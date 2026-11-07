# STARQ Operations Room — system overview

**Status:** Proposed Room v2 contract and implementation roadmap (not a live deployment). **Date:** 2026-11-07.

## Purpose

Starq operates two commercial engineering product streams: StarqERP and Hoadhaa. Cloudroom Command is the internal project coordination environment. Herdr is a separately developed third-party multi-agent execution harness, not a Starq product. Operations Room is the Starq-owned communications fabric connecting them, without becoming a second Kanban or another orchestration UI.

### Five planes

| Plane | Authority | Persistent record | Failure behavior |
|---|---|---|---|
| **Decision** | Founder, delegated scoped authority | Cloudroom task decision + Room event | Hold disputed action; do not infer approval |
| **Work** | Cloudroom task/thread and dependencies | Kanban ID, work package, owner | No duplicate task creation on retry |
| **Message/evidence** | Room broker | Immutable eventId, brokerSequence, ledger epoch, causal links | Replay safely, gap alarms, no silent skip |
| **Execution** | Herdr agents on Windows/WSL | session/instance, project, task branch/worktree | At-least-once wake, idempotent task ACK |
| **Candidate code** | GitHub repository/PR/checks | immutable SHA, review, merge SHA | Do not call local commit "merged" |

Telegram (Deadpool/StarqBot) is a notification and remote Founder interface, *not* a separate source of work truth. Starq Recall is a historical **read** projection of Room evidence, not an alternative live action ledger. Jevgrep is for source-code discovery, not operational instructions.

## Core invariants

- `ROOT_GENESIS`/Founder instructions are distinguished from agent reports. The sender's asserted handle alone does not confer Founder authority; authenticated provenance must be checked at ingress.
- Broker sequences are monotonic within a ledger epoch. Consumers persist both `(epoch, sequence)`; an epoch change requires recovery, not silent offset reuse.
- Each participant is a **handle** plus independently identifiable **seat/session**. `@antigravity` on ERP and Hoadhaa represents two Herdr sessions sharing one provider quota pool.
- A directed `@mention` is merely an address. `actionRequired: NONE` means no work; a structured action owner is necessary to wake a model.
- The only valid completion of a bounded engineering packet is a Room delivery receipt pointing to a PR and immutable head; accepted, merged, and closed are **separate** later states.
- Independent reviewer cannot be the builder for the same work package; merge authorization binds the reviewed SHA.
- System processes may retry **delivery**, not independently reproduce a cancelled/closed coding job.
- Cloudroom remains the authoritative Kanban; Room can carry task IDs/status events but must not silently mutate boards without a supported, explicit adapter.
- Live `agent-comms` should **not** be turned into an in-place Git checkout. Treat it as a deployment target with versioned manifests and rollback.

## Source boundaries

- `D:\StarqTech\starq-ops-room`: versioned source (`main` stable; branch/worktree per engineering task).
- `D:\StarqTech\agent-comms`: running local broker, identity registry, watchers, state, gateways and Room archive.
- Cloudroom: official Kanban tasks, project threads, reviewer children, Founder approvals.
- Herdr: Windows and WSL agent sessions, pane and workspace state, task worktrees.
- GitHub: PR/check/merge authority. Vercel `api/` remains a separately gated access proxy, not a substitute for the local broker.

## Design goal

An engineer can switch providers, exhaust a quota, crash a session, restart Windows/WSL, or lose a Telegram notification without losing the task identity, last accepted state, evidence, or the next actionable instruction. The delivery system should be boring and predictable; the coding agents can be chaotic.
