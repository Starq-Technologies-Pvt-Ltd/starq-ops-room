# STARQ Operations Room — engineering delivery roadmap

**Goal:** Improve the actual existing system rather than start a replacement product. Keep the work lean enough for one laptop and multiple quota-constrained harnesses.

## Phase 0 — Source continuity (first)

- PR #3 is open at head `c1c61a2` when this package was authored. It contains the first universal dispatcher, testability and session-routing work. Do not silently merge it or overwrite the Claude branch.
- Reconcile live `agent-comms` ↔ GitHub per `docs/reconciliation/DRIFT_INVENTORY_2026-11-07.md`: vendor source dependency closure, preserve sanitized identity fixture, fix divergent Codex and Deadpool watchers.
- Normalize `D:\StarqTech\starq-ops-room` to clean `main`; task worktrees live externally and close after Cloudroom acceptance. Live `agent-comms` remains separate.
- Close PR #3 under existing Vision/Founder acceptance before introducing a new live dispatcher.

## Phase 1 — Protocol authority (additive)

- Adopt typed Room v2 envelope + compatibility metadata adapter, task correlation and causation IDs.
- Add explicit action owner and `NO_ACTION`/CC semantics to every sender and watcher.
- Preserve authenticated identity lease, stable seat UUID and canonical Room broker sequence/epoch/hash-chain.
- Keep Cloudroom Kanban authoritative; expose task status as a **projection**, not a second task database.

## Phase 2 — One delivery engine

- Use PR #3's session dispatcher as baseline; add durable outbox/pending/held/dead-letter queue with error-propagating fsync/atomic writes.
- Add session rediscovery and no-double-wake cutover; reconcile precise per-project routing and overlapping agent handles.
- Test Windows+WSL+Cloudroom/Herdr, start in dry-run, canary one seat, then retire watcher-by-watcher.

## Phase 3 — End-to-end execution bridge

- Cloudroom existing task → Room dispatch → Herdr ACK → external worktree/PR → Room delivery → Vision review → Founder gate → Cloudroom Done → worktree retirement.
- Implement task-owner transfer/recovery events; pending-provider or quota exhaustion does not duplicate tasks.
- Add GitHub PR/check/SHA receipt verification and stable cycle correlation.

## Phase 4 — Founder communications and resilience

- Owner-aware Deadpool/Telegram notification policy, missing-sequence audit, operator retry/replay, concise alerts.
- Lightweight read-only founder activity view: what shipped, waiting for action, review queue, blocked quotas and per-floor state. No new editable Kanban.
- Starq Recall read access by exact seq and task; Jevgrep remains code-only.

## Phase 5 — Optional interop

- MCP read-only Room tools; A2A adapters for genuinely external agents; CloudEvents/OTel envelopes at gateways. Avoid infrastructure providers/services until a demonstrated need.

## Definition of delivered

- A phase has a verified PR, independent review, unchanged candidate SHA, relevant pure/real tests, reversible live deployment evidence (when applicable), and Cloudroom task closure. Writing a spec, opening a draft PR, or seeing an idle pane does not equal that phase being deployed.

## Suggested next bounded engineering packets

1. **OPS-V2-A:** source/CI completeness + PR #3 integration mapping.
2. **OPS-V2-B:** typed envelope and matcher with backward compatibility tests.
3. **OPS-V2-C:** durable delivery queue + restart/epoch fault injection.
4. **OPS-V2-D:** task/PR/Vision evidence bridge + no-drift merge gate.
5. **OPS-V2-E:** Founder notifications and missing-sequence audit.
6. **OPS-V2-F:** dry-run/canary and controlled live cutover.

Do not create a new Kanban project or shadow task system by default. Track these packets in the existing Command operating workflow using one accountable engineering owner each.
