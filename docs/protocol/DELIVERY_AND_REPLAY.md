# Durable delivery, retries and replay

## Correct delivery guarantee

Target **at-least-once notification delivery** with idempotent recipient processing. Don't promise exactly-once execution across a crashed model, Windows/WSL process and Git operations. Distinguish four receipts:

- **Broker append**: Room accepted the record and assigned sequence/epoch.
- **Transport delivery**: short pointer reached the Herdr session / Telegram API / Cloudroom integration.
- **Worker ACK**: human/agent read the event, claimed a specific task or reported BLOCKED.
- **Evidence completion**: worker posted result + immutable PR/test evidence; independent review and task closure are later.

## Outbox/inbox algorithm

1. Read a stable `readRoomSnapshot()` and validate `(ledgerEpoch, sequence)` continuity.
2. Compute target sessions using action classification + stable identity/role binding.
3. **Persist** delivery intents `(eventId, sessionId, state=pending)` and unresolved HOLDs before advancing the scan checkpoint.
4. Wake with a short Room pointer. Retry transient failures with exponential backoff + jitter and a maximum delivery count; preserve attempts.
5. Persist transport ACK separately from worker ACK. Deduplicate by `(eventId, sessionId)` on both ends.
6. On exhausted retries, write to a durable dead-letter queue, raise an operator exception, and offer replay of the *notification* after the target is restored.
7. Reconcile `lastSeq` and pending records on restart. Do not seed directly to tail if a recovered old checkpoint exists; first-ever bootstrap intentionally starts at tail only after explicit declaration.
8. On ledger epoch change, gap, stale snapshot or integrity fault: freeze advancing, alert operator, consult epoch recovery procedure. Never skip to the newest event silently.

## Specific risks in PR #3 dispatcher to address before live cutover

The current proposed `scripts/room-dispatcher.mjs` is a strong foundation, but its state writes swallow errors; checkpoint progress can therefore appear successful when durable storage failed. Queued pending items capture a *pane ID*, which may be stale after a Herdr restart. It also tracks ambiguities in a log but does not yet persist a routable HOLD queue. Before calling this crash-safe, persist intents and held resolutions first, use sessionId re-discovery on retries, and test power-loss windows. `DELIVERED_KEEP=2000` is a cache threshold, not a durable exactly-once proof.

## Room vs Telegram

The canonical Room event must be posted exactly once. A missed Deadpool Telegram relay is retried by eventId/sequence and recorded as a **delivery event**, not recreated as a duplicate Room post. The Founder may request replay of missing notifications from a sequence range. Recipient routing is based on actual notification policy and logged eligibility, not guesses.

## Retry taxonomy

| Condition | Behavior |
|---|---|
| Herdr session unavailable | Hold and re-resolve session UUID after recovery |
| Quota exhausted | Work stays QUEUED / BLOCKED, no repeated model wake |
| Telegram 429 | Respect retry-after; bounded retry without duplicate sends |
| Project ambiguous | HOLD with candidates; never broadcast to both AG seats |
| PR head moved after review | Stop merge; return to same review thread at new head |
| Room epoch invalid / sequence gap | Stop checkpoint advancement; demand recovery |
| Agent did work but crashed before receipt | Reconcile Git status/PR before new builder assignment |

`protocol/v2/deliveryLedger.mjs` provides deterministic delivery-state primitives; persistence, locking and real transport remain future integration tasks.
