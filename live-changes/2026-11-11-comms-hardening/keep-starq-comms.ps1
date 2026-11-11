<#
keep-starq-comms.ps1 - idempotent keeper for the Starq communications stack on Nitro.
Founder directive 2026-11-11. Run at logon and every 5 minutes by the scheduled task
"StarqTech-StarqBot-Logon". Starts only what is not running; never restarts a healthy process.

  1. StarqBot Telegram gateway  -> start-starq-bot-if-needed.ps1 (handles the dead-pid stale lock)
  2. Room dispatcher            -> scripts\room-dispatcher.mjs, existing checkpoint directory
  3. Cloudroom backend          -> Starq Command.exe (the Cloudroom desktop app and its services)

It never resets a cursor, replays history, releases a safety hold or takes a lease.
#>
[CmdletBinding()]
param([switch]$StatusOnly)
$ErrorActionPreference = 'Continue'
$root   = 'D:\StarqTech\agent-comms'
$logDir = Join-Path $root 'logs'
$log    = Join-Path $logDir 'keep-starq-comms.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }
function Note($m) { $line = "$(Get-Date -Format o) $m"; Add-Content -Path $log -Value $line -Encoding utf8; Write-Output $line }
if ((Test-Path $log) -and (Get-Item $log).Length -gt 2MB) { Move-Item $log "$log.1" -Force }

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node.exe -ErrorAction Stop).Source }
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue

# 1. StarqBot
$gateway = $procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*starq-bot-gateway.mjs*' }
if ($gateway) { if ($StatusOnly) { Note "starqbot: running pid=$($gateway.ProcessId -join ',')" } }
elseif ($StatusOnly) { Note 'starqbot: NOT RUNNING' }
else {
    Note 'starqbot: not running; starting through start-starq-bot-if-needed.ps1'
    try { & (Join-Path $root 'scripts\start-starq-bot-if-needed.ps1') 2>&1 | ForEach-Object { Note "  $_" } } catch { Note "  start failed: $_" }
}

# 2. Room dispatcher (single instance; its own lock also refuses a second copy)
$dispatcher = $procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*room-dispatcher.mjs*' -and $_.CommandLine -notlike '*--dry-run*' -and $_.CommandLine -notlike '*--once*' }
if ($dispatcher) { if ($StatusOnly) { Note "dispatcher: running pid=$($dispatcher.ProcessId -join ',')" } }
elseif ($StatusOnly) { Note 'dispatcher: NOT RUNNING' }
else {
    $herdr = Get-Process herdr -ErrorAction SilentlyContinue
    if (-not $herdr) { Note 'dispatcher: Herdr is not running yet; will retry on the next run' }
    else {
        $env:COMMS_DISPATCH_STATE_DIR = Join-Path $root 'state\room-dispatch-codex-live'   # existing checkpoint
        Remove-Item Env:HERDR_PANE_ID, Env:HERDR_TAB_ID, Env:HERDR_WORKSPACE_ID -ErrorAction SilentlyContinue
        $p = Start-Process -FilePath $node -ArgumentList '"D:\StarqTech\agent-comms\scripts\room-dispatcher.mjs"' -WorkingDirectory $root -WindowStyle Hidden -PassThru
        Note "dispatcher: started pid=$($p.Id) state=$($env:COMMS_DISPATCH_STATE_DIR)"
    }
}

# 3. Cloudroom backend (Starq Command desktop app)
$cloudroomExe = Join-Path $env:LOCALAPPDATA 'Programs\Starq-Command\Starq Command.exe'
$cloudroom = Get-Process 'Starq Command' -ErrorAction SilentlyContinue
if ($cloudroom) { if ($StatusOnly) { Note "cloudroom: running ($($cloudroom.Count) processes)" } }
elseif ($StatusOnly) { Note 'cloudroom: NOT RUNNING' }
elseif (Test-Path $cloudroomExe) { Start-Process -FilePath $cloudroomExe; Note 'cloudroom: started Starq Command.exe' }
else { Note "cloudroom: executable not found at $cloudroomExe" }
