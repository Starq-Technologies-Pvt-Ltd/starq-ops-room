# AG BRIEF — Scoped S2 Fix + Second Controlled Live E2E

From: Ops Room Vision (w3:p1). Command-authorized on Founder's disposition.
To: Ops AG (w3:p2).
Date: 2026-11-21.
Mission authority: ONE scoped fix + ONE live run. Readiness verification, NOT Step 5.

---

## HARD SCOPE — do not exceed

1. **Single-file fix, single location.** Edit only `scripts/startup-protocol/run-handshake.mjs`,
   only the dispatch / ack-wait handling. Nothing else is in scope.
2. **Semantic contract preserved:**
   - Genuine ACK token still required. `alive != handshake`.
   - No blind resends. Diagnostic gate remains in force.
   - Fail-closed on genuine FAILED/MISSING after full timeout expires.
   - Busy seat (`agent_status=working`) is `SKIPPED/busy` — never interrupted.
3. **The fix in one sentence:** when `herdr agent prompt --wait` returns
   `agent_prompt_stalled` AND readback confirms the prompt text was delivered post-baseline,
   do NOT short-circuit to FAILED; fall through to the `herdr agent read` polling loop and
   let the full configured timeout (60s/90s/180s) decide ACK / MISSING. Equivalent
   implementation: submit without relying on `--wait`'s 5s window and drive the poll loop
   directly. Pick whichever is cleaner; both are in scope.
4. **No other edits.** `topology.mjs`, `herdr-client.mjs`, `state-store.mjs`, `ack-parser.mjs`,
   `reconcile.mjs`, `test-scenarios.mjs`, docs, SOP, DRAFT — all untouched.
5. **Stay staged/untracked.** Do NOT commit. Do NOT push. Do NOT activate recurring execution.
   Do NOT trigger or announce Step 5.

## RE-TEST — gated on the fix landing cleanly

1. **Mock regression:** run `node scripts/startup-protocol/test-scenarios.mjs`. ALL 6
   scenarios must still PASS. If any regress, STOP and report — do NOT proceed to live.
2. **Dry-run sanity:** `node scripts/startup-protocol/run-handshake.mjs --dry-run`. Confirm
   0 prompts sent, 8 seats discovered.
3. **ONE live end-to-end:** `node scripts/startup-protocol/run-handshake.mjs --live`.
   - Expected path: S1 → S2 (ERP Vision → PICARD) → S3 (Hoadhaa Vision → DEADPOOL →
     JARVIS + XPS AG) → S4 (reconcile + consolidated readiness to w3:p1) → halt at
     `READY_FOR_FOUNDER_GATE`.
   - **Collision discipline:** ERP and Hoadhaa readiness work is running in parallel on
     those same seats right now. If any seat is `agent_status=working` when the
     orchestrator arrives, your fail-closed logic MUST record it as `SKIPPED/busy` in the
     ledger and move on — do NOT interrupt, do NOT blind-resend. An honest `SKIPPED/busy`
     is the correct outcome, not a failure.
   - The prompt to Vision seats must remain concise; they only relay to their subordinates
     and return the consolidated ACK token.
   - If ANY handoff surfaces unexpected downstream behavior (e.g. a seat tries to actually
     start engineering work because of the prompt wording), HALT the run immediately and
     escalate with readback evidence.

## MEASUREMENTS TO CAPTURE

- Measured XPS hop latency (previously UNKNOWN): record per-hop elapsed ms for the three
  XPS hops (`w2:p1`, `w2:p2`, `w2:p3`) in the ledger `notes` or `state.json.summary`.
  Report p50 and p95 across the three measurements (if the sample is < 3 due to SKIPPED,
  report min/max/median and note the sample size).
- Per-step elapsed wall clock.

## RETURN

Reply here with:
1. **Fix diff summary** (unified diff of the single-location edit, ≤30 lines or a concise
   summary + the start/end line numbers in `run-handshake.mjs`).
2. **Mock regression result**: 6/6 PASS or the first failure.
3. **Live run result**:
   - `run_id` and evidence dir path.
   - Final `state.json.status` and per-step status (`S1`/`S2`/`S3`/`S4`).
   - Full ACK ledger table (handoff_id, from, to, direction, status, acked_at, evidence
     snippet) — one row per handoff.
   - Measured XPS p50/p95 (or sample stats with n).
   - Any `SKIPPED/busy` seats, with the detected `agent_status` at the time.
4. **Remaining UNKNOWNs / limitations.**
5. **Decisions requiring Founder** (if any).

STOP after reporting. Do not iterate. Do not commit. Do not trigger Step 5.
