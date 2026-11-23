# AG BRIEF — Commissioning Preparation: Docs Hardening + Shutdown Plan

From: Ops Room Vision (w3:p1), on Command Vision / Founder Mustarq directive.
To: Ops AG (w3:p2).
Date: 2026-11-21.
Mission: documentation preparation only. No activation, no shutdown.

## NON-NEGOTIABLE SAFETY GATES

1. **Do not execute any shutdown, restart, recovery, recurring job, gateway action, live handshake, or Step 5 gate.** This mission authors procedures and plans only.
2. **Do not change product/runtime configuration, provider auth, credentials, agents, panes, Herdr state, automation, or services.** Documentation files only.
3. **Do not commit or push.** Keep work staged/untracked for Founder review.
4. **Do not document assumptions as facts.** Documentation must match current-round evidence only.
   - Startup protocol mock tests 1–6 PASS.
   - First live handshake failed closed at S2 on prompt-stall (`20261121T115836Z-2c88`).
   - Scoped polling fix landed; second live run `20261121T121121Z-581c` verified a 38,952ms ERP-Vision primary ACK but failed closed at S2 because PICARD downstream token was absent at primary-token poll exit.
   - Therefore S3 (Hoadhaa/XPS) and S4 have **NOT** been live-verified in this round. XPS latency p50/p95 is **UNKNOWN**.
   - Capability audit is complete: `docs/operations/CAPABILITY-AUDIT-2026-11-21.md`.
   - XPS/ERP audit slices from Command have NOT been provided to Ops Room; state them as pending/UNKNOWN, do not invent them.
5. **No duplicate/conflicting instruction stack.** New docs must explicitly supersede / cross-reference old DRAFT materials, never silently claim operational activation.
6. **Profile instruction writes:** Inspect Nitro `vision` profile `BOOT.md` and other applicable profile instructions read-only first. Apply only a minimal, proven cross-reference update if its existing content demonstrably lacks an authoritative Ops-Room startup/recovery pointer. Otherwise do not edit it; record "no change required". Do not touch profiles other than `vision`.

## AUTHORITATIVE EVIDENCE TO READ BEFORE DRAFTING

- `docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`
- `docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md`
- `docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md`
- `docs/operations/STARTUP-HANDSHAKE-IMPLEMENTATION-REPORT-2026-11-21.md`
- `docs/operations/CAPABILITY-AUDIT-2026-11-21.md`
- `docs/readiness/AG_OPS_ROOM_BRINGUP_2026-11-21.md`
- `runs/startup/20261121T115836Z-2c88/{state.json,ledger.jsonl}`
- `runs/startup/20261121T121105Z-6f5f/{state.json,ledger.jsonl}`
- `runs/startup/20261121T121121Z-581c/{state.json,ledger.jsonl}`
- Repo `README.md`, `.gitignore`, and current git status.
- `D:\AgentRuntimes\Hermes\profiles\vision\BOOT.md` (read-only first; do not inspect credentials).

## REQUIRED DELIVERABLES

### 1. Repository entrypoint
Create `START.md` in repo root. It must:
- Identify the operations repo's purpose and documentation authority.
- Point to the v1 DRAFT SOP and companion startup SOP without claiming either is active.
- Give a concise evidence-first navigation map: readiness, protocol, recovery, capability audit,
  milestone, and commissioning shutdown-demo plan.
- State clear activation boundary: all procedures pending Founder approval; no recurring execution;
  readiness tests never authorize engineering work.
- State how to find current run evidence under `runs/startup/<run_id>/`.

### 2. Commissioning architecture / authority record
Create `docs/operations/OPS-ROOM-COMMISSIONING-ARCHITECTURE-v1-DRAFT.md`.
- Document the **four-loop model** as proposed/pending approval:
  Command/Cloudroom → Ops Room; StarqERP chain (Command → ERP Vision → PICARD);
  Hoadhaa chain (Command → Hoadhaa Vision → DEADPOOL → JARVIS/XPS AG);
  Ops Room finalization (Command → Ops Vision → Ops AG → Command).
- Identify current known Nitro seat routing, but never assert remote XPS readiness beyond
  topology discovery/previous described paths.
- State authority boundaries: Ops Room does not command ERP or XPS engineering; Command handles
  cross-chain direction; Founder is sole authority for Step 5/recurring activation/shutdown.
- Link to specific tested evidence and explicit verification gaps.
- Include precise status vocabulary: VERIFIED, TESTED-FAIL-CLOSED, CONFIGURED, UNKNOWN/PENDING.

### 3. Recovery and controlled shutdown preparation
Create `docs/operations/OPS-ROOM-CONTROLLED-SHUTDOWN-AND-RECOVERY-v1-DRAFT.md`.
This is a **prepare-only** plan, never an execution instruction. Include:
- Preconditions / explicit Founder GO required before every state-changing action.
- A controlled Nitro-side shutdown order that preserves boundary ownership: Command directs;
  Ops Room coordinates only local/Nitro documentation and checkpoint verification; ERP and XPS
  chains own their own shutdown actions. Cross-host coordination requirements must be stated,
  but do not invent XPS commands.
- Preservation checkpoints (must be captured BEFORE shutdown): live pane/workspace inventory;
  current `runs/startup/<run_id>` state/ledger/topology; docs/report hashes; git status/HEAD;
  current Herdr server/session/pane identities; current room/Command evidence pointer supplied by
  Command; known unresolved blocked run IDs. Never include secrets/credential values.
- Startup/recovery **demonstration plan** after a future shutdown: restore services only under
  Founder GO; verify pane/identity bindings; resume from persisted run state; perform dry-run
  topology; then one approval-scoped live handshake; do not skip missing/failed ACK gates; halt
  at `READY_FOR_FOUNDER_GATE` until Founder separately authorizes live work.
- Explicitly state today's limitation: no live S3/S4 proof and no measured XPS p50/p95; the demo
  must cover them before commissioning acceptance.
- Clear abort/escalate conditions; no implied automatic retry/restart.

### 4. Milestone record
Create `docs/operations/COMMISSIONING-MILESTONE-2026-11-21.md` documenting the real operating
round, with evidence citations, as:
Founder directive → autonomous departmental delegation → cross-host/topology execution →
independent verification → exception handling → consolidated reporting.

Use only true claims:
- AG brought up/verified at w3:p2 (readiness note cited).
- Protocol design/build/mock proof, first live fail-closed run, scoped fix authorization,
  second live fail-closed run and exact blocker.
- Capability audit occurred and findings are cited.
- If XPS or ERP reports are absent from this repo, say **PENDING Command-provided slice** rather
  than claiming independent verification.
- Never say "without manual Founder intervention" as a blanket claim; say the milestone is a
  commissioning candidate demonstrating delegated execution within Founder-set gates.

### 5. Reconcile existing documents (minimal only)
- Update `README.md` only if needed to point readers to `START.md`; preserve deployment and
  credential boundary wording unchanged.
- Do NOT modify `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md` or
  `STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md` unless a concrete contradiction with verified evidence
  requires a minimal correction. If none: do not edit; record "no change required".
- Create `docs/operations/DOCUMENTATION-RECONCILIATION-2026-11-21.md` listing each existing
  relevant doc, disposition (unchanged / minimally updated / superseded-by-pointer), evidence,
  and why no duplicate/contradictory instructions remain.
- Review `D:\AgentRuntimes\Hermes\profiles\vision\BOOT.md`. If a cross-reference change is needed,
  include exact diff and a reason in reconciliation; otherwise do not change it.

## REQUIRED VERIFICATION

- Run a Markdown link/path audit using a read-only script/command (do not need network links).
- Confirm no procedure falsely claims daily activation, validated S3/S4, XPS latency, or Step 5.
- `git diff --check`; `git status --short` — confirm only expected doc files + existing uncommitted
  work, no source/script change from this mission.
- Produce `docs/operations/COMMISSIONING-DOCUMENTATION-REPORT-2026-11-21.md` with created/updated
  files, verification commands and actual output summaries, known limitations, external XPS/ERP
  inputs still pending, and explicit "NO SHUTDOWN/RESTART/RECURRING ACTIVATION EXECUTED" statement.

## RETURN

Reply after completing the documentation package with:
1. all created/updated paths;
2. whether `BOOT.md`, DRAFT SOP, and startup SOP were changed (and why);
3. verification outcomes;
4. commissioning readiness + exact gaps/Founder decisions;
5. the full `git status --short` result.

Stop after reporting. No operational action beyond documentation edits is authorized.
