# Operational implementation of the Herdr lifecycle facility. PowerShell 5.1 compatible.
#
# Every state-changing function takes a context and calls Assert-MutationAllowed first. The only context that
# passes is a marked sandbox beneath the authorized fixture parent. Live execution is refused by a constant
# until independent acceptance; changing that constant is a reviewed code change, not an operator option.
#
# Interfaces used are the ones verified on 2026-11-10 against herdr 0.9.4-preview.2026-10-14 / 0.9.5 and
# Sheprd 20261108.1 help output: `sheprd app quit`, `sheprd status`, `sheprd host list`, `sheprd remote status`,
# `sheprd window detach|reconnect`, `herdr status`, `herdr pane list`, `herdr workspace list`,
# `herdr machine list|status`, `herdr update [--handoff]`, `herdr server stop`.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\herdr-fixture-engine.ps1"

$script:LiveApplyEnabled = $false
$script:PinnedPublisherSubject = 'CN=Fabien Penso, O=Fabien Penso, L=Los Altos, S=ca, C=US'
$script:ResumableAgents = @('claude', 'codex', 'cursor', 'agy', 'devin', 'omp', 'copilot')

function Get-Value($object, [string]$name, $fallback = $null) {
    if ($null -eq $object) { return $fallback }
    if ($object -is [Collections.IDictionary]) { if ($object.Contains($name)) { return $object[$name] } else { return $fallback } }
    $property = $object.PSObject.Properties[$name]
    if ($null -eq $property) { return $fallback }
    return $property.Value
}

function Assert-MutationAllowed($Context) {
    $mode = Get-Value $Context 'Mode'
    if ($mode -eq 'Sandbox') { return (Get-FixtureRoot (Get-Value $Context 'SandboxRoot')) }
    if ($mode -eq 'Live' -and $script:LiveApplyEnabled) { throw 'Live mode has no reviewed implementation path.' }
    throw 'Live execution is disabled: independent review and operational authorization are outstanding.'
}

# ---------- sealed evidence ----------
function Write-SealedEvidence([string]$Path, $Object) {
    $json = $Object | ConvertTo-Json -Depth 12
    $encoding = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $json, $encoding)
    [IO.File]::WriteAllText("$Path.sha256", (Get-LockedSha256 $Path), $encoding)
    return $Path
}
function Read-SealedEvidence([string]$Path, [string]$Schema) {
    # The seal detects truncation and accidental or casual edits. It is not a signature: anyone able to write
    # both files can forge it. Independent acceptance must check provenance, not only the seal.
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Evidence missing: $Path" }
    if (-not (Test-Path -LiteralPath "$Path.sha256" -PathType Leaf)) { throw "Evidence seal missing: $Path" }
    $recorded = (Get-Content -LiteralPath "$Path.sha256" -Raw).Trim()
    if ((Get-LockedSha256 $Path) -ne $recorded) { throw "Evidence changed after it was sealed: $Path" }
    $object = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ((Get-Value $object 'schema') -ne $Schema) { throw "Evidence schema mismatch: expected $Schema" }
    return $object
}

# ---------- release discovery and artifact trust ----------
function Select-ReleaseAsset($Release, [string]$Target = 'x86_64-pc-windows-msvc') {
    $tag = [string](Get-Value $Release 'tag_name')
    if ($tag -notmatch '^v(\d{8}\.\d+)$') { throw 'Release tag is not a stable desktop version.' }
    if ((Get-Value $Release 'prerelease') -eq $true -or (Get-Value $Release 'draft') -eq $true) { throw 'Prerelease or draft refused.' }
    $version = $Matches[1]
    $wanted = "Sheprd-$version-$Target-setup.exe"
    $match = @(@(Get-Value $Release 'assets' @()) | Where-Object { (Get-Value $_ 'name') -ceq $wanted })
    if ($match.Count -ne 1) { throw "Exactly one asset named $wanted is required." }
    return @{ version = $version; name = $wanted; size = [string](Get-Value $match[0] 'size'); apiDigest = [string](Get-Value $match[0] 'digest') }
}
function New-ReleaseEvidence {
    # An expected SHA-256 is trusted only when at least two published sources agree and none disagrees:
    # the GitHub asset digest, the published <asset>.sha256 file, and windows-manifest.json.
    param($Release, [string]$Sha256FileText = '', [string]$WindowsManifestJson = '', [string]$Target = 'x86_64-pc-windows-msvc')
    $asset = Select-ReleaseAsset $Release $Target
    $sources = [ordered]@{}
    if ($asset.apiDigest -match '^sha256:([0-9a-fA-F]{64})$') { $sources['githubAssetDigest'] = $Matches[1].ToUpperInvariant() }
    if ($Sha256FileText -match '^\s*([0-9a-fA-F]{64})\s+\*?(\S+)\s*$') { if ($Matches[2] -ceq $asset.name) { $sources['publishedSha256File'] = $Matches[1].ToUpperInvariant() } }
    if ($WindowsManifestJson) {
        $manifest = $WindowsManifestJson | ConvertFrom-Json
        if ([string](Get-Value $manifest 'version') -ne $asset.version) { throw 'Windows manifest is for a different version.' }
        $entry = @(@(Get-Value $manifest 'assets' @()) | Where-Object { (Get-Value $_ 'name') -ceq $asset.name -and (Get-Value $_ 'target') -ceq $Target })
        if ($entry.Count -eq 1) { $sources['windowsManifest'] = ([string](Get-Value $entry[0] 'sha256')).ToUpperInvariant() }
    }
    $distinct = @($sources.Values | Sort-Object -Unique)
    if ($sources.Count -lt 2) { throw 'Fewer than two published hash sources; the expected hash is not trustworthy.' }
    if ($distinct.Count -ne 1) { throw 'Published hash sources disagree.' }
    return [ordered]@{ schema = 'starq.herdr.release.v1'; component = 'desktop'; version = $asset.version; target = $Target; assetName = $asset.name
        size = $asset.size; sha256 = $distinct[0]; sources = @($sources.Keys); publisherSubject = $script:PinnedPublisherSubject }
}
function Get-LiveSignature([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    $subject = ''
    if ($signature.SignerCertificate) { $subject = $signature.SignerCertificate.Subject }
    return @{ status = [string]$signature.Status; subject = $subject }
}
function Test-ArtifactTrust {
    param([Parameter(Mandatory=$true)][string]$ArtifactPath, [Parameter(Mandatory=$true)]$ReleaseEvidence, [scriptblock]$SignatureProbe = $null)
    if ((Get-Value $ReleaseEvidence 'schema') -ne 'starq.herdr.release.v1') { throw 'Release evidence missing or invalid.' }
    if (@(Get-Value $ReleaseEvidence 'sources' @()).Count -lt 2) { throw 'Release evidence lacks two agreeing hash sources.' }
    if ((Split-Path -Leaf $ArtifactPath) -cne (Get-Value $ReleaseEvidence 'assetName')) { throw 'Artifact name does not match the selected release asset.' }
    Assert-PlainFile $ArtifactPath | Out-Null
    if ([string](Get-Item -LiteralPath $ArtifactPath).Length -ne [string](Get-Value $ReleaseEvidence 'size')) { throw 'Artifact size mismatch.' }
    if ((Get-LockedSha256 $ArtifactPath) -ne (Get-Value $ReleaseEvidence 'sha256')) { throw 'Integrity mismatch: artifact does not match the published SHA-256.' }
    if ($null -eq $SignatureProbe) { $SignatureProbe = { param($p) Get-LiveSignature $p } }
    $signature = & $SignatureProbe $ArtifactPath
    if ((Get-Value $signature 'status') -ne 'Valid') { throw 'Authenticode signature is not valid.' }
    if ((Get-Value $signature 'subject') -cne (Get-Value $ReleaseEvidence 'publisherSubject')) { throw 'Authenticode publisher does not match the pinned publisher.' }
    return 'TRUSTED'
}

# ---------- compatibility ----------
function Test-VersionCompatibility {
    # Compatible only when the exact desktop version was observed working against the backend's protocol.
    # Anything not in the matrix is UNVERIFIED and blocks; version numbers alone never imply compatibility.
    param([string]$DesktopVersion, [string]$ServerVersion, [string]$ServerProtocol, $Matrix)
    foreach ($row in @(Get-Value $Matrix 'verified' @())) {
        if ((Get-Value $row 'desktop') -eq $DesktopVersion -and [string](Get-Value $row 'serverProtocol') -eq $ServerProtocol -and @(Get-Value $row 'serverVersions' @()) -contains $ServerVersion) { return 'VERIFIED' }
    }
    return 'UNVERIFIED'
}

# ---------- baseline, continuity, sessions ----------
function Find-DuplicateSessions($Panes) {
    $duplicates = @()
    $sessions = @(@($Panes) | ForEach-Object { Get-Value (Get-Value $_ 'agent_session') 'value' } | Where-Object { $_ })
    $duplicates += @($sessions | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { "agent_session:$($_.Name)" })
    $terminals = @(@($Panes) | ForEach-Object { Get-Value $_ 'terminal_id' } | Where-Object { $_ })
    $duplicates += @($terminals | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { "terminal:$($_.Name)" })
    return ,$duplicates
}
function Get-PaneKey($Pane) { return ('{0}|{1}|{2}' -f (Get-Value $Pane 'pane_id'), (Get-Value $Pane 'terminal_id'), (Get-Value (Get-Value $Pane 'agent_session') 'value')) }
function Compare-Continuity {
    # Process identity is PID plus creation time; a reused PID with a new start time is a different process.
    param($Before, $After, [string[]]$MustSurviveRoles = @('server', 'pane-child'))
    $lost = @()
    foreach ($process in @(Get-Value $Before 'processes' @())) {
        if ($MustSurviveRoles -notcontains (Get-Value $process 'role')) { continue }
        $same = @(@(Get-Value $After 'processes' @()) | Where-Object { [string](Get-Value $_ 'pid') -eq [string](Get-Value $process 'pid') -and [string](Get-Value $_ 'createdTicksUtc') -eq [string](Get-Value $process 'createdTicksUtc') })
        if ($same.Count -ne 1) { $lost += ('{0}:{1}' -f (Get-Value $process 'role'), (Get-Value $process 'pid')) }
    }
    $beforeKeys = @(@(Get-Value $Before 'panes' @()) | ForEach-Object { Get-PaneKey $_ } | Sort-Object)
    $afterKeys = @(@(Get-Value $After 'panes' @()) | ForEach-Object { Get-PaneKey $_ } | Sort-Object)
    $panesIdentical = (($beforeKeys -join "`n") -eq ($afterKeys -join "`n"))
    $duplicates = Find-DuplicateSessions (Get-Value $After 'panes' @())
    $ok = ($lost.Count -eq 0 -and $panesIdentical -and $duplicates.Count -eq 0 -and $beforeKeys.Count -gt 0)
    return [ordered]@{ ok = $ok; lostProcesses = $lost; paneRecordsIdentical = $panesIdentical; duplicateSessions = $duplicates
        note = 'Process and pane-record continuity only. This does not show that any agent conversation is productive or resumable.' }
}
function Get-SessionRecoveryClass {
    # Path A keeps the backend, so the question is only whether the original process survived.
    # Path B ends original processes; a conversation is recoverable only through the agent's own resume, and
    # only counts as verified when a per-session resume test is recorded. Pane metadata alone is layout.
    param($Pane, [ValidateSet('A', 'B')][string]$Path, [bool]$ProcessSurvived = $false, [string[]]$VerifiedResumeSessions = @())
    $session = Get-Value $Pane 'agent_session'; $sessionValue = Get-Value $session 'value'
    if ($Path -eq 'A') { if ($ProcessSurvived) { return 'LIVE_PROCESS_PRESERVED' } else { return 'PROCESS_LOST' } }
    if (-not $sessionValue) { return 'LAYOUT_ONLY' }
    if ($VerifiedResumeSessions -contains $sessionValue) { return 'RESUME_VERIFIED' }
    if ($script:ResumableAgents -contains (Get-Value $session 'agent')) { return 'RESUME_UNVERIFIED' }
    return 'LAYOUT_ONLY'
}

# ---------- journal: interrupted operations ----------
function Get-JournalPath($Root) { return (Join-Path $Root 'operation-journal.json') }
function Assert-NoInterruptedOperation($Root) {
    $path = Get-JournalPath $Root
    if (-not (Test-Path -LiteralPath $path)) { return }
    $journal = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if (@('COMPLETED', 'ROLLED_BACK') -notcontains (Get-Value $journal 'state')) { throw "Interrupted operation detected (state $(Get-Value $journal 'state'), step $(Get-Value $journal 'step')); resolve it before starting another." }
}
function Set-Journal($Root, [string]$Operation, [string]$State, [string]$Step) {
    $record = [ordered]@{ schema = 'starq.herdr.journal.v1'; operation = $Operation; state = $State; step = $Step; updatedUtc = [DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss') }
    [IO.File]::WriteAllText((Get-JournalPath $Root), ($record | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
}

# ---------- Path A: desktop maintenance ----------
function Invoke-DesktopRollback {
    # Restores configuration files from a verified backup set. Missing or altered backup evidence refuses.
    param($Context, [Parameter(Mandatory=$true)][string]$BackupRelative, [Parameter(Mandatory=$true)][string]$ConfigRelative)
    $root = Assert-MutationAllowed $Context
    $backupRoot = Resolve-ConfinedPath $root $BackupRelative; $configRoot = Resolve-ConfinedPath $root $ConfigRelative
    $manifest = Test-BackupSet $backupRoot
    $restored = @()
    foreach ($entry in @($manifest.files)) {
        $target = Resolve-ConfinedPath $configRoot $entry.path; $backup = Resolve-ConfinedPath $backupRoot $entry.path
        if (-not (Test-Path -LiteralPath $target)) { Copy-FileVerified -Source $backup -Destination $target -ExpectedSha256 $entry.sha256 | Out-Null; $restored += $entry.path; continue }
        $current = Get-LockedSha256 $target
        if ($current -eq $entry.sha256) { continue }
        Restore-FileAtomic -Backup $backup -Target $target -ExpectedBackupSha256 $entry.sha256 -ExpectedCurrentSha256 $current | Out-Null
        $restored += $entry.path
    }
    return [ordered]@{ status = 'ROLLED_BACK'; restored = $restored }
}
function Invoke-DesktopUpdate {
    # Side-by-side desktop update. Order: interrupted-operation check, compatibility, artifact trust,
    # baseline, duplicate-session check, verified backup, install, continuity. An installer failure restores
    # configuration from the backup. A continuity failure is reported, never papered over.
    param($Context, [Parameter(Mandatory=$true)]$Plan)
    $root = Assert-MutationAllowed $Context
    Assert-NoInterruptedOperation $root
    $evidence = Get-Value $Plan 'ReleaseEvidence'
    $compatibility = Test-VersionCompatibility -DesktopVersion (Get-Value $evidence 'version') -ServerVersion (Get-Value $Plan 'ServerVersion') -ServerProtocol (Get-Value $Plan 'ServerProtocol') -Matrix (Get-Value $Plan 'CompatibilityMatrix')
    if ($compatibility -ne 'VERIFIED') { throw 'Version incompatible or unverified for this backend; update refused.' }
    $artifact = Resolve-ConfinedPath $root (Get-Value $Plan 'ArtifactRelative')
    Test-ArtifactTrust -ArtifactPath $artifact -ReleaseEvidence $evidence -SignatureProbe (Get-Value $Plan 'SignatureProbe') | Out-Null
    $before = & (Get-Value $Plan 'BaselineProbe')
    $duplicates = Find-DuplicateSessions (Get-Value $before 'panes' @())
    if ($duplicates.Count -gt 0) { throw "Duplicate sessions present before update: $($duplicates -join ', ')" }
    Set-Journal $root 'desktop-update' 'IN_PROGRESS' 'backup'
    New-BackupSet -SourceRoot (Resolve-ConfinedPath $root (Get-Value $Plan 'ConfigRelative')) -BackupRoot (Resolve-ConfinedPath $root (Get-Value $Plan 'BackupRelative')) -RelativeFiles @(Get-Value $Plan 'ConfigFiles') | Out-Null
    Test-BackupSet (Resolve-ConfinedPath $root (Get-Value $Plan 'BackupRelative')) | Out-Null
    Set-Journal $root 'desktop-update' 'IN_PROGRESS' 'install'
    $installError = $null
    try { $exit = & (Get-Value $Plan 'Installer') $artifact; if ([string]$exit -ne '0') { $installError = "Installer exit $exit" } } catch { $installError = $_.Exception.Message }
    if ($installError) {
        Set-Journal $root 'desktop-update' 'IN_PROGRESS' 'rollback'
        $rollback = Invoke-DesktopRollback -Context $Context -BackupRelative (Get-Value $Plan 'BackupRelative') -ConfigRelative (Get-Value $Plan 'ConfigRelative')
        Set-Journal $root 'desktop-update' 'ROLLED_BACK' 'install-failed'
        return [ordered]@{ status = 'INSTALL_FAILED_ROLLED_BACK'; error = $installError; restored = $rollback.restored }
    }
    Set-Journal $root 'desktop-update' 'IN_PROGRESS' 'verify'
    $after = & (Get-Value $Plan 'BaselineProbe')
    $continuity = Compare-Continuity -Before $before -After $after
    if (-not $continuity.ok) { Set-Journal $root 'desktop-update' 'CONTINUITY_FAILED' 'verify'; return [ordered]@{ status = 'CONTINUITY_FAILED'; continuity = $continuity } }
    Set-Journal $root 'desktop-update' 'COMPLETED' 'verify'
    return [ordered]@{ status = 'UPDATED'; version = (Get-Value $evidence 'version'); continuity = $continuity }
}
function Invoke-DesktopDetach {
    # `sheprd app quit` closes the desktop and leaves Herdr and its terminals running. Verified by continuity.
    param($Context, [Parameter(Mandatory=$true)][scriptblock]$Runner, [Parameter(Mandatory=$true)][scriptblock]$BaselineProbe)
    Assert-MutationAllowed $Context | Out-Null
    $before = & $BaselineProbe
    $result = & $Runner 'sheprd' @('app', 'quit')
    if ([string](Get-Value $result 'exitCode') -notin @('0', '3')) { throw "Desktop quit failed with exit $(Get-Value $result 'exitCode')." }
    $continuity = Compare-Continuity -Before $before -After (& $BaselineProbe)
    if (-not $continuity.ok) { return [ordered]@{ status = 'CONTINUITY_FAILED'; continuity = $continuity } }
    return [ordered]@{ status = 'DETACHED'; continuity = $continuity }
}
function Invoke-DesktopReconnect {
    # Reconnects to the recorded original endpoints. Never launches a second desktop, never creates a
    # replacement workspace, and fails if any recorded host does not come back online within the attempts.
    param($Context, [Parameter(Mandatory=$true)][scriptblock]$StatusProbe, [Parameter(Mandatory=$true)][scriptblock]$Launch,
          [Parameter(Mandatory=$true)][string[]]$ExpectedHosts, [Parameter(Mandatory=$true)][string[]]$ExpectedWorkspaces, [int]$MaxAttempts = 5)
    Assert-MutationAllowed $Context | Out-Null
    $status = & $StatusProbe
    $launched = $false
    if ((Get-Value $status 'running') -ne $true) { & $Launch | Out-Null; $launched = $true }
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $status = & $StatusProbe
        if ((Get-Value $status 'running') -eq $true) {
            if (@(Get-Value $status 'desktopProcesses' @()).Count -gt 1) { throw 'More than one desktop process; duplicate client refused.' }
            $online = @(Get-Value $status 'onlineHosts' @()); $workspaces = @(Get-Value $status 'workspaces' @())
            $missingHosts = @($ExpectedHosts | Where-Object { $online -notcontains $_ })
            $missingWorkspaces = @($ExpectedWorkspaces | Where-Object { $workspaces -notcontains $_ })
            $extraWorkspaces = @($workspaces | Where-Object { $ExpectedWorkspaces -notcontains $_ })
            if ($extraWorkspaces.Count -gt 0) { throw "Unexpected workspaces after reconnect: $($extraWorkspaces -join ', ')" }
            if ($missingHosts.Count -eq 0 -and $missingWorkspaces.Count -eq 0) { return [ordered]@{ status = 'CONNECTED'; launched = $launched; attempts = $attempt } }
        }
    }
    throw 'Connection recovery failed: recorded hosts or workspaces did not return.'
}

# ---------- Path B: server migration (separately authorized) ----------
function Invoke-ServerMigration {
    # Windows and Ubuntu backends are migrated independently. Requires a sealed Founder approval naming this
    # backend and the exact versions, every session classified, and every non-verified session explicitly
    # accepted as a loss in that approval. Original pane processes end on a server restart; `--handoff` is
    # best effort upstream and its result is verified, never assumed.
    param($Context, [ValidateSet('windows', 'ubuntu')][string]$Backend, [Parameter(Mandatory=$true)]$Approval, [Parameter(Mandatory=$true)]$Panes,
          [string[]]$VerifiedResumeSessions = @(), [Parameter(Mandatory=$true)][scriptblock]$Runner, [Parameter(Mandatory=$true)][scriptblock]$VersionProbe, [switch]$Handoff)
    $root = Assert-MutationAllowed $Context
    Assert-NoInterruptedOperation $root
    if ((Get-Value $Approval 'schema') -ne 'starq.herdr.approval.v1' -or (Get-Value $Approval 'founderApproved') -isnot [bool] -or (Get-Value $Approval 'founderApproved') -ne $true) { throw 'Founder approval evidence missing.' }
    if (-not (Get-Value $Approval 'roomSequence')) { throw 'Founder approval lacks a Room sequence.' }
    if ((Get-Value $Approval 'backend') -ne $Backend) { throw 'Founder approval is for a different backend.' }
    $current = & $VersionProbe
    if ((Get-Value $Approval 'fromVersion') -ne $current) { throw 'Running version differs from the approved starting version.' }
    $accepted = @(Get-Value $Approval 'acceptedLossPanes' @())
    $classes = [ordered]@{}
    foreach ($pane in @($Panes)) {
        $class = Get-SessionRecoveryClass -Pane $pane -Path 'B' -VerifiedResumeSessions $VerifiedResumeSessions
        $classes[[string](Get-Value $pane 'pane_id')] = $class
        if ($class -ne 'RESUME_VERIFIED' -and $accepted -notcontains (Get-Value $pane 'pane_id')) { throw "Pane $(Get-Value $pane 'pane_id') is $class and not accepted as a loss in the approval." }
    }
    if ($classes.Count -eq 0) { throw 'No sessions classified.' }
    Set-Journal $root "server-migration-$Backend" 'IN_PROGRESS' 'update'
    $arguments = @('update'); if ($Handoff) { $arguments += '--handoff' }
    $result = & $Runner $Backend 'herdr' $arguments
    if ([string](Get-Value $result 'exitCode') -ne '0') { Set-Journal $root "server-migration-$Backend" 'FAILED' 'update'; throw "Server update failed with exit $(Get-Value $result 'exitCode'); state is recorded as FAILED." }
    $after = & $VersionProbe
    if ($after -ne (Get-Value $Approval 'toVersion')) { Set-Journal $root "server-migration-$Backend" 'FAILED' 'verify'; throw "Version after update is $after, not the approved $(Get-Value $Approval 'toVersion')." }
    Set-Journal $root "server-migration-$Backend" 'COMPLETED' 'verify'
    return [ordered]@{ status = 'MIGRATED'; backend = $Backend; version = $after; sessionClasses = $classes
        note = 'Each resumable session still needs its own resume test in a new process; this result does not show a conversation was recovered.' }
}

# ---------- evidence-backed preflight ----------
function Test-EvidencePreflight {
    # Replaces operator booleans with sealed evidence files read from a directory:
    # baseline.json, release.json, review.json, a backup set, and (Path B) approval.json.
    param([ValidateSet('A', 'B')][string]$Path, [Parameter(Mandatory=$true)][string]$EvidenceDir, [Parameter(Mandatory=$true)][string]$BackupRoot)
    $checks = [ordered]@{}; $errors = @()
    foreach ($item in @(@('baseline', 'starq.herdr.baseline.v1'), @('release', 'starq.herdr.release.v1'), @('review', 'starq.herdr.review.v1'))) {
        try { $loaded = Read-SealedEvidence (Join-Path $EvidenceDir "$($item[0]).json") $item[1]; $checks[$item[0]] = $true; Set-Variable -Name ("ev_" + $item[0]) -Value $loaded } catch { $checks[$item[0]] = $false; $errors += $_.Exception.Message }
    }
    try { Test-BackupSet $BackupRoot | Out-Null; $checks['backup'] = $true } catch { $checks['backup'] = $false; $errors += $_.Exception.Message }
    if ($checks['baseline']) { $checks['noDuplicateSessions'] = ((Find-DuplicateSessions (Get-Value $ev_baseline 'panes' @())).Count -eq 0); $checks['serverObserved'] = (@(@(Get-Value $ev_baseline 'processes' @()) | Where-Object { (Get-Value $_ 'role') -eq 'server' }).Count -ge 1) }
    if ($checks['release']) { $checks['twoHashSources'] = (@(Get-Value $ev_release 'sources' @()).Count -ge 2) }
    if ($checks['review']) { $checks['independentAcceptance'] = ((Get-Value $ev_review 'accepted') -is [bool] -and (Get-Value $ev_review 'accepted') -eq $true -and (Get-Value $ev_review 'reviewer') -and (Get-Value $ev_review 'reviewer') -ne (Get-Value $ev_review 'author') -and (Get-Value $ev_review 'roomSequence')) }
    if ($Path -eq 'B') { try { $approval = Read-SealedEvidence (Join-Path $EvidenceDir 'approval.json') 'starq.herdr.approval.v1'; $checks['founderApproval'] = ((Get-Value $approval 'founderApproved') -is [bool] -and (Get-Value $approval 'founderApproved') -eq $true -and [bool](Get-Value $approval 'roomSequence')) } catch { $checks['founderApproval'] = $false; $errors += $_.Exception.Message } }
    $failed = @($checks.Keys | Where-Object { -not $checks[$_] })
    $status = 'EVIDENCE_VERIFIED'; if ($failed.Count -gt 0) { $status = 'BLOCKED' }
    return [ordered]@{ status = $status; path = $Path; checks = $checks; failed = $failed; errors = $errors
        warning = 'Verified evidence is a precondition, not permission. Live execution stays disabled in code.' }
}

# ---------- safe update scheduling ----------
function Get-MaintenanceDecision {
    # Never interrupts work: any working or blocked agent defers. Unknown status is not idle; it defers
    # unless every unknown pane is named as confirmed idle by the operator.
    param($Panes, [DateTime]$NowLocal, [int]$WindowStartHour = 2, [int]$WindowEndHour = 5, [string[]]$ConfirmedIdlePanes = @())
    $busy = @(@($Panes) | Where-Object { @('working', 'blocked') -contains (Get-Value $_ 'agent_status') } | ForEach-Object { Get-Value $_ 'pane_id' })
    if ($busy.Count -gt 0) { return [ordered]@{ decision = 'DEFER_ACTIVE_AGENTS'; panes = $busy } }
    $unknown = @(@($Panes) | Where-Object { @('idle', 'done') -notcontains (Get-Value $_ 'agent_status') -and $ConfirmedIdlePanes -notcontains (Get-Value $_ 'pane_id') } | ForEach-Object { Get-Value $_ 'pane_id' })
    if ($unknown.Count -gt 0) { return [ordered]@{ decision = 'DEFER_UNKNOWN_STATUS'; panes = $unknown } }
    if ($NowLocal.Hour -lt $WindowStartHour -or $NowLocal.Hour -ge $WindowEndHour) { return [ordered]@{ decision = 'DEFER_OUTSIDE_WINDOW'; panes = @() } }
    return [ordered]@{ decision = 'WINDOW_OPEN'; panes = @() }
}
function New-ReleaseCheckTaskSpec {
    # Describes a discovery-only scheduled task. Nothing is registered here; the check downloads no installer
    # and changes nothing, it only reports a new release for a human decision.
    param([string]$ScriptRoot = $PSScriptRoot, [string]$Time = '09:00')
    $command = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}\herdr-discover.ps1" -Online -Component desktop' -f $ScriptRoot
    return [ordered]@{ taskName = 'StarqTech-Herdr-ReleaseCheck'; schedule = "DAILY $Time"; command = $command; registers = $false
        note = 'Discovery only. Registration is a separate, approved step: schtasks /Create /SC DAILY /ST <time> /TN <taskName> /TR <command>.' }
}
