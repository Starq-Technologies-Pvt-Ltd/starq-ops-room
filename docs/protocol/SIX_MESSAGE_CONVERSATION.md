# Six operational messages, one richer wire contract

Keep the human-facing vocabulary small. Founders and agents should not have to memorize dozens of event codes. The wire format is granular only to make delivery, evidence, transitions and recovery deterministic.

| Human-facing message | Room v2 event(s) | Meaning |
|---|---|---|
| **DISPATCH** | `task.dispatched` | Existing Cloudroom task, bounded package, target seat/role, exact baseline and required result |
| **ACK** | `task.acknowledged`, `task.started` | Worker saw the exact dispatch; separately reports start/capacity, not task completion |
| **UPDATE** | `task.progress`, `task.resumed` | Concrete code/evidence progress and recovery, never fictitious percentages |
| **BLOCKED** | `task.blocked`, `delivery.failed` | Verifiable missing source, quota, capability, access, ambiguity or infrastructure blocker |
| **REVIEW** | `task.delivered`, `review.requested`, `review.accepted`, `review.rejected` | GitHub exact-SHA delivery and independent acceptance/rejection |
| **HANDOVER** | `handoff.recorded`, `merge.authorized`, `merge.recorded`, `task.closed`, `task.deferred` | Return to Command, Founder merge gate, task closure or explicit deferral |

`runtime.heartbeat` and transport events support reliability but are not counted as business communications. `CC_CONTEXT` informational broadcasts are not an actionable message type and must not wake costly agent seats. This retains the lightweight six-message protocol the Founder originally sought while preserving precise machine semantics.

## Example: Hoadhaa task handoff

One exact task might have:

```json
{
  "version": "starq.room/2",
  "eventId": "evt-hoa250-dispatch-example",
  "kind": "task.dispatched",
  "occurredAt": "2026-11-07T09:56:18Z",
  "actor": {"handle": "claude", "instanceId": "cloudroom-hoa250"},
  "task": {"project": "HOA", "id": "HOA-250", "cloudroomThreadId": "thread-from-authoritative-task"},
  "action": {"required": true, "owners": ["antigravity"], "summary": "Build approved proofs package"},
  "target": {"role": "hoadhaa-builder"},
  "correlationId": "cycle-HOA-250",
  "payload": {"baseSha": "9c431a98ef97b2b71d4466ab9ca7e09f153084b1", "worktreePolicy": "isolated-external", "merging": "founder-gated"}
}
```

The `eventId` here is illustrative; never use it as an actual Room broker event identity. The sender must resolve the real Room `eventId` and `brokerSequence` after append, then use those in replies. `metadata.senderInstanceId` must name the real emitting seat. Never invent a corresponding lease.

## Receipt model

- Room dispatch persisted: broker returns `eventId` and sequence.
- Dispatcher transport receipt: `delivered_to_session`, provider/tool result and timestamp; **does not** claim a worker ACK.
- Worker ACK: new Room event `replyTo` actual dispatch `eventId`, bound to same Cloudroom task/cycle.
- Review: immutable 40-hex commit `reviewedHead`; distinct reviewer identity; independently run checks.
- Merge: Founder authorization exact PR and SHA; GitHub returns immutable merge SHA.
- Closure: Cloudroom task status updates, followed by Room closure receipt and worktree clean retirement.

Deduplication keys include `eventId + sessionId` for pointer delivery and `task ID + delivery event + work claim` for idempotent worker task handling. Source events never get reposted merely to repair a Telegram notification.
