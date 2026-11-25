# Hoadhaa V2 — Architecture, Infrastructure, Discovery Baseline & XPS Ownership Transition (2026-11-25)

**Status:** Authoritative operational reference — read-only preparation record. No engineering, config, deployment, credential, or task/status change is authorized by this document.
**Authority:** Founder Mustarq is the sole human authority. DEC-072 binds all seats (evidence over assertion; never self-close). Formal engineering handover to XPS occurs ONLY at explicit Founder authorization.
**Recording method:** Authored and verified directly by Vision from the existing Operations Room seat. No delegation to AG, no additional agents activated, no XPS pane prompted for this recording, and the Hoadhaa repository was not modified.
**Source authority:** Founder directive 2026-11-25 (Operations Room update + resume StarqERP coordination); Room `#19929`/`#19933` (restructure), `#19934` (read-only familiarization dossier), `#19959`/`#19964`/`#19973` (XPS takeover-readiness preparation).

---

## 1. Repositories (canonical identity)

| Surface | Canonical path / URL | Ref / state at pin | Note |
|---|---|---|---|
| **New Hoadhaa V2 repo** | `D:\StarqTech\Projects\hoadhaa v2` (quote path; WSL `/mnt/d/StarqTech/Projects/hoadhaa v2`) | branch `main`, HEAD `65c2f05` at 2026-11-25T12:28–12:34+05 | origin `https://github.com/almstq/hoadhaav2.git` (PUBLIC). HEAD is **moving** under AG — re-pin before any future claim. Earlier observed `3fedec5`. |
| Legacy Hoadhaa (d40 safeguard) | `D:\StarqTech\Projects\Hoadhaa` | branch `d40-wip-safeguard-20261123`, HEAD `fafaedb` | origin `https://github.com/Starq-Technologies-Pvt-Ltd/hoadhaa.git`. Backup-only; NOT the V2 engineering surface. |
| Operations Room | `D:\StarqTech\starq-ops-room` | branch `main` | This document's home. |

Credentials are only in GCP Secret Manager and the git-ignored `apps/web/.env.local`; neither was read. The V2 repo is PUBLIC with a zero-secret rule.

## 2. Architecture (new Hoadhaa V2)

From the verified read-only dossier (`#19934`), re-confirmed by DEADPOOL/JARVIS specialist reads (`#19964`, `#19973`). Labels: **OBSERVED** = cited repo file; **REPORTED** = artifact claim; **UNKNOWN** = not verified in this pass.

- **Backend:** modular Rust monolith, workspace resolver 2 / edition 2024; six crates `{domain, db, integrations, jobs, api, server}`. Axum 0.8 + Tokio + SQLx 0.8 (Postgres/uuid/chrono/decimal) + Utoipa with **31 `/api/v1` routes**; ES256 JWKS auth (`jsonwebtoken`/`p256`).
- **Data:** single Supabase Postgres 17.11 (Tokyo), PostGIS 3.3.7 + pgvector 0.8 + pg_trgm; 23 tables, FORCE RLS, least-privilege `hoadhaa_runtime` role; `DATABASE_URL` isolated from the runtime URL.
- **Deployment:** Google Cloud Run service `hoadhaa-api` in `starq-hoadhaa` / `asia-northeast1`, keyless service account, Secret Manager only. Cloud Run `hoadhaa-api-00003-pjx` `/health` + `/ready` reported 200 (REPORTED, not re-queried).
- **Web:** React 19 / TypeScript 5.7 / Vite 6 / Tailwind 4, served at `http://localhost:5173` ONLY (zero external web hosting); 9-section admin. Founder stopped the Vite server — **DO NOT RESTART** without Founder direction.
- **External:** Google Places (New), Maps JS, Gemini 2.5 flash + embeddings.
- **Android:** Flutter app (`apps/android/`) **absent at pinned HEAD** — Stage 6, gated; present only as uncommitted AG worktree WIP (correctness UNKNOWN).
- **Product invariants:** the Commercial Graph is the product; 8 commercial principles; provenance/confidence/freshness on every claim; AI/Vision/Inference may **NEVER** auto-Confirm even on admin publish; observed availability is not live inventory; no fabricated data. Out of scope: POS/inventory/payments/public signup/gamification/delivery/voice — future checkout integrates StarqERP. "Just Hoadhaa it." Founder's ground-truth product vision is preserved in `HOADHAA-FOUNDER-VISION-GROUND-TRUTH-2026-11-22.md` (this repo).

## 3. Infrastructure & delivery topology (read-only)

- Two-stage Dockerfile, non-root uid `10001`, `PORT 8080`; build script `tsc --noEmit && vite build` (OBSERVED by DUM-E).
- CI (`.github/workflows/ci.yml`): push/PR to `main` with `check_secrets.py` + `fmt` / `clippy -D warnings` / `cargo test` + `npm ci`/typecheck/lint/build (OBSERVED).
- **Gaps:** no deploy/rollback job; base-image tags move (not digests); Cloud Run revision/rollback posture UNKNOWN; Dockerfile ships the Rust server, not the CI-built web artifact.
- Discovery/enrichment: tiered Google Places FieldMasks, semaphore 3, retry on 429/502/503/504; Gemini semaphore 2, 402/429/503 → `UpstreamUnavailable`, 768-d embedding (OBSERVED by EDITH). `stage3_live` has a context `ctx()` silent-skip path under pooler contention (REPORTED) — a known hardening decision.
- **BLK-01:** Gemini paid inference/embeddings return HTTP 402 until prepay; written-text extraction works at $0, photographic extraction is mock-tested only. Docs conflict on CLOSED/HTTP 200 vs 402 — unresolved, Founder decision on credit top-up.
- **No credentials** were read, stored, or reproduced in this record.

## 4. Discovery baseline (5,470 nodes)

- **Founder-stated current baseline (2026-11-25 directive):** **5,470-node discovery baseline**. Recorded here as Founder-supplied authority; it was **not** independently re-queried in this read-only preparation pass.
- Prior figures are **not** to be silently overwritten or conflated — they are different measures at different times and require reconciliation:
  - **167 real Malé commercial nodes** across 4 wards (56 HEN / 37 GAL / 41 MAC / 33 MAA), 0 fabricated businesses/offerings, 16/150 Places quota — GATE-05 pin (`#19934`, `#19964`, STAGE5 dossier, REPORTED).
  - **~3,500 broader collected business records** from one free-API collection run (Founder ground truth; broader collected data, explicitly **not** 3,500 verified Malé storefronts).
  - **3,509 businesses / 3,719 locations** (production infra COUNT(*), 2026-11-22 doc) and **4,812 active nodes** on a public feed page (source TBD; determine live/cached/illustrative before relying on it).
- **Reconciliation gap (handover item):** establish the exact definition, scope, source query, and timestamp of the 5,470 baseline and its relationship to the 167 / ~3,509 / 4,812 figures before treating any single number as accepted truth. Observed availability is not live inventory; no fabricated data.

## 5. Authority boundaries and current posture

- **Founder sole human authority** for money, credentials, legal, production, deployment, merge/release/acceptance, and formal handover.
- **AG retains EXCLUSIVE development responsibility** for Hoadhaa V2 foundational closeout. No AG prompt, private-session inspection, or interference. AG (all seats) and Cursor and xAI remain parked per `#19915` / `#19925` / `#19929`.
- **XPS operates STRICTLY READ-ONLY** during preparation: no code/config/docs/evidence/infra/DB/GitHub/task/status writes; no tests, builds, migrations, servers, deployments, or credential reads; no AG contact. XPS seats DEADPOOL `w2:p1`, JARVIS `w2:p2`, and six on-demand specialist profiles (JOCASTA, EDITH, ULTRON, U, FRIDAY, DUM-E) are parked after preparation. All specialists are configured on Nous `tencent/hy4-flash:free` (`#19925`/`#19928`); DEADPOOL's own config unchanged.
- **XPS is reserved exclusively for Hoadhaa** — no ERP assignments to XPS under any circumstances (`#19929`). Nitro holds full StarqERP capacity: POS + Finance/Accounting (`SERP-004`, `SERP-075..084`), PICARD-officer verification under `codex/gpt-6-luna`, evidence-only Kanban comments (DEC-072), feature-branch push.
- **Route:** all XPS coordination through DEADPOOL only; DEADPOOL → JARVIS → specialists. No direct leaf prompting from central seats.

## 6. XPS takeover-readiness preparation (complete)

- Assignment `#19959` → DEADPOOL ACK `#19962` → consolidated ten-output report `#19964` → VISION final evidence `#19965`; item-7 six-profile follow-up `#19973` → VISION correction/evidence `#19974`. All verified by sanctioned `readRoomSnapshot()` readback.
- **All six specialist profiles produced role-specific, cited, read-only familiarization statements** (JOCASTA architecture/governance/docs; EDITH infra/pipelines; ULTRON auth/RLS/threat; U test/evidence inventory, no execution; FRIDAY operating model/handover; DUM-E dependency/build/recovery). Zero BLOCKED for familiarity.
- **Method caveat preserved:** JARVIS completed the six one-shot invocations before the `#19970` recovery redirect; the alternate no-read / max-two-concurrent / 120 s method was **not** the method executed. Profiles read 2–4 cited slices each read-only; no writes. Concurrency/timing caps not independently verified.
- **Verdict: READY-WITH-GAPS** — sufficient read-only knowledge to receive a future handover; **NOT** ready to assume engineering authority. This is preparation evidence, not acceptance, handover, or self-close (DEC-072).

## 7. Outstanding handover gaps

1. Stage 6 Android 0/10 and Stage 7 0/9 at pinned HEAD; no signed APK observed. EP-7.0 authorized but unstarted.
2. AG worktree dirty (76 entries at pin); committed 96 items / 75 done vs worktree 100 / 90 done — HEAD moving; true current state UNKNOWN until re-pin.
3. BLK-01 Gemini 402 vs docs claiming CLOSED/HTTP 200; Founder credit decision pending.
4. `stage3_live` silent-skip under pooler contention; hardening decision pending.
5. README/doc drift (stale 'Paused', 19/35/84 vs 20/37/89+7 / 21/38/93+7). Authoritative sources: `task-register.json`, `PROGRESS.md`, `VERIFICATION_GATES.md`.
6. Test-count and UI-case discrepancies (18 observed vs 14/14 reported; `ctx()` skip) — no tests re-executed in preparation.
7. No independent-verification governance rule in the slice; no deploy/rollback automation; moving base-image tags.
8. **5,470-node baseline reconciliation** (§4) — definition/query/timestamp and relationship to prior counts UNVERIFIED.
9. Four cross-cutting claim conflicts recorded, DEC-072 held, no self-resolution: GATE-06/signed-APK vs pin; BLK-01; test counts/`ctx()` skip; Gemini model id 3.5 vs 2.5.

## 8. Formal-handover checklist (Founder-gated)

1. AG completes and commits Stage 6/7 work and signs the APK.
2. Founder formally hands over at discretion with a pinned HEAD.
3. Refresh authoritative docs/README drift; reconcile the 5,470 baseline.
4. Resolve BLK-01 credit decision and `stage3_live` skip hardening.
5. Re-run verification suites under the new owner; independent PICARD/Nitro verification if required.
6. DEC-072: proposals/evidence only until Founder acceptance. No XPS engineering authority before the formal handover.

---

**Gates preserved:** merge/deployment gates, `F2`/`F3`/`F4`, `D1–D6`/`D40` unchanged. No PR, merge, deploy, release, acceptance, or handover claim. Hoadhaa repository untouched by this record; XPS parked.
