# Starq Ops Room — Authoritative Current-State Reconciliation (2026-11-24)

**Status:** Authoritative current-state operational record (pending Founder approval for any SOP activation).  
**Date:** 2026-11-24  
**Authority:** Founder continuation ref Room `#19868` (`eventId: b12cf7c3b66d997b05561edecf41fd0f7679a464f27a45891e0b414042b2c527`).  
**Author:** Ops AG (`w3:p2`), directed by Ops Room Vision (`w3:p3`).  
**Independent Review:** Ops AG (`w3:p2`), recorded separately on 2026-11-24 after the 32823e8 review pass (all 13 evidence spot-checks PASS; 0 defects other than this corrected line).  
**Scope:** Reconciles prior-24h operational changes from cited Room evidence without mutating historical records, unrelated dirty/untracked paths, engineering repos, or Room state.

---

## 1. Nitro Reboot & Ops Room Recovery

- **Two-pane Ops Room layout:** Founder confirmed the intended `w3` layout is **Ops Room Vision (`w3:p3`, left)** + **Ops AG (`w3:p2`, right)** (`cda1407`); the legacy standalone Claude Code session (`w3:p1`) is superseded/archived (`w3:t3`/`w3:p4`) and left untouched.
- **Post-reboot comms & session continuity (`#19839`):** Vision (`w3:p3`) ↔ AG (`w3:p2`) Herdr handshake verified; AG (`agy.EXE` `process-info`) restored in `w3:p2` under the same Antigravity conversation (`48effed5-0c63-4fe6-a339-453d0adfdbe1`) with zero files touched during the comms check.

---

## 2. Herdr Startup & Restored Sessions

- **Restored idle panes (`#19817`, `#19820`):** Herdr pane idle lists verified across restored Nitro workspaces.
- **Herdr runtime (`#19839`):** Herdr client/server `0.9.5` (protocol `22`), server running, `default` session running; `HERDR_ENV` and `HERDR_SESSION` are unset (never fabricated).
- **Physical host identity (`#19841`):** Verified via `Win32_ComputerSystem` as **Acer Nitro ANV15-41** with **RTX 4050**, despite Windows hostname `Mustarq`.

---

## 3. Identities, Routing & Model Config

- **Shared `vision` profile (`#19856`):** All three local Vision panes (`w2:p8` Hoadhaa Vision, `w3:p3` Ops Room Vision, `w4:p1` ERP Vision) share `HERMES_HOME=D:/AgentRuntimes/Hermes` profile `vision`.
  - Persistent `config.yaml` (`mtime 2026-11-22 11:41 +05`) remains `provider: anthropic`, `default: claude-opus-4-7`.
  - Session banners show **session-only** selections: `w2:p8` `gpt-5.6-terra`, `w3:p3` `tencent/hy4-flash:free`, `w4:p1` `hy4-flash:free` (persistence across restarts is **UNKNOWN**).
  - `w2:p8` experienced 3 Anthropic HTTP `429` attempts (~3.7d reset) — **rate limit**, not an auth failure.
  - XPS `w2:p2` (`JARVIS`) shows `grok-4.20-0309-reasoning` as a session-only selection (persistence **UNKNOWN**).
- **Identity lease practice (`#19843`, `#19846`, `#19847`):** Primary `@vision` lease is held by `vision-cloudroom-nau-20261123` (Nau child, out of scope). Ops Room Vision (`w3:p3`) posts via `--shared` co-holder instance `vision-w3p3-opsroom-20261123` with **no takeover**. Always check `send.mjs --whoami` before posting.
- **Routing rules (`#19842`, `#19844`, `#19864`):**
  - Pane label is **not** identity; verify seat/session bindings rather than assuming from labels.
  - XPS routing goes via **Hoadhaa Vision (`w2:p8`) → DEADPOOL (`XPS w2:p1`) ONLY** (`#19842`, `#19864`).

---

## 4. PICARD Recovery & `w4:p2` Custody

- **Sequence:** `#19844` (`w4:p2` not addressable, no halt) → `#19845` (Founder authorizes recovery of **existing** runtime `D:/AgentRuntimes/Picard`, six officers preserved, no new commissioning) → `#19846` (runtime clean, gateway PID `23788`, six officer profiles intact, but `w4:p2` occupied by live non-PICARD Hermes `"BuzzLab"` session `23c9f577`) → `#19851` (fresh re-verify: BuzzLab still occupies `w4:p2`; `process-info` shows `D:/AgentRuntimes/Picard/bin/hermes.exe --in .../StarqERP chat` PID `26772`; custody decision needed) → `#19854` (Step B `F3` static schema-hygiene evidence, SQL held) → `#19867` (PICARD active, false-idle completion signal, no re-prompt).
- **Preservation rule (Founder follow-up, this session):** `w4:p2` is confirmed as target, **and** BuzzLab session `23c9f577` plus its draft `"Research this topic and write me a brief"` **MUST be preserved** — do not clear, exit, evict, or prompt it without explicit authorization.

---

## 5. XPS & Fold6 Connectivity Boundaries

- **Fold6 (`#19841`):** Fold6, LM Studio, Herdr, and Hermes on the Cloudroom child remained **UNTESTED** and unchanged — do **not** upgrade to "connected".
- **XPS (`#19864`):** XPS evidence-only panel; static citations are **NOT** runtime integration.
  - Required route: `w2:p8` → `DEADPOOL (XPS w2:p1)` **ONLY**; no direct `JARVIS`/`XPS-AG` prompts from Ops Room or Command.
  - No legacy import/activation; XPS legacy map/proxy remains uncommitted and unauthorized.
  - `PHASE2-TRANSFER-PROPOSAL.md` is **BLOCKED** (Founder `GO` required).

---

## 6. Command & Room Protocols

- **ROOM-PROTO-1:** `ACTION_REQUIRED` semantics governed by `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md`.
- **Sanctioned posting & reading:** Post only via `send.mjs` with `--subject`, `--action-required`, and `--shared` co-holder when applicable. Read Room **only** via `readRoomSnapshot()` — direct `room.jsonl` ledger reads are a security incident.
- **DEC-072:** Evidence over assertion; never self-close.

---

## 7. Room Decisions

- **`#19835`:** Step A **PASS 6/6** + Step B released (no recommissioning, no WP-002 duplicate, no readiness repeat).
- **Open holds:** `D1–D6` Founder product decisions remain open; `D40` PR held.
- **`#19857`:** Same-day demo + POS direction.
- **`#19868`:** Continuation of the three engineering/operational lanes.

---

## 8. Revised Engineering Arrangements

- **Coordination boundary:** Ops Room Vision (`w3:p3`) coordinates via floor supervisors **ERP Vision (`w4:p1`)** and **Hoadhaa Vision (`w2:p8`)**; do **not** prompt XPS leaves or PICARD directly from `w3:p3`.
- **Hoadhaa:** Branches `d42-hcx04-public-projection` (Cursor) and `d42-hcx03-hq-parity` (AG-Nitro); `D40` / `D1–D6` holds remain active; `HCX-04` / `HCX-08` real-code milestones `#1–#4` with supervisor replay. `web-command-center` full lint remains a pre-existing CRLF-blocked baseline **FAIL** (`19,313` problems) — not caused by current work and **not** to be bulk-formatted.
- **StarqERP:** Branch `vision/erp-pos-readiness-step-a-20261123` at `d98cfac`; `4` modified + untracked WIP preserved.
