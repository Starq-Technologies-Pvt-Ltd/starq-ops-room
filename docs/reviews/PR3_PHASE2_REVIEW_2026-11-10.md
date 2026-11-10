# PR #3 phase 2 — independent review (2026-11-10)

**Reviewer:** Claude, Operations Room Deputy (Room instance `e97d7e67-fd68-40a1-9c4e-a7e8be387554`, Windows w3:p1).
**Reviewed:** Codex commits `99e0c3a`, `005e6de`, `06dd800` on `claude/ops-room-durable-foundation-20261107`.
**Not reviewed here:** `c63af6d` (phase 1) is the reviewer's own commit and still needs a reviewer other than Claude.
**Assignment:** Room #18768, handover #18752, Founder directive #18775. Nothing was deployed, armed or delivered.

## Verdict

No blocking defect found in the three commits. One whitespace fix was made (below). Four gaps
are recorded for a decision before any canary; none was changed in code because each is a design
or governance choice rather than a bug.

## What was run

| Check | Result |
|---|---|
| CI command (8 test files, `COMMS_IDENTITIES_PATH=tests/fixtures/identities.json`) | 99 tests, 99 pass |
| `node --check` on `send.mjs`, `ingress.mjs`, `ingressPaths.mjs`, `room-dispatcher.mjs` | all pass |
| `git diff --check c63af6d..06dd800` | one finding: blank line at EOF of `tests/send-routing.integration.test.mjs` (fixed in this commit) |
| Real `send.mjs` + real `ingress.mjs` in a scratch sandbox, `COMMS_ROOM_PATH` set to an isolated file | 3 valid structured posts and 1 legacy post appended to the isolated Room only; 4 invalid inputs refused with nothing appended |
| Candidate dispatcher, pure dry-run over that isolated Room, real Windows and WSL discovery | planned exactly the named seats; contradictory target and bare `@cursor` held; `writes=0`; pre-seeded state file hash unchanged |
| Candidate dispatcher, pure dry-run over the canonical Room | in-memory seed at #18778, no state directory created |
| Canonical Room size and mtime across the sandbox run; production checkpoint hash | unchanged; `7404C125…C97CC4B` |

The sandbox combined the branch files with read-only copies of the modules that exist only in
the live runtime (`envelope`, `hashChain`, `ledger-epoch`, `projectClassifier`, `identityLease`,
`reviewer-separation`, `room.mjs`, `room-structured-metadata.mjs`). Lease and inbox writes
landed inside the sandbox.

## Findings

1. **Structured targets are authoritative end to end.** With `metadata.routing` present, the
   audience and `mentions` are exactly the target handles; a body containing quoted `@copilot`,
   `@all` and `@antigravity` added nobody. Aliases are stored canonically (`elder` → `claude`).
2. **Sender refuses before publishing:** unknown handle, wrong schema, unknown field, and a
   NONE action were all refused with exit 1 and no append.
3. **Conjunction holds:** role `ops-room-deputy` plus the ERP seat's instance was published (the
   sender cannot see the seat table) and then held by the dispatcher as `CONTRADICTORY_TARGET`.
4. **Legacy path:** a post without `--routing-file` carries no `routing` key and routes as before.
5. **Ingress path seam:** default paths are the canonical ones; an override must be absolute and
   in a different directory, and lock and inbox follow it.

## Gaps for decision

1. **The real `ingress.mjs` is not exercised by CI.** `tests/send-routing.integration.test.mjs`
   replaces it with a double, because its dependencies are live-only. The ingress changes
   (routing validation, mention restriction, path seam wiring) are covered only by manual sandbox
   runs such as the one above. Closing this needs the live-only protocol modules in the repo,
   which is the open import decision from the 2026-11-07 drift inventory.
2. **`COMMS_ROOM_PATH` is honoured silently by the production sender.** If the variable leaks
   into a seat's shell, posts go to another file while the sender prints the normal success line.
   Recommendation: print the Room path on every send when the override is active.
3. **Seat enrollment is not enforced in code.** `seatBinding.mjs` checks pane, agent kind, cwd,
   optional session and pid. It does not check that the configured instance has ever posted to
   the Room or holds a lease. Recommendation: a small guard that holds a delivery
   (`INSTANCE_NOT_ENROLLED`) unless the Room contains a record from that handle with that exact
   `senderInstanceId`; until then enrollment remains an operator gate, as in Room #18770.
4. **Structured posts drop body mentions from `mentions`.** That is the intended fix for quoted
   text, but any reader that used `mentions` as a cc list (for example Founder visibility) no
   longer sees those handles on structured posts.

## Session pinning (Room #18773)

`herdrAgentSession` should stay optional. The required binding is backend + pane + agent kind +
cwd + foreground pid. Herdr's session value is a hint that some integrations keep current and
others do not: it matches for ERP Claude and Hoadhaa Antigravity, and is stale for the
Operations Room Deputy pane (#18734). Pin it only where it is known to track the live session;
a pinned value that drifts produces a recoverable `SESSION_MISMATCH` hold, which is the safe
direction. Cursor's Room instance is the generic label `cursor-session-fixed`, which does not
identify a session, so its pin is doing real work and should stay.

## Still unverified

- WSL prompt delivery. Discovery works; delivery from a caller outside a Herdr pane is untested
  and the backend stays `unverified`.
- Copilot, OpenCode, Devin, Goose and OMP have no current Room instance and stay unroutable.
- Seat pids are a snapshot; any harness restart holds that seat until the table is corrected.
- The legacy Claude watcher is seat-blind. If it were restarted alongside this dispatcher, a
  structured post for any `claude` role would also reach whichever pane that watcher targets.

## Proposed canary (nothing here is authorised yet)

1. Independent review of `c63af6d` by someone other than Claude; decisions on gaps 1–3.
2. Canary state directory outside the live tree; legacy watcher confirmed stopped.
3. One seat, one event: a structured post to role `ops-room-deputy` only, dispatcher run with
   `--deliver --once`. Expect one pointer in w3:p1, one delivery record, and a Room reply that
   sets the agent ACK.
4. Repeat for a second Windows seat with its lead's consent, then leave it running for a
   bounded window with every hold reviewed.
5. WSL and worker seats only after their own verification and enrollment.
