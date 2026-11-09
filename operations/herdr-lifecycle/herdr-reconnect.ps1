[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'reconnect' }
Write-Result 'reconnect' 'PLAN_ONLY' @{ path = $Path; executed = $false; implementation = 'Invoke-DesktopReconnect in herdr-ops.ps1 (sandbox-tested): refuses a second desktop, launches only when none runs, requires every recorded host and workspace, rejects unexpected workspaces.'; verifiedInterface = 'sheprd-launcher.exe, `sheprd status`, `sheprd host list`, `sheprd window reconnect`, `herdr machine status` for saved SSH machines.'; requirement = 'Use recorded original endpoints; do not create replacement workspaces. Validate each client, server, ACP and authenticated remote connection before declaring recovery.' }