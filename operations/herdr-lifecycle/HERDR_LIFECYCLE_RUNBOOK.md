# Herdr lifecycle and continuity

Status: **PHASE 3 IMPLEMENTED — INDEPENDENT REVIEW PENDING**. Operational logic for update, detach, reconnect, rollback and gated server migration now exists in `herdr-ops.ps1` and is exercised only against marked sandboxes with mocked Herdr, Sheprd, installer and signature calls. Every `-Apply` entry point and every live context is still refused in code. No preflight result authorizes a live action. See "Phase 3" at the end of this document for the current state; the sections between are the Phase 1-2 text, kept for history.

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

`herdr-detach.ps1`, `herdr-update.ps1`, `herdr-reconnect.ps1` and `herdr-rollback.ps1` are plans only. `-Apply` fails with exit 2. They do not implement production download, installation, preservation, detachment, migration, restoration or rollback. Do not rely on them for an operational recovery. `herdr-fixture-engine.ps1` contains executable file backup, side-by-side staging and rollback experiments restricted to marked fixture roots beneath `D:\StarqTech\scratch\codex\herdr-lifecycle-fixtures`; it is not wired to `-Apply` and cannot operate on the original environment. It retains partial files after interrupted staging and previous state after rollback. Fixture component and recovery tests are mocked; they do not prove live endpoint health.

## Path A: future client-only maintenance

Inventory exact client/server/ACP/remote versions, process IDs **and creation times**, original installation paths, socket routes, WSL state, workspaces, repositories and active jobs. Validate existing backups and rollback, candidate signatures/hashes and exact compatibility. Record proof that candidate installation cannot restart or replace either backend or migrate state. Check review and operational authorization. Stage a signed client side-by-side only with a reviewed implementation; maintain original binaries, configurations and endpoints. Verify both servers and agent processes are the same instances, and separately verify GUI, WSL, ACP, remote authentication and productive agent state. Stop if any claim cannot be proven.

## Path B: future backend migration

For each affected Windows and Ubuntu session, separately document whether the exact platform and versions support true process continuity; whether each agent can resume its conversation in a new process; and whether layout-only restore is available. Verify checkpoints, backup integrity, current work, supported restore commands and rollback consequences. Review a concrete migration plan and obtain explicit Founder approval for the specific disruption and migration. A handoff is experimental and must not be assumed safe. Execute only with a future independently reviewed implementation and per-operation authorization; verify actual outcomes rather than equating restored panes with recovered processes. If any session cannot be recovered, stop and report.

## Release detection and operations

No scheduler is installed. `herdr-discover.ps1` defaults offline; `-Online -Component core|desktop` queries the upstream GitHub latest-release API with a timeout, emitting metadata only. A bounded scheduled check could compare release IDs and emit an assessment only on change; never automatically download, migrate or interrupt sessions. Rate limits, durable state, authentication and notification routes require a separate design and review. The current code has no production download, backup, actual reconnection or remote/ACP health check. Preserve existing authentication and do not store secrets in logs. Update history only with verified facts.


## Phase 3 (2026-11-10)

### Current Nitro state

| Component | Version | Notes |
| --- | --- | --- |
| Sheprd desktop | 20261108.1, `%LOCALAPPDATA%\Programs\Herdr UI` | Installed by hand under a Founder directive, Room #18691-#18692. Not installed by these scripts. |
| Previous desktop | 20261028.1, `D:\StarqTech\Herdr-20261028.1-x86_64-pc-windows-msvc` | Untouched; rollback target. |
| Windows backend | 0.9.4-preview.2026-10-14-fbd2ae23927f, protocol 22, PID 2380 | Same process before and after. `herdr` on PATH resolves to this binary. |
| Ubuntu backend | 0.9.5, PID 897 | Same process; reached by the desktop through the WSL device bridge. |
| Remote control | 20261108.1, port 7443 | Replaced on first launch of the new desktop (see below). |

What the manual install taught, and the scripts now encode:

- Sheprd attaches to a running Herdr 1 daemon and does not upgrade or migrate it. Installing and launching it left the server and every pane process in place.
- **The desktop owns the "Herdr UI Remote Control" scheduled task.** On first launch the new desktop re-registered the task to its own `sheprd-remote-control.exe`, ending the old remote-control process and changing arguments (`--privacy generic` became `excerpt`). Export the task XML before any desktop change. `Compare-Continuity` treats remote control as replaceable by default and as required only when asked.
- `config-gpui.toml` holds managed defaults and is rewritten by a newer desktop. `config-gpui.local.toml` holds the overrides and was not changed. Back up both.
- One file under `%APPDATA%\herdr\session-backups` is not readable by the user account. A backup that skips a file must say so.
- WSL `ps lstart` wanders by a few seconds between calls. Use the PID together with `/proc/<pid>/stat` start time if exact identity is needed.

### Files

| File | Role |
| --- | --- |
| `herdr-safefs.ps1` | Confined, verified file operations: locked-handle hashing, no-overwrite commit, atomic restore, backup manifests. |
| `herdr-fixture-engine.ps1` | Phase 2 fixture functions, now built on the safe file layer. Fixture parent is configurable beneath `D:\StarqTech\scratch` through `STARQ_HERDR_FIXTURE_PARENT`. |
| `herdr-ops.ps1` | Release evidence, artifact trust, compatibility, continuity, session classification, journal, Path A update/detach/reconnect/rollback, Path B migration gate, evidence preflight, maintenance window. |
| `herdr-baseline.ps1` | Read-only sealed baseline of the live floor. Safe to run. |
| `herdr-compat.json` | Desktop/backend pairs actually observed working. Anything else is UNVERIFIED and blocks. |
| `herdr-preflight.ps1 -EvidenceDir -BackupRoot` | Evidence-backed preflight. The older `-EvidenceFile` mode still only checks declarations. |
| `tests/ops-tests.ps1` | 113 isolated checks. `tests/run-tests.ps1` 28, `tests/fixture-engine-tests.ps1` 18. |

### What was hardened in the Phase 2 fixture engine

- **File identity.** Source and destination are compared by path and by volume file ID; copying a file onto itself or onto a link to itself is refused.
- **Hard links.** Any file with more than one link is refused as source, target or backup, so a write cannot reach a file outside the root through a link.
- **Reparse points.** The whole chain to the drive root is checked, not only the part beneath the fixture parent.
- **Path forms.** Alternate data streams, traversal, rooted paths, reserved device names, 8.3 short names and trailing dots or spaces are refused.
- **Races.** The source is hashed and copied through one handle that denies writers, renames and deletes, so the bytes hashed are the bytes copied. Destinations are created with create-new and committed by a rename that fails if the name appeared. Restore re-checks the target hash immediately before the atomic swap; the remaining window is the swap call itself.
- **Backups.** A backup set carries a manifest of hashes and is re-hashed before use. A missing manifest, an empty manifest, a missing file or a changed file all refuse. An existing backup set is never overwritten, and a backup may not sit inside its source.
- **Interrupted work.** An interrupted copy leaves a `.partial` that blocks a retry until `Resolve-PartialFile` promotes it (hash proven) or quarantines it. A journal blocks a new operation while an earlier one is unfinished.
- **Expected SHA-256.** A hash typed by an operator proves nothing about provenance. The operational path accepts only release evidence in which at least two published sources agree and none disagrees (GitHub asset digest, published `.sha256` file, `windows-manifest.json`), plus a valid Authenticode signature from the pinned publisher subject. The upstream Sigstore and Ed25519 signatures are **not** verified by this facility.
- **Preflight.** The evidence mode reads sealed baseline, release and review records and re-hashes the backup. The seal detects edits and truncation; it is not a signature, and a person able to write both files can forge it. Acceptance must check where evidence came from.
- **PowerShell 5.1.** All three suites run under Windows PowerShell 5.1. Native stderr is kept from becoming a terminating error.

### Path A procedure (client and desktop, backends untouched)

1. `herdr-baseline.ps1` to a new evidence file. Confirm no duplicate sessions.
2. `herdr-discover.ps1 -Online -Component desktop`; fetch the asset digest, the `.sha256` file and `windows-manifest.json`; build release evidence. Choose `x86_64-pc-windows-msvc-setup.exe`.
3. Check `herdr-compat.json` for the desktop version against each backend's protocol. An unlisted pair needs a decision before proceeding and a new row after a verified connection.
4. Back up `%APPDATA%\herdr` and `%LOCALAPPDATA%\herdr`, export the remote-control task XML, and verify the backup by hash.
5. Verify the installer: size, SHA-256, Authenticode status and publisher subject.
6. Install with `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOCLOSEAPPLICATIONS /NORESTARTAPPLICATIONS /CURRENTUSER /LOG=<file>`. It installs per user and does not touch the previous extracted directory.
7. Launch from the Start menu shortcut so the desktop gets the user's environment, not a tool session's.
8. Baseline again and compare: server and pane processes by PID and start time, pane records, hosts online, workspaces present. Record the remote-control change.

Rollback: `sheprd app quit`; restore `config-gpui.toml` from the verified backup; re-import the exported task XML; launch `herdr-gpui-launcher.exe` from the preserved directory. Uninstall from Settings > Apps if wanted. None of this touches a backend.

### Path B (server migration, separate Founder authorization)

`Invoke-ServerMigration` handles Windows and Ubuntu separately and refuses unless: a sealed approval names the backend, the exact starting and target versions and a Room sequence; the running version equals the approved starting version; every pane is classified; and every pane that is not `RESUME_VERIFIED` is named in the approval as an accepted loss. It then runs `herdr update` (optionally `--handoff`) and checks the resulting version. `--handoff` is best effort upstream and its outcome is checked, not assumed.

Session classes: `LIVE_PROCESS_PRESERVED` and `PROCESS_LOST` (Path A); `RESUME_VERIFIED` (a resume test for that session is recorded), `RESUME_UNVERIFIED` (a session identifier exists for a known agent, nothing more), `LAYOUT_ONLY` (Path B). No resume test has been run for any current pane, so today every agent pane is `RESUME_UNVERIFIED`.

### Remote control, ACP and SSH machines

- Remote control: `sheprd remote status` reports the port, addresses, certificate fingerprint and paired devices. `sheprd remote restart` restarts it from the binary beside the desktop. Pairing and revocation are confirmed by the user in the app.
- ACP: `sheprd-acp 0.1.0` is installed; `sheprd chat` lists native chats. No ACP process was running and no ACP conversation was exercised, so ACP health is unverified.
- SSH machines: `herdr machine list|status|reconnect` on the backend that owns them. Both backends report none saved. `herdr machine status` checks without prompting; `reconnect` needs a person at a terminal.

### Dell XPS / JARVIS (separate environment, follow-up only)

The XPS runs Debian 13.5 under WSL2 with Herdr 0.9.5 and Hermes JARVIS. It was not contacted or changed. It is not a prerequisite for anything above.

- Compatibility: Herdr 0.9.5 with protocol 22 is the same pair observed working against Sheprd 20261108.1 on the Nitro's Ubuntu backend. That is a reason to expect compatibility, not a test of it.
- To add it later: SSH from the Nitro to the XPS must work non-interactively first; then `herdr machine add` from the Nitro backend, or Add Device > SSH host in the desktop. Upstream states that saved SSH hosts are unavailable in the Windows desktop, so the connection may have to be owned by the Ubuntu backend. Confirm before planning around it.
- `herdr machine add` prepares the remote Herdr server. On the XPS that must not restart or replace the running server, Hermes, its memory, skills or Telegram gateway. Treat the first connection as a Path B question for the XPS and get a specific approval.

### Scheduling

`Get-MaintenanceDecision` never opens a window while any agent is working or blocked, treats unknown status as not idle unless each such pane is confirmed idle by a person, and otherwise opens only inside the configured hours. `New-ReleaseCheckTaskSpec` describes a daily discovery-only task; it registers nothing. No scheduled task has been created.

### Limits

- Nothing in this facility has changed a live Herdr component. The 2026-11-10 desktop install was done by hand.
- Tests mock every external call. A pass shows the control logic. It does not show that a real installer behaves as mocked, or that any agent conversation can be resumed.
- Live execution has no code path: `$script:LiveApplyEnabled` is false and a live context is refused even if it were true. Enabling it needs real runners, independent acceptance and a reviewed change.
- No independent review has taken place.

## Official Herdr Desktop and machines (2026-11-10, later the same day)

Two different products carry the Herdr name. Do not treat them as one.

| | Herdr 1 (the Starq floor) | Official Herdr Desktop |
| --- | --- | --- |
| Daemon | `herdr server` 0.9.x | `herdr-core` (`hc`) 0.1.19 |
| Desktop | Sheprd 20261108.1, or the preserved 20261028.1 GUI, or the `herdr` TUI | `herdr-app` 0.1.14, `%LOCALAPPDATA%\Programs\herdr-app` |
| Publisher | CN=Fabien Penso (Sheprd) | CN=herdr, O=herdr, Wilmington, Delaware |
| State | `%APPDATA%\herdr`, `%LOCALAPPDATA%\herdr` | `~/.config/herdr-app`, `~/.local/state/herdr-core` |
| Machines | `herdr machine ...`, WSL device in Sheprd | `hc machine add <ssh host> --install` |

Herdr Desktop cannot attach to, import or migrate a Herdr 0.9.x server. No such mechanism appears in the herdr-app README, docs, changelog or the herdr-core README. The ten original panes and three workspaces stay on the Herdr 1 backend and are reachable only through Herdr 1 clients. Moving work to Herdr Desktop means starting new spaces there and resuming each agent with its own resume command; nothing is carried across.

### Sheprd is still a dependency

- No standalone herdr-core is installed on the Nitro. Herdr Desktop started `herdr-core.exe` from the Sheprd directory (first on PATH), and `hc update` has since replaced that file in place with 0.1.19. Uninstalling Sheprd while that core runs would remove or strand the binary Herdr Desktop depends on.
- The "Herdr UI Remote Control" task runs `sheprd-remote-control.exe` from the same directory.
- Sheprd is the current desktop for the Herdr 1 floor and its Ubuntu WSL device link.

To retire Sheprd later, in this order: install standalone herdr-core with the official installer (`%LOCALAPPDATA%\Programs\herdr-core`); restart the official core onto that binary and confirm its terminals survived; decide what replaces phone remote control; confirm the 20261028.1 GUI or the TUI is an acceptable way to reach the Herdr 1 floor; then uninstall from Settings > Apps. The uninstaller leaves `%APPDATA%\herdr` and `%LOCALAPPDATA%\herdr` alone according to upstream; back them up first anyway.

### Machine connectivity (herdr-core 0.1.19)

| Machine | SSH (non-interactive) | Platform | herdr-core | Registered | Online | Remote exec |
| --- | --- | --- | --- | --- | --- | --- |
| jarvis (XPS, Windows side) | Works after adding `IdentityFile ~/.ssh/jarvis_xps` to the host entry | Windows AMD64, cmd shell; Debian WSL2 running | 0.1.19 installed to `%LOCALAPPDATA%\Programs\herdr-core` by `hc machine add --install` | No | No | No |
| note8 | Works | Android 9, Termux, aarch64 | Runs `--version`; core restarts on every command. Removed again. | No (added, then removed) | No | No |
| s20plus | Works | Android 13, Termux, aarch64 | Does not execute (`unexpected e_type: 2`) | No | No | No |
| fold4 | Works | Android 16, Termux, aarch64 | Does not execute | No | No | No |
| fold6 | Works | Android 17, Termux, aarch64 | Does not execute | No | No | No |

- **XPS blocker.** The core refuses to start from an elevated SSH login while that user has a desktop session ("the desktop app could not access it"). This is a deliberate guard and is not to be worked around. At the XPS, in an ordinary non-administrator terminal, run `hc server start` (or open Herdr Desktop there); then on the Nitro run `hc machine add jarvis`. Hermes and the Herdr 0.9.5 server inside Debian were not touched; their process list was identical before and after.
- **JARVIS lives in Debian WSL2, not on the Windows side.** A Windows-side core reaches it with `wsl -d Debian` from a terminal. A core inside Debian would need its own route in (an SSH server in the distribution, or `hc machine add --via`), which changes JARVIS's environment and needs a separate decision.
- **Samsung nodes.** herdr-core publishes Linux aarch64 builds as static non-PIE executables and no Android build. Android 13 and later refuse to run them under Termux. On Android 9 the binary starts but the core crashes on use. No supported route exists today. Do not install an x86_64 build, and do not count a proot or emulation layer as supported.
- SSH discovery in the app lists hosts from `~/.ssh/config`. A listed host is not a connected machine.