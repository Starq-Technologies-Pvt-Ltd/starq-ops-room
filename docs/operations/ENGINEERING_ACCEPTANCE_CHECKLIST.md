# Universal Operations Room acceptance — real floor before cutover

This is the *acceptance gate* for any real dispatcher replacement. Reference tests alone do not pass it.

## Operational test matrix

- [ ] **Ledger:** broker epoch/hash-chain validates, exact eventIds resolve, writers obey the canonical ingress; no direct JSONL writes.
- [ ] **Authority:** fake Founder handle in body cannot grant ROOT_GENESIS; true Founder decision routes with authenticated provenance.
- [ ] **Routing:** identical `@claude` and `@antigravity` handles in different Cloudroom/Herdr/WSL seats route to exactly the intended session. Unqualified ambiguous target becomes durable HOLD.
- [ ] **No false wakes:** CC_CONTEXT, `actionRequired=NONE`, ordinary ACK and unrelated task update do not wake premium agents.
- [ ] **Source outage:** WSL/Windows Herdr offline or unreachable generates persistent pending/held evidence; restoring source delivers a pointer only once per session/event with retry guard.
- [ ] **Restart:** dispatcher kill/restart, stale lock, changed pane IDs, process death and duplicated watcher startup are exercised against a test ledger.
- [ ] **Backpressure:** shared AG quota pool respects ERP critical-path reservation while Hoadhaa may remain queued; stale quota is UNKNOWN, not available.
- [ ] **Review:** PR head changes after Vision review fail the merge gate; separate reviewer identity validated; deliberately-red CI not marked accepted.
- [ ] **Task continuity:** original Cloudroom task ID/thread unchanged across child planner, Herdr receipt, reviewer and merge; no duplicate cards.
- [ ] **Founder visibility:** missing Room #18437-style Telegram notice can be audited by `seq`, eligibility rule and provider ACK; replay notice only, not original task event.
- [ ] **Worktree:** canonical product repo stays clean on `main`; completed task worktree is removed only after Vision ACCEPT, Founder merge and Cloudroom Done.
- [ ] **Source/live reconciliation:** per-file checksums and explicit direction; preserve live credentials, identity registry and Room history.
- [ ] **Rollback:** restore only affected executable and previous checkpoint, verify no duplicated wakes, leave original Room ledger unchanged.

## Acceptance artifacts

One immutable Git commit/PR, tests with exact commands/results, live canary Room event ranges, watcher/dispatcher checkpoint evidence, rollback proof, independent Vision report, Founder merge/release decision and Cloudroom task closure. No blanket claims of autonomous operation without these traces.

## Rollout policy

Dry-run → compare against old watchers → canary one intended seat → verify ack and delivery → switch one watcher class at a time → stop old duplicates → broader floors. No untimed wholesale cutover; no new shadow Kanban. This is an internal engineering milestone, **not** a third commercial product launch.
