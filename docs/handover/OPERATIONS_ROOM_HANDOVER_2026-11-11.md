# Operations Room handover — 2026-11-11

From: Operations Room Deputy (Claude, Nitro Windows `w3:p1`, session
`509bf943-f40a-463e-9912-6e8cc3a7ded3`). Current to Room tail #18967. The previous handover is
`OPERATIONS_ROOM_HANDOVER_2026-11-07.md`.

## Mandate

Room #18903 (task `FOUNDER-OPS-STARTUP-20261111`), hierarchy in #18912 (Founder correction,
supersedes #18905): this seat is Operations Deputy / Communications Engineering Lead and reports
to Codex. It owns the records in this repository — the Factory Startup SOP, the daily journal,
handovers, roster and session recovery, cross-floor activity for StarqERP and Hoadhaa, and
communications incidents and improvements. Codex is Chief Engineer / Project Director with
authority and accountability across every floor and department; delegation does not transfer
that accountability. Completion and blockers from this seat go to Codex through Room. Merges and
releases stay with the Founder. The full hierarchy is in
`docs/operations/FACTORY_STARTUP_SOP.md`.

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
| StarqBot gateway | Restored about 15:50 PKT by Codex: supervisor pid 26768, gateway pid 27696, HEALTHY [#18950]. Was down from the 05:37 reboot. Logon task still not found |
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
8. Herdr completion signal fails on XPS (`agent_prompt_stalled`, no `completion_seq` change) and
   works on Fold 4 (`docs/incidents/2026-11-11-herdr-completion-notification.md`). Until XPS is
   validated: no blind resend; inspect the pane, read the output, record in Room.
9. A long Room body was cut off silently on posting (#18912). Read long posts back.
10. Vision's four-specialist review bridge is blocked for real packages. It blocks HOA-253 and
    the PR #204 review. Owner chain, failing predicate, source defects and a repair plan are in
    `docs/incidents/2026-11-11-vision-review-bridge-blocked.md`. The bridge source is outside
    version control.
11. No supervisor or autostart is verified for the live dispatcher (pid 34044).
12. Vision could not post to Room from a second instance while its lease was held by its
    Cloudroom instance; its PR #204 disposition reached Room only through Codex [#18935].

## Reviews blocked at handover

- PR #204 (StarqERP), head `808ad84`: independent review BLOCKED, no verdict. Founder to choose
  a one-off interim solo Vision review or to keep the gate [#18935].
- HOA-253 (Hoadhaa), candidate `4edf2dab`: independent review BLOCKED [#18923].
- Bridge correction pass (`VISION-BRIDGE-REPAIR`, #18933): **no builder**. Antigravity released
  it with zero edits (harness scratch outside `D:\StarqTech`); the WSL Claude transfer was
  withdrawn at its usage limit, reset 17:40 PKT [#18941, #18943]. Codex owns staffing; Founder
  choice in #18946. Vision reviews the result under #18642.

## Pending for this seat

Nothing pending. The Founder's execution-to-Command handover [#18948] is preserved in
`docs/handover/FOUNDER_COMMAND_HANDOVER_2026-11-11.md`: StarqERP-Dev WAITING FOR CHECKPOINT
(Founder: PR #204 review route); Hoadhaa-Dev READY TO RESUME [#18958, #18959, #18962]. After
that snapshot the HOA-255 gate opened and Devin (`w2:p2`) became its single builder; HOA-255 is
In Progress [#18964, #18965].

At the next session start, verify StarqBot is HEALTHY before any work (SOP, "StarqBot
recovery").

## Chain of command and message tracking

Founder → Codex → Floor or Department Lead → owned agents. Reports go up the same chain. Every
message is tracked through delivered, working, ACK, done and evidence. Both are in
`docs/operations/FACTORY_STARTUP_SOP.md` [#18915].

## Other hosts

- XPS: reachable two-way from Nitro; JARVIS heads General Engineering Support with six on-demand
  profiles; no GitHub access to StarqERP; no assignment accepted [#18912].
- Fold 4: FORGE reachable and ready, supplementary only, session `20261111_114008_dbda46` in
  remote `w1:p2`. Five X-Men profiles are configured but not running; capacity unverified; shared
  gateway on that host reported stopped [#18915].
- Deadpool and the secondary WSL Claude are not yet reported.

## Work in flight on the floors

See "Owner actions in progress" in `docs/journal/2026-11-11.md`. In short: the ERP lead is
recovered the WSL Claude scratch path and its read-only ERP-543 lanes are running [#18921, #18922]; the Hoadhaa lead holds new activation
below 1.23 GiB free (NO-GO at 0.92 GiB, #18920) and may start only HOA-255 [#18917]. The Hoadhaa startup was Founder-driven;
Codex oversees it and does not repeat the lead's activation.

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
