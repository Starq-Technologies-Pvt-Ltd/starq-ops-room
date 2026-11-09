# Isolated tests for herdr-safefs.ps1 and herdr-ops.ps1. PowerShell 5.1. Every Herdr, Sheprd, installer and
# signature call is a mock; nothing here contacts or changes a real Herdr component. A pass shows the control
# logic refuses and recovers as designed. It does not show that a real agent conversation can be recovered.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
if (-not $env:STARQ_HERDR_FIXTURE_PARENT) { $env:STARQ_HERDR_FIXTURE_PARENT = 'D:\StarqTech\scratch\herdr-lifecycle-tests\herdr-lifecycle-fixtures' }
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'herdr-ops.ps1')
$script:passed = 0
function Assert($condition, [string]$name) { if (-not $condition) { throw "FAIL $name" }; $script:passed++; Write-Host "PASS $name" }
function Refuses([scriptblock]$action, [string]$name, [string]$pattern = '') {
    $message = $null
    try { & $action | Out-Null } catch { $message = $_.Exception.Message }
    if ($null -eq $message) { throw "FAIL $name (no refusal)" }
    if ($pattern -and $message -notmatch $pattern) { throw "FAIL $name (refused for another reason: $message)" }
    $script:passed++; Write-Host "PASS $name"
}
function New-Sandbox {
    $root = Join-Path (Get-FixtureParent) ([Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $root '.fixture-only') -Value 'fixture'
    return $root
}
function Write-Text([string]$path, [string]$text) { $dir = Split-Path -Parent $path; if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }; [IO.File]::WriteAllText($path, $text) }

# ===== safe file layer =====
$root = New-Sandbox
Write-Text "$root\a.bin" 'alpha'; Write-Text "$root\b.bin" 'beta'
$alpha = Get-LockedSha256 "$root\a.bin"
cmd /c mklink /H "$root\a-link.bin" "$root\a.bin" | Out-Null
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\out1.bin" } 'hard-linked source refused' 'Hard-linked'
Remove-Item -LiteralPath "$root\a-link.bin" -Force
New-Item -ItemType Directory -Path "$root\real" | Out-Null; Write-Text "$root\real\inner.bin" 'inner'
cmd /c mklink /J "$root\junction" "$root\real" | Out-Null
Refuses { Resolve-ConfinedPath $root 'junction\inner.bin' } 'junction in path refused' 'Reparse'
cmd /c rmdir "$root\junction" | Out-Null
Refuses { Resolve-ConfinedPath $root 'a.bin:hidden' } 'alternate data stream refused' 'stream'
Refuses { Resolve-ConfinedPath $root '..\escape.bin' } 'traversal refused' 'traversal'
Refuses { Resolve-ConfinedPath $root 'sub\..\..\escape.bin' } 'nested traversal refused' 'traversal'
Refuses { Resolve-ConfinedPath $root 'NUL.txt' } 'reserved device name refused' 'Reserved'
Refuses { Resolve-ConfinedPath $root 'PROGRA~1\x' } 'short name refused' 'Short'
Refuses { Resolve-ConfinedPath $root 'trailing.\x' } 'trailing dot refused' 'Trailing'
Refuses { Resolve-ConfinedPath $root 'D:\StarqTech\x' } 'rooted path refused' 'Relative'
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\A.BIN" } 'source equals destination refused' 'same path'
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\b.bin" } 'existing destination never overwritten' 'overwrite refused'
Assert ((Get-Content -LiteralPath "$root\b.bin" -Raw) -eq 'beta') 'existing destination content intact'
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\out2.bin" -ExpectedSha256 ('0' * 64) } 'expected hash mismatch refused' 'Integrity'
Assert (-not (Test-Path "$root\out2.bin") -and -not (Test-Path "$root\out2.bin.partial")) 'hash mismatch leaves nothing behind'
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\out3.bin" -BeforeCommit { throw 'power loss' } } 'interrupted copy surfaces' 'power loss'
Assert ((Test-Path "$root\out3.bin.partial") -and -not (Test-Path "$root\out3.bin")) 'interrupted copy leaves only a partial'
Refuses { Copy-FileVerified -Source "$root\a.bin" -Destination "$root\out3.bin" } 'retry over a partial refused' 'Partial'
Assert ((Resolve-PartialFile -Destination "$root\out3.bin" -ExpectedSha256 $alpha) -eq 'PROMOTED') 'proven partial promoted'
Write-Text "$root\out4.bin.partial" 'truncat'
Assert ((Resolve-PartialFile -Destination "$root\out4.bin" -ExpectedSha256 $alpha) -eq 'QUARANTINED') 'unproven partial quarantined'
Assert (-not (Test-Path "$root\out4.bin") -and @(Get-ChildItem $root -Filter 'out4.bin.partial.rejected-*').Count -eq 1) 'quarantine keeps the evidence'

# ===== backup sets =====
Write-Text "$root\cfg\config.toml" 'theme = "old"'; Write-Text "$root\cfg\sub\local.toml" 'x = 1'
Refuses { New-BackupSet -SourceRoot "$root\cfg" -BackupRoot "$root\cfg\bk" -RelativeFiles @('config.toml') } 'backup inside its source refused' 'overlap'
$manifestPath = New-BackupSet -SourceRoot "$root\cfg" -BackupRoot "$root\bk" -RelativeFiles @('config.toml', 'sub\local.toml')
Assert (@((Test-BackupSet "$root\bk").files).Count -eq 2) 'backup set verifies'
Refuses { New-BackupSet -SourceRoot "$root\cfg" -BackupRoot "$root\bk" -RelativeFiles @('config.toml') } 'existing backup set never overwritten' 'never overwritten'
Refuses { Test-BackupSet "$root\no-such-backup" } 'missing backup evidence refused' 'Backup evidence missing'
Write-Text "$root\bk2\backup-manifest.json" '{"schema":"starq.herdr.backup.v1","files":[]}'
Refuses { Test-BackupSet "$root\bk2" } 'empty backup manifest refused' 'invalid or empty'
New-BackupSet -SourceRoot "$root\cfg" -BackupRoot "$root\bk3" -RelativeFiles @('config.toml') | Out-Null
Write-Text "$root\bk3\config.toml" 'theme = "tampered"'
Refuses { Test-BackupSet "$root\bk3" } 'altered backup file refused' 'changed since'
New-BackupSet -SourceRoot "$root\cfg" -BackupRoot "$root\bk4" -RelativeFiles @('config.toml') | Out-Null
Remove-Item -LiteralPath "$root\bk4\config.toml" -Force
Refuses { Test-BackupSet "$root\bk4" } 'backup with a missing file refused' 'File missing'

# ===== atomic restore =====
Write-Text "$root\live.toml" 'theme = "new"'
$oldHash = Get-LockedSha256 "$root\bk\config.toml"; $newHash = Get-LockedSha256 "$root\live.toml"
Refuses { Restore-FileAtomic -Backup "$root\bk\config.toml" -Target "$root\live.toml" -ExpectedBackupSha256 $oldHash -ExpectedCurrentSha256 ('0' * 64) } 'restore over a changed target refused' 'Current target changed'
Refuses { Restore-FileAtomic -Backup "$root\bk\config.toml" -Target "$root\live.toml" -ExpectedBackupSha256 ('0' * 64) -ExpectedCurrentSha256 $newHash } 'restore from an unproven backup refused' 'recorded hash'
Assert ((Get-Content "$root\live.toml" -Raw) -eq 'theme = "new"' -and -not (Test-Path "$root\live.toml.rollback-partial")) 'refused restore leaves target intact'
Restore-FileAtomic -Backup "$root\bk\config.toml" -Target "$root\live.toml" -ExpectedBackupSha256 $oldHash -ExpectedCurrentSha256 $newHash | Out-Null
Assert ((Get-Content "$root\live.toml" -Raw) -eq 'theme = "old"') 'restore puts the backup content back'
Assert ((Get-Content "$root\live.toml.before-rollback" -Raw) -eq 'theme = "new"') 'restore keeps the replaced file'
Refuses { Restore-FileAtomic -Backup "$root\bk\config.toml" -Target "$root\live.toml" -ExpectedBackupSha256 $oldHash -ExpectedCurrentSha256 $oldHash } 'second restore will not overwrite prior evidence' 'Prior rollback evidence'

# ===== release selection and hash trust =====
$assetName = 'Sheprd-20261108.1-x86_64-pc-windows-msvc-setup.exe'
function New-Release([string]$digest) {
    return [pscustomobject]@{ tag_name = 'v20261108.1'; prerelease = $false; draft = $false; assets = @(
        [pscustomobject]@{ name = 'Sheprd-20261108.1-aarch64-pc-windows-msvc-setup.exe'; size = 9; digest = ('sha256:' + ('a' * 64)) },
        [pscustomobject]@{ name = 'Sheprd-20261108.1-x86_64-unknown-linux-gnu.deb'; size = 9; digest = ('sha256:' + ('b' * 64)) },
        [pscustomobject]@{ name = $assetName; size = 15; digest = "sha256:$digest" }) }
}
$sb = New-Sandbox
Write-Text "$sb\dl\$assetName" 'installer-bytes'
$artifactHash = Get-LockedSha256 "$sb\dl\$assetName"
$release = New-Release $artifactHash.ToLower()
$shaFile = "$($artifactHash.ToLower())  $assetName`n"
$winManifest = '{"schema":3,"version":"20261108.1","assets":[{"target":"x86_64-pc-windows-msvc","name":"' + $assetName + '","size":15,"sha256":"' + $artifactHash.ToLower() + '"},{"target":"aarch64-pc-windows-msvc","name":"Sheprd-20261108.1-aarch64-pc-windows-msvc-setup.exe","size":9,"sha256":"' + ('a' * 64) + '"}]}'
Assert ((Select-ReleaseAsset $release).name -eq $assetName) 'x86_64 Windows installer selected, not ARM64 or Linux'
Refuses { Select-ReleaseAsset ([pscustomobject]@{ tag_name = 'v20261108.1'; prerelease = $true; draft = $false; assets = $release.assets }) } 'prerelease refused' 'Prerelease'
Refuses { Select-ReleaseAsset ([pscustomobject]@{ tag_name = 'v20261108.1'; prerelease = $false; draft = $false; assets = @($release.assets[0]) }) } 'release without the x86_64 installer refused' 'Exactly one'
Refuses { New-ReleaseEvidence -Release $release } 'single hash source is not trusted' 'Fewer than two'
Refuses { New-ReleaseEvidence -Release $release -Sha256FileText "$('c' * 64)  $assetName" } 'disagreeing hash sources refused' 'disagree'
Refuses { New-ReleaseEvidence -Release $release -Sha256FileText "$($artifactHash.ToLower())  other-file.exe" } 'hash file for another asset does not count' 'Fewer than two'
$evidence = New-ReleaseEvidence -Release $release -Sha256FileText $shaFile -WindowsManifestJson $winManifest
Assert (@($evidence.sources).Count -eq 3 -and $evidence.sha256 -eq $artifactHash) 'three agreeing sources produce release evidence'
$goodSig = { param($p) @{ status = 'Valid'; subject = 'CN=Fabien Penso, O=Fabien Penso, L=Los Altos, S=ca, C=US' } }
Assert ((Test-ArtifactTrust -ArtifactPath "$sb\dl\$assetName" -ReleaseEvidence $evidence -SignatureProbe $goodSig) -eq 'TRUSTED') 'artifact trusted with hash and pinned publisher'
Refuses { Test-ArtifactTrust -ArtifactPath "$sb\dl\$assetName" -ReleaseEvidence $evidence -SignatureProbe { param($p) @{ status = 'Valid'; subject = 'CN=Someone Else' } } } 'wrong publisher refused' 'publisher'
Refuses { Test-ArtifactTrust -ArtifactPath "$sb\dl\$assetName" -ReleaseEvidence $evidence -SignatureProbe { param($p) @{ status = 'NotSigned'; subject = '' } } } 'unsigned artifact refused' 'signature'
Refuses { Test-ArtifactTrust -ArtifactPath "$sb\dl\$assetName" -ReleaseEvidence @{ schema = 'starq.herdr.release.v1'; sources = @('operator'); assetName = $assetName; size = '15'; sha256 = $artifactHash; publisherSubject = 'x' } -SignatureProbe $goodSig } 'operator-supplied hash alone refused' 'two agreeing'
Write-Text "$sb\dl2\$assetName" 'installer-bytez'
Refuses { Test-ArtifactTrust -ArtifactPath "$sb\dl2\$assetName" -ReleaseEvidence $evidence -SignatureProbe $goodSig } 'altered artifact refused' 'Integrity'

# ===== compatibility =====
$matrix = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'herdr-compat.json') -Raw | ConvertFrom-Json
Assert ((Test-VersionCompatibility '20261108.1' '0.9.5' '22' $matrix) -eq 'VERIFIED') 'observed pair is verified'
Assert ((Test-VersionCompatibility '20261108.1' '0.9.5' '23' $matrix) -eq 'UNVERIFIED') 'different protocol is unverified'
Assert ((Test-VersionCompatibility '20261201.1' '0.9.5' '22' $matrix) -eq 'UNVERIFIED') 'unobserved desktop version is unverified'

# ===== Path A update =====
function New-Baseline([string]$serverTicks = '100', $panes = $null) {
    if ($null -eq $panes) { $panes = @([pscustomobject]@{ pane_id = 'w1:p1'; terminal_id = 't1'; agent_status = 'unknown'; agent_session = [pscustomobject]@{ agent = 'codex'; value = 's-1' } }, [pscustomobject]@{ pane_id = 'w1:p2'; terminal_id = 't2'; agent_status = 'unknown' }) }
    return @{ processes = @(@{ role = 'server'; pid = '2380'; createdTicksUtc = $serverTicks }, @{ role = 'pane-child'; pid = '12088'; createdTicksUtc = '101' }, @{ role = 'remote-control'; pid = '4236'; createdTicksUtc = '90' }); panes = $panes }
}
function New-Plan($sandbox) {
    Write-Text "$sandbox\cfg\config-gpui.toml" 'managed = 1'
    if (-not (Test-Path "$sandbox\dl\$assetName")) { Write-Text "$sandbox\dl\$assetName" 'installer-bytes' }
    return @{ ReleaseEvidence = $evidence; ServerVersion = '0.9.5'; ServerProtocol = '22'; CompatibilityMatrix = $matrix; ArtifactRelative = "dl\$assetName"
        SignatureProbe = $goodSig; ConfigRelative = 'cfg'; BackupRelative = 'backup'; ConfigFiles = @('config-gpui.toml')
        BaselineProbe = { New-Baseline }; Installer = { param($artifact) Write-Text "$script:installTarget\sheprd.exe" 'new'; 0 } }
}
$ctx = @{ Mode = 'Sandbox'; SandboxRoot = $sb }
$script:installTarget = "$sb\install"
$result = Invoke-DesktopUpdate -Context $ctx -Plan (New-Plan $sb)
Assert ($result.status -eq 'UPDATED' -and $result.continuity.ok) 'desktop update completes with continuity'
Assert ((Get-Content (Get-JournalPath $sb) -Raw | ConvertFrom-Json).state -eq 'COMPLETED') 'journal records completion'
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Live' } -Plan (New-Plan $sb) } 'live mode refused' 'Live execution is disabled'
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = 'D:\StarqTech\Herdr-20261028.1-x86_64-pc-windows-msvc' } -Plan (New-Plan $sb) } 'sandbox outside the fixture area refused' 'outside the authorized'
$unmarked = Join-Path (Get-FixtureParent) ([Guid]::NewGuid().ToString()); New-Item -ItemType Directory -Path $unmarked | Out-Null
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $unmarked } -Plan (New-Plan $sb) } 'unmarked sandbox refused' 'marker'

$s2 = New-Sandbox; $plan = New-Plan $s2; $plan.ServerProtocol = '23'
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s2 } -Plan $plan } 'incompatible version refused before any change' 'incompatible or unverified'
Assert (-not (Test-Path "$s2\backup") -and -not (Test-Path (Get-JournalPath $s2))) 'refused update changed nothing'

$s3 = New-Sandbox; $plan = New-Plan $s3
$plan.Installer = { param($artifact) [IO.File]::WriteAllText("$script:failRoot\cfg\config-gpui.toml", 'half-migrated'); throw 'installer crashed' }
$script:failRoot = $s3
$result = Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s3 } -Plan $plan
Assert ($result.status -eq 'INSTALL_FAILED_ROLLED_BACK') 'failed installation reported'
Assert ((Get-Content "$s3\cfg\config-gpui.toml" -Raw) -eq 'managed = 1') 'failed installation restores configuration'
Assert ((Get-Content "$s3\cfg\config-gpui.toml.before-rollback" -Raw) -eq 'half-migrated') 'failed installation keeps the damaged file as evidence'
Assert ((Get-Content (Get-JournalPath $s3) -Raw | ConvertFrom-Json).state -eq 'ROLLED_BACK') 'journal records the rollback'

$s4 = New-Sandbox; $plan = New-Plan $s4; $plan.Installer = { param($artifact) 5 }
Assert ((Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s4 } -Plan $plan).status -eq 'INSTALL_FAILED_ROLLED_BACK') 'non-zero installer exit treated as failure'

$s5 = New-Sandbox; $plan = New-Plan $s5
Set-Journal $s5 'desktop-update' 'IN_PROGRESS' 'install'
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s5 } -Plan $plan } 'interrupted operation blocks a new one' 'Interrupted operation'
Refuses { Invoke-ServerMigration -Context @{ Mode = 'Sandbox'; SandboxRoot = $s5 } -Backend windows -Approval @{} -Panes @() -Runner { } -VersionProbe { '0.9.4' } } 'interrupted operation blocks migration too' 'Interrupted operation'

$s6 = New-Sandbox; $plan = New-Plan $s6; $script:probeCalls = 0
$plan.BaselineProbe = { $script:probeCalls++; if ($script:probeCalls -eq 1) { New-Baseline '100' } else { New-Baseline '999' } }
$result = Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s6 } -Plan $plan
Assert ($result.status -eq 'CONTINUITY_FAILED' -and $result.continuity.lostProcesses -contains 'server:2380') 'restarted server (same PID, new start time) detected'
Assert ((Get-Content (Get-JournalPath $s6) -Raw | ConvertFrom-Json).state -eq 'CONTINUITY_FAILED') 'continuity failure is not recorded as success'

$s7 = New-Sandbox; $plan = New-Plan $s7
$dupPanes = @([pscustomobject]@{ pane_id = 'w1:p1'; terminal_id = 't1'; agent_session = [pscustomobject]@{ agent = 'claude'; value = 'same' } }, [pscustomobject]@{ pane_id = 'w1:p2'; terminal_id = 't2'; agent_session = [pscustomobject]@{ agent = 'claude'; value = 'same' } })
$plan.BaselineProbe = { New-Baseline '100' $dupPanes }
Refuses { Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s7 } -Plan $plan } 'duplicate agent session blocks update' 'Duplicate sessions'
$script:probeCalls = 0; $s8 = New-Sandbox; $plan = New-Plan $s8
$plan.BaselineProbe = { $script:probeCalls++; if ($script:probeCalls -eq 1) { New-Baseline } else { New-Baseline '100' $dupPanes } }
Assert ((Invoke-DesktopUpdate -Context @{ Mode = 'Sandbox'; SandboxRoot = $s8 } -Plan $plan).status -eq 'CONTINUITY_FAILED') 'duplicate session appearing after update fails continuity'
$remoteGone = New-Baseline; $remoteGone.processes = @($remoteGone.processes | Where-Object { $_.role -ne 'remote-control' })
Assert ((Compare-Continuity -Before (New-Baseline) -After $remoteGone).ok) 'remote-control replacement is not a backend loss by default'
Assert (-not (Compare-Continuity -Before (New-Baseline) -After $remoteGone -MustSurviveRoles @('server', 'pane-child', 'remote-control')).ok) 'remote-control loss is caught when required'
Assert (-not (Compare-Continuity -Before @{ processes = @(); panes = @() } -After @{ processes = @(); panes = @() }).ok) 'empty baseline never counts as continuity'

# ===== rollback entry =====
Refuses { Invoke-DesktopRollback -Context @{ Mode = 'Sandbox'; SandboxRoot = $s2 } -BackupRelative 'backup' -ConfigRelative 'cfg' } 'rollback without backup evidence refused' 'Backup evidence missing'
[IO.File]::WriteAllText("$sb\cfg\config-gpui.toml", 'drifted')
Assert (@((Invoke-DesktopRollback -Context $ctx -BackupRelative 'backup' -ConfigRelative 'cfg').restored).Count -eq 1 -and (Get-Content "$sb\cfg\config-gpui.toml" -Raw) -eq 'managed = 1') 'rollback restores drifted configuration'
Assert (@((Invoke-DesktopRollback -Context $ctx -BackupRelative 'backup' -ConfigRelative 'cfg').restored).Count -eq 0) 'rollback is idempotent when nothing differs'

# ===== detach and reconnect =====
$script:calls = @()
$detach = Invoke-DesktopDetach -Context $ctx -Runner { param($tool, $arguments) $script:calls += "$tool $($arguments -join ' ')"; @{ exitCode = 0 } } -BaselineProbe { New-Baseline }
Assert ($detach.status -eq 'DETACHED' -and $script:calls[0] -eq 'sheprd app quit') 'detach uses sheprd app quit and verifies continuity'
Refuses { Invoke-DesktopDetach -Context $ctx -Runner { param($tool, $arguments) @{ exitCode = 6 } } -BaselineProbe { New-Baseline } } 'failed desktop quit surfaces' 'quit failed'
$hosts = @('Local', 'Ubuntu'); $workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room')
$script:launches = 0
$connected = { @{ running = $true; desktopProcesses = @(1); onlineHosts = @('Local', 'Ubuntu'); workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room') } }
$r = Invoke-DesktopReconnect -Context $ctx -StatusProbe $connected -Launch { $script:launches++ } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces
Assert ($r.status -eq 'CONNECTED' -and $script:launches -eq 0) 'running desktop is not launched a second time'
$script:launches = 0; $script:polls = 0
$slow = { $script:polls++; if ($script:polls -le 2) { @{ running = $false } } else { @{ running = $true; desktopProcesses = @(1); onlineHosts = @('Local', 'Ubuntu'); workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room') } } }
$r = Invoke-DesktopReconnect -Context $ctx -StatusProbe $slow -Launch { $script:launches++ } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces
Assert ($r.status -eq 'CONNECTED' -and $script:launches -eq 1 -and $r.launched) 'stopped desktop launched exactly once and waited for'
$script:launches = 0
Refuses { Invoke-DesktopReconnect -Context $ctx -StatusProbe { @{ running = $true; desktopProcesses = @(1); onlineHosts = @('Local'); workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room') } } -Launch { $script:launches++ } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces -MaxAttempts 3 } 'host that stays offline is a failed recovery' 'Connection recovery failed'
Refuses { Invoke-DesktopReconnect -Context $ctx -StatusProbe { @{ running = $false } } -Launch { $script:launches++ } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces -MaxAttempts 2 } 'desktop that never starts is a failed recovery' 'Connection recovery failed'
Refuses { Invoke-DesktopReconnect -Context $ctx -StatusProbe { @{ running = $true; desktopProcesses = @(1); onlineHosts = @('Local', 'Ubuntu'); workspaces = @('StarqERP', 'Hoadhaa') } } -Launch { } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces -MaxAttempts 2 } 'missing workspace is a failed recovery' 'Connection recovery failed'
Refuses { Invoke-DesktopReconnect -Context $ctx -StatusProbe { @{ running = $true; desktopProcesses = @(1, 2); onlineHosts = @('Local', 'Ubuntu'); workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room') } } -Launch { } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces } 'two desktop processes refused' 'duplicate client'
Refuses { Invoke-DesktopReconnect -Context $ctx -StatusProbe { @{ running = $true; desktopProcesses = @(1); onlineHosts = @('Local', 'Ubuntu'); workspaces = @('StarqERP', 'Hoadhaa', 'starq-ops-room', 'StarqERP-2') } } -Launch { } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces } 'replacement workspace refused' 'Unexpected workspaces'
Refuses { Invoke-DesktopReconnect -Context @{ Mode = 'Live' } -StatusProbe $connected -Launch { } -ExpectedHosts $hosts -ExpectedWorkspaces $workspaces } 'live reconnect refused' 'Live execution is disabled'

# ===== session recovery classification =====
$agentPane = [pscustomobject]@{ pane_id = 'w1:p1'; agent_session = [pscustomobject]@{ agent = 'codex'; value = 's-1' } }
$shellPane = [pscustomobject]@{ pane_id = 'w1:p2' }
$oddPane = [pscustomobject]@{ pane_id = 'w1:p3'; agent_session = [pscustomobject]@{ agent = 'unknown-tool'; value = 's-3' } }
Assert ((Get-SessionRecoveryClass -Pane $agentPane -Path A -ProcessSurvived $true) -eq 'LIVE_PROCESS_PRESERVED') 'Path A surviving process classified'
Assert ((Get-SessionRecoveryClass -Pane $agentPane -Path A -ProcessSurvived $false) -eq 'PROCESS_LOST') 'Path A lost process classified'
Assert ((Get-SessionRecoveryClass -Pane $agentPane -Path B) -eq 'RESUME_UNVERIFIED') 'session id alone is not a verified resume'
Assert ((Get-SessionRecoveryClass -Pane $agentPane -Path B -VerifiedResumeSessions @('s-1')) -eq 'RESUME_VERIFIED') 'recorded resume test classifies as verified'
Assert ((Get-SessionRecoveryClass -Pane $shellPane -Path B) -eq 'LAYOUT_ONLY') 'pane without a session is layout only'
Assert ((Get-SessionRecoveryClass -Pane $oddPane -Path B) -eq 'LAYOUT_ONLY') 'unknown agent is layout only'

# ===== Path B migration gating =====
$m = New-Sandbox; $mctx = @{ Mode = 'Sandbox'; SandboxRoot = $m }
$panes = @($agentPane, $shellPane)
$approval = @{ schema = 'starq.herdr.approval.v1'; founderApproved = $true; roomSequence = '99999'; backend = 'windows'; fromVersion = '0.9.4'; toVersion = '0.9.5'; acceptedLossPanes = @('w1:p2') }
$script:version = '0.9.4'; $script:ran = @()
$runner = { param($backend, $tool, $arguments) $script:ran += "$backend $tool $($arguments -join ' ')"; $script:version = '0.9.5'; @{ exitCode = 0 } }
$probe = { $script:version }
Refuses { Invoke-ServerMigration -Context $mctx -Backend windows -Approval @{ schema = 'starq.herdr.approval.v1'; founderApproved = 'true'; roomSequence = '1'; backend = 'windows' } -Panes $panes -Runner $runner -VersionProbe $probe } 'string approval is not approval' 'approval evidence missing'
Refuses { Invoke-ServerMigration -Context $mctx -Backend ubuntu -Approval $approval -Panes $panes -Runner $runner -VersionProbe $probe } 'approval for another backend refused' 'different backend'
Refuses { Invoke-ServerMigration -Context $mctx -Backend windows -Approval $approval -Panes $panes -Runner $runner -VersionProbe $probe } 'unverified resume not accepted as loss refused' 'RESUME_UNVERIFIED'
$wrongFrom = $approval.Clone(); $wrongFrom.fromVersion = '0.9.3'
Refuses { Invoke-ServerMigration -Context $mctx -Backend windows -Approval $wrongFrom -Panes $panes -VerifiedResumeSessions @('s-1') -Runner $runner -VersionProbe $probe } 'running version other than approved refused' 'approved starting version'
Refuses { Invoke-ServerMigration -Context $mctx -Backend windows -Approval $approval -Panes @() -Runner $runner -VersionProbe $probe } 'migration with no classified sessions refused' 'No sessions classified'
Assert ($script:ran.Count -eq 0) 'no refused migration reached the update command'
Refuses { Invoke-ServerMigration -Context @{ Mode = 'Live' } -Backend windows -Approval $approval -Panes $panes -VerifiedResumeSessions @('s-1') -Runner $runner -VersionProbe $probe } 'live migration refused' 'Live execution is disabled'
$done = Invoke-ServerMigration -Context $mctx -Backend windows -Approval $approval -Panes $panes -VerifiedResumeSessions @('s-1') -Runner $runner -VersionProbe $probe -Handoff
Assert ($done.status -eq 'MIGRATED' -and $script:ran[0] -eq 'windows herdr update --handoff' -and $done.sessionClasses['w1:p2'] -eq 'LAYOUT_ONLY') 'approved migration runs herdr update and reports classes'
$m2 = New-Sandbox; $script:version = '0.9.4'
Refuses { Invoke-ServerMigration -Context @{ Mode = 'Sandbox'; SandboxRoot = $m2 } -Backend windows -Approval $approval -Panes $panes -VerifiedResumeSessions @('s-1') -Runner { param($b, $t, $a) @{ exitCode = 1 } } -VersionProbe $probe } 'failed server update surfaces' 'Server update failed'
Assert ((Get-Content (Get-JournalPath $m2) -Raw | ConvertFrom-Json).state -eq 'FAILED') 'failed migration journaled as FAILED'
$m3 = New-Sandbox; $script:version = '0.9.4'
Refuses { Invoke-ServerMigration -Context @{ Mode = 'Sandbox'; SandboxRoot = $m3 } -Backend windows -Approval $approval -Panes $panes -VerifiedResumeSessions @('s-1') -Runner { param($b, $t, $a) @{ exitCode = 0 } } -VersionProbe $probe } 'update that leaves the old version running is a failure' 'not the approved'
$m4 = New-Sandbox; $script:version = '0.9.5'; $script:ran = @()
$ubuntuApproval = @{ schema = 'starq.herdr.approval.v1'; founderApproved = $true; roomSequence = '99998'; backend = 'ubuntu'; fromVersion = '0.9.5'; toVersion = '0.9.6'; acceptedLossPanes = @('w1:p2') }
$done = Invoke-ServerMigration -Context @{ Mode = 'Sandbox'; SandboxRoot = $m4 } -Backend ubuntu -Approval $ubuntuApproval -Panes $panes -VerifiedResumeSessions @('s-1') -Runner { param($b, $t, $a) $script:ran += "$b $t $($a -join ' ')"; $script:version = '0.9.6'; @{ exitCode = 0 } } -VersionProbe $probe
Assert ($done.backend -eq 'ubuntu' -and $script:ran[0] -eq 'ubuntu herdr update') 'Ubuntu backend migrates independently of Windows'

# ===== evidence-backed preflight =====
$e = New-Sandbox; New-Item -ItemType Directory -Path "$e\ev" | Out-Null
Write-Text "$e\cfg\config.toml" 'a = 1'; New-BackupSet -SourceRoot "$e\cfg" -BackupRoot "$e\bk" -RelativeFiles @('config.toml') | Out-Null
$baseline = New-Baseline; $baseline['schema'] = 'starq.herdr.baseline.v1'
Write-SealedEvidence "$e\ev\baseline.json" $baseline | Out-Null
Write-SealedEvidence "$e\ev\release.json" $evidence | Out-Null
Write-SealedEvidence "$e\ev\review.json" @{ schema = 'starq.herdr.review.v1'; accepted = $true; reviewer = 'copilot'; author = 'claude'; roomSequence = '99997' } | Out-Null
Assert ((Test-EvidencePreflight -Path A -EvidenceDir "$e\ev" -BackupRoot "$e\bk").status -eq 'EVIDENCE_VERIFIED') 'sealed evidence passes Path A preflight'
Assert ((Test-EvidencePreflight -Path B -EvidenceDir "$e\ev" -BackupRoot "$e\bk").failed -contains 'founderApproval') 'Path B preflight needs sealed Founder approval'
Assert ((Test-EvidencePreflight -Path A -EvidenceDir "$e\ev" -BackupRoot "$e\missing").failed -contains 'backup') 'preflight fails without backup evidence'
$text = [IO.File]::ReadAllText("$e\ev\baseline.json"); [IO.File]::WriteAllText("$e\ev\baseline.json", $text.Replace('2380', '2381'))
Assert ((Test-EvidencePreflight -Path A -EvidenceDir "$e\ev" -BackupRoot "$e\bk").failed -contains 'baseline') 'edited evidence fails its seal'
$e2 = New-Sandbox; New-Item -ItemType Directory -Path "$e2\ev" | Out-Null
Write-SealedEvidence "$e2\ev\baseline.json" $baseline | Out-Null; Write-SealedEvidence "$e2\ev\release.json" $evidence | Out-Null
Write-SealedEvidence "$e2\ev\review.json" @{ schema = 'starq.herdr.review.v1'; accepted = $true; reviewer = 'claude'; author = 'claude'; roomSequence = '1' } | Out-Null
Assert ((Test-EvidencePreflight -Path A -EvidenceDir "$e2\ev" -BackupRoot "$e\bk").failed -contains 'independentAcceptance') 'self-review is not independent acceptance'
$pf = Join-Path (Split-Path -Parent $PSScriptRoot) 'herdr-preflight.ps1'
$out = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $pf -Path A -EvidenceDir "$e2\ev" -BackupRoot "$e\bk"
Assert ($LASTEXITCODE -eq 2 -and (($out | Out-String | ConvertFrom-Json).status -eq 'BLOCKED')) 'preflight script blocks on unverified evidence'

# ===== scheduling =====
$idle = @([pscustomobject]@{ pane_id = 'w1:p1'; agent_status = 'idle' }, [pscustomobject]@{ pane_id = 'w1:p2'; agent_status = 'done' })
$night = Get-Date -Year 2026 -Month 11 -Day 10 -Hour 3 -Minute 0 -Second 0
Assert ((Get-MaintenanceDecision -Panes $idle -NowLocal $night).decision -eq 'WINDOW_OPEN') 'idle floor inside the window opens'
Assert ((Get-MaintenanceDecision -Panes $idle -NowLocal $night.AddHours(9)).decision -eq 'DEFER_OUTSIDE_WINDOW') 'outside the window defers'
Assert ((Get-MaintenanceDecision -Panes ($idle + [pscustomobject]@{ pane_id = 'w1:p3'; agent_status = 'working' }) -NowLocal $night).decision -eq 'DEFER_ACTIVE_AGENTS') 'working agent defers'
Assert ((Get-MaintenanceDecision -Panes ($idle + [pscustomobject]@{ pane_id = 'w1:p3'; agent_status = 'blocked' }) -NowLocal $night).decision -eq 'DEFER_ACTIVE_AGENTS') 'blocked agent defers'
$unknown = $idle + [pscustomobject]@{ pane_id = 'w1:p3'; agent_status = 'unknown' }
Assert ((Get-MaintenanceDecision -Panes $unknown -NowLocal $night).decision -eq 'DEFER_UNKNOWN_STATUS') 'unknown status is not treated as idle'
Assert ((Get-MaintenanceDecision -Panes $unknown -NowLocal $night -ConfirmedIdlePanes @('w1:p3')).decision -eq 'WINDOW_OPEN') 'operator-confirmed idle pane opens the window'
$spec = New-ReleaseCheckTaskSpec
Assert ($spec.registers -eq $false -and $spec.command -match 'herdr-discover\.ps1" -Online' -and $spec.command -notmatch 'Apply|update|install') 'release check is discovery only and registers nothing'

Write-Host "TOTAL $script:passed passed; fixture parent: $(Get-FixtureParent)"
