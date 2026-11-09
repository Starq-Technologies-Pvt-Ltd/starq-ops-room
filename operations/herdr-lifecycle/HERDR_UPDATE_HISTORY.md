# Herdr maintenance history

| Date (PKT) | Event | Outcome |
| --- | --- | --- |
| 2026-11-09 | Read-only baseline, Room #18665 and #18668 | Windows preview server and Ubuntu 0.9.5 server observed independently; no update, detach, restart or migration. Remote-control health inconclusive. |
| 2026-11-09 | Facility implementation | Fixture-based checks only. Independent review pending. No live lifecycle operations authorized. |
| 2026-11-09 | Phase 2 partial development | Added offline-by-default discovery and confined backup/staging/rollback fixture engine. Operational Herdr actions remain unimplemented and disabled; independent review pending. |
| 2026-11-10 | Manual Path A desktop update, Founder directive, Room #18691-#18692 | Sheprd 20261108.1 installed per user beside 20261028.1 (installer sha256 ce12162863983c21e10e52acb64897af53acae6074145a7e739fa1b51469e277, Authenticode valid, publisher CN=Fabien Penso). Windows server PID 2380 and Ubuntu server PID 897 unchanged; 10 pane records identical; hosts Local and Ubuntu online; 3 workspaces. Remote control replaced by the new desktop (PID 4236 ended, task re-registered, privacy generic to excerpt). config-gpui.toml rewritten. One ACL-denied session-backups file not backed up. Agent conversations not tested. Lifecycle scripts not used. |
| 2026-11-10 | Phase 3 implementation | Safe file layer, operational module, evidence preflight, baseline script, compatibility matrix; 159 isolated checks pass under PowerShell 5.1. Live execution still refused in code. Independent review pending. |
| 2026-11-10 | Official Herdr Desktop 0.1.14 / herdr-core 0.1.19, Room #18694 onward | Desktop verified and running; it cannot see the Herdr 0.9.x floor and no migration path exists. Sheprd retained as a dependency. SSH to jarvis fixed in ssh config. herdr-core 0.1.19 installed on the XPS Windows side; core start refused over elevated SSH, not registered. Four Termux nodes incompatible; note8 install removed. No machine registered. Original backends unchanged. |

Add a record after each future cycle: exact versions, actions, approvals, process and session results, validation, failures and rollback evidence. Never add credentials or transcript contents.
