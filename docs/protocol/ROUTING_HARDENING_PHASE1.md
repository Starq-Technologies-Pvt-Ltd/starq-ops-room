# Routing hardening — phase 1 (COMMS-ROUTING-20261110)

**Status:** candidate on the PR #3 branch. Not deployed, not armed. The live runtime
(`D:\StarqTech\agent-comms`) and its checkpoints are untouched.
**Authority:** Room #18737 (assignment), #18736 (audit), #18741 and #18742 (Floor Lead seat facts).

This document supersedes, for the dispatch path only, the delivery-precedence text in
`COMMUNICATION_CONTRACT.md` that describes `@handle#token` qualifiers, subject hints and
project/cwd affinity. `protocol/v1/sessionRouting.mjs` and `seatRouting.mjs` remain in the tree
with their tests, but the dispatcher no longer imports them.

## 1. Who a record is for

Decided by `protocol/v1/routingTargets.mjs` from structured metadata only.

| Input | Result |
|---|---|
| `actionRequired` is NONE, or the record is not `ACTION_REQUIRED` | no-op (`NOT_OUTSTANDING`) |
| `metadata.routing = { schema: "starq.routing/1", targets: [{ handle, role?, instance?, backend? }] }` | exact recipients |
| no `routing`, but `@handles` named in `actionRequired` | unqualified handle targets |
| `@all` / `@everyone` / `@team` in `actionRequired` | HOLD `BROADCAST_NOT_ROUTED` |
| outstanding action, no owner named | no-op (`UNADDRESSED`) |
| malformed `routing`, unknown field, unknown or retired handle | HOLD `INVALID_ROUTING` |

The message body is never read. Quoted or forwarded mentions, `[FLOOR·pane]` subject tags,
`@handle#token` text, partial UUIDs, bare pane suffixes and cwd substrings have no routing
meaning. Aliases (`@elder`, `@dp`, `@ag`) resolve to the canonical handle through the identity
registry; retired identities are not routable.

`send.mjs` does not yet have a flag that writes `metadata.routing`. Until it does, only
unqualified owners can be expressed, and those resolve to a default seat or HOLD. Adding that
flag is a change to a live-synced file and is an open approval gate (§7).

## 2. Which seat

Decided by `protocol/v1/seatBinding.mjs` against a versioned seat table (`starq.seats/1`).

- `instance` → the one seat with that exact Room instance id.
- `role` → the one seat holding that exact role. Two holders → HOLD `AMBIGUOUS_ROLE`.
- neither → the handle's single `default: true` seat. None → HOLD `NO_DEFAULT_SEAT`.
- `backend` narrows any of the above to `host/herdr-session`.
- The sender's own instance is excluded by exact `senderInstanceId`, so one seat of a shared
  handle can address another.

Every HOLD is durable, carries its reason and candidates, is retried against the current seat
table on each poll, and expires into dead-letter after 24 h.

### Candidate routing table (`config/seat-table.candidate.json`)

| Seat | Handle | Roles | Default | Backend / pane | Instance | Source |
|---|---|---|---|---|---|---|
| codex-chief-engineer | codex | chief-engineer | **yes** (Founder direction) | windows/default w1:p1 | `01a1c4c0-…` | #18737 |
| erp-floor-lead | claude | erp-floor-lead, erp-architect | no | windows/default w1:p5 | `claude-herdr-w1p5-20261110` | #18742 |
| ops-room-deputy | claude | ops-room-deputy | no | windows/default w3:p1 | `e97d7e67-…` | #18733, #18737 |
| erp-wsl-verification | claude | erp-wsl-verification | no | wsl/default w1:p4 (delivery unverified) | `claudewsl-wsl-w1p4-20261110` | #18728, #18742 |
| hoadhaa-lead | antigravity | hoadhaa-lead | no | windows/default w2:p1 | `9629f477-…` | #18741 |
| erp-antigravity | antigravity | none | no, **never wake** | windows/default w1:p3 | Herdr value, unconfirmed | #18742 |

A post directed to `@codex` wakes Codex: the verified Codex seat at w1:p1 is the sole `codex`
default (Founder direction). Both Floor Leads asked that a bare `@claude` and a bare
`@antigravity` HOLD, so those handles have no default seat and need a role or instance.
Not in the table, therefore not routable: Cursor, Copilot, OpenCode (ERP floor), Devin, Goose,
OMP (Hoadhaa floor, dispatched through their lead), Deadpool/Hermes, Vision, Cloudroom seats.

## 3. Binding check before every delivery and retry

`verifySeatBinding` compares the seat with live discovery of its own backend:
backend declared and reachable → backend delivery verified → exact pane present → Herdr agent
kind → exact cwd → Herdr `agent_session` only if the seat declares one → agent not blocked →
foreground pid from `herdr pane process-info --pane`. Any mismatch is a recoverable HOLD.

Herdr's `agent_session` is not a Room identity. It was stale for the Operations Room Deputy pane
(#18734), so that seat is bound by Room instance, pane and pid and declares no session.

## 4. Durable state

One file, `room-dispatch.v2.json` (`starq.dispatch-state/2`), in an explicit state directory.
The live `agent-comms` tree and any directory containing a legacy `room-dispatch.json` are
refused. Writes are temp-file + fsync + rename; any failure throws and stops the dispatcher. A
corrupt or legacy-shaped file is an error, never a re-seed.

| Ledger status (PR #4 contract) | Meaning |
|---|---|
| `pending` | planned and persisted with its checkpoint, not yet submitted |
| `inflight` | submitted: recorded before the pane is touched |
| `transport_acknowledged` | delivered: Herdr accepted the prompt for the verified pane |
| `workAckAt` | agent ACK: the target instance replied in Room to the event |
| `roomResponseAt` | Room response: a later or lifecycle reply from that instance |
| `held` | parked behind a HOLD |
| `dead_letter` | attempts (5, backoff 5 s → 5 min) or hold lifetime exhausted |

Idempotency key is `eventId::instance`. A delivery left `inflight` by a crash becomes HOLD
`SUBMIT_OUTCOME_UNKNOWN` and is not re-sent; a Room reply from the target instance clears it.
If any declared backend is unavailable the checkpoint is frozen and the outage is recorded.

## 5. Modes

Default is a pure dry-run: no state file, no checkpoint, no log file, no lock, no prompt.
Delivery needs `--deliver`, `--seat-table` and `--state-dir`. The first armed poll seeds at the
Room tail; legacy backlog is never replayed.

## 6. Source inventory and limits (verified 2026-11-10 from Windows pane w3:p1)

| Backend | Discovery | Process info | Prompt delivery | Notes |
|---|---|---|---|---|
| windows/default (Herdr 0.9.5) | verified | verified | verified | 11 agents listed |
| wsl/default (Ubuntu, Herdr 0.9.5) | verified read-only | verified read-only | **not exercised** | must call `/home/mustarq/.local/bin/herdr`; bare `herdr` through `wsl.exe` exits 127 |
| wsl/starq-wsl-deadpool (named session) | answers, lists no agents | not checked | not exercised | not declared; no seats |
| XPS-Windows (saved SSH machine) | not checked | not checked | not checked | out of scope |

Not claimed: control of any WSL pane. The dispatcher would run outside a Herdr pane; whether
Herdr on Ubuntu accepts `agent prompt` from a `wsl.exe` caller with no pane binding is untested,
and `HERDR_ENV` is never set by hand. WSL seats therefore HOLD with `BACKEND_DELIVERY_UNVERIFIED`.

Pane ids and workspace ids repeat across backends (`w1:p1`, `w1:p4` exist on Windows and on
WSL). A pane is only ever addressed as backend + pane.

Not solved here: Herdr's stale `agent_session` on w3:p1; pids in the seat table go stale on
every harness restart and are corrected by hand; `agent prompt` is sent to a working agent
(only `blocked` is refused); ledger-epoch changes; a `send.mjs` flag for structured targets.

## 7. Open approval gates

1. Adding a structured-target flag to `send.mjs` (live-synced file).
2. A supported, tested delivery path for WSL seats before `wsl/default` is marked verified.
3. Disposition of the preserved production checkpoint (#18497), the stale Claude watcher
   checkpoint and lock, and the unmerged PR #3 copy already present in the live tree.
4. Independent review of this branch, then the controlled canary plan. Nothing is armed.

## 8. Backlog

`scripts/room-backlog-report.mjs` produces a read-only reconciliation of the range after the
preserved production checkpoint. Every actionable entry is `UNVERIFIED_HOLD`, `delivered: false`.
The report is generated outside the repository and outside the live tree.
