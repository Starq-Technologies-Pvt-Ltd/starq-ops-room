# Fixture-only implementation. No production Herdr command or installation is called.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-FixtureRoot([string]$Root) {
    $allowed = [IO.Path]::GetFullPath('D:\StarqTech\scratch\codex\herdr-lifecycle-fixtures').TrimEnd('\')
    $actual = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if (-not $actual.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture root is outside the authorized test area.' }
    if (-not (Test-Path -LiteralPath $actual -PathType Container)) { throw 'Fixture root missing.' }
    $p = Get-Item -LiteralPath $actual -Force
    while ($p -and $p.FullName.Length -ge $allowed.Length) {
        if (($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse points are not allowed.' }
        $p = $p.Parent
    }
    if (-not (Test-Path -LiteralPath (Join-Path $actual '.fixture-only') -PathType Leaf)) { throw 'Fixture marker missing.' }
    return $actual
}
function Get-FixturePath([string]$Root, [string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)') { throw 'Relative fixture path required.' }
    $target = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $target.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture path escapes root.' }
    $cursor = $target
    while ($cursor.Length -gt $Root.Length) {
        if (Test-Path -LiteralPath $cursor) { if (((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point forbidden.' } }
        $next = Split-Path -Parent $cursor; if ($next -eq $cursor) { throw 'Invalid path.' }; $cursor = $next
    }
    return $target
}
function Invoke-FixtureBackup([string]$Root, [string]$Source, [string]$Backup) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Source; $dst = Get-FixturePath $rootPath $Backup
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw 'Source missing.' }
    if (Test-Path -LiteralPath $dst) { if ((Get-FileHash -LiteralPath $src).Hash -eq (Get-FileHash -LiteralPath $dst).Hash) { return 'UNCHANGED' }; throw 'Backup exists with different content.' }
    Copy-Item -LiteralPath $src -Destination $dst -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $src).Hash -ne (Get-FileHash -LiteralPath $dst).Hash) { throw 'Incomplete backup.' }
    return 'BACKED_UP'
}
function Invoke-FixtureStage([string]$Root, [string]$Source, [string]$Destination, [string]$Sha256, [switch]$SimulateInterrupt) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Source; $dst = Get-FixturePath $rootPath $Destination
    if ($Sha256 -notmatch '^[0-9a-fA-F]{64}$' -or -not (Test-Path -LiteralPath $src -PathType Leaf)) { throw 'Artifact or hash invalid.' }
    if ((Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash -ne $Sha256) { throw 'Integrity mismatch.' }
    if (Test-Path -LiteralPath $dst) { if ((Get-FileHash -LiteralPath $dst).Hash -eq $Sha256) { return 'UNCHANGED' }; throw 'Destination already exists.' }
    $partial = "$dst.partial"
    if (Test-Path -LiteralPath $partial) { throw 'Partial stage requires manual investigation.' }
    Copy-Item -LiteralPath $src -Destination $partial -ErrorAction Stop
    if ($SimulateInterrupt) { throw 'Simulated interrupted installation; partial retained.' }
    if ((Get-FileHash -LiteralPath $partial).Hash -ne $Sha256) { throw 'Staged file integrity mismatch.' }
    Move-Item -LiteralPath $partial -Destination $dst -ErrorAction Stop
    return 'STAGED'
}
function Invoke-FixtureRollback([string]$Root, [string]$Backup, [string]$Target, [string]$ExpectedCurrentHash) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Backup; $dst = Get-FixturePath $rootPath $Target
    if (-not (Test-Path -LiteralPath $src -PathType Leaf) -or -not (Test-Path -LiteralPath $dst -PathType Leaf)) { throw 'Backup or target missing.' }
    if ((Get-FileHash -LiteralPath $dst).Hash -ne $ExpectedCurrentHash) { throw 'Current target changed; rollback refused.' }
    $partial = "$dst.rollback-partial"; if (Test-Path -LiteralPath $partial) { throw 'Rollback partial already exists.' }
    Copy-Item -LiteralPath $src -Destination $partial
    if ((Get-FileHash -LiteralPath $src).Hash -ne (Get-FileHash -LiteralPath $partial).Hash) { throw 'Backup verification failed.' }
    $previous = "$dst.before-rollback"; if (Test-Path -LiteralPath $previous) { throw 'Prior rollback evidence exists.' }
    [IO.File]::Replace($partial, $dst, $previous)
    return 'RESTORED'
}
function Test-FixturePreflight($components, $sessions) {
    if (@($components).Count -eq 0) { throw 'No component evidence.' }
    foreach ($component in @($components)) {
        if ($component.connected -ne $true) { throw 'Connection failure.' }
        if ($component.compatible -ne $true) { throw 'Version incompatible.' }
        if ($component.backupVerified -ne $true) { throw 'Backup incomplete.' }
    }
    foreach ($session in @($sessions)) { if ($session.recoveryVerified -ne $true) { throw 'Session recovery failed.' } }
    return 'FIXTURE_READY'
}
