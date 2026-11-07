# Controlled source → live Room deployment

Current canonical source: `D:\StarqTech\starq-ops-room` (GitHub repo). Current live runtime: `D:\StarqTech\agent-comms` (NOT Git). This runbook is a **procedure**, not proof that any v2 code has been deployed.

## Before deployment

1. Branch from clean `main` in a **new external worktree**; keep root `main` stable. Every change gets tests and a PR.
2. Verify existing PRs (#1/#2 merged; #3 still open when this blueprint was prepared) and potential conflicts. Do not merge a speculative dispatcher without a working dry-run.
3. Read `docs/reconciliation/DRIFT_INVENTORY_2026-11-07.md`: Code/watchers differ between repo and live; compare by content and semantics, not file count.
4. Snapshot live executable files and runtime checkpoint/lock **without committing them**. Record restart owner and rollback commands.
5. Test the new code with synthetic fixtures and read-only Room snapshots; do not write fake operational records to the authoritative Room to test routing.

## Staged cutover

A. **Source/CI**: reconcile `room.mjs` and protocol dependencies so an isolated repo checkout can run all relevant tests. Current PR #3 addresses testability and core routing; confirm its final merged SHA first.

B. **Read-only shadow**: deploy new dispatcher in no-wake / dry-run mode; compare its routing recommendations against live watcher decisions. Include ambiguous and cross-floor cases.

C. **Canary single seat**: stop precisely one old watcher after recording checkpoint; enable dispatcher delivery for the same assigned seat, confirm exactly one pointer, one Room ACK, and no duplicate token spend.

D. **Fleet migration**: migrate remaining seats one by one, with per-seat checkpoint handover. Retire old watchers only after successful canary; retain reversible snapshots. Never run old watcher and new dispatcher simultaneously for the same target without a de-duplication fence.

E. **Founder notifications**: separately validate StarqBot/Deadpool delivery, missing-sequence audit and replay. Transport ACK does not prove user read the message.

F. **Close and retire**: after Cloudroom accepts the infrastructure task and live evidence is recorded, remove completed engineering worktrees. Do not delete any uncommitted or open-review worktree.

## Crash recovery

- On restart, verify broker ledger epoch/stability and durable checkpoint. Re-read pending, held, dead-letter and in-flight state before advancing `lastSeq`.
- A failed wake targets an immutable **session UUID**, not an expired pane name; rediscover where it is now.
- If a process died after actual agent work but before Room delivery receipt, inspect branch/PR and ask the existing worker for a reconciliation receipt before assigning a replacement.
- Never clear queue or lock to "fix" a live-owner issue without confirming the recorded process is gone.
- No blind replay of historical ACTION_REQUIRED events to agents after startup.

## Rollback

Stop only the affected dispatcher instance. Restore pre-cutover executable snapshot **and previous checkpoint**, restart the former watcher(s) with de-duplication guard, compare last delivered event IDs, then post an operations receipt. Never alter `room.jsonl`, identities or GitHub PR history to manufacture a rollback.

## Deployment artifact

A proper Room deployment receipt includes: source commit, files deployed and hashes, runtime process IDs/session identity, tests, before/after checkpoint, no-double-wake proof, canary seq, rollback location and final state.
