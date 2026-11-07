# Founder visibility — informative, not noisy

## The Founder view should answer

- What engineering task changed, on which product, and who owns the next action?
- Which code shipped to `main`, with which PR/merge SHA, and which reviewer accepted it?
- What is blocked by quota, absent evidence, missing dataset, failed CI, or Founder product decision?
- Which tasks were dispatched but never ACKed, ACKed but never started, delivered but never reviewed, and accepted but not merged?
- Which Room events failed to reach Telegram, Cloudroom or a specific Herdr seat?

## Three notification classes

1. **Decision required** — one actionable Founder question, clear recommendation and linked evidence. Higher urgency; a real human decision is needed.
2. **Operational exception** — persistent failure, queue blocked, ambiguous delivery, ownership conflict or lost Room→Herdr handoff. Alert the responsible coordinator first; escalate when unresolved.
3. **Digest/awareness** — normal ACK, tests, branch update, routine PR creation, healthy throughput. Bundle into concise periodic summaries, no premium agent wake unless the action belongs to it.

Never treat every `ACTION_REQUIRED` in Room as "ACTION REQUIRED FOR FOUNDER." A message can be required for `@codex` and informational for Founder. Telegram delivery eligibility must be evaluated against structured action owner, escalation and notification-policy fields.

## Missing-sequence reconciliation

The user saw Deadpool receive #18436 and #18438 while Room #18437 (HOA-247 dispatch) did not appear. AG later acknowledged #18437 and shipped the work, proving the task-dispatch path succeeded. The relay must retain its own eligibility/delivery trail:

`(brokerEpoch, sequence, notificationPolicyVersion, eligible?, destination, attempt, providerReceipt, deliveredAt, failureReason)`.

A sequence-gap audit distinguishes:

- Eligible but not attempted → watcher bug/backlog.
- Attempted but provider failed → retry/dead-letter.
- Intentionally filtered → visible reason/rule, optional Founder replay.
- Delivered but not displayed/read → provider/UI status unknown, don't claim display proof.

**Replaying a Telegram notification must not repost the original Room event.**

## Proposed Founder commands

`/room 18437` show exact event with actor/owner/related task; `/room gap 18435..18443` delivery eligibility and receipts; `/tasks blocked` current exceptions; `/tasks awaiting-review` review queue; `/tasks accepted-unmerged` merge decisions; `/floor` live seats and most recently observed quota; `/recall "ERP-541"` historical evidence with source seq. These are **proposed** StarqBot/Command views, not currently implemented commands.
