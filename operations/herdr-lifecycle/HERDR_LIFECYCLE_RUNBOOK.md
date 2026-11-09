# Herdr lifecycle and continuity

Status: **IMPLEMENTED — INDEPENDENT REVIEW PENDING**. This is an inventory and planning facility, not an updater. Every `-Apply` operation is deliberately disabled. No live action is authorized by a preflight result. Independent review and a subsequent implementation of supported, appropriately gated actions are required before any live maintenance.

## Observed baseline, 2026-11-09

| Component | Observed | Qualification |
| --- | --- | --- |
| Windows server | 0.9.4-preview.2026-10-14-fbd2ae23927f, protocol 22 | Running at inventory time; not interchangeable with Ubuntu. |
| Windows CLI | 0.9.5 | Reported protocol compatibility with observed server; stale server binary is not a restart instruction. |
| Windows desktop | 20261028.1 | Original installation retained; GUI connection unverified. |
| ACP and remote | 0.1.0 companions | Active ACP communication unverified; remote port checks inconclusive, auth and exposure unverified. |
| Ubuntu server and CLI | 0.9.5, protocol 22 | Independent WSL backend and socket; running at inventory time. |

This is historical evidence, not a current health assertion. Sources: Room #18665/#18668; [Herdr releases](https://github.com/herdrdev/herdr/releases), [desktop releases](https://github.com/sheprd-labs/sheprd/releases). Desktop and backend release versions do not establish compatibility. Verify provenance, signatures or hashes, exact platform and version-specific release notes before any proposed change. Do not use an installer merely to discover a release.

## Recovery matrix

| Event | Original process | Conversation | Workspace/layout |
| --- | --- | --- | --- |
| Client disconnect while backend survives | Can continue in its existing backend; verify PID and creation time | Can continue only if the agent process remains alive | Live backend may retain it; verify the actual endpoint |
| Backend restart | Original processes end | New agent process may resume only with a supported, valid, verified native session and credentials | Saved metadata may restore layout and cwd; not process state |
| Live handoff | Best effort only when exact old/new versions and platform support it | Preserved only if the underlying agent process survives | Verify after handoff; transient connections may break |
| Saved pane metadata alone | No proof | No proof | Evidence of layout only, subject to successful restore |

The upstream [session-state documentation](https://herdr.dev/tui/docs/session-state/) describes current behavior; validate it against the *installed* binaries and platform. `--load` or `--resume` existence and integration version do not establish that a particular agent can resume successfully. Never infer productive work from an idle label or a visible pane. Windows and WSL must be checked separately.

## Safe use now

All scripts emit one structured JSON result and default to observation or planning. Run from PowerShell 5.1 with explicit, trusted paths. `herdr-inventory.ps1` defaults to Windows process and port enumeration and does not launch Herdr. Supply `-WindowsHerdr <absolute-path>` only after confirming that this version's `status` is read-only and does not start a server. For WSL add both `-WslDistribution Ubuntu -WslHerdr /absolute/path/to/herdr`; the script refuses a distribution not reported running, but a stop/start race remains possible: do not use it if waking WSL is unacceptable. `-IncludePaneMetadata` exposes sensitive cwd, session IDs and potentially other private data; protect the output and do not publish it.

`herdr-preflight.ps1 -Path A|B -EvidenceFile <json>` checks **operator assertions**, not evidence authenticity, approvals or current state. `EVIDENCE_DECLARED` is not permission and never enables execution. `herdr-verify.ps1` compares supplied string evidence; matching strings do not prove live health, conversation resume, or activity. Prefer verified PID plus creation time, live socket/GUI connection, explicit session tests and repository status. Empty or missing values fail closed.

`herdr-detach.ps1`, `herdr-update.ps1`, `herdr-reconnect.ps1` and `herdr-rollback.ps1` are plans only. `-Apply` fails with exit 2. They do not implement download, installation, preservation, detachment, migration, restoration or rollback. Do not rely on them for an operational recovery.

## Path A: future client-only maintenance

Inventory exact client/server/ACP/remote versions, process IDs **and creation times**, original installation paths, socket routes, WSL state, workspaces, repositories and active jobs. Validate existing backups and rollback, candidate signatures/hashes and exact compatibility. Record proof that candidate installation cannot restart or replace either backend or migrate state. Check review and operational authorization. Stage a signed client side-by-side only with a reviewed implementation; maintain original binaries, configurations and endpoints. Verify both servers and agent processes are the same instances, and separately verify GUI, WSL, ACP, remote authentication and productive agent state. Stop if any claim cannot be proven.

## Path B: future backend migration

For each affected Windows and Ubuntu session, separately document whether the exact platform and versions support true process continuity; whether each agent can resume its conversation in a new process; and whether layout-only restore is available. Verify checkpoints, backup integrity, current work, supported restore commands and rollback consequences. Review a concrete migration plan and obtain explicit Founder approval for the specific disruption and migration. A handoff is experimental and must not be assumed safe. Execute only with a future independently reviewed implementation and per-operation authorization; verify actual outcomes rather than equating restored panes with recovered processes. If any session cannot be recovered, stop and report.

## Release detection and operations

No scheduler is installed. After independent review, a bounded, non-interactive scheduled release-metadata check could compare upstream release IDs and emit an assessment only on change; no automatic download, migration or agent-token polling. Identify the authoritative APIs, rate limits, failure handling and state location before deploying it. The current code has no discovery implementation, backup implementation, actual reconnection or remote/ACP health check. Preserve existing authentication and do not store secrets in logs. Update history only with verified facts.
