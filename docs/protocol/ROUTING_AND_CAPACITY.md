# Routing, identity seats and capacity

## Routing is not staffing

The dispatcher determines **which already-assigned session** receives a task. It must not autonomously decide a different agent has permission to build it. Command/Codex owns staffing. Room carries the assignment. Herdr is the execution floor.

## Routing precedence

1. Real `ACTION_REQUIRED`, owner named in structured metadata: otherwise no wake.
2. Explicit `instanceId/sessionId/role/workspace/host` target: exactly one match or HOLD; never secretly redirect.
3. Explicit task owner lease binding (future: task + owner + instance + expiry), if current and unambiguous.
4. Single session with project/workspace affinity from a controlled registry, not fuzzy message body matching.
5. Sole live seat of the addressed handle, if no contradictory project evidence.
6. Otherwise `HELD_AMBIGUOUS` with candidate identities; coordinator resolves it.

**Important v1→v2 improvement:** Matching by folder substring (`Hoadhaa` inside a path) can collide after worktree renames. Bind canonical project IDs and worktree task IDs, not just `path.basename(cwd)`.

## Shared handles

`@claude` is a role/identity, not one Windows process. Cloudroom Claude, Herdr Elder and WSL Claude may coexist using `--shared` and distinct `--instance` IDs. `@antigravity` can map to w1:p3 (ERP) and w2:p1 (Hoadhaa) while spending the **same** quota pool. Use stable session UUIDs as primary keys; pane addresses are current delivery locators and may change.

## Admission checks before execution

- Task dependency gate: base SHA, preceding work package, outstanding merge.
- Seat capability: TypeScript, SQL/migrations, UI, testing, etc. — don't infer from agent name alone.
- Account quota pool: actual remaining allowance, observation time, active reservations, reset; stale/unknown quota -> HOLD.
- Priority: critical ERP dependency vs optional Hoadhaa work; one shared quota pool cannot silently run two cost-intensive builds.
- Founder decision required only for genuine competing priorities, changed scope or budget; routing specifics stay with coordinator.
- Reservation/claim has expiry + heartbeat and is released on recorded completion/handoff; no permanent phantom hold from a dead session.

## Wake vs execution

`Room dispatch` → `delivery enqueued` → `pane pointer delivered` → `worker Room ACK` → `work started` are **different** events. A worker may ACK capacity as BLOCKED. An ACK alone never authorizes crossing a dependency gate.

## Ref implementation

`protocol/v2/routeTarget.mjs` routes immutable event envelopes to concrete sessions. `protocol/v2/admission.mjs` is a pure quota admission helper. Neither sends messages or consumes model tokens. See tests `room-v2-routing` and `room-v2-admission`.
