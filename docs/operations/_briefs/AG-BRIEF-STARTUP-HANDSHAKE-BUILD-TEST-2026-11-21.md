# AG BRIEF — Hardened Startup Handshake Protocol (BUILD + TEST PHASE)

From: Ops Room Vision (w3:p1). Design reviewed and approved.
To: Ops AG (w3:p2).
Date: 2026-11-21.
Prior artifacts:
- Design doc: `docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md`
- Design brief: `docs/operations/_briefs/AG-BRIEF-STARTUP-HANDSHAKE-DESIGN-2026-11-21.md`

Mission authority: Founder-authorized engineering mission (build + test only; NOT activation).

---

## HARD SCOPE GATES — unchanged

- Deliverables are for FOUNDER APPROVAL. DO NOT trigger Step 5 (execution gate).
- Build + TEST authorized. Real ACK round-trips in bounded tests are allowed; a passing test
  is NOT live-work authorization.
- Preserve all existing sessions. No restarts of any pane. No changes to `watch/`, `protocol/`,
  `api/`, `scripts/send.mjs`, or any `scripts/room-watch-*.mjs`.
- No new network services. All comms over existing `herdr` CLI.
- Evidence over assertion. Fail closed. No blind resends.

---

## DESIGN RESOLUTIONS (apply during build)

1. **Hybrid handshake, not direct probing.** The protocol must prove the command structure
   routes work, not just that panes are alive. Implement:
   - `S2`: orchestrator prompts ERP Vision (`w4:p1`) with a brief: "obtain PICARD's readiness
     ACK token from `w4:p2`, reply here with the consolidated ACK containing PICARD's token."
     ERP Vision executes that handshake. Orchestrator parses the consolidated ACK.
   - `S3`: orchestrator prompts Hoadhaa Vision (`w2:p8`) -> relays to DEADPOOL (`XPS w2:p1`).
     DEADPOOL obtains SEPARATE ACKs from JARVIS (`XPS w2:p2`) and XPS AG (`XPS w2:p3`),
     consolidates, replies to Hoadhaa Vision, who replies to the orchestrator.
   - Direct orchestrator probes are allowed ONLY for top-of-chain seats to verify liveness
     before delegating. The actual readiness ACK must come through the chain, not around it.
   - Prompts to Vision seats must be concise (single short message with explicit ACK-token
     format) to minimize Vision LLM. PICARD / JARVIS / XPS AG / DEADPOOL do the real work.
2. **Command Vision bridge:** Ops Room Vision (`w3:p1`) bridges Command (Cloudroom
   `thr_7gyyc4dv22`). The orchestrator produces a final readiness packet; it does NOT call
   Cloudroom APIs itself.
3. **XPS timeouts:** keep 180s; calibrate during tests and record actual p95 in the test report.
4. **Git tracking of `runs/`:** commit `state.json`, `ledger.jsonl`, `topology_snapshot.json`.
   Gitignore `runs/startup/*/logs/`. Add the rule to `.gitignore` as part of this change.

## ADDITIONAL GUARDRAILS

5. **Do NOT mutate `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md` from any run.** Even in
   a live run, if `reconcile.mjs` detects workflow changes, write the proposed delta to
   `runs/startup/<run_id>/sop-delta.md` and surface the path. Only Ops Room Vision applies
   DRAFT edits after review (and only on Founder approval of the delta).
6. **Deliverable A (hardened SOP) ships as a new companion doc:**
   `docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md` — captures the SOP + checklist in
   the same style as the v1 DRAFT (status: DRAFT, pending Founder approval; versioned header;
   explicit "integrates with" link). Do NOT edit the existing v1 DRAFT; prepare a one-line
   cross-reference as a proposed addendum in `runs/<test_run_id>/sop-delta.md` for Founder
   review.

---

## WHAT TO BUILD

1. `scripts/startup-protocol/` per the design: `run-handshake.mjs`, `topology.mjs`,
   `herdr-client.mjs`, `state-store.mjs`, `ack-parser.mjs`, `reconcile.mjs`.
2. `herdr-client.mjs` MUST be dependency-injectable so a test harness can substitute a mock
   transport (same code path for live and mock — this is how we fault-inject safely).
3. `.gitignore` update for `runs/startup/*/logs/`.
4. `docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md` (Deliverable A).
5. Startup checklist as Deliverable B — can live inside the SOP doc as an explicit section.

## WHAT TO TEST (all 6 scenarios from the design, with EVIDENCE)

Before any live ACK test, run 1–3, 5, 6 against the mock transport. Scenario 4 (resume) uses
mock-produced state. Then — and only then — run ONE bounded LIVE handshake end-to-end to
prove the live command chain really works (this is scenario 7, below).

- 1. Dry-run topology (mock transport, `--dry-run`). Evidence: topology snapshot + all
  handoffs SKIPPED.
- 2. Induced interruption (mock). SIGINT mid-S2. Evidence: `state.json` shows partial progress,
  `ledger.jsonl` has no partial lines.
- 3. Induced MISSING + induced FAILED (mock). Evidence: diagnostic gate blocked blind resend
  on MISSING; zero prompt sent on `agent_blocked`; run ends `BLOCKED_ESCALATE`.
- 4. Resume (mock). After scenario 2, `--resume --run-id`. Evidence: ACKed handoffs skipped,
  protocol completes to `READY_FOR_FOUNDER_GATE`.
- 5. Idempotency (mock). Re-run `--resume` on a completed run. Evidence: 0 new prompts,
  ledger line count unchanged.
- 6. Doc-update-only-on-change (mock reconcile). Two runs: identical snapshot -> no delta;
  changed snapshot -> `sop-delta.md` written.
- **7. ONE live end-to-end run** (`--live`, no fault injection), against the real seats.
  Evidence: full `ledger.jsonl` showing real ACK tokens from `w4:p1`, `w4:p2`, `w2:p8`,
  `XPS w2:p1`, `XPS w2:p2`, `XPS w2:p3`, consolidated via the proper chain; run ends at
  `READY_FOR_FOUNDER_GATE`; `reconcile.mjs` reports `changes_detected` honestly; script
  halts there (NEVER announces live-work authorization). Capture p95 XPS hop latency.

Live-test discipline:
- Use short, bounded prompts. Explicit ACK token in the required regex.
- Do NOT ask seats to do real engineering work. ACK readiness only.
- If any seat is actively working (`agent_status=working`), SKIP that seat in the live run
  (mark `SKIPPED/busy` in the ledger) and continue. The orchestrator must not interrupt a
  real working turn.

## DELIVERABLE D — IMPLEMENTATION REPORT

Write `docs/operations/STARTUP-HANDSHAKE-IMPLEMENTATION-REPORT-2026-11-21.md` containing:
- Files created (absolute paths, sizes, SHAs).
- Scenarios 1–7 run commands + relevant output excerpts + evidence file paths.
- PASS/FAIL for each scenario; UNKNOWNs encountered; any deviation from the design (and why).
- Measured XPS hop latency p50 / p95 from scenario 7.
- Explicit statement that Step 5 was NOT triggered.

## RETURN

When all of A, B, C, D are complete, reply here with:
1. The 4 deliverable paths (A: SOP; B: checklist section in SOP; C: test evidence dir
   `runs/startup/<live_run_id>/`; D: implementation report).
2. Top-line PASS/FAIL for each of the 7 scenarios.
3. Any blocker that stopped you from finishing; any UNKNOWN.
4. Commands to re-run each scenario (so I can independently re-verify).

STOP after reporting. DO NOT iterate on live runs without my authorization. If scenario 7
produces unexpected downstream behavior, halt immediately and escalate with the readback
evidence.
