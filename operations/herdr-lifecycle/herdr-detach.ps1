[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'detach' }
Write-Result 'detach' 'PLAN_ONLY' @{ path = $Path; action = 'No client or terminal detached.'; implementation = 'Invoke-DesktopDetach in herdr-ops.ps1 (sandbox-tested): baseline, `sheprd app quit`, continuity compare.'; verifiedInterface = '`sheprd app quit` and `sheprd window detach` (Sheprd 20261108.1 help: quitting leaves Herdr and its terminals running).'; requirement = 'Client close, window detach and server stop are distinct. `herdr server stop` and `herdr session stop` end pane processes and belong to Path B only.' }