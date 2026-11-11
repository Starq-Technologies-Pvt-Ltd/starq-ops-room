# Vision four-specialist review bridge: blocked for real packages (2026-11-11)

Status: **OPEN** — investigation only. Recorded by the Operations Room Deputy for Room #18929
item 4 and #18930. Nothing was run: no bridge invocation, no test run, no edit. All findings are
from reading files and Room records at 15:25–15:35 PKT.

## Effect

- Hoadhaa: HOA-253 independent review is blocked at candidate `4edf2dab` [#18923].
- StarqERP: the PR #204 review at head `808ad84` is BLOCKED with no verdict [#18930, #18935].
- On 2026-11-08, PR #201 and PR #203 were reviewed only through Founder-authorised one-off
  interim reviews because of this bridge [#18611, #18614, #18639].

## What the bridge is

`D:\AgentRuntimes\Hermes\profiles\vision\workspace\department\scripts\hermes-group-bridge.py`.
It sends one review assignment to the existing Hermes group `70af4632-…`, collects replies from
sentinel, evidence, planner and reporter, starts a Vision follow-up turn, and writes a JSON
receipt. It lives in Vision's Hermes profile workspace. **It is not in any Git repository**
(`git rev-parse` fails in that tree), the same class of problem as the Telegram gateway source
[#18871].

## Current source state (verified by hash)

| File | SHA-256 | Matches |
|---|---|---|
| `scripts/hermes-group-bridge.py` (16345 bytes, 2026-11-08 20:35) | `6C36543D…2563297` | the **repaired, promoted** script reported in #18637 |
| `scripts/hermes-group-bridge.py.pre-repair-20261108.bak` | not re-hashed | rollback copy named in #18637 |
| `tests/test_department_bridge_contract.py` | `F330547E…F347AF` | the contract test named in #18635 and #18637 |

So the file on disk is not the broken v3 edit from 2026-11-07. It is the repair delivered on
2026-11-08.

## Owner

The owner is recorded; it is not unknown.

| Responsibility | Holder | Source |
|---|---|---|
| Department, its SOP, review requirements, independent acceptance of the bridge | **Vision** | `PROJECT-MANAGEMENT-SOP.md` line 4; #18635 |
| Coordinating one accountable engineering owner for the repair | **Codex** | Founder #18632; #18633; #18635 |
| Builder of the repair | **Antigravity** (then Herdr `w1:p3`) | #18635, #18636, #18637 |
| Authority for the repair and for any exception | Founder | #18632 |

What is missing is not an owner but a **closing step**: #18642 asked Vision for a formal
acceptance verdict on the repair (PASS or CORRECTIONS-REQUIRED). No such verdict from Vision is
in Room between #18642 and #18922. Whether one exists in Cloudroom was not checked from this
seat.

## The two project statuses are the same state

`PROJECT-MANAGEMENT-SOP.md` (edited 2026-11-10 20:04) says, in its "Reconciliation (2026-11-10)"
paragraph:

- contract tests pass 3/3 and the synthetic receipt is settled;
- the "must not run" prohibition is **lifted for synthetic and contract validation**;
- **real-package dispatch remains fail-closed until a real Cloudroom package receipt is
  persisted**; `receipts/e2e-cloudroom-test.json` does not exist and must not be cited.

The ERP headquarters wording ("synthetic/contract tests passed, real routing unverified") and
the Hoadhaa wording in #18923 ("incomplete and prohibited from invocation") describe this one
state. #18923 quotes the older warning, which the SOP itself now marks superseded; its
conclusion — the real review path is blocked — is still correct.

## Exact failing predicate

**No receipt exists for a real Cloudroom package.** `receipts/` holds seven files, the newest
being the synthetic one of 2026-11-08. The SOP makes that receipt the precondition for real
dispatch. A real-package receipt can only come from a real-package run, so the gate cannot be
passed by ordinary work: it needs one explicitly authorised, controlled first run.

## Defects found by reading the current source

These would undermine that first run and should be fixed before it.

1. **Assignment ID in the prompt differs from the receipt.** With `--manifest` and no
   `--assignment-id`, `dispatch()` generates one UUID for the prompt (line 160) and a second for
   the receipt (line 186). Confirmed in the synthetic receipt: the prompt says
   `Assignment: 70492a00-…`, the receipt's `assignment_id` is `4d9cf534-…`. The specialists were
   told one ID and the receipt records another.
2. **A manifest run cannot be resumed.** For the same reason, a rerun builds a prompt with a new
   random ID, the comparison at line 174 fails, and the script raises "Existing receipt belongs
   to a different assignment". After a timeout or crash the only path is a fresh send.
3. **The receipt does not identify the package.** `validate_manifest` checks only `read_only`,
   `evidence` and `task.key`. The manifest's `child_thread_id`, `parent_thread_id`,
   `revision_event_id` and `milestone` are neither required nor written to the prompt or the
   receipt, and there is no field for the candidate commit. A completed receipt cannot be tied to
   an immutable SHA except by reading the free-text prompt. This is the "durable correlated
   receipt" Vision asks for in #18923.
4. **Timeout is tight.** Default 240 s. The synthetic run took 141 s and the HOA-246 run 233 s.
   A real four-specialist code review may exceed it, and defect 2 then prevents resuming.
5. **Tests cover the predicate only.** The three contract tests exercise `validate_manifest`,
   `build_review_prompt` and `receipt_is_complete` on hand-built data. Nothing tests `dispatch()`:
   ID handling, resume, timeout or the event loop.

Not found: any fault in `receipt_is_complete` itself. It requires all four routed replies, the
first-turn settlement, a distinct Vision follow-up discussion, the Vision message and the second
settlement, each bound to the thread.

## Bounded repair and test plan (proposal; nothing here is authorised)

Follow the route already used in #18635: isolated candidate copy, contract tests, then promotion
with a rollback hash. Builder independent of Vision; Vision accepts.

1. **Decide the home of the source.** Put the bridge and its tests under version control before
   changing them. Founder decision, alongside #18871.
2. **Repair, in a candidate copy:**
   - generate the assignment ID once and use it for both prompt and receipt;
   - on resume, take the prompt from the existing receipt instead of rebuilding it;
   - require `child_thread_id`, `revision_event_id` and a candidate commit in the manifest, and
     write the manifest identity into the receipt; make `receipt_is_complete` require it;
   - make the timeout an explicit argument for real packages.
3. **Tests:** add cases for the single ID, resume after timeout with an unchanged prompt, a
   manifest missing the package identity, and a completed receipt whose package identity does
   not match. Use a fake gateway client; no live group.
4. **Synthetic E2E** in the existing group with a fresh assignment ID and a new receipt, as in
   #18637, including one forced timeout and resume.
5. **First real-package E2E**, explicitly authorised, read-only, on one package. HOA-253 at
   `4edf2dab` is the natural candidate because it is already waiting. All four specialists, a
   fresh Vision child, receipt persisted and read back.
6. **Vision's formal verdict** on the bridge, in Room, closing #18642. Then update the SOP
   paragraph and lift the real-package gate.

Until step 6, an interim review of any package needs the Founder's explicit one-off
authorisation, as on 2026-11-08.

## Follow-up on 2026-11-11

- 15:33 — Codex assigned a correction pass for the five defects above to the original builder,
  Antigravity `w1:p3`, under the same task `VISION-BRIDGE-REPAIR`, in the existing isolated
  candidate `D:\StarqTech\_worktrees\vision-hermes-bridge-repair-20261108`. Synthetic-only E2E;
  no real Cloudroom task, no promotion, no runtime change. Vision reviews under #18642 [#18933].
  This covers steps 2 to 4 of the plan above. Steps 1, 5 and 6 are still open.
- 15:34 — Builder ACK; no edit yet [#18934].
- 15:34 — The gate bit a second package: the PR #204 review at `808ad84` is BLOCKED with no
  verdict. Founder to choose between a one-off interim solo review and keeping the gate
  [#18935].

- 15:35 — Vision posted its own BLOCKED record for PR #204 under its existing lease [#18938].
- 15:36 to 15:44 — the correction pass lost its builder before any edit. Antigravity's harness
  scratch is outside `D:\StarqTech`, so it released the task with zero edits [#18939–#18941].
  The transfer to WSL Claude was withdrawn at its usage limit (reset 17:40 PKT) [#18942,
  #18943]. OpenCode was preflighted only [#18945]. **No builder is authorised; the candidate is
  unchanged.** Founder staffing choice in #18946.

## Limits of this investigation

- Tests were not run; "3/3 pass" is from #18637 and the SOP.
- The Hermes gateway, the group log and Cloudroom threads were not queried.
- Whether settlement events on a real package carry the same fields as in the synthetic run is
  unverified.
- Line numbers refer to the file with the hash above.
