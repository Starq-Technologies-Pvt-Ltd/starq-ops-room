[CmdletBinding()]
param([ValidateSet('A','B')][string]$Path = 'A', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'rollback' }
Write-Result 'rollback' 'PLAN_ONLY' @{ path = $Path; executed = $false; implementation = 'Invoke-DesktopRollback in herdr-ops.ps1 (sandbox-tested): verifies the backup manifest, then restores each changed file atomically and keeps the replaced file.'; pathA = 'Quit Sheprd; restore config-gpui.toml from the verified backup; re-import the exported "Herdr UI Remote Control" task XML; launch the preserved desktop directory. Backends are not touched.'; requirement = 'Identify original binaries and verified backups; stop for approval if rollback interrupts sessions or changes persistent state. A backend downgrade is Path B.' }