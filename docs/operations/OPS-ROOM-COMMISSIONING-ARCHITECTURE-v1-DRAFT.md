# Starq Ops Room — Commissioning Architecture (v1 DRAFT — pending Founder approval)

**Status:** DRAFT. NOT ACTIVE. Pending Founder Mustarq approval.  
**Date:** 2026-11-21  
**Author:** Ops AG (`w3:p2`)  
**Integrates with:** [START.md](../../START.md), [OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md](OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md), [STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md](STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md)  

---

## 1. Status Vocabulary

- **VERIFIED:** Directly observed in tool output, file readback, or live run ledger in this round.
- **TESTED-FAIL-CLOSED:** Exercised in a bounded live or mock run and halted safely without blind resend or corruption when a downstream gate was not satisfied.
- **CONFIGURED:** Present in configuration/code on disk, not yet proven end-to-end in a live run.
- **UNKNOWN / PENDING:** Not yet verified in this round or awaiting an external Command-provided slice.

---

## 2. Proposed Four-Loop Commissioning Model

1. **Loop 1 — Command / Cloudroom ↔ Ops Room (`S1` init):**  
   Command Vision (`thr_7gyyc4dv22`) ↔ Ops Room Vision (`w3:p3`) ↔ Ops AG (`w3:p2`).  
   *Current status:* **VERIFIED** for Nitro local `w3:p3` ↔ `w3:p2` (`AG_OPS_ROOM_BRINGUP_2026-11-21.md`; `S1` `ACK` in `20261121T121121Z-581c`; post-reboot `#19839`).
2. **Loop 2 — StarqERP Chain (`S2`):**  
   Command Vision → ERP Vision (`w4:p1`) → PICARD (`w4:p2`) → ERP Vision → Command / Orchestrator.  
   *Current status:* **TESTED-FAIL-CLOSED** — In `20261121T121121Z-581c`, `w4:p1` primary ACK (`ACK::20261121T121121Z-581c::S2::ERP_VISION::29b2`) was **VERIFIED** in `38,952 ms`, and `w4:p1` readback showed it prompted `w4:p2`, but `w4:p1` omitted `PICARD`'s token in the captured snapshot so the run halted at `BLOCKED_ESCALATE` (`S2_PICARD_TOKEN_MISSING`).
3. **Loop 3 — Hoadhaa Chain (`S3`):**  
   Command Vision → Hoadhaa Vision (`w2:p8`) → DEADPOOL (`XPS w2:p1`) → separate ACKs from JARVIS (`XPS w2:p2`) and XPS AG (`XPS w2:p3`) → DEADPOOL → Hoadhaa Vision → Command / Orchestrator.  
   *Current status:* **UNKNOWN / PENDING** — Nitro and XPS pane topology was **VERIFIED** via `herdr pane list` and `herdr --machine XPS pane list` (`20261121T121105Z-6f5f`), and an earlier manual `w2:p8` → `XPS w2:p1` PING→PONG is cited in `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`, but **S3 has NOT been live-verified** by the startup orchestrator (`20261121T121121Z-581c` skipped `S3` after `S2` halted). XPS `p50`/`p95` latency is **UNKNOWN**.
4. **Loop 4 — Ops Room Finalization (`S4`):**  
   Command / Orchestrator → Ops Room Vision (`w3:p3`) → Ops AG (`w3:p2`) reconciles snapshot/SOP delta → Ops Room Vision reports consolidated readiness to Command Vision (`thr_7gyyc4dv22`) → halt at `READY_FOR_FOUNDER_GATE`.  
   *Current status:* **CONFIGURED / MOCK-VERIFIED** (`test-scenarios.mjs` scenarios 4 & 6 **PASS**; live `S4` **UNKNOWN / PENDING** because `20261121T121121Z-581c` halted at `S2`).

---

## 3. Known Nitro Seat Routing & Boundaries

| Seat | Machine / Pane | Status in Round | Authority Boundary |
|---|---|---|---|
| Command Vision | Cloudroom `thr_7gyyc4dv22` | External (bridged by `w3:p3`) | Portfolio PM; directs Vision seats; no engineering authority |
| Ops Room Vision | Nitro `w3:p3` | **VERIFIED** | Operational coordination; bridges Command ↔ Ops AG |
| Ops AG | Nitro `w3:p2` | **VERIFIED** | Ops-Room-scoped technical execution only |
| ERP Vision | Nitro `w4:p1` | **VERIFIED** (primary ACK in `S2`) | Owns StarqERP coordination; Ops Room never tasks `w4:p2` directly |
| PICARD | Nitro `w4:p2` | **CONFIGURED** (downstream token `MISSING` in `S2` poll) | Owns StarqERP engineering; directed only by `w4:p1` |
| Hoadhaa Vision | Nitro `w2:p8` | **CONFIGURED** (`S3` not yet live-run) | Owns Hoadhaa coordination; also reachable via `thr_r23tqt7wgn` |
| DEADPOOL / JARVIS / XPS AG | XPS `w2:p1`, `w2:p2`, `w2:p3` | **CONFIGURED / DOCS-COMPLETE (prepare-only)** (`pane list` **VERIFIED**; `S3` **UNKNOWN**; XPS slice reconciled, not independently re-verified) | Directed only via `w2:p8 -> XPS w2:p1`; `XPS -> Nitro` has no `herdr` bridge (`P13`) |

- **Founder-only gates:** Step 5 (engineering execution), recurring automation activation, controlled shutdown/restart (`P15`), credential/ACL changes, ERP `F1`/`F2`/`F3`/`F8`, XPS `P13`, and SOP approval remain **exclusively Founder-authorized**.

---

## 4. Verification Gaps & Pending External Inputs

1. **Live `S2` consolidated-token completion:** Root cause fixed in `run-handshake.mjs` (poll loop now waits for all `downstreamExpected` tokens after primary token) and mock-verified (7/7 PASS); awaiting authorized live re-run.
2. **Live `S3` (Hoadhaa/XPS) and `S4` proof + XPS `p50`/`p95` latency:** Not yet executed live.
3. **Reconciled external audit slices (documented from Command-provided reports, not independently re-verified by Ops Room):**
   - **ERP slice** (`VISION-CONSOLIDATED-REPORT.md`, `FOUNDER-ESCALATION-F1-F2-F3-F8.md`): Root PICARD operational; 6 officers uniformly **INCOMPLETE** (`F1`/`F2`/`F3`/`F8` Founder-gated, unexecuted; officer live inference/dispatch/failover **UNKNOWN**).
   - **XPS slice** (`xps-commissioning-docs-status-2026-11-21.md`): Documentation-complete / **prepare-only**; cold-boot, Telegram reconnect, `sshfs` remount, and delegation fan-out remain **UNKNOWN** until demo (`P13`/`P15` Founder-gated).
4. **Mobile Hermes (`FORGE`, `S20PLUS`, `NOTE8`):** **UNKNOWN-BLOCKED** (all 3 unreachable via SSH from Nitro in `CAPABILITY-AUDIT-2026-11-21.md`).
