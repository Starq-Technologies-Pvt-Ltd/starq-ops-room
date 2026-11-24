# Starq Ops Room — Controlled Shutdown & Recovery Plan (v1 DRAFT — Prepare-Only)

**Status:** DRAFT. PREPARE-ONLY PLAN. **NOT** an execution instruction.  
**Date:** 2026-11-21  
**Author:** Ops AG (`w3:p2`)  
**Authority Gate:** **Explicit Founder Mustarq `GO` is required before any shutdown, restart, or recovery action.**  

---

## 1. Preconditions & Boundary Ownership

- **Founder `GO` required:** No pane, gateway, Herdr server, or machine may be stopped or restarted without explicit Founder authorization.
- **Boundary ownership:**
  - **Command Vision (`thr_7gyyc4dv22`):** Directs cross-studio shutdown/recovery sequencing across Vision seats.
  - **Ops Room (`w3:p3`, `w3:p2`):** Coordinates only Nitro-local documentation, preservation checkpoints, and post-restart startup handshake verification.
  - **StarqERP (`w4:p1 -> w4:p2`) and Hoadhaa (`w2:p8 -> XPS w2:p1 -> w2:p2/w2:p3`):** Own their own studio/host shutdown actions. Ops Room does **not** issue shutdown commands into ERP or XPS.
- **Cross-host coordination requirement:** Before any Nitro-side shutdown, Command must confirm with Hoadhaa/XPS whether remote XPS sessions (`w2:p1`, `w2:p2`, `w2:p3`) are idle/checkpointed and whether Nitro `herdr` SSH dependency affects them. (No XPS shutdown commands are prescribed here.)

---

## 2. Preservation Checkpoints (Capture BEFORE Any Shutdown)

Ops AG (`w3:p2`) must capture and verify all of the following read-only checkpoints (never recording secrets or credential values):

1. **Live pane & workspace inventory:** `herdr pane list`, `herdr workspace list`, and `herdr --machine XPS pane list` saved to a dated checkpoint file.
2. **Startup run state & ledger:** Record latest `runs/startup/<run_id>/{state.json,ledger.jsonl,topology_snapshot.json}` and list any unresolved `BLOCKED_ESCALATE` / `PAUSED` run IDs (currently `20261121T115836Z-2c88`, `20261121T121121Z-581c`).
3. **Repository state:** Capture `git status --short` and `git rev-parse HEAD` in `D:\StarqTech\starq-ops-room`.
4. **Docs & report integrity:** Record SHA-256 hashes of `docs/operations/*.md` and `scripts/startup-protocol/*.mjs`.
5. **Herdr server & session identities:** Record `herdr status` output and active pane `terminal_id` / `agent_session` IDs.
6. **Command / Room evidence pointer:** Record the current Cloudroom sequence / thread pointer supplied by Command Vision (`thr_7gyyc4dv22`).

---

## 3. Controlled Nitro-Side Shutdown Order (On Founder `GO` Only)

1. **Confirm studios idle:** Command confirms StarqERP (`w4:p1`/`w4:p2`) and Hoadhaa (`w2:p8` + XPS) have no active engineering turns.
2. **Capture preservation checkpoints (§2).**
3. **Stop Ops Room / local non-essential watchers** (currently none running per `CAPABILITY-AUDIT-2026-11-21.md`).
4. **Halt active Nitro agent panes gracefully** (`w3:p2`, `w3:p3`, and studio Vision panes via their owning chains).
5. **Stop Hermes gateways** (Nitro hosts two gateways: `D:\AgentRuntimes\Hermes` and `D:\AgentRuntimes\Picard`) and **Herdr server** (`herdr server stop`) only if full host shutdown/restart is authorized.

---

## 4. Post-Shutdown Recovery & Commissioning Demonstration Plan

After a future authorized shutdown/restart, commissioning acceptance requires executing this exact sequence under Founder `GO`:

1. **Restore core services:** Start Herdr server, Hermes gateway(s), and required panes under Founder `GO` (no automatic restart).
2. **Verify pane & identity bindings:** Confirm `herdr status`, `herdr pane list`, and `herdr --machine XPS pane list` match expected seat topology (`w2:p8`, `w3:p3`, `w3:p2`, `w4:p1`, `w4:p2`, `XPS w2:p1..p3`).
3. **Resume or dry-run:**
   - If a prior run is `PAUSED`, test `node scripts/startup-protocol/run-handshake.mjs --resume --run-id <run_id>`.
   - Run `node scripts/startup-protocol/run-handshake.mjs --dry-run` (0 prompts, 8 seats discovered).
4. **Approval-scoped live handshake:** Execute ONE authorized `node scripts/startup-protocol/run-handshake.mjs --live`.
   - **Today's known limitation:** Live `S3` (Hoadhaa/XPS), live `S4`, and measured XPS `p50`/`p95` latencies have **NOT** been proven yet (`20261121T121121Z-581c` halted at `S2`). The post-recovery commissioning demo **must** complete `S1 -> S2 -> S3 -> S4` and capture XPS `p50`/`p95` before commissioning acceptance.
5. **Gate:** Do not skip `MISSING`/`FAILED` ACK gates; halt at `READY_FOR_FOUNDER_GATE` until Founder separately authorizes Step 5 live work.

---

## 5. Abort & Escalate Conditions

- Any pane missing or `agent_status=blocked` during recovery.
- Any `MISSING` or `FAILED` ACK after diagnostic check (no blind resend, no automatic retry loop).
- Unexplained `topology_snapshot.json` drift (`changes_detected: true` → review `sop-delta.md`).
- **Action on abort:** Halt immediately in `BLOCKED_ESCALATE` and escalate readback evidence to Ops Room Vision (`w3:p3`) → Command Vision (`thr_7gyyc4dv22`) → Founder.
