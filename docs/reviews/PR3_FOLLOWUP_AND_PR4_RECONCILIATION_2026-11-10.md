# PR #3 safety-gap follow-up and PR #4 reconciliation (2026-11-10)

**Author:** Claude, Operations Room Deputy (Room instance `e97d7e67-fd68-40a1-9c4e-a7e8be387554`, Windows w3:p1).
**Assignment:** Room #18781 (ACK #18782). Base: PR #3 at `0fd784e`, PR #4 at `acd8e4b`.
**Not done, by scope:** no merge, no watcher, no `--deliver`, no live delivery, no worker contact,
no backlog replay, nothing changed under `agent-comms`. The code below is new and needs a
reviewer other than Claude.

## 1. PR #4 compatibility (read-only)

| Check | Result |
|---|---|
| `git merge-tree` of PR #3 head with `acd8e4b` | merges cleanly, no conflict |
| Files touched by both branches | one: `protocol/v2/deliveryLedger.mjs`, byte-identical blob on both sides |
| PR #4 contract tests (`tests/room-v2-*.test.mjs`) in its own worktree | 38 pass, 0 fail; worktree clean |
| Imports between `protocol/v2` and `protocol/v1` | none in PR #4; PR #3 imports only `deliveryLedger.mjs` |

**Dependency:** PR #4 does not depend on PR #3 to merge, and PR #3 depends on PR #4 only for a
file it already carries. Either order works.

**Disposition:** keep PR #4 as a reference/contract package and merge it after PR #3, with these
points recorded so the two are not read as one design:

- `protocol/v2/routeTarget.mjs` and PR #3's `seatBinding.resolveTarget` agree on conjunction of
  explicit selectors and on HOLD for ambiguity. They differ on the unqualified case: v2 wakes a
  sole live session; PR #3 wakes only a documented default seat. PR #3's rule is the one the
  Floor Leads asked for and is the one in force on this branch.
- `protocol/v2/eventContract.legacyRoutingMetadata` emits `targetSession` / `targetRole`. The
  dispatcher reads `metadata.routing` (`starq.routing/1`) and ignores those fields. An adapter
  is needed before any v2 event is fed to it.
- `docs/reconciliation/PR3_INTEGRATION_MAP.md` in PR #4 describes PR #3 as it was at `c1c61a2`.
  Its risks 1–6 are addressed on this branch; the map should be refreshed when PR #4 is next
  touched. PR #4 itself was not modified.
- Still unused from PR #4: `taskLifecycle`, `admission`, `notificationPolicy`, `worktreeGate`,
  `eventContract`. None is wired to anything.

## 2. Sender diagnostic for `COMMS_ROOM_PATH`

`scripts/send.mjs` now prints a warning on **stderr** before posting and again after the record
is written whenever `COMMS_ROOM_PATH` is set, naming the redirect target. stdout is unchanged, so
callers that parse the success line are unaffected. Applies to structured and legacy Room posts.
Test: `sender warns on stderr whenever COMMS_ROOM_PATH redirects the post, and is silent otherwise`.

## 3. Recipient-enrollment guard

A seat is deliverable only if the Room holds the record its seat-table entry cites
(`enrollmentSeq`) and that record was posted by the seat's canonical handle with the seat's exact
instance id. `seatBinding.verifySeatEnrollment` runs before the live binding check on every
attempt and retry.

| Situation | Hold reason |
|---|---|
| seat cites no record | `INSTANCE_NOT_ENROLLED` |
| cited sequence not in the Room | `ENROLLMENT_RECORD_NOT_FOUND` |
| cited record from another handle or another instance | `ENROLLMENT_EVIDENCE_MISMATCH` |

All three are recoverable holds. The guard does not replace the pane/agent/cwd/pid check: an
enrolled seat with a changed pid still holds (`PID_MISMATCH`). A never-wake seat is refused first.

Candidate table citations, each verified read-only against the real Room: codex #18737,
erp-floor-lead #18742, ops-room-deputy #18733, erp-wsl-verification #18728, hoadhaa-lead #18741,
erp-cursor #18718, erp-antigravity #18716 (never-wake). Swapping the Ops seat's instance for the
ERP seat's yields `ENROLLMENT_EVIDENCE_MISMATCH`.

**Limits, stated plainly.** The guard proves that an instance id was once used by that handle in
the Room. It does not prove the session is the same one today (the pid and pane check covers
that), it does not consult the identity lease (live-only module, 20-minute expiry, unsuitable as
a delivery gate), and it cannot stop an operator citing a genuine but old record. Cursor posts as
the generic `cursor-session-fixed`, so its citation is weak evidence and its Herdr session pin
stays. Workers with no Room instance cannot cite anything and stay unroutable.

## 4. Consumers of `mentions` on structured posts

On a structured post, `mentions` and `evaluatedAudience` are exactly the target handles; handles
that appear only in the body are no longer included. Readers found in the repo and (read-only) in
the live runtime:

| Consumer | Use | Effect |
|---|---|---|
| `room-watch-codex`, `room-watch-antigravity`, `room-watch-vision`, `room-pointer-claude`, `room-wake-claude`, `room-watch-claude-herdr` | "is my handle in audience or mentions" | No breakage. They stop reacting to handles that were only quoted. They remain seat-blind. |
| `reviewer-separation.mjs` (DEC-072 builder attribution) | mentions on `started`/`claim` posts distinguish a dispatch from a self-claim | Unchanged when the dispatch targets the assignee. A structured `started` post whose targets omit the assignee would read as a self-claim; authors must target the assignee. |
| `room.mjs` snapshot view, `ingress.mjs` inbox entries | pass-through | Inbox entries are written only for target handles. |
| **`watch/deadpool-room-watch.mjs` `validateBrokerRecord`** | re-derives routing from sender, body and mentions **without metadata** and throws on any difference from the recorded audience | **Impacted.** A structured post whose body contains another handle is recorded with audience `[target]` but re-derived as `[other, target]`, so the relay watcher would reject that record. Demonstrated with the branch policy: body `forwarded: @copilot said hi`, target `claude` → recorded `["claude"]`, re-derived `["copilot","claude"]`. |

The Deadpool relay is another department's gateway and was not changed. The fix is one argument
(pass `record.event.metadata` to `evaluateEventRouting`) and needs Codex's decision and Deadpool's
owner. No relay watcher process is running now. Until it is fixed, structured posts should not be
used in production alongside that watcher.

No test was added for the relay path: the module cannot be imported in this repository (live-only
dependencies), which is the same CI gap recorded in the phase 2 review.

## 5. Evidence

- CI command, 8 files, `COMMS_IDENTITIES_PATH=tests/fixtures/identities.json`: 101 tests, 101 pass
  (99 before; +1 enrollment guard, +1 sender warning). Existing dispatcher and publisher tests
  were adjusted only to supply enrollment records.
- `node --check` on `send.mjs`, `room-dispatcher.mjs`, `seatBinding.mjs`: pass.
- Pure dry-run over the canonical Room with real Windows and WSL discovery: in-memory seed at
  #18782, `writes=0`, no frozen sources, no state directory created.
- Production checkpoint sha256 unchanged: `7404C12562E988EC6F46A72506BCC74788E318BBE5B45DEAD1CB8DB57C97CC4B`.
  No dispatcher or watcher process running.

## 6. Open gates

1. Review of this commit and of `c63af6d` by someone other than Claude.
2. Decision and owner for the Deadpool relay re-derivation (section 4).
3. Real-ingress CI coverage (needs the live-only protocol modules in the repository).
4. WSL prompt delivery; worker and Copilot/OpenCode enrollment.
5. Canary plan from the phase 2 review, unchanged, after 1–2.
