# Starq Ops Room — Startup Handshake Protocol (v1 SOP — pending Founder approval)

**Status:** DRAFT. NOT ACTIVE. No recurring startup loops run under this until Founder Mustarq approves.  
**Version:** v1.0 (2026-11-21)  
**Author:** Ops AG (`w3:p2`), authorized by Ops Room Vision (`w3:p3`)  
**Integrates with:** [OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md](file:///D:/StarqTech/starq-ops-room/docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md) (companion procedure; does not modify or supersede the v1 DRAFT)  
**Design specification:** [STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md](file:///D:/StarqTech/starq-ops-room/docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md)  

---

## 1. Purpose & Scope

This SOP defines the daily, deterministic startup-handshake procedure that verifies all command-chain seats across Ops Room, StarqERP, and Hoadhaa (including XPS) can communicate, acknowledge readiness, and preserve state before Founder Mustarq authorizes daily execution (Step 5).

**Hard boundaries:**
- **Hybrid chain routing:** Readiness ACKs must traverse the command chain (`w4:p1 -> w4:p2` for StarqERP; `w2:p8 -> XPS w2:p1 -> {XPS w2:p2, XPS w2:p3}` for Hoadhaa), not bypass it.
- **Minimal Vision LLM:** The Node.js orchestrator (`scripts/startup-protocol/run-handshake.mjs`) drives all Herdr handoffs and delivers only the consolidated readiness packet to Ops Room Vision (`w3:p3`) in Step 4.
- **No Step 5 auto-trigger:** The protocol always halts at `READY_FOR_FOUNDER_GATE`. Engineering execution begins only on explicit Founder authorization.
- **Non-mutating reconciliation:** Step 4 never mutates `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`. Any detected topology/config delta is written to `runs/startup/<run_id>/sop-delta.md` for Ops Room Vision / Founder review.

---

## 2. Authoritative Seat Topology

| Step | Seat | Machine / Address | Role |
|---|---|---|---|
| `S1` | Ops Room Vision | Nitro `w3:p3` | Operations Deputy (Hermes Vision, left pane; legacy Claude archived in `w3:t3`/`w3:p4`); bridges Command (`thr_7gyyc4dv22`) |
| `S1` | Ops Room AG | Nitro `w3:p2` | Ops Room technical executor (right pane) |
| `S2` | ERP Vision | Nitro `w4:p1` | StarqERP PM; obtains ACK from `w4:p2` |
| `S2` | PICARD | Nitro `w4:p2` | StarqERP Principal Engineering Studio |
| `S3` | Hoadhaa Vision | Nitro `w2:p8` | Hoadhaa PM; delegates to `XPS w2:p1` |
| `S3` | DEADPOOL | XPS `w2:p1` | XPS Commander; obtains separate ACKs from `w2:p2` & `w2:p3` |
| `S3` | JARVIS | XPS `w2:p2` | Hoadhaa XPS engineering seat |
| `S3` | XPS AG | XPS `w2:p3` | Hoadhaa XPS AG seat (distinct from `w3:p2`) |

---

## 3. Daily Execution Procedure

1. **Pre-flight & Run:** Ops AG (`w3:p2`) invokes:
   ```powershell
   node scripts/startup-protocol/run-handshake.mjs --live
   ```
   (Or `--resume --run-id <run_id>` if resuming a `PAUSED` run.)
2. **Step 1 (`S1`) — Ops Room Init:** Orchestrator verifies `w3:p3` and `w3:p2` presence via `herdr pane list`.
3. **Step 2 (`S2`) — StarqERP Loop:** Orchestrator prompts `w4:p1` (120s timeout) to obtain PICARD's (`w4:p2`) ACK token and return the consolidated ACK. If `w4:p1` is `working`, it is recorded as `SKIPPED/busy` without interruption.
4. **Step 3 (`S3`) — Hoadhaa Loop:** Orchestrator prompts `w2:p8` (180s timeout) to instruct DEADPOOL (`XPS w2:p1`) to obtain **separate** ACK tokens from JARVIS (`XPS w2:p2`) and XPS AG (`XPS w2:p3`) and return the consolidated ACK.
5. **Step 4 (`S4`) — Ops Room Finalization:** Orchestrator runs `reconcile.mjs` against the prior completed run's `topology_snapshot.json`, writes `runs/startup/<run_id>/sop-delta.md` **only** if real changes are detected, and delivers the consolidated readiness packet to `w3:p3` (90s timeout).
6. **Halt at `READY_FOR_FOUNDER_GATE`:** Ops Room Vision (`w3:p3`) reports consolidated readiness (plus any `sop-delta.md` path) to Command Vision (`thr_7gyyc4dv22`).

---

## 4. Failure, Retry & Escalation Rules

- **Genuine ACK required:** Standalone post-baseline line `^ACK::<run_id>::<step>::<seat_tag>::<nonce>`. `agent_status=idle` or `herdr` exit code `0` is never an ACK.
- **No blind resends:** At most `N = 1` retry (`10s` local / `20s` XPS backoff), permitted **only** if a diagnostic readback confirms non-delivery (`agent_prompt_stalled` / transport error with absent prompt text). Delivered-but-silent or `blocked`/`working` seats are never blind-resent.
- **STOP / Escalate:** Any exhausted retry, `agent_blocked`, missing pane, or downstream token omission transitions the run to `BLOCKED_ESCALATE` and surfaces the diagnostic evidence to Ops Room Vision (`w3:p3`) -> Command (`thr_7gyyc4dv22`) -> Founder.

---

## 5. Deliverable B — Startup Handshake Checklist

### Pre-Run
- [ ] Confirm `herdr status` is running on Nitro and `herdr --machine XPS pane list` succeeds.
- [ ] Confirm no active run is `PAUSED` that should be resumed instead (`--resume --run-id <id>`).

### During Run
- [ ] Verify `runs/startup/<run_id>/topology_snapshot.json` and `state.json` are created.
- [ ] Confirm any `working` seat is marked `SKIPPED/busy` (never interrupted).
- [ ] Confirm all `ACK` rows in `ledger.jsonl` carry pane-readback evidence citations.

### Post-Run (Halted at `READY_FOR_FOUNDER_GATE`)
- [ ] Verify `state.json` status is `READY_FOR_FOUNDER_GATE` (or `BLOCKED_ESCALATE` with diagnostic packet).
- [ ] Check `summary.changes_detected`: if `true`, review `runs/startup/<run_id>/sop-delta.md` before proposing any SOP edit.
- [ ] Ops Room Vision (`w3:p3`) reports consolidated readiness to Command Vision (`thr_7gyyc4dv22`).
- [ ] **Step 5 Gate:** Wait for explicit Founder Mustarq authorization before any engineering execution begins.

---

## 6. Proposed Cross-Reference Addendum for `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`

*(Not applied automatically; for Founder review alongside v1 DRAFT approval.)*

> - **Startup handshake:** Daily pre-execution readiness verification follows [STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md](file:///D:/StarqTech/starq-ops-room/docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md) (pending Founder approval).
