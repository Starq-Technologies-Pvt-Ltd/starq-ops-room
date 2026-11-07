# Operations Room — live ⇄ repo drift inventory (2026-11-07)

**Author:** Claude (Elder), incoming Operations Room engineering owner
**Scope:** `D:\StarqTech\agent-comms` (live runtime, not git) vs `D:\StarqTech\starq-ops-room` (canonical repo)
**Method:** path + md5 content comparison (live `agent-comms` is not a git repo, so no `git diff`).
**Status:** Report for Founder decision. No bulk import performed — per handover §6, drift is reported before importing.

> Point-in-time snapshot. ROOM-PROTO-1 classifier (`authorityPolicy.mjs`, `ingress.mjs`, `send.mjs`),
> the `room-watch-claude-herdr` watcher, and its test are **in sync** repo↔live as of this date
> (PR #2 merged + deployed; see §4).

---

## 1. Synced (repo == live, byte-identical) — 5 files

| File | Notes |
|---|---|
| `protocol/v1/authorityPolicy.mjs` | ROOM-PROTO-1 classifier + the new `actionRequiredOwners` / `isActionAddressedTo` helpers (PR #2). |
| `protocol/v1/ingress.mjs` | Broker ingress. |
| `scripts/send.mjs` | Room sender / structured-metadata CLI. |
| `scripts/room-watch-claude-herdr.mjs` | Canonical-classifier watcher (PR #2). |
| `tests/room-watch-claude-herdr.test.mjs` | 14-test suite (PR #2). |

## 2. Divergent (in repo AND live, but different) — 3 files — **need a canonical-direction decision**

| File | Live | Repo | Likely truth | Proposed action |
|---|---|---|---|---|
| `scripts/room-watch-codex.mjs` | 39308 b (Nov 7 02:22) | 35954 b (PR #1) | **Live ahead** (running code, +~47 lines) | Pull live → repo via PR; then it should also consume the new `isActionAddressedTo` to retire its inline owner logic (follow-up to ROOM-PROTO-1). |
| `watch/deadpool-room-watch.mjs` | 14070 b (Nov 6 13:49) | 14329 b (PR #1) | **Repo ahead** (repo larger) | Diff and reconcile; confirm which is deployed-correct before overwriting the live Telegram relay watcher. |
| `tests/room-proto-1-classification.test.mjs` | 7161 b | 7348 b | Minor | Diff; align to one copy. |

> ⚠️ `room-watch-codex.mjs` and `deadpool-room-watch.mjs` diverge in **opposite directions** — do not
> bulk-copy one tree over the other. Each must be reconciled individually.

## 3. Repo-only (correctly NOT in live `agent-comms`) — 3 files

`api/events.js`, `api/health.js`, `public/index.html` — the Vercel broker/proxy layer. Expected: these
are the deployment surface, not floor tooling. No action.

## 4. Live-only — genuine source worth tracking (the real gap)

### 4a. Protocol core — **blocks repo self-consistency / testability**
The repo's tracked `authorityPolicy.mjs`, `ingress.mjs`, `send.mjs`, and watchers import these, but they
are **not in the repo**, so the repo cannot run its own tests (confirmed: `ERR_MODULE_NOT_FOUND:
identityProvider.mjs`). This is the single biggest structural risk.

- Code: `protocol/v1/identityProvider.mjs`, `envelope.mjs`, `hashChain.mjs`, `ledger-epoch.mjs`,
  `projectClassifier.mjs`, `identityLease.mjs`, `reviewer-separation.mjs`, `health.mjs`
- Watcher core: `scripts/room.mjs` (snapshot reader used by every watcher), `scripts/room-structured-metadata.mjs`
- Data (sensitivity varies): `identities.json` (**gitignored** — static registry, 26 identities),
  `staff-state.json` (**gitignored**), `ledger-epoch.json`, `projects.json`

### 4b. Other live-only watchers / tooling
`room-watch-antigravity.mjs`, `room-watch-vision.mjs`, `room-watch-claude.mjs`, `room-pointer-claude.mjs`,
`room-wake-claude.mjs`, `send-cursor.mjs`, `cursor-session-resume.mjs`, `starq-bot-gateway.mjs`,
`gateway-supervisor.mjs`, `keep-room-watch-{antigravity,claude,codex}.ps1`,
`start-starq-bot-if-needed.ps1`, `run-persistent-starq-bot.cmd`, `jev.ps1`,
`watch/start-deadpool-room-watch.sh`, `watch/tail-selftest.sh`

### 4c. Live-only test suite (~20 files)
`deadpool-room-watch`, `room-watch-codex`, `identityLease-shared`, `room-structured-metadata`,
`reviewer-separation`, `legacy-post-to-room-guard`, `send-reply-to-guard`, `room-epoch-integrity-marker`,
`epoch3-*`, `gateway-*`, `starq-bot-gateway-*`, `telegram-formatting-fixtures`, `isolated-ingress.harness`,
`deadpool-room-relay-format.test.py`, plus `tests/fixtures/`.

## 5. Live-only **junk** — do NOT track; flagged for cleanup authority

Scratch/temp and backups sitting in the live tree (not source):
- `scripts/_tmp-*.{mjs,txt}` (16 files), `scripts/ack_17684.mjs`, `scripts/.old.gateway-supervisor.mjs`,
  `scripts/*.candidate.mjs`, `scripts/start-starq-bot-if-needed.candidate.ps1`
- Deploy backups created today by this session: `protocol/v1/authorityPolicy.pre-canonical-20261107.mjs`,
  `scripts/room-watch-claude-herdr.pre-canonical-20261107.mjs` (safe to delete once the canonical deploy is accepted)

These stay out of the repo via the `.gitignore` additions (`state/`, `locks/`, `*.lock`) plus existing
rules; the `_tmp-*` / `.candidate` / `.old` artifacts are live-tree hygiene, not repo concerns. Per
AGENTS.md process-local temp routing, I am **not** deleting pre-existing artifacts without separate authority.

---

## 6. Decisions requiring Founder approval (I will not do these unilaterally)

1. **Repo self-consistency (recommended).** Import the §4a protocol-core dependency closure so the repo
   can run its own tests and CI can be added. Open question: `identities.json` / `staff-state.json` are
   gitignored. Proposal: vendor the code modules + a **sanitized `tests/fixtures/identities.json`** (only
   the handful of identities the tests need), keeping the live registry gitignored. Needs your go-ahead.
2. **`agent-comms` as a git working copy** (handover §6.4) — would eliminate the untracked-runtime class of
   drift entirely, but is a structural change to how the floor runs. Founder call.
3. **Canonical direction for the §2 divergences** — confirm live-ahead for `room-watch-codex.mjs`,
   and which `deadpool-room-watch.mjs` is deployed-correct.
4. **Scope of bulk import** — which §4b/§4c live-only files belong in the canonical repo vs. stay
   floor-local tooling.

## 7. Recommended next steps (pending your calls above)

1. Reconcile the 3 §2 divergences individually (PR each, live→repo or repo→live as decided).
2. Import §4a protocol core (+ sanitized identity fixture) → repo tests become runnable → add a GitHub
   Actions CI workflow running `node --test tests/`.
3. Refactor `room-watch-codex.mjs` onto `isActionAddressedTo` (retire its inline owner logic) — completes
   "ROOM-PROTO-1 as common authority across all watchers."
4. Import the §4b/§4c source approved in (6.4).
5. Document the controlled source→runtime deploy procedure as a repo `docs/` runbook (the backup +
   atomic-copy + single-watcher-restart + test-gate sequence used for PR #2 today).
