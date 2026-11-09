# Read-only. Captures a sealed baseline of the live floor: process identities (PID + creation time), pane and
# workspace records, desktop hosts, remote control and saved SSH machines. Starts, stops and changes nothing.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$HerdrExe, [Parameter(Mandatory=$true)][string]$OutFile, [string]$SheprdExe = '', [string]$WslDistribution = '')
. "$PSScriptRoot\herdr-common.ps1"
. "$PSScriptRoot\herdr-ops.ps1"
try {
    $out = Get-NormalizedPath $OutFile
    if (-not $out.StartsWith('D:\StarqTech\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence must be written under D:\StarqTech.' }
    if (Test-Path -LiteralPath $out) { throw 'Evidence file exists; a baseline is never overwritten.' }
    $all = @(Get-CimInstance Win32_Process)
    $servers = @($all | Where-Object { $_.Name -eq 'herdr.exe' -and $_.CommandLine -match '\sserver\s*$' })
    $serverIds = @($servers | ForEach-Object { $_.ProcessId })
    $processes = @()
    foreach ($p in $all) {
        $role = $null
        if ($serverIds -contains $p.ProcessId) { $role = 'server' }
        elseif ($serverIds -contains $p.ParentProcessId) { $role = 'pane-child' }
        elseif ($p.Name -match '^(herdr|sheprd)-remote-control\.exe$') { $role = 'remote-control' }
        elseif ($p.Name -match '^(sheprd|herdr-gpui)\.exe$') { $role = 'desktop' }
        elseif ($p.Name -match '^(sheprd|herdr)-acp\.exe$') { $role = 'acp' }
        if ($role) { $processes += [ordered]@{ role = $role; pid = [string]$p.ProcessId; name = $p.Name; createdTicksUtc = [string]$p.CreationDate.ToUniversalTime().Ticks; path = $p.ExecutablePath } }
    }
    $status = Invoke-FixedHerdr $HerdrExe @('status')
    $panes = @(); $workspaces = @()
    $paneCall = Invoke-FixedHerdr $HerdrExe @('pane', 'list'); if ($paneCall.ok) { $panes = @(($paneCall.output | ConvertFrom-Json).result.panes) }
    $wsCall = Invoke-FixedHerdr $HerdrExe @('workspace', 'list'); if ($wsCall.ok) { $workspaces = @(($wsCall.output | ConvertFrom-Json).result.workspaces) }
    $machines = Invoke-FixedHerdr $HerdrExe @('machine', 'list')
    $desktop = @{ status = 'NOT_CHECKED' }
    if ($SheprdExe) { $desktop = @{ status = (Invoke-FixedHerdr $SheprdExe @('status')); hosts = (Invoke-FixedHerdr $SheprdExe @('host', 'list')); remote = (Invoke-FixedHerdr $SheprdExe @('remote', 'status')) } }
    $wsl = @{ status = 'NOT_CHECKED' }
    if ($WslDistribution) {
        $running = (& wsl.exe --list --running --quiet 2>$null | Out-String) -replace "`0", ''
        if ($running -notmatch ('(?m)^\s*' + [regex]::Escape($WslDistribution) + '\s*$')) { $wsl = @{ status = 'distribution_not_running' } }
        else {
            # Native stderr must not become a terminating error under PowerShell 5.1 (ps warns about the pipe's width).
            $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            try { $ps = & wsl.exe -d $WslDistribution -- ps -ww -o pid=,lstart=,args= -C herdr 2>$null | Out-String } finally { $ErrorActionPreference = $previous }
            $wsl = @{ status = 'observed'; processes = $ps.Trim() }
        }
    }
    $baseline = [ordered]@{ schema = 'starq.herdr.baseline.v1'; capturedUtc = [DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'); host = $env:COMPUTERNAME
        processes = $processes; panes = $panes; workspaces = $workspaces; herdrStatus = $status; sshMachines = $machines; desktop = $desktop; wsl = $wsl
        duplicateSessions = (Find-DuplicateSessions $panes) }
    Write-SealedEvidence $out $baseline | Out-Null
    Write-Result 'baseline' 'OBSERVED' @{ file = $out; servers = $servers.Count; processes = $processes.Count; panes = $panes.Count; workspaces = $workspaces.Count; warning = 'Contains working directories and session identifiers; do not publish. Process survival is not conversation health.' }
} catch { Write-Result 'baseline' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }