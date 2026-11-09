# Hardened file primitives for the Herdr lifecycle facility. PowerShell 5.1 compatible.
# Every operation is confined to a caller-supplied root and refuses reparse points, hard links,
# alternate data streams, reserved device names, and source/destination aliasing.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Path) { return [IO.Path]::GetFullPath($Path).TrimEnd('\') }

function Assert-NoReparseChain([string]$Path) {
    # Walks from the path (or its nearest existing ancestor) to the drive root.
    $cursor = Get-NormalizedPath $Path
    while ($true) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point forbidden: $cursor" }
        }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
}

function Assert-SafeRelative([string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative)) { throw 'Relative path required.' }
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative.StartsWith('\') -or $Relative.StartsWith('/')) { throw 'Relative path required.' }
    if ($Relative.IndexOf(':') -ge 0) { throw 'Alternate data streams and drive references are forbidden.' }
    if ($Relative.IndexOfAny([IO.Path]::GetInvalidPathChars()) -ge 0 -or $Relative -match '[\*\?"<>\|]') { throw 'Invalid path characters.' }
    foreach ($segment in ($Relative -split '[\\/]')) {
        if ($segment -eq '' -or $segment -eq '.' -or $segment -eq '..') { throw 'Path traversal or empty segment forbidden.' }
        if ($segment.EndsWith('.') -or $segment.EndsWith(' ')) { throw 'Trailing dot or space forbidden.' }
        if ($segment -match '~\d') { throw 'Short (8.3) names are forbidden.' }
        $stem = ($segment -split '\.')[0]
        if ($stem -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9]|CONIN\$|CONOUT\$)$') { throw 'Reserved device name forbidden.' }
    }
}

function Resolve-ConfinedPath([string]$Root, [string]$Relative) {
    Assert-SafeRelative $Relative
    $rootPath = Get-NormalizedPath $Root
    $target = Get-NormalizedPath (Join-Path $rootPath $Relative)
    if (-not $target.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes the confined root.' }
    Assert-NoReparseChain $target
    return $target
}

function Get-FileIdentity([string]$Path) {
    # Volume-unique file ID and hard-link count through fsutil (no elevation, no compilation).
    $idOut = & fsutil.exe file queryFileID $Path 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $idOut -notmatch '(0x[0-9a-fA-F]+)') { throw "File identity unavailable: $Path" }
    $fileId = $Matches[1].ToLowerInvariant()
    $links = @(& fsutil.exe hardlink list $Path 2>&1 | Where-Object { "$_".Trim() -ne '' })
    if ($LASTEXITCODE -ne 0) { throw "Hard-link count unavailable: $Path" }
    return @{ fileId = $fileId; linkCount = $links.Count; volume = [IO.Path]::GetPathRoot((Get-NormalizedPath $Path)).ToUpperInvariant() }
}

function Assert-PlainFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "File missing: $Path" }
    Assert-NoReparseChain $Path
    $identity = Get-FileIdentity $Path
    if ($identity.linkCount -ne 1) { throw "Hard-linked file forbidden ($($identity.linkCount) links): $Path" }
    return $identity
}

function Get-StreamSha256([IO.Stream]$Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $Stream.Position = 0; return ([BitConverter]::ToString($sha.ComputeHash($Stream)) -replace '-', '') } finally { $sha.Dispose() }
}

function Get-LockedSha256([string]$Path) {
    # Hash through a handle that denies writers, renames and deletes for the duration.
    $stream = New-Object IO.FileStream($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { return Get-StreamSha256 $stream } finally { $stream.Dispose() }
}

function Copy-FileVerified {
    # Copies Source to Destination without ever overwriting. The source is held open (writers, renames and
    # deletes denied) while it is hashed and copied from the same handle, so the bytes hashed are the bytes copied.
    # The copy lands in "<Destination>.partial" (CreateNew), is flushed, re-hashed, then renamed (no overwrite).
    param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination,
          [string]$ExpectedSha256 = '', [scriptblock]$BeforeCommit = $null)
    $src = Get-NormalizedPath $Source; $dst = Get-NormalizedPath $Destination
    if ($src -ieq $dst) { throw 'Source and destination are the same path.' }
    if ($ExpectedSha256 -and $ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Expected hash is not a SHA-256 value.' }
    $srcIdentity = Assert-PlainFile $src
    Assert-NoReparseChain $dst
    if (Test-Path -LiteralPath $dst) {
        $dstIdentity = Assert-PlainFile $dst
        if ($dstIdentity.volume -eq $srcIdentity.volume -and $dstIdentity.fileId -eq $srcIdentity.fileId) { throw 'Source and destination are the same file.' }
        throw 'Destination already exists; overwrite refused.'
    }
    $partial = "$dst.partial"
    if (Test-Path -LiteralPath $partial) { throw 'Partial file exists; resolve it with Resolve-PartialFile before retrying.' }
    $in = New-Object IO.FileStream($src, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        # Re-check identity while the handle pins the file: detects a swap between the check and the open.
        $pinned = Get-FileIdentity $src
        if ($pinned.fileId -ne $srcIdentity.fileId -or $pinned.linkCount -ne 1) { throw 'Source changed identity during open.' }
        $sourceHash = Get-StreamSha256 $in
        if ($ExpectedSha256 -and $sourceHash -ne $ExpectedSha256.ToUpperInvariant()) { throw 'Integrity mismatch: source does not match the expected SHA-256.' }
        $in.Position = 0
        $out = New-Object IO.FileStream($partial, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        try { $in.CopyTo($out); $out.Flush($true); $partialHash = Get-StreamSha256 $out } finally { $out.Dispose() }
    } finally { $in.Dispose() }
    if ($partialHash -ne $sourceHash) { throw 'Copy verification failed; partial retained for investigation.' }
    if ($BeforeCommit) { & $BeforeCommit }   # test seam: simulates an interruption before the atomic rename
    [IO.File]::Move($partial, $dst)          # same-volume rename; throws if the destination appeared meanwhile
    if ((Get-LockedSha256 $dst) -ne $sourceHash) { throw 'Committed file failed verification.' }
    return @{ sha256 = $sourceHash; length = (Get-Item -LiteralPath $dst).Length }
}

function Resolve-PartialFile {
    # Explicit recovery of an interrupted copy: the partial is either promoted (hash proven) or quarantined, never silently deleted.
    param([Parameter(Mandatory=$true)][string]$Destination, [Parameter(Mandatory=$true)][string]$ExpectedSha256)
    $dst = Get-NormalizedPath $Destination; $partial = "$dst.partial"
    if (-not (Test-Path -LiteralPath $partial -PathType Leaf)) { return 'NO_PARTIAL' }
    Assert-PlainFile $partial | Out-Null
    if ((Test-Path -LiteralPath $dst)) { throw 'Destination exists beside a partial; manual investigation required.' }
    if ((Get-LockedSha256 $partial) -eq $ExpectedSha256.ToUpperInvariant()) { [IO.File]::Move($partial, $dst); return 'PROMOTED' }
    $quarantine = "$partial.rejected-" + [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')
    [IO.File]::Move($partial, $quarantine)
    return 'QUARANTINED'
}

function Restore-FileAtomic {
    # Replaces Target with Backup content atomically, keeping the replaced file as "<Target>.before-rollback".
    param([Parameter(Mandatory=$true)][string]$Backup, [Parameter(Mandatory=$true)][string]$Target,
          [Parameter(Mandatory=$true)][string]$ExpectedBackupSha256, [Parameter(Mandatory=$true)][string]$ExpectedCurrentSha256)
    $src = Get-NormalizedPath $Backup; $dst = Get-NormalizedPath $Target
    if ($src -ieq $dst) { throw 'Backup and target are the same path.' }
    $srcIdentity = Assert-PlainFile $src; $dstIdentity = Assert-PlainFile $dst
    if ($srcIdentity.volume -eq $dstIdentity.volume -and $srcIdentity.fileId -eq $dstIdentity.fileId) { throw 'Backup and target are the same file.' }
    $previous = "$dst.before-rollback"; $staged = "$dst.rollback-partial"
    if (Test-Path -LiteralPath $previous) { throw 'Prior rollback evidence exists; refusing to overwrite it.' }
    if (Test-Path -LiteralPath $staged) { throw 'Rollback partial exists; manual investigation required.' }
    if ((Get-LockedSha256 $src) -ne $ExpectedBackupSha256.ToUpperInvariant()) { throw 'Backup does not match its recorded hash; rollback refused.' }
    # Hold the target against writers while its hash is confirmed and the staged copy is prepared.
    $hold = New-Object IO.FileStream($dst, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { if ((Get-StreamSha256 $hold) -ne $ExpectedCurrentSha256.ToUpperInvariant()) { throw 'Current target changed; rollback refused.' } } finally { $hold.Dispose() }
    $in = New-Object IO.FileStream($src, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $out = New-Object IO.FileStream($staged, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        try { $in.CopyTo($out); $out.Flush($true); $stagedHash = Get-StreamSha256 $out } finally { $out.Dispose() }
    } finally { $in.Dispose() }
    if ($stagedHash -ne $ExpectedBackupSha256.ToUpperInvariant()) { throw 'Staged rollback copy failed verification.' }
    # Final check immediately before the atomic swap narrows the remaining window to the swap call itself.
    if ((Get-LockedSha256 $dst) -ne $ExpectedCurrentSha256.ToUpperInvariant()) { Remove-Item -LiteralPath $staged -Force; throw 'Current target changed; rollback refused.' }
    [IO.File]::Replace($staged, $dst, $previous)
    if ((Get-LockedSha256 $dst) -ne $ExpectedBackupSha256.ToUpperInvariant()) { throw 'Restored file failed verification.' }
    return @{ restoredSha256 = $ExpectedBackupSha256.ToUpperInvariant(); previousKeptAt = $previous }
}

function New-BackupSet {
    # Backs up the named relative files from SourceRoot into a new BackupRoot and writes a hash manifest.
    param([Parameter(Mandatory=$true)][string]$SourceRoot, [Parameter(Mandatory=$true)][string]$BackupRoot, [Parameter(Mandatory=$true)][string[]]$RelativeFiles)
    $srcRoot = Get-NormalizedPath $SourceRoot; $dstRoot = Get-NormalizedPath $BackupRoot
    if ($dstRoot -ieq $srcRoot -or $dstRoot.StartsWith($srcRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $srcRoot.StartsWith($dstRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup root must not overlap the source root.' }
    Assert-NoReparseChain $srcRoot; Assert-NoReparseChain $dstRoot
    if (Test-Path -LiteralPath (Join-Path $dstRoot 'backup-manifest.json')) { throw 'Backup set already exists; a backup is never overwritten.' }
    $entries = @()
    foreach ($relative in $RelativeFiles) {
        $src = Resolve-ConfinedPath $srcRoot $relative; $dst = Resolve-ConfinedPath $dstRoot $relative
        $parent = Split-Path -Parent $dst
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null; Assert-NoReparseChain $parent }
        $copied = Copy-FileVerified -Source $src -Destination $dst
        $entries += [ordered]@{ path = $relative; sha256 = $copied.sha256; length = [string]$copied.length }
    }
    $manifest = [ordered]@{ schema = 'starq.herdr.backup.v1'; createdUtc = [DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'); sourceRoot = $srcRoot; files = $entries }
    $manifestPath = Join-Path $dstRoot 'backup-manifest.json'
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    return $manifestPath
}

function Test-BackupSet {
    # Re-hashes every file named in the manifest. A missing manifest, missing file or changed hash fails.
    param([Parameter(Mandatory=$true)][string]$BackupRoot)
    $root = Get-NormalizedPath $BackupRoot; $manifestPath = Join-Path $root 'backup-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Backup evidence missing: no manifest.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 'starq.herdr.backup.v1' -or @($manifest.files).Count -eq 0) { throw 'Backup evidence invalid or empty.' }
    foreach ($entry in @($manifest.files)) {
        $file = Resolve-ConfinedPath $root $entry.path
        Assert-PlainFile $file | Out-Null
        if ((Get-LockedSha256 $file) -ne $entry.sha256) { throw "Backup file changed since it was recorded: $($entry.path)" }
    }
    return $manifest
}
