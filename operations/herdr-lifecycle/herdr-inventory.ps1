[CmdletBinding()]
param([string]$WindowsHerdr = '', [string]$WslDistribution = '', [string]$WslHerdr = '', [switch]$IncludePaneMetadata)
. "$PSScriptRoot\herdr-common.ps1"
try {
    $windows = @{ status = 'NOT_CHECKED'; panes = 'NOT_CHECKED' }
    $ubuntu = @{ status = 'NOT_CHECKED'; panes = 'NOT_CHECKED' }
    if ($WindowsHerdr) {
        $windows.status = Invoke-FixedHerdr $WindowsHerdr @('status')
        if ($IncludePaneMetadata) { $windows.panes = Invoke-FixedHerdr $WindowsHerdr @('pane','list') }
    }
    if ($WslDistribution -and $WslHerdr) {
        # WSL is queried only when explicitly named, to avoid starting a stopped distribution.
        $running = (& wsl.exe --list --running --quiet 2>$null | Out-String) -replace "`0", ''
        if ($running -notmatch ('(?m)^\s*' + [regex]::Escape($WslDistribution) + '\s*$')) {
            $ubuntu.status = @{ ok = $false; error = 'distribution_not_confirmed_running' }
        } else {
            $out = & wsl.exe -d $WslDistribution -- $WslHerdr status 2>&1 | Out-String
            $ubuntu.status = @{ ok = ($LASTEXITCODE -eq 0); output = $out.Trim() }
            if ($IncludePaneMetadata) { $out = & wsl.exe -d $WslDistribution -- $WslHerdr pane list 2>&1 | Out-String; $ubuntu.panes = @{ ok = ($LASTEXITCODE -eq 0); output = $out.Trim() } }
        }
    } elseif ($WslDistribution -or $WslHerdr) { throw 'Both WslDistribution and WslHerdr are required.' }
    $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('herdr.exe','herdr-gpui.exe','herdr-gpui-launcher.exe','herdr-remote-control.exe','herdr-acp.exe') } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CreationDate)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 7443 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
    Write-Result 'inventory' 'OBSERVED' @{ windows = $windows; wsl = $ubuntu; processes = $processes; remote7443Listeners = $listeners; warning = 'Pane metadata and paths may be sensitive; absent listener or process does not prove service health.' }
} catch { Write-Result 'inventory' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }
