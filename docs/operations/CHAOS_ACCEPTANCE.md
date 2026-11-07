# Chaos and acceptance plan for Operations Room v2

**This is the hard gate before a universal dispatcher replaces live watchers.** A suite passing pure helper tests is not enough to claim deployment-ready transport reliability.

## Mandatory simulation matrix

| Scenario | Expected proof |
|---|---|
| Two `@claude` Herdr/Cloudroom/WSL seats share one handle | Exactly one target wakes or the event is held explicitly; CC wakes none |
| Same AG account with ERP and Hoadhaa sessions | Hoadhaa task routes to Hoadhaa seat; quota reservation can block competing ERP-critical work |
| One Room event delivered twice | Dedup by `(epoch,eventId,sessionId)`; one work ACK and one task execution |
| Crash before delivery-intent fsync | Broker seq is re-read and re-enqueued on restart |
| Crash after wake but before checkpoint | Transport may retry; recipient idempotency prevents duplicate task start |
| Pane ID changes after restart | Session UUID re-discovered; no pointer sent to wrong pane |
| User sees Room #N-1 and #N+1 but not #N in Telegram | Eligibility/delivery audit explains #N, authorized replay supported |
| Unknown Room epoch or missing sequence | Dispatcher freezes checkpoint; operator receives integrity alert |
| Work quota zero or stale | HOLD, no speculative wake/model spend |
| Reviewer==builder | Reject verdict as independent acceptance |
| PR head changed after Vision approved | Merge gate rejects until new head reviewed |
| Worktree has uncommitted files at closure | Retirement deferred; nothing deleted |
| `actionRequired: NONE` with 5 mentions | No model wakes |
| Herdr command returns success but model never ACKs | Transport receipt exists; assignment remains unacknowledged |
| One Herdr floor unavailable while another active | Other project continues; failed floor queues pending deliveries |
| Vercel proxy unavailable | Local Room ledger and floor continue, cloud access degrades visibly |

## Acceptance phases

**1. Pure tests:** `node --test tests/room-v2-*.test.mjs` across event, routing, lifecycle, delivery, capacity. These are committed in this design package.

**2. Real-CLI simulation:** test `herdr agent list` parsing against captured/sanitized agent-list fixtures, evaluate priorities and target UUID stability; no live model wakes.

**3. Ledger snapshot simulation:** compare readRoomSnapshot stable/unstable/epoch-change handling; assert checkpoint is never advanced without durable pending/held writes.

**4. Runtime canary:** one real Room dispatch → one existing Herdr seat → one attributed ACK → no duplicate wake, with runtime rollback available.

**5. Multi-floor recovery:** disconnect WSL, restart Windows watcher, restart Telegram relay; verify backlog and evidence consistency by `(epoch,seq,eventId)`.

**6. Founder acceptance:** reviewer evidence, no-drift SHA, tested rollback, explicit approval to cut over one service at a time.

## No false-green gate

Tests may deliberately fail for unsupported future capabilities and remain conspicuously informational. Do not suppress or skip them and then claim full acceptance. Report known gaps under their own IDs.
