[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'rollback' }
Write-Result 'rollback' 'PLAN_ONLY' @{ path = $Path; executed = $false; requirement = 'Identify original binaries and verified backups; stop for approval if rollback interrupts sessions or changes persistent state.' }
