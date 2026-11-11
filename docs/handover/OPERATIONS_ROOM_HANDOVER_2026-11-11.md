# Operations Room handover — 2026-11-11

From: Operations Room Deputy (Claude, Nitro Windows `w3:p1`, session
`509bf943-f40a-463e-9912-6e8cc3a7ded3`). Written at Room tail #18906. The previous handover is
`OPERATIONS_ROOM_HANDOVER_2026-11-07.md`.

## Mandate

Room #18903 (task `FOUNDER-OPS-STARTUP-20261111`), boundaries in #18905: this seat is Operations
Room Deputy and Communications Engineering Lead. It owns the records in this repository — the
Factory Startup SOP, the daily journal, handovers, roster and session recovery, cross-floor
activity for StarqERP and Hoadhaa, and communications incidents and improvements. Codex is Chief
Engineer; merges and releases stay with the Founder.

## Recovering this seat in a new session

1. Complete the startup gate in `D:\StarqTech\AGENTS.md`. Post as `claude` with the harness
   session ID as `--instance`.
2. Bind by pane `w3:p1` and the harness session ID. Herdr listed this pane under the previous
   session (`7db2e99c`) for the whole of 2026-11-11; do not trust that value.
3. Read this file, then the newest file in `docs/journal/`.
4. Read Room from the last sequence the journal names, through `readRoomSnapshot()`.
5. Check infrastructure read-only (SOP step 1) and compare with "Live state" below.
6. Do not use the harness scratchpad: it resolves under `C:\Users\...\AppData\Local\Temp`, outside
   `D:\StarqTech`. Work without scratch files, or inside a worktree.

## Live state at handover

| Item | State |
|---|---|
| StarqBot gateway | DOWN since the 05:37 PKT reboot; lock stale, relay cursor #18871 |
| Starq Command | DEGRADED; all services gone |
| Room dispatcher | pid 34044, live `agent-comms` script, delivery mode; not the PR #3 candidate |
| Legacy watchers | none running; `state/claude-herdr-watch.lock` is a stale file from 11-07 |
| `claude` lease | primary: this seat; shared: ERP `claude-herdr-w1p5-ce2c1fda`, stale Copilot `b14edf13` |

## Repository state

| Checkout | Branch | Head |
|---|---|---|
| `D:\StarqTech\starq-ops-room` | `main` = `origin/main` | `2d56dd4` |
| `.worktrees\starq-ops-room-durable-foundation` | `claude/ops-room-durable-foundation-20261107` (PR #3) | `99fe117` |
| `.worktrees\starq-ops-room-v2-protocol` | `claude/ops-room-v2-protocol-20261107` (PR #4) | `acd8e4b` |
| `.worktrees\herdr-lifecycle-20261109` | `claude/herdr-lifecycle-phase3-20261110` | `51099da` |
| `.worktrees\starq-ops-room-ops-records` | `claude/ops-records-20261111` (these records) | see PR |

PR #3 and PR #4 are open, mergeable and unreviewed. They are preserved as they are; no code work
on them is authorised.

## Parked (Founder #18808)

WSL dispatcher investigation, dispatcher cutover, gateway ingress integration
(`COMMS-ROUTING-INGRESS-20261111`, blocked at #18871), and other noncritical communications work.
Do not resume without a new direction.

## Known communications defects

1. Founder Telegram ingress derives recipients from any `@word` in the message body and emits no
   structured routing. The fix needs the gateway source under version control (#18871).
2. The Deadpool relay re-derives recipients without routing metadata; owner decision open.
3. WSL delivery backend is unverified.
4. The `claude` handle is shared by three seats; an unqualified mention is ambiguous.
5. Herdr session values are stale for `w3:p1` and `w1:p5`.
6. Copilot, OpenCode, Devin, Goose and OMP have no dispatcher seat enrolment.
7. No logon task was found to relaunch StarqBot after a reboot.

Detail for 1–3 and 6 is on the PR #3 branch under `docs/reviews/`.

## What this seat may do without asking

Documentation, journal, handover and incident records; read-only status commands and Room reads;
a documentation-only branch and pull request.

## What needs authorisation

Any start or restart (StarqBot, Command, dispatcher, watchers); lock release; edits under
`D:\StarqTech\agent-comms`; dispatcher or seat-table changes; WSL routing; code changes to PR #3
or PR #4; merge; deploy; takeover of a live lease.

## Open decisions

Listed in `docs/journal/2026-11-11.md`, "Open decisions".
