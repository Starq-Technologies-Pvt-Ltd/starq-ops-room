# Live runtime changes — 2026-11-11 comms hardening

Applied directly to `D:\StarqTech\agent-comms` (which is not a Git repository) under the
Founder's convergence directive, and recorded here so they can be reviewed. Not yet
independently reviewed. Operation and rollback: `docs/operations/COMMS_RECOVERY_RUNBOOK.md`.

| File here | Live file | Change |
|---|---|---|
| `starq-bot-gateway.mjs.patch` | `scripts/starq-bot-gateway.mjs` | optional full mirror (`mirrorAll`), Telegram 429 back-off, a log line per delivered record |
| `room-dispatcher.mjs.patch` | `scripts/room-dispatcher.mjs` | retain records for offline seats; wake only addressed handles; never wake the sender's own pane; default-seat reader (no file exists, by Founder decision #19034) |
| `starq-bot-gateway-mobile-layout.mjs.patch` | `scripts/starq-bot-gateway.mjs` | Founder #19039: selectable mobile layout (`layout`), **off by default**; samples in `mobile-layout-samples.md` |
| `send.mjs.patch` | `scripts/send.mjs` | stamp `senderPane` / `senderHost` from `HERDR_PANE_ID` |
| `start-starq-bot-if-needed.ps1.patch` | `scripts/start-starq-bot-if-needed.ps1` | clear a dead-pid stale lock when no gateway process exists |
| `keep-starq-comms.ps1` | `scripts/keep-starq-comms.ps1` | new: idempotent keeper run by the scheduled task |
| `*.test.mjs` | `tests/` | new tests |

SHA-256 (first 16) after / before:

- `starq-bot-gateway.mjs` `a89729a6ab4adc0b` / `1780cc0aeadeff09` (after the mirror step: `40df49bc7676c73a`, backup `starq-bot-gateway.pre-mobile-20261111.mjs`)
- `room-dispatcher.mjs` `71e6ede337c4abfa` / `a01aceb218458b32`
- `send.mjs` `8185191beff01c4f` (backup `send.pre-senderpane-20261111.mjs`)
- `start-starq-bot-if-needed.ps1` `d80aad07e3ea7455` / `98f050a38a6bdba4`
- `keep-starq-comms.ps1` `b95fe71f36ef89f1` (new)

Also created: `state/starq-bot-config.json` (`{"mirrorAll": true}`) and the scheduled task
`StarqTech-StarqBot-Logon`.

The earlier candidate in `candidates/starqbot-founder-filter/` is superseded while the mirror is
on: with `mirrorAll`, every record is sent and the Founder-action filter only decides which
records carry the urgent banner.
