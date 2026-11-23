# AG BRIEF — Hardened Startup Handshake Protocol (DESIGN PHASE ONLY)

From: Ops Room Vision (w3:p1). On Command Vision, on Founder Mustarq's directive.
To: Ops AG (w3:p2).
Date: 2026-11-21.
Mission authority: Founder-authorized engineering mission (build + test only; NOT activation).

---

## HARD SCOPE GATES — read twice

- This is the ONLY authorized engineering mission right now. Do NOT touch unrelated work.
- Deliverables are for FOUNDER APPROVAL. Do NOT activate recurring execution. Do NOT trigger
  Step 5 "execution gate" (engineering studios begin/resume) — that is Founder-only.
- Build + TEST the handshake mechanism is authorized. Real ACK round-trips during a bounded
  test are allowed. A passing test is NOT live-work authorization.
- Preserve all existing sessions (`w2:p8` Hoadhaa Vision, `w3:p1` me, `w3:p2` you, `w4:p1`
  ERP Vision, `w4:p2` PICARD, XPS `w2:p1` DEADPOOL, `w2:p2` JARVIS, `w2:p3` XPS AG). No restarts.
- Fail closed. Evidence over assertion. Unknowns are UNKNOWN. No blind resends.
- Repo root: `D:\StarqTech\starq-ops-room`. Integrate with — do NOT duplicate — the existing
  draft: `docs\operations\OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`.

## PHASE SPLIT

This brief is the DESIGN phase. Do NOT write production scripts yet.
After I review and approve your design, I will issue a BUILD+TEST brief.

## WHAT TO DESIGN

A durable, repeatable, idempotent startup-handshake protocol that proves the full command
structure can communicate, acknowledge readiness, preserve state, and resume safely. The
Founder's 5-step sequence is below; your design must implement all of it.

### Protocol steps (reference)

1. Command + Ops Room init (w3:p1, w3:p2 available; Ops Room finalization deferred to Step 4).
2. StarqERP loop: Command Vision -> ERP Vision `w4:p1` -> PICARD `w4:p2` -> back to ERP -> Command.
3. Hoadhaa loop: Command Vision -> Hoadhaa Vision `w2:p8` -> DEADPOOL (XPS `w2:p1`) ->
   DEADPOOL obtains SEPARATE ACKs from JARVIS (XPS `w2:p2`) and XPS AG (XPS `w2:p3`),
   consolidates, replies to Hoadhaa Vision, who replies to Command.
   (Topology already live-verified: `herdr --machine XPS pane list` shows DEADPOOL w2:p1,
   JARVIS w2:p2, display_agent="AG" at w2:p3. Treat these as the authoritative IDs.)
4. Ops Room finalization: Command sends confirmed results to Ops Room Vision (me), who directs
   you to reconcile, document actual readiness + operational changes, update repo + SOP ONLY
   where real changes are detected. Then I report final readiness to Command.
5. Execution gate (Founder-only; out of scope for this mission).

### Hardening requirements (must appear in your design)

1. **Durable + repeatable**: runnable every day. Code lives under `scripts/startup-protocol/`;
   state under `runs/startup/<run_id>/` (per-run dir with state + ledger + logs).
2. **ACK ledger**: one row per handoff with: `handoff_id`, `from_pane`, `to_pane`, `direction`
   (request/response), `sent_at`, `acked_at`, `status` in {PENDING, ACK, FAILED, MISSING, SKIPPED},
   `evidence` (pane readback snippet proving a real reply, not just a submit RC), `retry_count`,
   `notes`. Append-only JSONL.
3. **State preservation**: persist run state to disk after each state transition so a
   crashed/paused run resumes from the last COMPLETED handshake, not from scratch. Define the
   state schema (JSON). A separate `state.json` (current) + `ledger.jsonl` (history) is fine.
4. **Idempotency**: a handoff already in `ACK` must NOT be re-sent; a step already COMPLETED
   must NOT re-run. Resume reads `state.json`, picks up at first non-COMPLETE step. Use a
   deterministic `handoff_id` (e.g. `<run_id>:<step>:<from>-><to>:<direction>`) as the guard.
5. **Explicit failure handling**:
   - Define timeouts per handoff (propose values — e.g. 60s default, 180s for XPS hops; justify).
   - Bounded retry policy (propose N retries with backoff; MUST NOT be blind-resend — each retry
     requires a diagnostic readback showing the prior message was not actually delivered or
     was silently dropped; otherwise escalate).
   - "Alive but silent" is NOT ready: `agent_status=idle`/submit-RC is not an ACK. A genuine
     ACK requires recipient-produced text in their pane readback that references the handoff
     or returns a defined ACK token.
   - Define the STOP/ESCALATE path (what triggers STOP, what gets escalated to Command/Founder).
6. **Lightweight + deterministic**: minimize Vision LLM. The script is the orchestrator; Vision
   seats only receive the final consolidated readiness, not every intermediate ACK.
7. **Doc update rule**: AG updates docs ONLY when real config/workflow changes are detected
   (diff against prior run or against current SOP). Unchanged = no rewrite.

### What you produce in THIS design phase (and only this)

A single design document at:
`docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md`

It must contain, in order:

- **Overview** (one paragraph; how it fits with the v1 DRAFT SOP).
- **Topology** (live-verified seats + machines + pane IDs; ACK token convention).
- **File layout** (exact paths for scripts, state, ledger, logs, docs).
- **State machine** (states + transitions for the run and for each handoff; a diagram in
  mermaid or ascii is fine).
- **State schema** (`state.json`) and **ledger schema** (`ledger.jsonl`) with field types.
- **Handoff algorithm** (how a single handoff is executed: send, wait, confirm by readback,
  classify ACK vs MISSING vs FAILED, record, decide next).
- **ACK verification rule** (exactly what counts as a genuine ACK — token format, where it
  must appear, how you parse it from pane readback).
- **Timeouts + retry policy** (values, justification, backoff).
- **Idempotency + resume** (how resume works, what guards duplicates).
- **Failure / escalation paths** (STOP triggers, who gets notified, how).
- **Test plan** (how you will test in the next phase: dry-run topology, induced interruption
  case, induced missing/failed-ACK case, resume case, idempotency case, doc-update-only-on-
  change case). Describe the scenarios and the exact evidence you will capture for each.
- **UNKNOWNs / open questions** (anything you cannot verify yet).

### Constraints on the design

- No new network services. All comms over existing `herdr` CLI (local + `--machine XPS`).
- No modification to the Cloudroom thread registry or room protocol.
- No changes to `watch/`, `protocol/`, `api/`, or existing `scripts/room-watch-*.mjs`.
- Scripts: Node.js (repo convention — see `scripts/room-watch-codex.mjs`, `scripts/send.mjs`).
- State files MUST be human-readable JSON/JSONL.
- Do NOT prompt real agents during the design phase. Dry-reasoning only. Real ACK round-trips
  come in the BUILD+TEST phase that I will authorize next.

## RETURN

When the design doc is written, reply here with:
1. Absolute path of the design doc.
2. A ~10-line executive summary (states, key timeouts, retry policy, doc-update rule).
3. Any UNKNOWNs you could not resolve.

Do not begin implementation. Do not send test prompts. I will review and then authorize
the BUILD+TEST phase with a second brief.
