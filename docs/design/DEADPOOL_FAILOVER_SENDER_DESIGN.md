# Deadpool as failover-only Founder sender — design

Status: **DESIGN, not implemented, not enabled.** Founder decision 4c [#18981], assigned in
#18983 and #18993. Written by the Operations Room Deputy. Nothing here changes the current
cron job, its checkpoint or its configuration. Background:
`docs/incidents/2026-11-11-founder-delivery-paths.md`.

## Goal

StarqBot is the primary Room-to-Founder sender. Deadpool sends only while StarqBot cannot, and
between them every Founder-directed record reaches Telegram once: no duplicates, no losses.

## What is wrong with the relay today

| Property | Today (`room-relay.py`, cron `room-relay-backup`) | Needed |
|---|---|---|
| When it sends | every minute, always | only when StarqBot is unhealthy |
| What it sends | every Room record | exactly what StarqBot would send |
| Checkpoint | advances when the script prints, before delivery is known | advances only after confirmed delivery |
| Knowledge of StarqBot | none | reads StarqBot's health and delivery state |
| Room read | parses `room.jsonl` directly | sanctioned reader with integrity checks |

## Design

### 1. One shared filter

Both senders call the same eligibility function (the 4b candidate,
`candidates/starqbot-founder-filter/founderNotificationFilter.mjs`) and the same inbound-echo
rule (skip records carrying a Telegram update ID from the Founder). The function lives in one
versioned module that both import. A Python reimplementation is not acceptable: two copies
drift.

Consequence: the failover sender is a small Node script run by the Deadpool cron as a script
job, replacing `room-relay.py`.

### 2. One shared delivery ledger

A single append-only file, `agent-comms/state/founder-delivery-ledger.jsonl`, written under a
lock by whichever sender delivers. One line per record:

```
{ "sequence": 18975, "eventId": "...", "recordHash": "...", "sender": "starqbot" | "deadpool",
  "status": "intent" | "delivered" | "ambiguous", "chunks": 2, "at": "..." }
```

- A sender writes `intent` before calling Telegram and `delivered` after Telegram returns ok.
- A sender never sends a record whose latest ledger line is `intent`, `delivered` or
  `ambiguous` from **either** sender.
- `ambiguous` (the call threw, or the process died between intent and result) is never retried
  automatically by either sender. It is reported in Room and resolved by a person, as StarqBot
  already does for its own ambiguous sends.

The ledger, not a per-sender cursor, is what prevents duplicates. Each sender keeps its own
cursor only as a read position.

### 3. Health gate

Deadpool sends only when all of these hold, checked at the start of every run:

1. StarqBot is unhealthy: the supervisor lock is absent or names a dead pid, **or** the relay
   cursor has not advanced for longer than a threshold (proposed 5 minutes) while eligible
   records are waiting.
2. That state has persisted for two consecutive runs (no flapping on a restart).
3. No StarqBot safety hold is set. A safety hold means a person stopped delivery on purpose;
   failover must not override it.

When StarqBot is healthy again, Deadpool stops at once. It does not finish a batch.

Health is read from a small status file that the StarqBot supervisor already has the data
for (lock holder, pid alive, cursor, safety hold, last tick). Deadpool runs in WSL and must not
depend on parsing Windows process tables.

### 4. Failover behaviour

- On takeover Deadpool starts from the **ledger**, not from its own old checkpoint: it sends
  eligible records after the last `delivered` sequence, oldest first.
- Bounded: at most N records per run (proposed 5) and nothing older than a window (proposed
  2 hours). Older records are listed in one summary message instead of replayed.
- Every failover message is marked as sent by the secondary path, so the Founder can tell.
- On takeover and on hand-back Deadpool posts one Room record. Those records are not
  Founder-eligible, so they cannot loop.

### 5. Hand-back

When StarqBot resumes, it reads the ledger before sending and skips everything already
`delivered` by Deadpool. Its own cursor may be behind; the ledger makes that safe.

## Failure cases

| Case | Outcome |
|---|---|
| StarqBot down, Deadpool healthy | Deadpool delivers eligible records within about two minutes |
| Both down | Nothing is sent. Nothing is lost: the first sender back delivers from the ledger, within the window |
| StarqBot restarts mid-failover | Gate closes next run; StarqBot skips ledger-delivered records |
| Both alive, StarqBot slow | Gate needs two runs and a stalled cursor; if both reach the same record, the lock plus the `intent` line let only one send |
| Sender dies between `intent` and result | Record is `ambiguous`; neither sender retries; reported in Room. One possible loss or one possible duplicate, decided by a person |
| Ledger unreadable or lock unavailable | Both senders refuse to send and report it. Fail closed |
| Room reader reports an unstable or failed snapshot | No send this run |
| Deadpool's Telegram platform still unconfigured | Failover cannot work. This is the present state and is a precondition, below |
| Safety hold set on StarqBot | Deadpool does not send |
| WSL cannot see the Windows state files | Gate cannot be evaluated; Deadpool does not send |

## What must change, and where

| Change | Where | Owner |
|---|---|---|
| Shared filter module, with the 4b fix | versioned repository, imported by both | Ops |
| Ledger write and ledger check in StarqBot's send path | `starq-bot-gateway.mjs` — outside version control (#18871) | Ops, after the source has a versioned home |
| Health status file | `gateway-supervisor.mjs` — same | Ops |
| Failover sender script replacing `room-relay.py` | Deadpool's Hermes scripts | Deadpool's department, with Ops |
| Telegram platform for Deadpool's cron delivery | Deadpool's Hermes configuration | Deadpool / Founder |

## Preconditions and gates

1. A versioned home for the gateway and supervisor source (#18871). Without it none of the
   StarqBot-side changes can be reviewed.
2. Independent review of the filter, ledger and gate code.
3. Tests: unit tests for the gate and ledger rules; a two-sender simulation with a fake
   Telegram client covering each failure case above.
4. A planned StarqBot restart to activate the ledger. Founder approval.
5. Deadpool's cron stays disabled for Telegram until 1 to 4 are done and a controlled failover
   drill has passed: stop StarqBot deliberately, post one test record, confirm one copy, restart
   StarqBot, confirm no second copy.

## Until then

The current `room-relay-backup` job must not have its Telegram delivery re-enabled as it is.
It would send every Room record to the Founder, duplicate StarqBot's deliveries, and still drop
records whenever it fails.

## Open questions for the Founder

1. Stall threshold before failover (proposed 5 minutes) and the replay window (proposed
   2 hours).
2. Whether failover messages should be full text or a short notice pointing to Room.
3. Whether Deadpool's separate "Wade Wire" digest should reach Telegram at all, and if so by
   which sender.
