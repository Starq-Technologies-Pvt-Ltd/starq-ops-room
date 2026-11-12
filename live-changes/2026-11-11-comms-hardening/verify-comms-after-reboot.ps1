<#
verify-comms-after-reboot.ps1 - read-only check that the Starq comms stack came back unattended.
Run after Nitro has rebooted and the Founder account has signed in. Changes nothing, posts nothing.
Exit code 0 = everything verified, 1 = at least one check failed.
#>
$root = 'D:\StarqTech\agent-comms'
$fail = 0
function Check($name, [bool]$ok, $detail) { $mark = if ($ok) { 'PASS' } else { 'FAIL' }; if (-not $ok) { $script:fail++ }; "{0}  {1}  {2}" -f $mark, $name.PadRight(34), $detail }

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
"Boot time: $boot   (up $([int]((Get-Date) - $boot).TotalMinutes) min)"
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue

$task = Get-ScheduledTaskInfo -TaskName 'StarqTech-StarqBot-Logon' -ErrorAction SilentlyContinue
Check 'keeper task ran since boot' ($task -and $task.LastRunTime -gt $boot -and $task.LastTaskResult -eq 0) "last run $($task.LastRunTime) result $($task.LastTaskResult)"

$gw = $procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*starq-bot-gateway.mjs*' }
Check 'StarqBot gateway running' ([bool]$gw -and $gw[0].CreationDate -gt $boot) "pid $($gw.ProcessId -join ',')"
$status = (& 'C:\Program Files\nodejs\node.exe' "$root\scripts\gateway-supervisor.mjs" --status 2>&1 | Out-String)
Check 'gateway lock held, relay healthy' ($status -match 'Authoritative Lock: HELD' -and $status -match 'Relay Health: HEALTHY') (($status -split "`n" | Select-String 'Relay Health|Authoritative Lock|Safety Hold' | ForEach-Object { $_.Line.Trim() }) -join ' | ')

$herdr = Get-Process herdr -ErrorAction SilentlyContinue
Check 'Herdr running (needed by dispatcher)' ([bool]$herdr) $(if ($herdr) { 'running' } else { 'NOT running: open Herdr; the keeper starts the dispatcher within 5 minutes' })
$disp = $procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*room-dispatcher.mjs*' }
Check 'Room dispatcher running' ([bool]$disp -and $disp[0].CreationDate -gt $boot) "pid $($disp.ProcessId -join ',')"

$cr = Get-Process 'Starq Command' -ErrorAction SilentlyContinue
Check 'Cloudroom app running' ([bool]$cr) "$(@($cr).Count) processes"

# mirror caught up: gateway cursor vs Room tail
$tail = & 'C:\Program Files\nodejs\node.exe' --input-type=module -e "import { readRoomSnapshot } from 'file:///D:/StarqTech/agent-comms/scripts/room.mjs'; console.log(readRoomSnapshot().tailSequence)" 2>$null
$st = Get-Content "$root\logs\starq-bot-gateway-state.json" -Raw | ConvertFrom-Json
$lag = [int]$tail - [int]$st.roomLastSeq
Check 'mirror cursor at Room tail' ($lag -le 1) "cursor $($st.roomLastSeq), tail $tail, lag $lag"
Check 'no outbound failure pending' (-not $st.outboundProgress) $(if ($st.outboundProgress) { "progress: $($st.outboundProgress.status) on #$($st.outboundProgress.sequence)" } else { 'none' })

"`nKeeper log (last 6):"; Get-Content "$root\logs\keep-starq-comms.log" -Tail 6 -ErrorAction SilentlyContinue
"`nTo prove gap recovery: post one Room record while Nitro is rebooting or just after sign-in, then confirm the gateway log shows 'delivered record #<seq>' exactly once."
if ($fail) { "`n$fail check(s) FAILED"; exit 1 } else { "`nAll checks passed"; exit 0 }
