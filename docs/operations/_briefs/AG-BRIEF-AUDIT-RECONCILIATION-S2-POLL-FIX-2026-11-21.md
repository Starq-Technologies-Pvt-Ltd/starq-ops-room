# AG BRIEF — Audit-Slice Reconciliation + S2 Poll Completion Fix (NO LIVE RUN YET)

From: Ops Room Vision (w3:p1), Command/Founder authorized.
To: Ops AG (w3:p2).
Date: 2026-11-21.

## Authority and HOLD

This brief authorizes ONLY:
A. documentation reconciliation of Command-provided XPS + ERP audit slices; and
B. one narrow protocol code fix + local/mock regression.

**DO NOT run a live handshake yet.** Command is separately briefing ERP Vision. Wait for an explicit
Ops Room Vision follow-up that names the live-run timing. No shutdown, restart, recurring activation,
Step 5, commit, push, config/auth change, or agent prompt is authorized by this brief.

## A. Reconcile audit slices — documentation only

Read these sources exactly:

1. XPS relay copy:
`D:\AgentRuntimes\Hermes\profiles\vision\workspace\hoadhaa-studio\xps-commissioning-docs-status-2026-11-21.md`
2. ERP durable report location supplied by Command:
`D:\StarqTech\Projects\StarqERP\docs\governance\audit\PICARD-STUDIO-FULL-AUDIT-20261121\`
   Note: If `REPORT.md` is absent at that exact path, inspect the supplied directory listing/read
   the actual report available (currently likely `VISION-CONSOLIDATED-REPORT.md`) and record the
   path correction; do not fabricate a missing REPORT.md.
3. `...\FOUNDER-ESCALATION-F1-F2-F3-F8.md`
4. Existing repo docs:
`docs/operations/CAPABILITY-AUDIT-2026-11-21.md`,
`docs/operations/OPS-ROOM-COMMISSIONING-ARCHITECTURE-v1-DRAFT.md`, and
`docs/operations/COMMISSIONING-DOCUMENTATION-REPORT-2026-11-21.md`.

Allowed edits: ONLY those three repo docs above (plus the report) and only factual additions/
minimal corrections necessary to remove the stale “ERP/XPS slices PENDING” statement.

Requirements:
- In the capability matrix, add XPS and ERP classifications with source-path citations.
- Preserve exact audit distinctions (e.g. INSTALLED vs CONFIGURED vs VERIFIED-OPERATIONAL vs
  DEGRADED/INCOMPLETE/UNKNOWN). Do not upgrade XPS/Nitro/mobile beyond sources.
- XPS docs are **documentation-complete / prepare-only**. XPS full cold-boot, Telegram reconnect,
  sshfs remount, delegation fan-out remain UNKNOWN at demo. Preserve P13/P15 Founder decisions.
- ERP: cite F1/F2/F3/F8 as Founder-gated and unexecuted. Do not call officers universally ready;
  distinguish root services/graphify/ruflo verified from officer gaps and RIKER NO_RETRY.
- Mobile (FORGE/S20PLUS/NOTE8) remains UNKNOWN-BLOCKED due to failed SSH reachability.
- Update architecture to identify the XPS chain as documented from its received slice, not
  independently reverified by Ops Room.
- Report which exact stale phrases were removed/replaced.

## B. S2 root-cause confirmation + narrow fix

Evidence to read before changing code:
`runs/startup/20261121T121121Z-581c/state.json`,
`runs/startup/20261121T121121Z-581c/ledger.jsonl`,
`runs/startup/20261121T121121Z-581c/logs/readbacks/20261121T121121Z-581c_S2_orchestrator-_w4_p1_request__attempt_1.txt`,
and `scripts/startup-protocol/run-handshake.mjs`.

Verified evidence constraint: the readback shows ERP Vision DID run the PICARD prompt (~31.7 sec)
and stated "PICARD ACK received." It then emitted the ERP primary token while still working.
Therefore do NOT claim PICARD was unresponsive or that ERP did not drive the nested leg.

Root cause to confirm in code:
- Polling terminates once the primary target token appears, before all configured
  `downstreamExpected` tokens are present.

Authorized code change (single file):
- In `scripts/startup-protocol/run-handshake.mjs`, make the ACK poll loop continue until BOTH
  the primary expected token AND every downstream expected token appear post-baseline, or the full
  existing deadline expires.
- Preserve strict post-baseline token parsing, no-blind-resend, existing timeouts, busy handling,
  and BLOCKED_ESCALATE behaviour. No other semantic changes.
- If existing tests do not cover this exact ordering, add the smallest mock test in the existing
  `scripts/startup-protocol/test-scenarios.mjs` that proves: primary token arrives first,
  downstream token arrives later, and the handoff remains pending until both tokens exist.
  This additional test is within the protocol test boundary; no other test restructuring.

Run only local/mock verification:
1. `node scripts/startup-protocol/test-scenarios.mjs`
2. `node scripts/startup-protocol/run-handshake.mjs --dry-run`
3. `git diff --check`

NO `--live` invocation. NO live agent prompt. Do not modify SOP/DRAFT docs for this code change;
the reconciliation report may identify the gap as now fixed-and-awaiting-live-verification.

## Return

Reply when A+B are complete with:
1. Exact files changed + concise diff summary.
2. Path correction for ERP report if applicable.
3. Exact S2 root cause evidence (readback line / code location).
4. Regression outputs (test count + dry-run status) and `git diff --check` result.
5. Confirmation no live run, no agent prompt, no shutdown/restart, no Step 5 occurred.
6. Full `git status --short`.

Stop and await my explicit live-run timing authorization.
