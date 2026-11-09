[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('A','B')][string]$Path, [Parameter(Mandatory=$true)][string]$EvidenceFile)
. "$PSScriptRoot\herdr-common.ps1"
try {
    $e = Read-JsonFile $EvidenceFile
    $checks = [ordered]@{}
    foreach ($name in @('inventoryComplete','windowsBaseline','wslBaseline','releaseIntegrity','compatibility','backupVerified','rollbackPlan','independentReview')) { $checks[$name] = Require-True (Get-Field $e $name) }
    if ($Path -eq 'A') { $checks['serverUnchanged'] = Require-True (Get-Field $e 'serverUnchanged'); $checks['clientOnly'] = Require-True (Get-Field $e 'clientOnly') }
    else {
        $checks['founderApproval'] = Require-True (Get-Field $e 'founderApproval')
        $checks['recoveryPlanVerified'] = Require-True (Get-Field $e 'recoveryPlanVerified')
        $sessions = @(Get-Field $e 'sessions' @())
        $checks['allSessionsClassified'] = ($sessions.Count -gt 0 -and @($sessions | Where-Object { -not (Require-True (Get-Field $_ 'recoveryVerified')) }).Count -eq 0)
    }
    $failed = @($checks.Keys | Where-Object { -not $checks[$_] })
    $status = if ($failed.Count) { 'BLOCKED' } else { 'EVIDENCE_DECLARED' }
    Write-Result 'preflight' $status @{ path = $Path; checks = $checks; failed = $failed; warning = 'Assertions are operator-supplied, not independently verified; no live action is enabled.' }
    if ($failed.Count) { exit 2 }
} catch { Write-Result 'preflight' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }
