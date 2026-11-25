# Hoadhaa VISION Seat Absorption — Prepared Transition Plan (2026-11-25)

**Status: PREPARED — NOT EXECUTED. Execution is gated. Do not act on this plan until BOTH gates in §3 are met.**
**Authority:** Founder directive 2026-11-25 — accepted the asymmetric-simplification recommendation from the command-structure assessment (Room #19979, corrected #19980), approved absorbing the Hoadhaa intermediary VISION seat into Main Command, and ordered preparation to coincide with today's formal Hoadhaa handover.
**Scope discipline:** This document records an approved future arrangement. It does NOT execute it, does NOT activate XPS development, does NOT retire or reassign any live seat, and does NOT change any configuration. ERP engineering remains uninterrupted.

---

## 1. Decision recorded

- **Retain (no change):** ERP VISION `w4:p1` and PICARD `w4:p2` on Nitro, with PICARD's officer structure, independent replay and context separation. Founder explicitly retained this structure — demonstrated value of replay, concurrency and context separation outweighs resource savings.
- **Approve (gated):** The Hoadhaa intermediary VISION seat (`w2:p8`, currently a parked/placeholder Hermes pane whose loaded identity was never independently established) is to be absorbed into **Main Command VISION**.
- **Target Hoadhaa chain:** `Founder → Main Command VISION → DEADPOOL (XPS, w2:p1) → JARVIS (w2:p2) + specialists`, with **DEADPOOL reporting directly to Main Command VISION** and retaining responsibility for coordinating **JARVIS** and **independent AG verification on XPS**.
- **This matches the documented pre-intermediary chain** (`Founder → Vision → DEADPOOL → JARVIS`); the intermediary seat was an incidental recovery artifact, not a governance requirement.

## 2. Current vs target structure

| Role | Current (2026-11-25) | Target (post-trigger) |
|---|---|---|
| Central PM / oversight | Main Command VISION | Main Command VISION (unchanged) |
| ERP engineering | Founder→Vision→ERP VISION `w4:p1`→PICARD `w4:p2`→officers | UNCHANGED |
| Hoadhaa oversight | Main Command → Hoadhaa VISION `w2:p8` → DEADPOOL | Main Command → DEADPOOL directly (`w2:p8` no longer in path) |
| XPS coordination | DEADPOOL → JARVIS + six specialists; specialists read-only, parked | DEADPOOL → JARVIS + specialists; DEADPOOL retains coordination |
| Hoadhaa verification | AG exclusive developer, independent verifier role held in reserve | AG as **independent verifier on XPS** under DEADPOOL coordination (post-handover); builder ≠ verifier |
| Reporting | DEADPOOL posts Room milestones; Hoadhaa VISION readback/correction | DEADPOOL posts Room milestones **directly addressed to Main Command VISION**; Main Command performs readback/correction itself |

## 3. Execution gates — BOTH required before any action

1. **Founder formally accepts Antigravity's Hoadhaa handover** — evidence: a canonical Room record from `@mustarq` (or `@ali`) stating acceptance, with exact `eventId` and `brokerSequence`, read back via sanctioned `readRoomSnapshot()`.
2. **Founder explicitly authorizes the new operating arrangement** — a distinct directive naming the direct `Main Command VISION ↔ DEADPOOL` chain and the `w2:p8` absorption. These are two separate gates; acceptance of the handover does NOT by itself authorize the restructure.

The Founder's current instruction is explicit: **do not execute the transition or activate XPS development until both gates are met.** Until then: XPS stays parked/read-only, `w2:p8` stays as-is, no XPS pane is prompted for engineering, AG is not activated, no config/credential/routing change is made.

## 4. What is preserved (non-negotiable)

- **DEC-072:** evidence over assertion; no self-close; builder never self-accepts. Main Command VISION does not verify its own dispatch; DEADPOOL coordinates an independent verifier (AG on XPS post-handover) and reports evidence; Founder retains acceptance authority.
- **Independent verification:** preserved explicitly through DEADPOOL-coordinated AG verification; verdicts bound to exact HEAD/evidence; no relabelling of historical model discrepancies (per #19958/#19973/#19974).
- **Reporting requirements:** DEADPOOL continues posting via canonical `send.mjs --room` under the `hoadhaa` project with `--subject` and stable `--instance`; every post verified by sanctioned readback (seq, eventId, sender, project, body tail). Main Command takes over the readback/correction duty previously performed at `w2:p8` (already demonstrated in #19974).
- **Engineering continuity:** no reset, stash, branch switch, WIP deletion, or session kill; Hoadhaa repo untouched until handover; moving HEAD must be re-pinned at trigger; 76-entry dirty AG WIP at prior pin must be preserved, not attributed to a commit.
- **Other parked seats:** Cursor, AG (until handover), and xAI remain parked; no fallback/routing to them; no config or credential deletion.
- **Founder gates:** merge/deploy/release/PR/acceptance/production remain Founder-only; `F2/F3/F4`, `D1–D6/D40` unchanged.

## 5. Execution procedure — FOR USE ONLY AFTER BOTH GATES

1. **Re-pin baseline (read-only):** Room tail + exact handover `eventId`; Hoadhaa V2 HEAD and dirty state; DEADPOOL/JARVIS/AG pane liveness and parked status; confirm no in-flight XPS engineering was lost.
2. **Announce activation in Room:** post a governance record under `hoadhaa` citing both gate records by seq + full eventId, stating the arrangement is now ACTIVE and `w2:p8` is out of the path. Verify by readback.
3. **Re-home reporting:** issue ONE bounded directive to DEADPOOL `w2:p1` via `herdr --machine XPS agent prompt`, naming Main Command VISION as direct recipient and restating DEC-072 / independent AG verification / read-only-until-authorized boundaries. Confirm delivery by pane readback (ending line present, no truncation).
4. **Retire the intermediary path:** mark `w2:p8` as out-of-route; do NOT kill the process or delete its session — leave it idle as an archive unless the Founder separately authorizes closure (per herdr-operations empty-check rule). Remove it from future briefs and routing notes.
5. **Update durable docs:** flip this plan's status to ACTIVE with activation evidence; update START.md nav and the governance ledger with the activation record; commit and push to `starq-ops-room` main, verifying local HEAD == `origin/main`.
6. **Verify first reporting cycle:** require DEADPOOL's next Room milestone under the direct chain; Main Command performs independent readback and posts any correction, exactly as in #19974.
7. **Rollback trigger:** if any gate is later withdrawn, verification separation cannot be re-established, or XPS dev is activated without authorization — stop, re-park, and restore the prior chain by a Founder-authorized record. Do not self-reverse silently.

## 6. Known operational constraints

- **No Herdr cross-machine push:** DEADPOOL → Main Command must travel by Room milestone, not a Herdr completion hook. Main Command must poll/read back; a Nitro→XPS prompt can be sent directly with `herdr --machine XPS`, but the reverse leg needs polling. No new credentials are authorized.
- **Context load:** this assessment follows a session compacted 3+ times. Direct Hoadhaa oversight is accepted for a parked/read-only project; ERP retains its own seat precisely to protect concurrent engineering. Do not route ERP milestones through this arrangement.
- **Identity binding:** `w2:p8` was a fresh Hermes with generic metadata; any future reliance on a seat must verify live process/pane/CWD before dispatch (per herdr-operations).

## 7. Explicitly not done now

No XPS pane contacted; no engineering activated; no AG dispatch; no ERP interruption; no config, credential, session, process, task/status or acceptance change; no Hoadhaa repo write. ERP continued independently during preparation — SERP-439 (#19978), SERP-440 (#19981), SERP-444 (#19982) landed under the retained chain.

---

**Gates preserved. Awaiting Founder handover acceptance + arrangement authorization.**
