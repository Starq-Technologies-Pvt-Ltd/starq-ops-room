# Operations Room — Handover to incoming Claude session

**Date:** 2026-11-07
**From:** Elder (`@claude`, Herdr floor seat w1:p5), Standard A identity `a.musthaq@gmail.com`
**To:** fresh Claude session that will own the Operations Room (`starq-ops-room`) repository work
**Scope:** consolidate decisions/fixes/outstanding items from the Herdr-floor Operations Room discussion. **Handover only — no new implementation was done to produce this file.** Elder is returning to ERP-454 duties after saving it.

> Everything below is point-in-time as of 2026-11-07. Treat file:line and behavior claims as "verify before relying," per standing memory discipline.

---

## 0. TL;DR for the receiving session

1. **Two code homes, know the difference.** `D:\StarqTech\agent-comms` is the **live runtime** (NOT a git repo). `D:\StarqTech\starq-ops-room` is the **canonical git repo** (curated subset, Vercel-deployed). They drift; reconciling them is your job.
2. **ROOM-PROTO-1 (PR #1) is MERGED** and already **deployed to the live runtime**. It added a canonical ACTION_REQUIRED classifier at the protocol layer (`protocol/v1/authorityPolicy.mjs`, `protocol/v1/ingress.mjs`) + spec doc + tests, and updated `scripts/send.mjs`, `scripts/room-watch-codex.mjs`, `watch/deadpool-room-watch.mjs`.
3. **PR #2 (mine) is OPEN/pending.** It brings the previously-untracked `scripts/room-watch-claude-herdr.mjs` into the repo with a **bespoke regex** ACTION_REQUIRED filter. **Key issue:** it duplicates ROOM-PROTO-1's canonical classifier instead of reusing it. Decide: merge-then-refactor, or revise PR #2 onto the canonical classifier first.
4. **Biggest outstanding work:** a full reconciliation pass of live `agent-comms` ⇄ repo (the claude-herdr watcher was missing; other files may have drifted). `agent-comms` not being under git is the root risk.

---

## 1. Authoritative paths & facts (Founder-confirmed 2026-11-07)

| Thing | Value |
|---|---|
| Canonical repo (local) | `D:\StarqTech\starq-ops-room` *(moved here from `D:\!starq\starq-ops-room`; the `D:\!starq` tree is off-limits per AGENTS.md — do not use it)* |
| Git remote | `Starq-Technologies-Pvt-Ltd/starq-ops-room` (corrected) |
| `main` @ | `b38b5b5` — local `main` synced with `origin/main` |
| Live runtime (unchanged) | `D:\StarqTech\agent-comms` — **NOT a git repo** |
| Repo layout vs live | repo root `scripts/`, `protocol/`, `watch/`, `api/`, `tests/`, `docs/`, `public/` map to live `agent-comms/scripts/`, `agent-comms/protocol/`, `agent-comms/watch/`, … |
| Deployment | repo is Vercel-deployed (`api/`, `vercel.json`, `public/`). The watcher scripts are **local node tooling run on the Windows/WSL floor**, not Vercel functions. |
| gh account in use | `almstq` (has write to the org repo) |

---

## 2. Room communication protocol — ROOM-PROTO-1 & ACTION_REQUIRED semantics

**Status: MERGED (PR #1), DEPLOYED LIVE.** Merge commit `b38b5b5`; fix commit `c5550d2` "fix(protocol): resolve ACTION_REQUIRED mis-classification of ACKs at source (ROOM-PROTO-1)".

**What it fixed:** the protocol was mis-classifying ACKs — a post that merely *acknowledges* or is addressed as an FYI was being treated as ACTION_REQUIRED. ROOM-PROTO-1 resolves this **at the source/ingress** so the structured `actionRequired` metadata correctly reflects *who must act*, not just who is addressed.

**Files (all in repo `main`, and the code ones present live):**
- `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md` — **the canonical spec. Read this first.** (Present in repo; **not** copied to live `agent-comms/docs/` — docs need not deploy.)
- `protocol/v1/authorityPolicy.mjs` (new) — canonical classification/authority policy. **Present live.**
- `protocol/v1/ingress.mjs` (new) — ingress-side classification. **Present live.**
- `scripts/send.mjs` (updated, 506 lines; live copy matches line count). 
- `scripts/room-watch-codex.mjs`, `watch/deadpool-room-watch.mjs` — updated to consume corrected semantics.
- `tests/room-proto-1-classification.test.mjs` — classification tests. **Present live.**

**Operative semantics (what drove everything else below):** being an **addressee / `@mention`** is NOT the same as action being required of you. The authoritative signal is the structured `actionRequired` field. `actionRequired: NONE` means nothing is required of anyone. These are the rules `send.mjs` enforces: `--subject` always required; `--action-required <text>` required whenever a recipient is addressed (`NONE` if nothing); `--reply-to <eventId>` required when the body starts "Reply to #<n>" (use the REAL `eventId` from `readRoomSnapshot()`, not a fabricated hash); `--task <ID>` / `--action started|blocked|done|accepted|rejected|claim` set board status.

---

## 3. Agent identity, concurrent seats, `--shared` leases, stale handling

**Decision (Founder, 2026-11-07): one identity can run in multiple seats at once, blocker-free. The rule is: ALWAYS post with `--shared` from every seat.**

Verified in `agent-comms/protocol/v1/identityLease.mjs` + `scripts/send.mjs`:
- The lease model = **one primary holder + N shared co-holders**.
- `--shared` → `registerSharedHolder()` **never refuses**: it prunes stale holders first, then promotes itself to primary if none is live, else co-holds (primary untouched).
- The bare post path (`claimOrRenewLease`, **no** `--shared`) is the **only** path that returns `REFUSED: primary slot is currently held by a different session`. Avoid it when co-holding.
- `LEASE_STALE_MS = 20 min`: a stale holder is auto-pruned on the next post and is **informational only** in `--whoami` — never a hard block.
- Keep a **stable, distinct `--instance`** per seat for honest per-seat attribution (e.g. `codex-herdr-w1p1-20261107`, `codex-cloudroom-<thread>`); `--from` stays the same handle.
- **No `identities.json` edit needed** — `identities.json` is a static record; any `CORE_AGENT` identity already supports this.

**Applied in-session:** Elder (`claude`) runs 3 seats concurrently (Cloudroom-ERP454, Cloudroom-Hoadhaa, this Herdr pane). Codex was taught the always-`--shared` rule in his Herdr pane (w1:p1) and it was verified working (`--whoami codex` showed `codex-herdr-w1p1-20261107` co-holding with no blocker). `--takeover` exists but is an exclusive-seat handoff requiring explicit authorization — **not** the mechanism for co-holding.

---

## 4. Watcher notifications, FYI filtering, and the fix I made

**Problem (Founder):** the Herdr `@claude` watcher was pinging the (premium) Elder seat on **any** `@claude` mention, including pure FYI/cc posts where the action belonged to someone else — noise + wasted usage.

**Live file:** `D:\StarqTech\agent-comms\scripts\room-watch-claude-herdr.mjs` (265 lines). This watcher:
- Polls `readRoomSnapshot()` every 2s; durable checkpoint in `agent-comms/state/claude-herdr-watch.json` (`lastSeq`/`delivered`/`pending`); singleton lock `claude-herdr-watch.lock`; log `claude-herdr-watch.log`.
- **No auto-respawn supervisor** (the `keep-room-watch-claude.ps1` keepalive supervises a *different* watcher, `room-pointer-claude.mjs`). To apply code changes you must **manually kill + relaunch** it; the durable checkpoint means a restart does NOT replay or miss (seeds to tail only on first-ever run).
- Wakes the pane via `herdr agent prompt w1:p5 "..."`.

**Fix I implemented (now running live; captured in PR #2):** replaced the "notify on any mention" logic with an **action-required-aware** `selfActionLevel(md)` classifier that:
- Reads the structured `actionRequired` string and attributes each instruction to the `@handle(s)` it addresses (**per-clause**; a run like `@codex @claude @mustarq note X` addresses "note X" to all three).
- Returns `act` (notify) only when a clause addressed to `@claude`/`@elder` contains an action verb; `fyi`/`other` → suppress; `NONE` → suppress; no `actionRequired` field → fall back to the legacy mention check.
- Deliberately excludes noun-colliding/other-agent verbs (e.g. "ack" inside "resumption ACK", "begin/start", staffing-of-others verbs) — these were causing false `act` classifications.
- Preserves: all Founder (`@mustarq`/`@ali`) posts always surface; Deadpool routine-digest suppression; the `[WATCHER-TEST]` hook.

**Validation:** against the last ~10 live Room posts, only the single post that genuinely instructed `@claude` surfaced; all Codex/AG/Deadpool/Vision FYIs suppressed; a synthetic `@claude route ...` still fires. Restarted cleanly (final live pid at handover time was 51116; checkpoint preserved, no replay).

> ⚠️ **Overlap with ROOM-PROTO-1:** my `selfActionLevel` regex solves the SAME problem ROOM-PROTO-1 already solved canonically at the protocol layer (`authorityPolicy.mjs`/`ingress.mjs`) and that `room-watch-codex.mjs` now consumes. This is the main thing to reconcile — see §6.

---

## 5. Relationship: live `agent-comms` ⇄ `starq-ops-room` repo

- `agent-comms` is the **live runtime** and is **not under git**. Files edited there change live behavior immediately (processes must be restarted to pick up code changes).
- `starq-ops-room` is the **canonical repo** and a **curated subset** — it does not contain everything that exists live (the claude-herdr watcher was a live-only file for ~1 day before PR #2).
- **Drift goes both ways:**
  - *Repo → live:* ROOM-PROTO-1 merged in the repo; its **code** is confirmed present live (`authorityPolicy.mjs`, `ingress.mjs`, `tests/room-proto-1-classification.test.mjs`, 506-line `send.mjs`), so that one is in sync. (Its `docs/` markdown is repo-only, which is fine.)
  - *Live → repo:* the claude-herdr watcher existed only live until PR #2.
- **Runtime state must NOT be committed:** `agent-comms/state/*.json`, `*.lock`, `*.log` are per-machine runtime artifacts. Ensure `.gitignore` excludes them before any bulk add.

---

## 6. PR #2 and outstanding reconciliation work

**PR #2 — OPEN, pending Founder merge.**
- URL: https://github.com/Starq-Technologies-Pvt-Ltd/starq-ops-room/pull/2
- Branch: `elder/ops-room-claude-herdr-watcher-20261107`
- Adds: `scripts/room-watch-claude-herdr.mjs` (the live watcher + the §4 filter).
- Commit `0e3336a5`, author/committer **Elder `<a.musthaq@gmail.com>`** (Standard A).
- Created via GitHub API (no local clone existed at creation time). Local-tooling only; no Vercel/runtime change — the live watcher already runs this code.

**Decision point for you on PR #2:** merge-as-is (fast: it's a real noise fix already live) **then** refactor the classifier onto ROOM-PROTO-1's canonical module; **or** revise the PR first so `room-watch-claude-herdr.mjs` consumes `protocol/v1/authorityPolicy.mjs`/`ingress.mjs` the same way `room-watch-codex.mjs` does, avoiding a second parallel classifier that can diverge. Recommended: align with the canonical classifier — a single source of truth for ACTION_REQUIRED classification is the whole point of ROOM-PROTO-1.

**Outstanding reconciliation (the real next body of work):**
1. Diff live `D:\StarqTech\agent-comms` against the repo tree; produce the list of files that are live-only, repo-only, or divergent. (`agent-comms` is not git, so compare by path/content, not `git diff`.)
2. Bring genuine live-only/divergent **source** into the repo via branch + PR (exclude runtime state). Decide the canonical direction for each divergence (repo is authoritative for source; live is authoritative for what's actually running).
3. Confirm/establish `.gitignore` coverage for `state/`, locks, logs.
4. Consider whether `agent-comms` should itself become a working copy of the repo (eliminating the untracked-runtime class of problem) — a Founder decision, not to be done unilaterally.

---

## 7. Runtime precautions (read before touching anything)

- **`agent-comms` is LIVE.** Editing a watcher/script there changes behavior now; restart the specific process to apply. For the claude-herdr watcher: kill the pid holding `agent-comms/state/claude-herdr-watch.lock`, remove the stale lock, relaunch `node agent-comms/scripts/room-watch-claude-herdr.mjs` detached. The durable checkpoint prevents replay/missed events.
- **Do not commit runtime state** (`state/*.json`, `*.lock`, `*.log`).
- **Vercel:** merging to `starq-ops-room` `main` can trigger a production deploy of the `api/` broker. The watcher scripts are not Vercel functions, but be deliberate about anything touching `api/`, `vercel.json`, `public/`. Use branch → PR; **Founder holds merge/release authority** (unchanged by any PR).
- **Standard A identity on every commit:** author AND committer email `a.musthaq@gmail.com`, author name = the truthful agent name; never `*.local` (Vercel rejects invalid author emails).
- **`D:\!starq` is off-limits** per AGENTS.md — the repo was correctly moved out of it to `D:\StarqTech\starq-ops-room`; do not reintroduce `D:\!starq` paths.
- `herdr` pane prompts use positional args: `herdr --session default agent prompt <paneId> "<text>"` (not `--pane`). Room reads: `readRoomSnapshot()` returns an **object** `{ records, tailSequence, … }` — iterate `.records`; on Windows import via a `file:///D:/...` URL.

---

## 8. Recommended next steps (ordered)

1. Read `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md` and skim `protocol/v1/authorityPolicy.mjs` + `ingress.mjs` to internalize the canonical classifier.
2. Resolve PR #2 per §6 (recommend: refactor the claude-herdr watcher onto the canonical classifier, then it's a clean merge).
3. Run the live ⇄ repo reconciliation diff (§6 item 1) and report the drift inventory to the Founder before bulk-importing.
4. Establish `.gitignore` for runtime state; then PR the genuine source gaps.
5. Keep merge/release decisions with the Founder; post coordination to Room under your own canonical identity (co-hold with `--shared`).

---

## 9. Quick reference

| Item | Value |
|---|---|
| ROOM-PROTO-1 | PR #1, MERGED, `main`=`b38b5b5`, fix `c5550d2`; spec `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md` |
| Claude-herdr watcher | PR #2, OPEN, branch `elder/ops-room-claude-herdr-watcher-20261107`, commit `0e3336a5` (Elder) |
| Canonical classifier | `protocol/v1/authorityPolicy.mjs`, `protocol/v1/ingress.mjs` (repo + live) |
| Lease logic | `protocol/v1/identityLease.mjs`, `scripts/send.mjs` |
| Identities | `protocol/v1/identities.json` (static; `CORE_AGENT`) |
| Live runtime root | `D:\StarqTech\agent-comms` (not git) |
| Repo root | `D:\StarqTech\starq-ops-room` (origin `Starq-Technologies-Pvt-Ltd/starq-ops-room`) |
| Watcher runtime state | `agent-comms/state/claude-herdr-watch.{json,lock,log}` (do not commit) |

*Prepared by Elder on the Herdr floor, 2026-11-07. Handover only; returning to ERP-454.*
