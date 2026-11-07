# Cloudroom ↔ Herdr ↔ Cloudroom — authoritative bridge contract

## Problem and resolution

Cloudroom can plan, dispatch and verify. Herdr can execute with multiple independently addressable model/harness seats. Neither should have to inherit another agent's chat history. The **Room eventId + Cloudroom task + GitHub SHA** are the continuity keys.

## Adapter responsibilities

### Cloudroom outbound adapter (plan → dispatch)

Input: existing task ID, thread ID, approved scope, dependencies, owner, engineering branch/base SHA, required tests, action ceiling and approvals. Emit a Room **task.dispatched** event with structured `task`, `actor`, `action.owner`, `target.project`, `payload.specRef`, and a `correlationId` that remains stable for the cycle. Do not start a second task just because a model retry produced a new chat session.

### Session dispatcher (Room → Herdr)

Discover actual sessions from Herdr, bind `handle + instanceId + project + workspace`, choose one actual target, persist delivery intent, wake with a *short* pointer (`Room #sequence / eventId`). A failed wake is retryable. An ambiguous/shared `@claude` target is **HELD** with reason, never broadcast. Seat-specific claims to act must be backed by the recipient's own Room ACK.

### Herdr worker adapter (execution → Room)

Worker retrieves the complete Room instruction using the supported reader, ACKs under its own stable instance, works in an isolated external task worktree, posts targeted progress/blocker messages only when useful, and delivers `PR URL + head SHA + tests + limitations + scope summary` to the original Room correlation/task. A Herdr pane status `done` is not a delivery receipt.

### Cloudroom inbound adapter (Room → review/closure)

Resolve the existing Cloudroom task/thread via stable IDs. Open Vision's **independent** review at the exact PR head. Record ACCEPT/REJECT with evidence. After Founder-approved merge at unchanged head, sync canonical `main`, update existing Kanban card Done, and post closure. Only then remove the completed external worktree and local task branch after checking clean state.

## Traceable cycle: Hoadhaa example

```text
HOA-247 + Cloudroom thread thr_bsgw75nm6c
    -> Room #18437 task.dispatched
    -> Hoadhaa Herdr w2:p1 task.acknowledged #18443
    -> isolated worktree hoadhaa-HOA-247
    -> PR #4 + immutable head 80efa4a + Room #18446 task.delivered
    -> Vision #18453 review.accepted
    -> Founder merge authorization -> main merge 7fb9fa4
    -> Cloudroom HOA-247 Done, Room #18457
    -> retire task worktree after closure
```

This example is an **observed historic cycle**, not a claim that these proposed v2 adapters already operate in production.

## Correlation and transport fields

- `task.id`, `task.project`, `task.cloudroomThreadId` identify the Cloudroom record.
- `correlationId` threads all Room events for the cycle; `causationId` identifies the triggering event.
- `actor.handle`, `actor.instanceId` distinguish a human/agent handle from its running seat.
- `target.instanceId` or `target.sessionId` are preferred; project affinity is fallback only when unambiguous.
- `payload.pr`, `payload.headSha`, `payload.checks`, `payload.reviewedHead`, `payload.mergeSha` are typed evidence fields, not inferred from prose.
- `brokerSequence`, `eventId`, `ledgerEpoch` come from the broker; clients cannot forge sequence authority.

## Two independent queues

- **Delivery queue:** a notification is awaiting transport/wake. Retry transparently and bound it.
- **Work queue:** a real assignment awaits capacity, approval, or dependencies. Never treat a delivery retry as permission to start a competing worker.

## Failure walkthroughs

- Claude runs out of quota: the task, Room records, PR and worktree survive. A different model may pick up the **existing** task after an explicit transfer and ACK; not by impersonating the original session.
- AG shares an ERP/Hoadhaa quota: route to the appropriate seat, then use capacity admission to hold lower-priority work. An idle pane is not proof of quota.
- Founder sees a missing Telegram seq: delivery audit compares the Room broker range with Telegram delivery receipts, explains filtered/not eligible vs attempted/failed and supports replay **of the notification**, not reposting a duplicate Room directive.
- Cloudroom thread dies: reconstruct from Cloudroom task + Room event chain + exact GitHub refs; start one recovery thread and preserve original task identity.
