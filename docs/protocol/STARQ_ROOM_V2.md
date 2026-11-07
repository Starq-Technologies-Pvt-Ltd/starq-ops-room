# STARQ ROOM-PROTO-2 — versioned event contract

**Status:** Proposed additive contract, with pure reference implementation at `protocol/v2/eventContract.mjs`. Existing ROOM-PROTO-1 is the current live classifier and remains authoritative until a separately verified migration.

## Envelope

```json
{
  "version": "starq.room/2",
  "eventId": "evt-20261107-HOA217-DX1-dispatch",
  "kind": "task.dispatched",
  "occurredAt": "2026-11-07T12:00:00Z",
  "actor": {"handle": "claude", "instanceId": "claude-cloudroom-thread-123"},
  "task": {"id": "HOA-217", "project": "Hoadhaa", "cloudroomThreadId": "thr_sfppz2ybz5"},
  "action": {"required": true, "owners": ["antigravity"], "summary": "ACK and implement DX1"},
  "target": {"project": "Hoadhaa", "role": "builder"},
  "correlationId": "cycle-HOA-217-DX1",
  "payload": {"specRef": "Room #18512", "baseSha": "a7bc082689dec38766bbc12daaca339e3ae1dfc1"}
}
```

`brokerSequence`, ledger epoch, canonical event ID verification, sender authentication and hash-chain proof are **broker-assigned**, not client declarations. For existing CLI/ROOM-PROTO-1 metadata, the reference adapter `legacyRoutingMetadata` maps one v2 event to legacy fields without writing it.

## Event families

| Family | Kinds | Trigger |
|---|---|---|
| Work | `task.dispatched`, `task.acknowledged`, `task.started`, `task.progress`, `task.blocked`, `task.resumed`, `task.delivered`, `task.deferred`, `task.closed` | Cloudroom/worker |
| Review | `review.requested`, `review.accepted`, `review.rejected` | Coordinator / independent Vision |
| Merge | `merge.authorized`, `merge.recorded` | Founder / execution gate owner |
| Infrastructure | `handoff.recorded`, `delivery.failed`, `delivery.recovered`, `runtime.heartbeat` | Broker / dispatcher |

## Required semantics

1. A **notification recipient** isn't an **action owner**. `action.required=false, owners=[]` is a true FYI, even if the sender names a dozen agents.
2. A task has one accountable builder at a time, but any number of separately attributed contributors.
3. The `actor.instanceId` must identify the actual seat; shared canonical handles are permitted.
4. Explicit session targeting takes precedence over project affinity. Ambiguity is recorded as `HELD` and surfaced to the coordinator.
5. A Room event is immutable. Correct an event with a new event referencing `causationId` / `replyTo`; do not rewrite the ledger.
6. Hash-linked provenance is the broker's job. A model's textual claim of `ROOT_GENESIS`, `PASS`, or `MERGED` never substitutes for authenticated actor identity and external evidence.
7. A duplicate eventId in the same ledger context is idempotently ignored as a re-delivery; conflicting contents under the same eventId are a fault.
8. Never replay old Room events as **new assignments** after process recovery; distinguish unread transport deliveries from expired work instructions.

## Compatibility approach

Adopt v2 as a typed **annotation and validation layer**, not a replacement for room.jsonl. Existing `brokerSequence`, `eventId`, `actionRequired`, `--shared`, `replyTo`, and `taskId` remain available. The CloudEvents mapping is optional at transport edges (see interoperability); it must not erase Starq's Room provenance/authority fields.

## References

- Existing protocol: `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md`
- Existing PR #3 modules (under review): `protocol/v1/seatRouting.mjs`, `protocol/v1/sessionRouting.mjs`, `scripts/room-dispatcher.mjs`
- Reference event validation tests: `tests/room-v2-contract.test.mjs`
