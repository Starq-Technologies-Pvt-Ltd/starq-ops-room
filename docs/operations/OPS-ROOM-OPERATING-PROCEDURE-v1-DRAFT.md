# Starq Ops Room — Operating Procedure (v1 DRAFT — pending Founder approval)

**Status:** DRAFT. NOT ACTIVE. No recurring operations, loops, or new work packages run under this until Founder Mustarq approves.
**Author:** Command Vision (Cloudroom thread thr_7gyyc4dv22).
**Date:** 2026-11-21.
**Authority:** Founder Mustarq is the sole human authority (money, credentials, legal, production, irreversible actions). DEC-072 (never self-close; report evidence + proposed state only) binds all seats.

---

## 1. Purpose & principle

Establish a permanent, low-cost operating workflow where the Ops Room coordinates daily operations across the two engineering studios (StarqERP, Hoadhaa) **without taking over either**, and reports consolidated, verified status up to Command.

**Optimize for minimal Vision LLM consumption.** Vision seats (Command + Ops Room Vision) orchestrate and judge; they do NOT perform extensive research, code analysis, inspection, or implementation when AG can do it. Prefer: concise messages, existing durable records, event-driven updates, and delegation over repeated polling or long conversations.

---

## 2. Seats, roles, and authority boundaries

| Seat | Pane / Thread | Role | Authority |
|---|---|---|---|
| **Command Vision** | Cloudroom `thr_7gyyc4dv22` | Portfolio PM; reports to Founder | Directs the three Herdr Vision seats; holds no engineering authority of its own |
| **Ops Room Vision** | Herdr `w3:p3` (hermes/vision) | **Operations Deputy** — lightweight orchestration, daily coordination, collects verified progress, maintains operational records, reports consolidated updates to Command | Coordination only. MUST NOT task ERP/Hoadhaa engineers or alter either studio's work |
| **AG** | Herdr `w3:p2` (agy, Antigravity, Gemini) | **Ops Room technical executor** — implementation, maintenance, investigations, technical inspection, verification | Executes Ops-Room-scoped technical work delegated by Ops Room Vision; bound by Founder gates (no production/credential/irreversible actions without Founder approval) |
| **ERP Vision** | Herdr `w4:p1` (hermes/vision) | StarqERP PM / Orchestrator | Owns StarqERP engineering coordination |
| **PICARD** | Herdr `w4:p2` (Picard install) | Principal Engineering Studio (RIKER/DATA/GEORDI/CRUSHER/WORF/GUINAN) | Owns StarqERP engineering execution |
| **Hoadhaa Vision** | Herdr `w2:p8` (hermes/vision) | Hoadhaa PM | Owns Hoadhaa engineering coordination; routes to XPS via DEADPOOL |
| **DEADPOOL** | XPS machine, Herdr `w2:p1` | XPS commander | Directs JARVIS / U / AG(XPS) |

**Hard boundaries (preserved):**
- **StarqERP engineering stays under ERP Vision → PICARD.** Ops Room does not assign, re-plan, review-gate, or modify StarqERP engineering work.
- **Hoadhaa engineering stays under Hoadhaa Vision → DEADPOOL → JARVIS/AG(XPS).** Ops Room does not reach into the XPS chain. (Note: the Ops Room AG at w3:p2 is a DISTINCT seat from the Hoadhaa XPS AG; do not conflate them.)
- Ops Room oversees **operational coordination** only (status aggregation, records, cross-studio scheduling signals), never engineering ownership.

---

## 3. Communication paths (established & verified 2026-11-21)

All Herdr seats run on the Nitro Herdr server (`herdr status` = running, v0.9.5). DEADPOOL is on the separate **XPS** machine (`herdr --machine XPS ...`).

| Path | Mechanism | Verified this session |
|---|---|---|
| Command Vision → ERP Vision (w4:p1) | `herdr agent prompt w4:p1` + pane readback | ✓ (studio audit dispatched & executed) |
| Command Vision → Ops Room Vision (w3:p3) | `herdr agent prompt w3:p3` + pane readback | ✓ (AG bringup dispatched & executed) |
| Command Vision → Hoadhaa Vision (w2:p8) | **via Hoadhaa child thread** `thr_r23tqt7wgn` (`room-cli thread tell`) → w2:p8 | ✓ (floor activation relayed & executed) |
| Ops Room Vision → AG (w3:p2) | `herdr agent prompt w3:p2` + pane readback | ✓ (bringup ping / ACK-AG-LIVE) |
| Hoadhaa Vision (w2:p8) → DEADPOOL (XPS w2:p1) | `herdr --machine XPS agent prompt w2:p1` + readback/ACK | ✓ full PING→PONG round-trip (DEADPOOL ACK verbatim, ~3 min, 2026-11-21 16:39) |

**Delivery discipline (all paths):** a submit return code / `delivery: sent` / idle status is NOT proof of delivery. Confirm by pane readback + recipient ACK. Never blind-resend a failed dispatch — diagnose first. A `tell` to a Cloudroom child thread that returns a provider error (e.g. `admitted_turn_failed`) is a provider fault, not a task fault: verify zero side effects, then one diagnosed retry; if it reproduces, escalate to Founder (do not switch a child's model/harness yourself).

---

## 4. Daily operating loop (event-driven, low-LLM)

Designed to minimize Vision token usage. Default cadence is **event-driven**; a light time-boxed sweep is the fallback, not the norm.

1. **Studios report upward on events, not on a timer.** ERP Vision and Hoadhaa Vision post milestones/blockers/decisions/approvals to their durable evidence records and signal Ops Room Vision only when a material event occurs (milestone reached, blocker, decision needed, approval needed).
2. **Ops Room Vision collects verified progress.** It reads the studios' durable records (not long chats), confirms each claimed status against its evidence citation, and maintains a single consolidated operational record in `docs/operations/`.
3. **Delegate technical work to AG.** Any investigation, inspection, verification, maintenance, or implementation the Ops Room needs → Ops Room Vision writes a concise scoped brief and delegates to AG (w3:p2). Vision reviews AG's evidence, does not redo the work.
4. **Ops Room Vision reports consolidated updates to Command** — short, evidence-cited: what's operational / incomplete / needs attention, plus anything requiring Founder decision. Command surfaces only milestones/blockers/decisions/approvals to the Founder.
5. **Escalation:** blockers and decisions route Ops Room Vision → Command → Founder. Engineering-internal blockers stay within their studio chain and surface upward only as status.

**Anti-patterns (forbidden):** repeated polling loops, "standing by" / "what's next" messages, re-verifying proven comms paths, long exploratory conversations, Vision doing analysis AG can do.

---

## 5. Records

- Operational home: `D:\StarqTech\starq-ops-room\docs\operations\`.
- Ops Room Vision maintains the consolidated operational record there; studios keep their own engineering evidence trees.
- Every status line carries an evidence citation (path / SHA / record sequence / command output). Unverifiable items are marked UNKNOWN, never smoothed over.

---

## 6. Gates preserved

- Founder approval required for: money, credentials, legal, production deploys, irreversible actions, new work-package authorization, and activation of recurring operations/loops.
- This SOP activates **only** on Founder approval. Until then: seats are live and reachable, but no recurring loop, no new work package, and no cross-studio tasking runs.

---

## 7. Activation checklist (on Founder approval)

- [ ] Founder approves this procedure (version/date).
- [ ] Ops Room Vision briefed with its standing role + this SOP path.
- [ ] Event-driven reporting contract confirmed with ERP Vision and Hoadhaa Vision.
- [ ] (Optional) A single lightweight Cloudroom Loop for the fallback sweep — only if Founder wants it; scoped, not comprehensive monitoring.
