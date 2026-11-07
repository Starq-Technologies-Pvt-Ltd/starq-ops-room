# Publication handoff — GitHub permissions and PR continuity

**Observed 2026-11-07:** The ChatGPT GitHub connection successfully read `Starq-Technologies-Pvt-Ltd/starq-ops-room`, root tree, handovers and PR #3. Direct GitHub `create_branch` and `create_blob` returned `403 Resource not accessible by integration`, so **the design package was NOT published to the GitHub repository**. The final ZIP package is a local deliverable. The user has not sent it to Claude yet.

## Intended publishing route, once an authorized writer is available

1. In the *existing canonical repository* `D:\StarqTech\starq-ops-room`, fetch GitHub and keep its checkout on clean `main`.
2. Preserve PR #3 (`claude/ops-room-durable-foundation-20261107` at the recorded head) and let the responsible engineer handle its independent review. Do not rewrite, close or supersede it blindly.
3. Create one external task worktree from current `main` (or from merged PR #3 if it has since been accepted) under `D:\StarqTech\.worktrees\starq-ops-room-<task>`.
4. Extract the ZIP, copy only the `overlay/` contents into the task worktree, compare existing files; the README is an intentional documentation rewrite. Reconcile overlapping paths with any newer upstream commits instead of clobbering them.
5. Run the 38 pure reference tests via `node --test tests/room-v2-*.test.mjs` and the existing PR #3 regression suite once its dependency closures are present.
6. Commit as one coherent docs + pure-protocol reference PR with truthful Git identity. Do not merge or deploy without the established Founder/Command gate.
7. Separately implement integration, live migration and canary per the execution phases; these are not implied by publishing documentation.

The attached overlay intentionally contains no `agent-comms/room.jsonl`, real identity registry, Cloudroom task database, credential, quota panel or runtime state. It is intended to be applied to the source repository, not copied over the live `agent-comms` tree.
