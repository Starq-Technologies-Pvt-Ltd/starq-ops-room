[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'reconnect' }
Write-Result 'reconnect' 'PLAN_ONLY' @{ path = $Path; executed = $false; requirement = 'Use recorded original endpoints; do not create replacement workspaces. Validate each client, server, ACP and authenticated remote connection before declaring recovery.' }
