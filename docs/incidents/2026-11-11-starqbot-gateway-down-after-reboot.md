# StarqBot gateway down after host reboot (2026-11-11)

Status: **SERVICE RESTORED about 15:50 PKT by Codex [#18950]; one item open** (logon task).
Recorded by the Operations Room Deputy. Room: #18895, #18906, #18950, #18952.

## What was observed

All observations are read-only status commands run from Nitro Windows `w3:p1`.

| Time (PKT) | Observation |
|---|---|
| 05:12 | Gateway healthy: lock held by pid 10456, relay healthy, Room tail #18858 (PR #3 branch, `docs/reviews/PR3_FOLLOWUP_AND_PR4_RECONCILIATION_2026-11-10.md`) |
| 05:35 | Last Room record the relay processed: #18871 |
| 05:37 | Windows last boot time |
| 14:46 | `gateway-supervisor.mjs --status`: preflight PASS, safety hold NONE, lock **STALE** (pid 10456), relay **STALE_CURSOR**, cursor #18871, tail #18894 |
| 14:53 | pid 10456 is not running. `schtasks /Query /TN StarqTech-StarqBot-Logon` returns "cannot find the file specified" |

## Effect

- Room records addressed to the Founder have not been relayed to Telegram since #18871.
- Founder Telegram messages have not entered Room since the reboot. The last one is #18808
  (update 32613295).
- Floor startup on 2026-11-11 ran entirely through panes and Room.

## Likely cause

The host rebooted and the gateway was not relaunched. `AGENTS.md` names the scheduled task
`StarqTech-StarqBot-Logon` as the relaunch mechanism; that task was not found from this user
context. Whether it is missing or only invisible to a non-elevated session is **not verified**.

## Not done, and why

- No restart. Room #18893 and #18903 forbid restarting StarqBot or changing live services without
  authorisation.
- No lock release. The recorded pid is dead, so the documented launcher
  (`agent-comms\scripts\start-starq-bot-if-needed.ps1`) would reclaim the stale lock by itself;
  a manual `--release-lock` is not needed.

## To close

1. Decision on who relaunches the gateway (Room #18906, decision 1).
2. Relaunch through `start-starq-bot-if-needed.ps1`; confirm the relay cursor reaches the Room tail.
3. Expect a backlog of Founder-addressed records to be relayed at once. If outbound delivery stops
   on an ambiguous sequence, the documented path is `--recover-batch 1 --confirm-duplicate`.
4. Verify or recreate the logon task from an elevated session, then confirm it after the next
   reboot.

## Resolution [#18950, as reported by Codex]

- Before recovery the cursor was #18871, 76 records behind tail #18947.
- The start wrapper halted: supervisor preflight refuses to proceed while a stale lock file
  exists. So the note above was wrong — the launcher did **not** reclaim the stale lock by
  itself.
- Codex confirmed pid 10456 dead and no gateway or wrapper process running, cleared only the
  stale lock with `gateway-supervisor --release-lock` (safety hold untouched), then launched
  `start-starq-bot-if-needed.ps1`.
- Result: supervisor pid 26768, gateway pid 27696, safety hold NONE, status HEALTHY, cursor at
  #18949. Founder message #18948 was deduplicated; no cursor reset and no backlog replay.
- Root cause as stated: a dead-pid stale lock blocked normal wrapper startup.
- The 76 Founder-addressed records between #18871 and #18947 were not replayed to Telegram.

Startup rule made explicit afterwards [#18952, #18953]: every new engineering session verifies
StarqBot before work; if not healthy, use the wrapper; if a confirmed-dead pid holds the lock
and no gateway process exists, clear only that lock; never reset the cursor or replay backlog
as routine.

Still open: the wrapper does not recover from a dead-pid lock unaided, and the logon task was
not found. Either means the next reboot repeats this incident.

## Related

Starq Command went down in the same reboot: `command-lifecycle.mjs status` reports DEGRADED with
every service GONE and "config changed since this runtime was started". Tracked separately as
decision 2 in Room #18906.
