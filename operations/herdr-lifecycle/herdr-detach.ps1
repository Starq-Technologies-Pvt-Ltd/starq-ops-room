[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'detach' }
Write-Result 'detach' 'PLAN_ONLY' @{ path = $Path; action = 'No client or terminal detached.'; requirement = 'Establish installed-version detach semantics and per-session process persistence; client close, terminal detach and server stop are distinct.' }
