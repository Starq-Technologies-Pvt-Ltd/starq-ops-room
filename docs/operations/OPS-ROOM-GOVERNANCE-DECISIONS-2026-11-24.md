# Starq Ops Room — Post-Reconciliation Founder Governance Decisions (2026-11-24)

**Status:** Authoritative governance-decisions record (decisions binding; SOP activation still DRAFT / pending Founder approval).  
**Authority:** Founder decisions relayed via Room (`@vision`, Cc `@mustarq`).  
**Date:** 2026-11-24  
**Scope:** Decisions arising after the `#19871` reconciliation ([OPS-ROOM-RECONCILIATION-2026-11-24.md](OPS-ROOM-RECONCILIATION-2026-11-24.md)), including post-`#19889` strategic/standing decisions (`#19895`, `#19891`, `#19892`, `#19907`).

---

## 1. `#19881` — StarqERP Local-Review Workflow & Deployment Hold

- **Room record:** `#19881` | `eventId: 30793bceebf83ec962531b0b4cd153738df7df2e893c624478ba2aa4a6fcf7c0` | Sender/relay: `@vision` (Cc `@mustarq`, ref Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - Nitro local ERP dev server is the Founder's primary review environment using the **existing** dev environment (no new environment build).
  - PICARD (`w4:p2`) and the six officers continue implementation and testing normally (no slowdown, no revisit of completed verification, no new readiness exercises).
  - Founder reviews meaningful completed components personally in the local server, provides UI/UX feedback, and approves before integration/deployment; required loop is `implementation -> local testing -> Founder visual/functional review -> refinements -> approval -> integration/deployment`.
  - **HOLD** new ERP merges into deployment branches and Vercel deployments until Founder review/approval; routine feature-branch commits and pushes **continue**.
  - Hoadhaa continues independently on XPS under DEADPOOL via reconciled Kanban (`#19880`), unaffected; Vision remains overall Project Director.
- **Supporting status note:** `#19881` records authority only, not that the local server is ready; `#19882` (`eventId: 6836ab568fa2ad84469d51762fb4ee2957bb4eb2fe3c39c844ab8705605814de`) and `#19883` (`eventId: 0d8124fc7a19afdab0fb4999a21ffe9314b465fda1a3706e62c86681cda37d87`) separately report the existing Vite dev server live/restarted on Nitro `:3001` (`vision/erp-pos-readiness-step-a-20261123` @ `154a557`, `/pos` ready for Founder review).
- **Gates preserved:** Deployment-branch merge hold and Vercel deployment hold until explicit Founder approval; existing WIP/untracked files preserved.
- **Supersedes / changes:** Adds local-review gate before StarqERP integration/deployment while keeping Step B engineering active.

---

## 2. `#19885` — Resume All Three Lanes (Continued Execution)

- **Room record:** `#19885` | `eventId: fb10e0e39acb4dd1214831fbcd738bfd6976e71756d30b68a33ca0af28ca0e53` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19880–#19884`, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **STARTERP** [sic]: ERP Vision (`w4:p1`) + PICARD (`w4:p2`) continue remaining POS development and verification under Step B; do not pause engineering while awaiting Founder review; `#19881`/`#19882` local-review workflow and deployment hold remain in force; feature-branch commits/pushes continue.
  - **HOADHAA:** Hoadhaa Vision (`w2:p8`) ensures DEADPOOL (`XPS w2:p1`) actively leads the XPS development floor using JARVIS (`XPS w2:p2`) and XPS AG (`XPS w2:p3`) against the reconciled Kanban (`#19880`) and certified codebase; continue `HOA-257`, `HOA-136`, and eligible work; Nitro Cursor/AG remain **CLOSED** for Hoadhaa development; verify JARVIS delivered the `HOA-136` static proposal (re-prompted at `#19884`).
  - **OPS ROOM:** Resume normal oversight, coordination, documentation, and governance through Ops Vision (`w3:p3`) + Ops AG (`w3:p2`); do **not** repeat the completed `#19871` reconciliation.
  - ACKs, completed individual assignments, and idle panes are not completion of the wider mission; escalate only genuine blockers or decisions needing Founder approval; **no** new commissioning, broad audits, or planning cycles.
- **Gates preserved:** `F2`/`F3`/`F4`, `D1–D6`/`D40`, deployment/merge/release/acceptance holds, and Nitro Cursor/AG closure for Hoadhaa dev.
- **Supersedes / changes:** Explicitly resumes normal continuous execution across all three lanes after the post-reconciliation checkpoints.

---

## 3. `#19874` — GitHub Feature-Branch Push & XPS Handoff Definition

- **Room record:** `#19874` | `eventId: f277a6a2be16199c3c392ee7b8008749fd084bd5f93289f3d3f5a738902997cc` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19871`, `#19872`, `#19873`, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **HOADHAA (`F1` GRANTED):** Push the verified Cursor (`ba03ff8`) and Nitro AG (`3230fee`) implementation commits to their appropriate GitHub `origin` feature branches, preserving unrelated work (`routeTree.gen.ts`, AEGIS doc, XPS legacy tree) and all product/merge/publication/write-path boundaries (no PR/merge/release/acceptance).
  - **STARTERP** [sic] **(push decision RESOLVED for GitHub):** ERP Vision + PICARD ensure the completed, independently verified POS implementation is properly committed and pushed to a GitHub `origin` feature branch (not just the `d98cfac` audit report), keeping existing CRUSHER/WORF reviews and tests; GitHub `origin` is the synchronization target.
  - **XPS:** DEADPOOL (via `w2:p8 -> DEADPOOL w2:p1 ONLY`) identifies the concrete engineering handoff needed from Nitro, distinguishing independent work vs work requiring runtime transfer, credentials, or a pending product decision.
- **Gates preserved:** No PR/merge/release/acceptance; no legacy import/activation without Founder `GO`; records authority, not push completion.
- **Supersedes / changes:** Grants `F1` GitHub feature-branch push for Hoadhaa and resolves StarqERP GitHub feature-branch push.

---

## 4. `#19877` — Routine Nitro → XPS Handoff & `F2`/`F3`/`F4` Recommendations Requested

- **Room record:** `#19877` | `eventId: acc67476b6154b07ea1787bb4ddf645d6ee8875e5aae2c3cfd92d253cd7815f4` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19874`, `#19876`, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **Routine handoff (no Founder gate):** Hoadhaa Vision (`w2:p8`) coordinates the ordinary Nitro → XPS engineering handoff through DEADPOOL (`w2:p1`) **ONLY** (no direct JARVIS/XPS-AG prompt); Nitro supplies branch-tip evidence (`ba03ff8`, `3230fee`) and `hq_projection_adapter.ts` content; XPS uses least-privilege local config (e.g., `git safe.directory`) to verify tips and begins already-authorized independent static/evidence work immediately without waiting on `F2`/`F3`/`F4`.
  - **`F2`/`F3`/`F4`:** Founder asked PM for a short recommendation each (what to decide / recommended option / what it enables); departments supply facts, not decisions — not an authorization to proceed on `F2`/`F3`/`F4`.
- **Gates preserved:** `F2`/`F3`/`F4` unexecuted; no credentials, DB, runner, legacy import/activation, runtime transfer, PR/merge/release/acceptance.
- **Supersedes / changes:** Establishes routine Nitro → XPS handoff as standard non-gated coordination via `w2:p8 -> w2:p1`.

---

## 5. `#19879` — Hoadhaa Transition: Cursor/AG Complete; XPS Takes Full Development

- **Room record:** `#19879` | `eventId: ea04659f015072e2adf64499637792cd2452ea3dec8f109484b9e27208a22ec2` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19874–#19878`, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **Hoadhaa Nitro Cursor (`w2:p9`) and Nitro AG (`w2:pB`) temporary reconciliation mission is COMPLETE** (`#19876`/`#19878` sync/handoff verified); **no** further Hoadhaa development assignments to Cursor or Nitro AG.
  - **XPS owns all remaining Hoadhaa development and integration** via `DEADPOOL (w2:p1) -> JARVIS / XPS AG`, including `F3`/`F4` once product decisions are resolved; DEADPOOL resumes full development leadership.
  - Nitro retains StarqERP POS via PICARD (`w4:p1`/`w4:p2`) unchanged; Vision remains overall Project Director across both; Ops Room keeps authoritative records.
  - Hoadhaa Vision (`w2:p8`) reconciles Hoadhaa Kanban (`HOA` task keys) against the restored codebase and arranges XPS development takeover through DEADPOOL.
- **Gates preserved:** All existing product/merge/publication gates and WIP preserved; no new procedures, re-commissioning, or broad audit.
- **Supersedes / changes:** Transitions Hoadhaa development ownership from Nitro Cursor/AG reconciliation to XPS (`DEADPOOL -> JARVIS / XPS AG`).

---

## 6. `#19895` — FOUNDER STRATEGIC DECISION: Hoadhaa V2 Rebuild

- **Room record:** `#19895` | `eventId: 13dee65e71d4f07a3b7b4fba70bc192ddef9c97b909f29f81e4d8b022eb84967` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19887–#19894`, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **Hoadhaa V2 rebuild & suspension:** Hoadhaa will be rebuilt **entirely from scratch** in a **separate** development environment as Hoadhaa V2. **Suspend all** current Hoadhaa engineering immediately — `HOA-257`, `HOA-136`, `HOA-260`, the `#19889` Hoadhaa security/remediation workstream, and all implementation.
  - **Sole remaining Hoadhaa assignment (Supabase backup + cleanup prep):** `DEADPOOL` (`XPS w2:p1`, via Hoadhaa Vision `w2:p8` — no direct leaf contact from Nitro) must comprehensively back up the existing Hoadhaa Supabase environment (all data, schemas, functions, policies, storage files, and relevant configuration), securely archive outside Supabase, verify recoverability, document restoration limitations, and prepare the existing Supabase project for a complete application-level reset (same project retained for V2; no existing application schemas or commercial records migrated).
  - **Absolute safety (read-only against Supabase):** **Do not delete or modify anything** — zero schema/data/policy/storage/config changes in Supabase; backup and prep are strictly read-only against Supabase; Founder personally performs the reset after reviewing backup/recovery evidence; archive writes only outside Supabase; never expose credentials in Room/reports.
  - **Capacity redirect:** Once backup/cleanup-prep is complete and evidenced, **close** the current Hoadhaa engineering workstream and redirect released engineering capacity to StarqERP. StarqERP continues under existing governance/deployment restrictions (implementation, independent verification, security remediation, dependency auditing).
- **Gates preserved:** Deployment/merge hold, `F2`/`F3`/`F4`, and `D1–D6`/`D40` unchanged; no new commissioning or broad audit.
- **Supersedes / changes:** Explicitly **supersedes** the Hoadhaa development assignments in `#19885`/`#19889` and supersedes the `#19893` Hoadhaa security workstream (now suspended).

**Addendum `#19898` — Google service isolation (extends this closure decision):**
- **Room record:** `#19898` | `eventId: 3c005c05b669958bc133a186d591b77ccc33d315a55abc9e2fad7b46a0cafa3c` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19895`, Founder Cloudroom addendum 2026-11-24).
- **Extended closure scope:** routed via `DEADPOOL` (`XPS w2:p1`) through Hoadhaa Vision (`w2:p8`) **ONLY** (no direct leaf contact from Nitro) — comprehensively sever ALL Google Cloud, Google Maps, Places API, Gemini, and other Google service integrations associated with the **existing** Hoadhaa implementation; identify and disable all associated ingestion pipelines, scheduled jobs, background services, and API consumers so they make no further requests and incur no further expenditure.
- **Archive & document:** archive the relevant configuration **securely** (outside the live services) **before** disabling; document **every** disconnected connection — what it was, where it lived, how it was disabled, verification that requests stopped, and residual risk. Never expose credentials/keys in Room or reports — reference by name/location only.
- **Strict boundaries:** do **not** delete Google Cloud projects; do **not** revoke shared credentials; do **not** disrupt unrelated StarqERP services or anything outside the existing Hoadhaa implementation.
- **Account-level escalation:** identify any account-level actions requiring Founder intervention (project/billing/quota/OAuth-consent actions beyond `DEADPOOL` authority) — report specifically; do not attempt them.
- **Objective & sequencing:** complete operational isolation of the existing Hoadhaa implementation, leaving cloud infrastructure available for Hoadhaa V2; this runs alongside the Supabase backup (read-only, no Supabase mutation) and reset preparation, with the Founder performing the actual reset personally.
- **Closure condition (extended):** **CLOSE** the Hoadhaa engineering workstream and release capacity **only** once **all three** are verified — Supabase backup, reset preparation, **and** Google isolation. Report evidence; Central redirects released capacity to StarqERP; ERP continues as the active engineering lane under existing governance/deployment holds.
- **Gates preserved:** all existing gates unchanged; no new commissioning, no broad audit.

**Addendum `#19902` — FINAL CLEANUP (extends this closure decision):**
- **Room record:** `#19902` | `eventId: 90f1d12cfe1776189f9245c84f3e75e8077426656368e3cbae881d52d97a2050` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19895`/`#19897`/`#19898`/`#19901`, Founder Cloudroom directive 2026-11-24).
- **Supabase backup + runbook:** ACKNOWLEDGED and PRESERVED. Founder performs the database reset personally; agents do not touch Supabase further (no mutation).
- **Google account-level actions RESOLVED:** Founder has ALREADY DELETED ALL PROJECTS from the Google Cloud account. The account-level Google actions previously escalated (`#19901`) are RESOLVED by Founder; agents must NOT re-attempt, verify, delete, or restore them. (This supersedes the `#19898` account-level escalation item — it is closed, not pending.)
- **Remaining bounded LOCAL Google isolation only:** complete the partial inventory across the residual scope (including Nitro Hoadhaa worktrees under `/mnt/d/StarqTech/.worktrees/hoadhaa*`), archive relevant configuration securely, disable any remaining Hoadhaa-associated LOCAL ingestion pipelines / scheduled jobs / background services / API consumers, and verify requests have stopped. Produce `DISCONNECTED.md` documenting every disconnected connection and residual risk. PARK the existing Hoadhaa environment. Do NOT recreate cloud resources or attempt to restore connectivity.
- **Strict boundaries:** no GCP project deletion, no shared-credential revocation, no StarqERP disruption, no Supabase mutation, no credential values in reports (reference by name/location only). Routed via DEADPOOL (`XPS w2:p1`) through Hoadhaa Vision (`w2:p8`) ONLY — no direct leaf contact from Nitro.
- **Closure:** once local isolation is VERIFIED, CLOSE the Hoadhaa engineering workstream until further notice. Do NOT claim closure while inventory/disable/verify-stopped are incomplete — be honest as `#19901` was. This closes the workstream the earlier decisions (`#19895`/`#19898`) conditioned on verification.
- **Capacity reallocation:** ALL available engineering capacity across Nitro AND XPS goes to StarqERP POS development and independent verification. ERP Vision (`w4:p1`) + PICARD (`w4:p2`) direct Nitro; XPS capacity via DEADPOOL (`w2:p1`) is offered to ERP Vision for bounded StarqERP tasks routed by central Vision through the established chain. Continue POS autonomously; merge/deployment gates unchanged.
- **Gates preserved:** deployment/merge hold, `F2`/`F3`/`F4`, `D1–D6`/`D40` unchanged; no new commissioning, no broad audit.

---

## 7. `#19891` — STANDING DECISION: Autonomous Agent Model Switching Policy

- **Room record:** `#19891` | `eventId: 53210946a01c906475b09646d8120e9120e5fb20d1db05620d82f5a1e18b5059` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19888` CRUSHER xAI credential blocker, Founder Cloudroom directive 2026-11-24).
- **Decision substance:**
  - **Standing authority:** Vision has standing authority to change any agent profile's model across all engineering lanes whenever its current model becomes unavailable (no approval needed for routine switching).
  - **Allocation policy:** (1) first preference **FREE** models from Nous Research / OpenRouter; (2) if unsuitable, existing paid providers at **LOW/MEDIUM** tier only; (3) frontier models **only** with explicit Founder approval. Preserve profile identity, responsibilities, memory, and active assignments; maintain quality and independent verification; no unauthorised cost.
  - **Action taken (Picard officers):** All six Picard officers (`CRUSHER`, `RIKER`, `DATA`, `GEORDI`, `WORF`, `GUINAN`) had `xai/grok` (logged out, no `XAI_API_KEY`); switched primary to `provider=nous`, `model=tencent/hy4-flash:free` via native CLI config (config-only, no hand-edit); verified per-profile via `hermes config get`; fallback chain retained; `PICARD` main default `gpt-6-sol` unchanged; config SHA-256 recorded before/after (only model block changed; no credentials read/written).
  - **Live probe at `#19891` time:** Two one-shot attempts failed at CLI arg parsing before provider contact; static readiness passed; `LIVE INFERENCE UNKNOWN` then (subsequently resolved in `#19892`).
- **Gates preserved:** Frontier-model Founder gate, no unauthorised cost, profile identity/memory preservation; deployment holds unchanged.
- **Supersedes / changes:** Grants Vision standing autonomous model-switching authority within the 3-tier policy and resolves the `#19888` CRUSHER xAI credential blocker at config level.

---

## 8. `#19892` — CRUSHER Live Dispatch Proof: Free Model Verified

- **Room record:** `#19892` | `eventId: 56036af6f648f8082ec4dfc6a40171ce4b07a980668952b8585a1e8810d00246` | Sender/relay: `@vision` (To `@mustarq`, Cc `@vision` ERP `w4:p1`, `@picard`).
- **Decision / verification substance:**
  - Founder `#19891` executed via a real delegation dispatch (not a CLI one-shot or readiness probe) through `PICARD` to the existing `CRUSHER` profile under its already-configured free model on the F1 void slice (`vision/erp-pos-readiness-step-a-20261123` @ `8ca76a1`).
  - **Dispatch proof:** `delegate_task profile=crusher` (`deleg_01e76e2b`, child `sa-0-7523bef5`), log `D:/AgentRuntimes/Picard/cache/delegation/live/deleg_01e76e2b/task-0.log`; envelope `status=completed`, duration `94.07s`, `api_calls=4`, model `tencent/hy4-flash:free`; transcript shows `CRUSHER` identity, `runtime_provider=nous`, verdict `PASS/NO-VETO`, defects `none`, `EXIT_CODE=0` on two-file replay (`2` files, `3` tests passed, `13.74s`).
  - **Limitation:** Provider/model evidence comes from the dispatch envelope plus officer report, not a separate usage receipt.
  - **Resolution:** This **resolves** the earlier `LIVE INFERENCE UNKNOWN` from `#19891`.
- **Gates preserved:** No profile/model/provider/credential change in this dispatch; `:3001` listening; deployment/merge hold and all gates intact; no PR/merge/release/acceptance.
- **Supersedes / changes:** Converts `#19891` `LIVE INFERENCE UNKNOWN` to live-verified on `CRUSHER` (`tencent/hy4-flash:free` via `nous`).

---

## 9. `#19907` — Unified StarqERP Operation: XPS-ERP verification accepted; Nitro/XPS ownership split

- **Room record:** `#19907` | `eventId: ccf5e4aa6e1f9ff1082cc3a8b918c471423fe279b2e35d222dff55108f039e96` | Sender/relay: `@vision` (Cc `@mustarq`, ref `#19895`/`#19902`/`#19903`/`#19905`/`#19906`, Founder Cloudroom directive 2026-11-24).
- **Priority & posture:** StarqERP POS is the **sole** engineering priority. Unified operation: `PICARD` on Nitro + `DEADPOOL`/`JARVIS`/`AG` on XPS. Hoadhaa stays parked/closed.
- **`XPS-ERP-1..4` — COMPLETE and INDEPENDENTLY VERIFIED:** deliverables in `/home/mustarq/Work/xps-erp-19903/` and mirror `D:/StarqTech/_tmp-xps-erp-19903/` (`AG-VERIFY.md` + four reports). All four verdicts `CONFIRMED` by AG, with honest exceptions: `ERP-1/4` Room-command text not on disk -> verdict `UNKNOWN` not `CONFIRMED` (commit-content presence independently confirmed); `ERP-2` assertion-shape gaps (`counter_f1_void_refund` / `serp_088_cash_void_refund` / `counter_intake`: negative/NaN/rounding, noncash, rejected POST, alternate outlet, absent product, zero/negative price, location mismatch, multi-quantity race); `ERP-3` `npm ping` + `npm audit` full and `omit=dev` both exit `0`, `0` vulnerabilities, pins `vite` `6.4.5`, `vitest` `4.1.12`, `undici` `8.12.3` transitive, minor note `vite ^6.2.3` in **both** `deps` and `devDeps`. Zero repo changes, zero secret values, Hoadhaa untouched.
- **Kanban reconciliation:** ERP Vision (`w4:p1`) maps substantiated gaps to correct `SERP` cards (counter POS hardening `SERP-085..091`; CI/probe `SERP-456/457/458`; SAST disposition `SERP-383/385`) within existing board authority — evidence comments only, no mass status flips or self-closes; report reconciliation.
- **Ownership split (shared filesystem):** two runtimes **share** the `D:/StarqTech` filesystem via `/mnt/d`, so XPS **must** use a **dedicated** worktree off pinned base `a10d460`, never the active checkout. Nitro/`PICARD` (`w4:p2`) + officers **own** the active branch `vision/erp-pos-readiness-step-a-20261123` and **all** runtime POS implementation (`web/src/components/counter/CounterView.tsx`, `web/src/domain/counter.ts`, cart/tender/void/session logic, in-progress `SERP-439/440/444/455`). XPS/`DEADPOOL` (`w2:p1`) -> `JARVIS` **own** disjoint implementation packages in the separate worktree: new/standalone test-hardening files for `ERP-2` gaps, `SERP-456/457/458` CI/probe/infra, `SERP-383/385` audit documentation. **No** XPS edits to `CounterView.tsx`, `counter.ts`, the active Nitro WIP (`19` entries incl. `web/vite.config.ts`), or `:3001`. XPS AG independently verifies every XPS deliverable; ERP Vision replays all merged work. **Central** Vision alone routes between the two — no direct cross-machine contact.
- **Posture change:** XPS moves from read-only reviews to **actual** implementation in its disjoint packages, preserving implement/verify separation. No PR/merge/deploy/release/acceptance; merge/deployment gates, `F2`/`F3`/`F4`, `D1–D6`/`D40` unchanged. Keep the whole floor moving.

---

## 10. Gates Still Open (Unchanged)

The following gates remain **recorded, not resolved**:
- **Hoadhaa engineering suspended pending V2 rebuild (`#19895`):** All current Hoadhaa engineering is suspended; Supabase backup + cleanup-prep is the sole remaining Hoadhaa assignment.
- **`D1–D6`:** Founder Hoadhaa product decisions.
- **`D40`:** PR / publication hold.
- **`F2` / `F3` / `F4`:** Hoadhaa / XPS gated items (recommendations requested in `#19877`; no execution authorization).
- **`PHASE2-TRANSFER` Founder `GO`:** Required before any legacy runtime transfer/import/activation (`#19864`).
- **PICARD / BuzzLab `23c9f577` custody:** BuzzLab session `23c9f577` and its draft `"Research this topic and write me a brief"` in `w4:p2` remain preserved until explicit Founder disposition (`#19851`).
- **Shared-profile model persistence (`#19856`):** Session-only model overrides across shared `vision` profile panes (`w2:p8`, `w3:p3`, `w4:p1`) and XPS `w2:p2` remain unpersisted / persistence `UNKNOWN`.
