# Starq Ops Room — Read-Only Capability & Integration Audit

**Date:** 2026-11-21  
**Author:** Ops AG (`w3:p2`)  
**Brief:** `docs/operations/_briefs/AG-BRIEF-CAPABILITY-AUDIT-2026-11-21.md`  
**Scope:** Strictly read-only inspection on Nitro (`D:\StarqTech\starq-ops-room`, `D:\AgentRuntimes\Hermes`, `D:\AgentRuntimes\Picard`, `herdr` machines). XPS and ERP officer chains are excluded (separate Command-commissioned slices).  

---

## 1. Executive Summary

- Nitro operates two parallel Hermes runtimes (`D:\AgentRuntimes\Hermes` with active profile `vision`, and `D:\AgentRuntimes\Picard`) plus two live `hermes-gateway` processes (PIDs `22336` and `21112`).
- **Core coordination & UI plugins work:** `starq-pm` (`data.db` 45 KB, `events.jsonl` 19.9 KB, updated today), `memory-wiki` (UI over `state.db` 786 MB + `MEMORY.md`/`USER.md`), and `advanced-delegation` (`profile_routes` over 10 `command-*` profiles) are **CONFIGURED / VERIFIED-OPERATIONAL** on `vision`.
- **Major integration gap:** `ruflo` (PID `23524`) and `graphify` (`0.9.64`, PIDs `23252`/`10892`) MCP servers are live under `Picard`, but **absent** from `D:\AgentRuntimes\Hermes\config.yaml` and `profiles\vision\config.yaml`.
- **Security & auth degradation:** `D:\AgentRuntimes\Hermes\.env` and `auth.json` grant `Authenticated Users` Modify and `BUILTIN\Users` ReadAndExecute (**DEGRADED**); `vision` `fallback_model` points to `openrouter` which is **logged out** (**DEGRADED**); `protocol/v1/ingress.mjs` records `signature: null` (`signatureAlgorithm: 'none'`).
- **Duplication & stale automation:** `advanced-delegation`, `hermes-jev-routing`, and 18+ skill categories are duplicated across root and `vision`; `cron\dispatch_held.json` is holding cron dispatch; zero `room-watch-*` daemons are running.
- **Mobile Hermes (`FORGE`, `S20PLUS`, `NOTE8`):** All 3 mobile Herdr machines failed SSH reachability from Nitro and are classified **UNKNOWN-BLOCKED**.

---

## 2. Capability Matrix

| # | Capability | Classification | Evidence (Path / Command / Output) | Gap / Next Probe |
|---|---|---|---|---|
| 1 | **Jevgrep** (+ Starq Recall v1) | **UNKNOWN-BLOCKED** (on Nitro) / **INSTALLED** (in WSL2) | `Get-Command jevgrep` -> not found on Windows PATH. `D:\StarqTech\00_STARQ_HQ\operations\STARQ_RECALL_JEVGREP_FOUNDER_HANDOVER_2026-11-07.md` documents WSL2 binary `/home/mustarq/.npm-global/bin/jg` v0.8.0; Starq Recall DB `D:\StarqTech\projects\starqerp\analysis\room-knowledge\database\room.sqlite` (56.76 MB, 2026-11-06). | Not wired into Windows Nitro Hermes/Vision PATH or MCP; WSL2 live OpenRouter probe not run. |
| 2 | **Ruflo** | **VERIFIED-OPERATIONAL** (Picard) / **INCOMPLETE** (Hermes/Vision) | `D:\AgentRuntimes\Picard\config.yaml:2477` (`launch-mcp.mjs`); live process PID `23524` (`node.EXE .../ruflo/launch-mcp.mjs mcp start`). Absent from `D:\AgentRuntimes\Hermes\config.yaml` & `profiles\vision\config.yaml`. | Wire `mcp_servers.ruflo` into `vision` if Founder approves cross-runtime advisory access. |
| 3 | **Graphify** | **VERIFIED-OPERATIONAL** (Picard) / **INCOMPLETE** (Hermes/Vision) | `graphify --version` -> `graphify 0.9.64` (`C:\Users\Ali Musthaq\.local\bin\graphify.exe`); `Picard\config.yaml:2470`; live PIDs `23252`, `10892` serving `D:\AgentRuntimes\Picard\graphify-out\graph.json`; `D:\StarqTech\Projects\StarqERP\graphify-out` present. Absent from `Hermes\profiles\vision\config.yaml`. | No `graphify-out` for `starq-ops-room`; not exposed to `vision`. |
| 4 | **Hermes plugins & skills** | **VERIFIED-OPERATIONAL** (with duplication) | `Hermes\plugins\` (10 dirs) vs `profiles\vision\plugins\` (7 dirs); `vision\config.yaml:31-41` enables 8 plugins (`advanced-delegation`, `claude-subscription-directsdk-experimental`, `hermes-dreaming`, `hermes-jev-routing`, `inbox`, `memory-wiki`, `security-guidance`, `starq-pm`). `Hermes\skills\` (24 entries) vs `vision\skills\` (42 entries): 18 skill categories + `.bundled_manifest` overlap. | `security-guidance` is bundled in `hermes-agent\plugins\`; `advanced-delegation` and `hermes-jev-routing` exist in both root and `vision` plugin dirs. |
| 5 | **Memory Wiki** | **CONFIGURED** | `profiles\vision\plugins\memory-wiki\plugin.yaml` v1.1.0 (`desktop-plugins\memory-wiki\plugin.js` 9,919 B); reads `profiles\vision\state.db` (786.28 MB, 2026-11-21) and `memories\MEMORY.md` (2,178 B, 2026-11-20) / `USER.md` (1,389 B, 2026-10-31). `provides_tools: []`, `provides_hooks: []` (UI-only). | Dashboard/Desktop UI-only; live HTTP `/api/plugins/memory-wiki/` not probed. |
| 6 | **Advanced Delegation** | **CONFIGURED** | `Hermes\plugins\advanced-delegation\` + `profiles\vision\plugins\advanced-delegation\`; `vision\config.yaml:246-272` routes `backend: profile_routes` (`gpt-5.6-luna`, `openai-codex`) across 10 `command-*` profiles; default `max_concurrent_children` = `10` (`hermes_cli\config_defaults.py:1323`, `session_worker_child.py:15`). `spawn-ledger.json` (2,881 B, 2026-11-21 16:34) shows active gateway/CLI/ACP spawns (`mcp-helper`, `cli`). | No recent `delegate_task` child-agent row inspected in `state.db`; live delegate call not run (read-only). |
| 7 | **Security** | **DEGRADED** | `protocol\v1\authorityPolicy.mjs` enforces DEC-072 / `ROOT_GENESIS` / `CORE_AGENT`; `identities.json` present. However: `protocol\v1\ingress.mjs:170-171` sets `signatureAlgorithm: 'none'`, `signature: null`; `Get-Acl` on `D:\AgentRuntimes\Hermes\.env` and `auth.json` shows `NT AUTHORITY\Authenticated Users Allow Modify` and `BUILTIN\Users Allow ReadAndExecute`; `api\events.js` uses `Bearer ${OPS_ROOM_UPSTREAM_TOKEN}`. | Tighten NTFS ACLs on `.env` / `auth.json` (Founder-gated); enable payload signatures if moving beyond local trust. |
| 8 | **Ponytail** | **INSTALLED** (convention, not plugin) | `rg -n ponytail` across `Hermes\plugins\`: inline code/architecture annotation convention (`# ponytail: ...`) in `jev-curator`, `jev-approvals`, and `pstack\skills\poteto-mode\SKILL.md:121`. Enabled in `Picard\config.yaml:81` as `ponytail`. | Not a standalone plugin in `D:\AgentRuntimes\Hermes\plugins\`. |
| 9 | **PM plugin (`starq-pm`)** | **VERIFIED-OPERATIONAL** (on `vision`) | `profiles\vision\plugins\starq-pm\` enabled in `vision\config.yaml:40-62` (roles `O:vision`, `E:jarvis,deadpool`, `V:ag`, `F:mustarq`); active store `profiles\vision\plugin-data\starq-pm\data.db` (45,056 B, updated `2026-11-21 15:32`) + `events.jsonl` (19,860 B, `2026-11-20`). | Root `Hermes\projects.db` (45 KB, `2026-08-14`) is stale/unused compared to `vision\plugin-data\starq-pm\data.db`. |
| 10 | **Provider auth & fallbacks** | **DEGRADED** | `hermes auth status <p>`: **root**: `anthropic=logged out`, `openai-codex=logged in` (primary `gpt-6-sol`), `openrouter=logged out`, `nous=logged in`, `fallback_model` commented out; **vision**: `anthropic=logged in` (primary `claude-opus-4-7`), `openai-codex=logged in` (aux/delegation `gpt-5.6-luna`), `openrouter=logged out`, `nous=logged in`. Yet `vision\config.yaml:180-183` sets `fallback_model.provider: openrouter` (`reflection/beam-1.0-501b-a23b:free`) and `moa` references `openrouter`. | `vision` fallback leg (`openrouter`) is **dead** (`logged out`); `root` has no `fallback_model` configured. |
| 11 | **Specialist configurations** | **CONFIGURED** (Nitro Command) / **INCOMPLETE** (ERP 6 officers) / **CONFIGURED** (XPS 7 JARVIS profiles) | 10 `command-*` profiles mapped in `vision\config.yaml:250-272`. **ERP slice** (`VISION-CONSOLIDATED-REPORT.md`): 6 officers (`RIKER`, `DATA`, `GEORDI`, `CRUSHER`, `WORF`, `GUINAN`) uniformly **INCOMPLETE** (F1/F2/F3/F4/F5; `RIKER` `F8` `NO_RETRY`). **XPS slice** (`xps-commissioning-docs-status-2026-11-21.md`): 7 `JARVIS` profiles + 16 protected configs/SOUL.md byte-identical; delegation dormant. | Reconciled from Command-provided slices (not independently re-verified by Ops Room); ERP `F1`/`F2`/`F3`/`F8` Founder-gated. |
| 15 | **ERP Studio Slice (`PICARD` + 6 officers)** | **VERIFIED-OPERATIONAL** (Root PICARD) / **INCOMPLETE** (6 officers) | Source: [VISION-CONSOLIDATED-REPORT.md](file:///D:/StarqTech/Projects/StarqERP/docs/governance/audit/PICARD-STUDIO-FULL-AUDIT-20261121/VISION-CONSOLIDATED-REPORT.md) & [FOUNDER-ESCALATION-F1-F2-F3-F8.md](file:///D:/StarqTech/Projects/StarqERP/docs/governance/audit/PICARD-STUDIO-FULL-AUDIT-20261121/FOUNDER-ESCALATION-F1-F2-F3-F8.md) (citing primary `D:/AgentRuntimes/Picard/audits/PICARD-STUDIO-FULL-AUDIT-20261121/REPORT.md`; `REPORT.md` is not in `StarqERP/docs/governance/audit/...`). Root PICARD `graphify` (10 tools) + `ruflo` (11 tools) + Codex auth verified; 6 officers lack `OPENROUTER_API_KEY` (`F1`), 3 root plugins (`F2`), MCPs (`F3`), 4 skills (`F4`), and live dispatch (`F5`); `RIKER` Codex `F8` `NO_RETRY`. | `F1`/`F2`/`F3`/`F8` unexecuted & Founder-gated; officer live inference/failover/dispatch **UNKNOWN**. |
| 16 | **XPS / Hoadhaa Slice (`DEADPOOL`, `JARVIS`, `XPS AG`)** | **CONFIGURED** / **DOCUMENTATION-COMPLETE (prepare-only)** | Source: [xps-commissioning-docs-status-2026-11-21.md](file:///D:/AgentRuntimes/Hermes/profiles/vision/workspace/hoadhaa-studio/xps-commissioning-docs-status-2026-11-21.md) (relayed from `XPS w2:p1` `/home/mustarq/Work/xps-commissioning-2026-11-21/report/DOCS-STATUS-AND-SHUTDOWN-PLAN.md`). 12 docs reconciled/created (`XPS-BOOT-SEQUENCE.md`, `XPS-SHUTDOWN-PROCEDURE.md`, `XPS-PRESERVATION-CHECKPOINTS.md`); `JARVIS --resume`, `AG --conversation`, specialists `6/6` oneshot verified; `XPS -> Nitro` has **no** `herdr` bridge (channel-only `sshfs` + `powershell.exe`). | Cold-boot full handshake, Telegram reconnect, `sshfs` remount, delegation fan-out remain **UNKNOWN** until demo; `P13`/`P15` Founder-gated. |
| 12 | **Cross-host routing** | **VERIFIED-OPERATIONAL** (XPS) / **UNKNOWN-BLOCKED** (Mobile) | `herdr 0.9.5` running locally; `herdr --machine XPS pane list` succeeded (`w2:p1` DEADPOOL, `w2:p2` JARVIS, `w2:p3` AG). `FORGE`, `S20PLUS`, `NOTE8` all failed SSH (`Connection refused` / `Connection timed out`). | Only `XPS` is reachable over SSH; mobile hosts offline/unreachable. |
| 13 | **Existing automation** | **DEGRADED** / **INCOMPLETE** | `hermes-gateway` running on `Hermes` (PID `22336`, `telegram` + `vision:telegram` connected) and `Picard` (PID `21112`). `Hermes\cron\dispatch_held.json` holds cron dispatch (`executions.db` present, `cron\output\` empty). Zero `room-watch-*.mjs` or `deadpool-room-watch.mjs` processes running in `Win32_Process`. | Cron dispatch is held; room watchers are stopped/manual. |
| 14 | **Mobile Hermes** (`FORGE`, `S20PLUS`, `NOTE8`) | **UNKNOWN-BLOCKED** | `herdr machine list` lists `FORGE` (`fold4`), `S20PLUS` (`s20plus`), `NOTE8` (`note8`). `herdr --machine <m> pane list` returned: `FORGE` `port -1: Connection refused`; `S20PLUS` (`192.168.1.14:8022`) `Connection timed out`; `NOTE8` (`192.168.1.12:8022`) `Connection timed out`. | Unreachable from Nitro; cannot probe mobile profile/version read-only. |

---

## 3. Missing Integrations

1. **Ruflo & Graphify MCP not wired to `Hermes` / `vision`:** Both MCP servers run under `D:\AgentRuntimes\Picard` (PIDs `23524`, `23252`, `10892`), but `D:\AgentRuntimes\Hermes\config.yaml` and `profiles\vision\config.yaml` define zero `mcp_servers`.
2. **Jevgrep / Starq Recall not bridged to Windows Nitro agents:** `room.sqlite` (56.76 MB) and `jg` (v0.8.0) live in WSL2/analysis paths with no `vision` skill or MCP wrapper on Windows.
3. **`vision` `fallback_model` & `moa` point to unauthenticated `openrouter`:** `vision\config.yaml:180-183` and `280-296` configure `openrouter`, while `hermes --profile vision auth status openrouter` reports `logged out`.
4. **Room watchers not supervised:** `scripts\room-watch-codex.mjs`, `scripts\room-watch-claude-herdr.mjs`, and `watch\deadpool-room-watch.mjs` exist on disk, but none are running (`Win32_Process`).

---

## 4. Duplication / Overlap

1. **Dual Hermes installations & gateways:** `D:\AgentRuntimes\Hermes` (PID `22336`) and `D:\AgentRuntimes\Picard` (PID `21112`) run separate `hermes-gateway` processes on the same host. **Canonical:** keep `Hermes` for Ops/Vision/Command and `Picard` for StarqERP studio unless consolidated by Founder.
2. **Duplicated plugins across root and `vision`:** `advanced-delegation` and `hermes-jev-routing` exist in both `D:\AgentRuntimes\Hermes\plugins\` and `D:\AgentRuntimes\Hermes\profiles\vision\plugins\`. **Canonical:** keep in root `plugins\` only if shared, or `vision\plugins\` if profile-scoped.
3. **18 overlapping skill categories:** `Hermes\skills\` (24 entries) and `profiles\vision\skills\` (42 entries) share 18 category folders (`autonomous-ai-agents`, `devops`, `github`, `research`, `software-development`, etc.). **Canonical:** root `Hermes\skills\` for shared skills, profile `skills\` only for `vision`-specific overrides.
4. **Legacy `projects.db` vs `starq-pm\data.db`:** `Hermes\projects.db` and `vision\projects.db` (45 KB, `2026-08-14`/`2026-11-02`) sit alongside active `vision\plugin-data\starq-pm\data.db` (45 KB, `2026-11-21`). **Canonical:** `vision\plugin-data\starq-pm\data.db`.

---

## 5. Efficiency Opportunities

1. **Deduplicate overlapping skills & plugins between root `Hermes\` and `profiles\vision\`:** Eliminates duplicate skill prompt loading and drift (e.g., `.skills_prompt_snapshot.json` bloat).
2. **Share `graphify` / `ruflo` MCP read-only endpoints with `vision`:** Avoids redundant repo grepping by Ops Room seats when `Picard` already keeps those MCP servers warm.
3. **Switch `vision` `fallback_model` to an authenticated provider (`openai-codex` or `nous`):** Eliminates silent failover failure when Anthropic rate-limits.

---

## 6. Prioritized Plan

### (a) Safe Under Existing Authority (Reversible, Non-Credential, Non-Production)

1. **Audit & deduplicate `vision\plugins\` (`advanced-delegation`, `hermes-jev-routing`) against root `Hermes\plugins\`**
   - *Evidence:* Present in both `D:\AgentRuntimes\Hermes\plugins\` and `profiles\vision\plugins\`.
   - *Proposed change:* Move/remove duplicate `vision`-local copy if identical to root; keep git/backup copy.
   - *Blast radius:* `vision` profile plugin resolution only. *Reverse:* Restore folder from backup.
2. **Deduplicate identical skills between `Hermes\skills\` and `profiles\vision\skills\`**
   - *Evidence:* 18 overlapping skill categories across both trees.
   - *Proposed change:* Diff and remove exact-duplicate bundled skills from `profiles\vision\skills\`.
   - *Blast radius:* `vision` skill prompt size. *Reverse:* Restore from `.curator_backups` or root `Hermes\skills\`.
3. **Archive/mark stale `Hermes\projects.db` and `vision\projects.db` vs active `starq-pm\data.db`**
   - *Evidence:* `starq-pm\data.db` updated `2026-11-21 15:32`; root `projects.db` untouched since `2026-08-14`.
   - *Proposed change:* Document `starq-pm\data.db` as canonical in ops records (no deletion).
   - *Blast radius:* Zero (docs only). *Reverse:* N/A.

### (b) Founder-Gated (Credentials, Security Policy, Provider Changes, Recurring Execution)

1. **Tighten NTFS ACLs on `D:\AgentRuntimes\Hermes\.env` and `auth.json`**
   - *Evidence:* `Get-Acl` shows `NT AUTHORITY\Authenticated Users Allow Modify` and `BUILTIN\Users Allow ReadAndExecute`.
   - *Proposed change:* Restrict `.env` and `auth.json` ACLs to `Ali Musthaq`, `SYSTEM`, `Administrators` only.
   - *Blast radius:* Any secondary local Windows account/sandbox reading those files. *Reverse:* Re-grant ACE via `icacls`.
2. **Repair `vision` dead `openrouter` fallback leg (`fallback_model` & `moa`)**
   - *Evidence:* `hermes --profile vision auth status openrouter` = `logged out`, while `vision\config.yaml:180-183` sets `fallback_model.provider: openrouter`.
   - *Proposed change:* Either run `hermes --profile vision auth add openrouter` or repoint `fallback_model` to `openai-codex` / `nous` (both `logged in`).
   - *Blast radius:* Failover billing/routing for `vision`. *Reverse:* Restore `config.yaml` from `.bak`.
3. **Wire `ruflo` / `graphify` MCPs to `vision` & enable `protocol/v1/ingress.mjs` signatures**
   - *Evidence:* `ruflo`/`graphify` run only in `Picard\config.yaml:2469-2488`; `ingress.mjs:170-171` uses `signature: null`.
   - *Proposed change:* Add read-only MCP entries to `vision\config.yaml` and enable HMAC/Ed25519 signing on Room ingress.
   - *Blast radius:* `vision` tool surface and Room event validation. *Reverse:* Revert `config.yaml` / `identities.json`.

---

## 7. `UNKNOWN-BLOCKED` Items

| Item | Why Blocked | Exact Requirements to Resolve |
|---|---|---|
| **Mobile Hermes (`FORGE`, `S20PLUS`, `NOTE8`)** | `FORGE` SSH refused (`port -1`); `S20PLUS` (`192.168.1.14:8022`) and `NOTE8` (`192.168.1.12:8022`) SSH timed out from Nitro. | 1) Confirm devices are on LAN/Tailscale with Termux/sshd running on port 8022; 2) Verify SSH key/port in `herdr` machine config (`herdr machine list`); 3) Re-run `herdr --machine <label> pane list` and `hermes --version`. |
| **Jevgrep live OpenRouter connectivity (WSL2)** | Not installed on Windows PATH; live OpenRouter query not permitted under read-only/no-credential-probe rule. | Run bounded read-only WSL2 check (`wsl -e /home/mustarq/.npm-global/bin/jg --version` + Founder-approved test query on `demo-corpus/`). |
| **ERP officer live inference / dispatch / failover & RIKER `NO_RETRY` (`F8`)** | Reconciled from Command ERP slice (`VISION-CONSOLIDATED-REPORT.md`); live probes forbidden in audit & `RIKER` `NO_RETRY` active. | Founder disposition on `F1`/`F2`/`F3`/`F8` + bounded per-officer dispatch smoke test. |
| **XPS cold-boot / Telegram reconnect / `sshfs` remount / delegation fan-out** | Reconciled from Command XPS slice (`xps-commissioning-docs-status-2026-11-21.md`); docs are prepare-only. | Execute Founder-authorized commissioning demo (`P15`) and resolve `P13` (`XPS -> Nitro` bridge). |

---

## 8. Appendix: Command Inventory Used (Read-Only)

- `herdr --version`, `herdr machine list`, `herdr status`, `herdr --machine <FORGE|S20PLUS|NOTE8> pane list`
- `hermes --version`, `hermes auth --help`, `hermes auth status <anthropic|openai-codex|openrouter|nous>`, `hermes --profile vision auth status <...>`
- `graphify --version`, `Get-Command hermes, jevgrep, ruflo, graphify`
- `Get-ChildItem` on `C:\Users\Ali Musthaq\.hermes`, `D:\AgentRuntimes\Hermes`, `D:\AgentRuntimes\Picard`, `D:\StarqTech\starq-ops-room`
- `Get-Acl` on `D:\AgentRuntimes\Hermes\.env`, `D:\AgentRuntimes\Hermes\auth.json`
- `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='python.exe'"`
- `rg -n` on `D:\AgentRuntimes\Hermes\`, `D:\AgentRuntimes\Picard\config.yaml`, `D:\StarqTech\starq-ops-room\protocol\v1\`
- `read_file` on `D:\AgentRuntimes\Hermes\config.yaml`, `profiles\vision\config.yaml`, `Picard\config.yaml`, `STARQ_RECALL_JEVGREP_FOUNDER_HANDOVER_2026-11-07.md`, `protocol\v1\authorityPolicy.mjs`, `api\events.js`, `identities.json`
