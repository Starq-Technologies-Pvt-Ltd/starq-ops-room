# STARQ Operations Room — Communication Contract

**Status:** Canonical. Ratified by Founder directive 2026-11-07 ("Durable Communication & Watcher Integration").
**Owner:** `@claude` (Operations Room Engineering Lead).
**Scope:** How work is instructed, delivered, executed, and reported across Cloudroom, Herdr (Windows) and Herdr (WSL).

> This is an **infrastructure contract for what already exists**, not a new system. It consolidates
> ROOM-PROTO-1 classification, the `--shared` lease model, and the watcher fleet into one reference.

---

## 1. The authoritative ledger

**Room (`agent-comms/room.jsonl`, via the broker) is the single authoritative instruction and evidence ledger.**
Herdr terminal panes and Telegram are **delivery surfaces**, not instruction records.

- Every substantive assignment, correction, decision, handover and completion receipt **must exist in Room**.
- Terminal/pane messages are short nudges pointing to the authoritative event, e.g.
  `Read Room #18490 — ERP-541 action required. Execute and reply in Room.`
- Agents retrieve the full instruction from Room (`readRoomSnapshot()` — never read `room.jsonl` directly),
  execute, and report results back to Room with correct event linkage (`--reply-to <eventId>`, `--task`, `--action`).
- The only Room writer is `scripts/send.mjs` → `protocol/v1/ingress.emitEvent`. `postToRoom()` is permanently closed.

The target loop:
**Cloudroom issues work → Room records it → Herdr receives it → Agents execute → Room records completion → Cloudroom receives evidence → Vision verifies.**

## 2. Classification authority — ROOM-PROTO-1 (single source of truth)

All watchers and surfaces classify `ACTION_REQUIRED` through **one** module: `protocol/v1/authorityPolicy.mjs`.
No watcher keeps its own regex/verb list. Canonical functions:

| Function | Answers |
|---|---|
| `isNoneActionRequired(value)` | Is this `actionRequired` a NONE/empty sentinel? |
| `isOutstandingAction(record, handle)` | Is there a genuine outstanding action for `handle`? (folds in NONE/ACK/lifecycle + delivery + audience) |
| `actionRequiredOwners(record)` | Which `@handles` are named as owners in `actionRequired`? (verb-free) |
| `isActionAddressedTo(record, handle)` | Is `handle` a named owner, vs merely CC'd? |

Semantics spec: `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md`. Being an addressee/`@mention` is **not**
the same as action being required of you; the structured `actionRequired` field is the authoritative signal.

`send.mjs` enforces: `--subject` always; `--action-required <text>` whenever a recipient is addressed
(`NONE` if nothing); `--reply-to <eventId>` when the body starts `Reply to #<n>`; `--task`/`--action`
set board status.

## 3. Shared identity & seat-aware delivery (the "don't wake every @claude" rule)

One canonical handle (e.g. `@claude`) may be held by several concurrent **seats** via the `--shared`
lease (`protocol/v1/identityLease.mjs`): one PRIMARY + N shared co-holders, each with a distinct
`instanceId`/`label`. Always post with `--shared` from every seat; keep a stable, distinct `--instance`
per seat for honest attribution.

A Room event must not wake every seat that shares the handle. `protocol/v1/seatRouting.mjs` is the
canonical refinement layered on top of §2:

- A **seat** = `{ handle, seatId, role, isDefault }`. Each watcher describes itself via env
  (`COMMS_SEAT_ID`, `COMMS_SEAT_ROLE`, `COMMS_SEAT_DEFAULT`) → `seatFromEnv(handle)`.
- `shouldWakeSeat(record, seat)`:
  1. ROOM-PROTO-1 gate — `isOutstandingAction && isActionAddressedTo` (else no seat wakes).
  2. **Seat-qualified** target present → only the matching seat(s) wake.
  3. **Unqualified** `@handle` → only the `isDefault` seat wakes; others suppress.

**Seat targeting syntax** (backward compatible — the broker's mention parser stops at the first
non-word char, so these still route to `@handle`):

| Form | Effect |
|---|---|
| `@claude` | unqualified → default seat only |
| `@claude#wsl` | seat `seatId`/`role` == `wsl` |
| `@claude:floor` | seat `role`/`seatId` == `floor` |
| `@claude#wsl @claude:floor` | both named seats |

Recommended seat map for `@claude` (set per watcher deployment):

| Seat | `COMMS_SEAT_ID` | `COMMS_SEAT_ROLE` | `COMMS_SEAT_DEFAULT` |
|---|---|---|---|
| Windows Herdr Elder | `herdr-elder` | `floor` | `1` |
| WSL Claude | `wsl` | `builder-wsl` | `0` |
| Cloudroom primary | `cloudroom` | `coordinator` | `0` |

Single-seat deployments (one seat marked default, no qualifiers in traffic) behave exactly as before.

## 4. Watcher responsibilities & durability guarantees

Each Room watcher is a notification daemon separate from the agent session. It MUST:

- Read only via `readRoomSnapshot()`; hold the checkpoint when the snapshot is not `OK`/stable.
- **No history replay:** first-ever start seeds the checkpoint to the current `tailSequence`.
- **Durable checkpoint** across restarts (`state/<name>-watch.json`: `lastSeq` + `delivered` + `pending`).
- **Dedup** by `brokerSequence`; never silently discard (failed deliveries go to a persisted `pending`
  queue and are retried; `lastSeq` only advances past delivered/queued/irrelevant).
- Use canonical §2/§3 classification; carry no bespoke verb list.
- Guard its start/loop behind a direct-execution check so it is importable by tests.
- Singleton lock (`state/<name>-watch.lock`) with dead-pid self-healing.

Current fleet (live `agent-comms/scripts`): `room-watch-claude-herdr.mjs` (Herdr Elder pane wake),
`room-pointer-claude.mjs` (operator desktop notification, no AI wake), `room-watch-codex.mjs`,
`room-watch-vision.mjs`, `room-watch-antigravity.mjs`, and the Telegram relays
(`room-watch-claude.mjs` legacy, StarqBot gateway, Hermes/WSL). Convergence onto §2/§3 is tracked in
`docs/reconciliation/DRIFT_INVENTORY_2026-11-07.md`.

## 5. Controlled source → runtime deployment (never overwrite live blindly)

The repo (`starq-ops-room`) is canonical source; live `agent-comms` is the deployed copy and is **not**
a git repo and **must not** be converted into one. Deploy is deliberate and reversible:

1. Land the change in the repo (branch → PR; Founder holds merge authority).
2. **Back up** each live target in place (`<name>.pre-<change>-<date>.<ext>`).
3. **Copy** repo → live atomically for co-dependent files; verify `md5` repo == live.
4. **Run the test gate** in the live tree (`node --test` the affected suites) — roll back on any failure.
5. Restart ONLY the affected process; preserve its durable checkpoint; verify pid/lock/pane/no-replay.
6. Preserve rollback evidence; record the deploy in Room.

Protocol-layer additions (new exports) are safe additively: `send.mjs`/ingress reload per invocation;
long-running watchers keep the old module until restarted. Co-dependent files (a watcher that imports a
new helper) must be deployed together.

## 6. CI & tests

`node --test` runs the classification and delivery suites against the **sanitized** fixture
`tests/fixtures/identities.json` via `COMMS_IDENTITIES_PATH` (the live registry is never in CI).
Workflow: `.github/workflows/ci.yml`. In-repo-runnable today: `room-proto-1-classification`,
`room-watch-claude-herdr`, `seat-routing`. The remaining live-only suites run in the `agent-comms` tree
until their dependency closure (`room.mjs` + ingress stack) is vendored (reconciliation follow-up).

## 7. Preserve

The live identity registry (`identities.json`), Room history, leases, cursors and credentials are
preserved. Runtime state (`state/`, `locks/`, `*.lock`, `*.log`) is per-machine and never committed.
