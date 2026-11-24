# STARQ Ops Room — Operations Entrypoint (`START.md`)

**Status:** Commissioning Preparation (all operating procedures below are **DRAFT / pending Founder approval**).  
**Authority:** Founder Mustarq is the sole human authority for activation, recurring execution, Step 5 engineering gates, shutdown/restart, credentials, and production changes. DEC-072 (evidence over assertion; never self-close) binds all seats.

---

## Current-State Reconciliation (2026-11-24)

See [OPS-ROOM-RECONCILIATION-2026-11-24.md](docs/operations/OPS-ROOM-RECONCILIATION-2026-11-24.md) for the authoritative 2026-11-24 reconciliation of Nitro/Herdr recovery (`#19839`), shared-profile model/lease routing (`#19856`, `--shared`), PICARD custody (`w4:p2` / BuzzLab `23c9f577`), XPS/Fold6 evidence boundaries (`#19841`, `#19864`), and revised engineering arrangements (`#19868`).

---

## 1. Repository Purpose

`D:\StarqTech\starq-ops-room` is the operational coordination and documentation home for the **Starq Ops Room** (`w3:p3` Ops Room Vision, `w3:p2` Ops AG; Founder-approved two-pane layout per commit `cda1407` and Room `#19839`). It coordinates daily operational status across Command, StarqERP, and Hoadhaa **without taking over either engineering studio**, and maintains durable operational records under `docs/operations/` and `runs/startup/`.

---

## 2. Activation Boundary (Read First)

- **NOT ACTIVE:** Neither [OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md](docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md) nor [STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md](docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md) is active. Both await explicit Founder approval.
- **No recurring execution:** No cron, loop, or watcher is authorized to run recurring operations automatically.
- **Tests do not authorize live work:** Passing a dry-run, mock test, or readiness handshake halts at `READY_FOR_FOUNDER_GATE` and **never** triggers Step 5 (engineering execution).

---

## 3. Evidence-First Navigation Map

| Area | Document | Status |
|---|---|---|
| **AG Bringup & Readiness** | [AG_OPS_ROOM_BRINGUP_2026-11-21.md](docs/readiness/AG_OPS_ROOM_BRINGUP_2026-11-21.md) | VERIFIED (2026-11-21) |
| **Daily Operating Procedure** | [OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md](docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md) | DRAFT (pending Founder approval) |
| **Startup Handshake Design** | [STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md](docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-DESIGN.md) | Approved for BUILD+TEST |
| **Startup Handshake SOP & Checklist** | [STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md](docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md) | DRAFT (pending Founder approval) |
| **Handshake Implementation Report** | [STARTUP-HANDSHAKE-IMPLEMENTATION-REPORT-2026-11-21.md](docs/operations/STARTUP-HANDSHAKE-IMPLEMENTATION-REPORT-2026-11-21.md) | Evidence record (mock 6/6 PASS; live 1 failed closed at S2) |
| **Commissioning Architecture** | [OPS-ROOM-COMMISSIONING-ARCHITECTURE-v1-DRAFT.md](docs/operations/OPS-ROOM-COMMISSIONING-ARCHITECTURE-v1-DRAFT.md) | DRAFT (pending Founder approval) |
| **Controlled Shutdown & Recovery Plan** | [OPS-ROOM-CONTROLLED-SHUTDOWN-AND-RECOVERY-v1-DRAFT.md](docs/operations/OPS-ROOM-CONTROLLED-SHUTDOWN-AND-RECOVERY-v1-DRAFT.md) | DRAFT (prepare-only; requires Founder GO) |
| **Capability & Integration Audit** | [CAPABILITY-AUDIT-2026-11-21.md](docs/operations/CAPABILITY-AUDIT-2026-11-21.md) | VERIFIED (Nitro read-only audit; ERP/XPS slices pending) |
| **Commissioning Milestone Record** | [COMMISSIONING-MILESTONE-2026-11-21.md](docs/operations/COMMISSIONING-MILESTONE-2026-11-21.md) | Evidence record |
| **Documentation Reconciliation** | [DOCUMENTATION-RECONCILIATION-2026-11-21.md](docs/operations/DOCUMENTATION-RECONCILIATION-2026-11-21.md) | VERIFIED (2026-11-21) |
| **Post-Reconciliation Governance Decisions** | [OPS-ROOM-GOVERNANCE-DECISIONS-2026-11-24.md](docs/operations/OPS-ROOM-GOVERNANCE-DECISIONS-2026-11-24.md) | Authoritative governance record (2026-11-24) |

---

## 4. Finding Current Run Evidence

Per-run startup handshake artifacts live under `runs/startup/<run_id>/`:
- `state.json` — current run, step (`S1`–`S4`), and handoff state.
- `ledger.jsonl` — append-only JSONL audit ledger of every handoff attempt and readback citation.
- `topology_snapshot.json` — `herdr pane list` snapshot captured at run start.
- `sop-delta.md` — generated **only** when `reconcile.mjs` detects real topology/config changes.
- `logs/` — gitignored local execution logs and raw pane readbacks.

Current recorded runs from 2026-11-21:
- `runs/startup/20261121T115836Z-2c88/` — First live run (`BLOCKED_ESCALATE` at `S2` on `agent_prompt_stalled` 5s race).
- `runs/startup/20261121T121105Z-6f5f/` — Dry-run topology sanity (`READY_FOR_FOUNDER_GATE`, 0 prompts, 8 `SKIPPED`).
- `runs/startup/20261121T121121Z-581c/` — Second live run after scoped fix (`BLOCKED_ESCALATE` at `S2`: `w4:p1` primary ACK verified in `38,952 ms`, downstream `PICARD` token missing at poll exit; `S3`/`S4` `SKIPPED`).
