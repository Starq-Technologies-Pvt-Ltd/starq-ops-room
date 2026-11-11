# Founder delivery paths: StarqBot primary, Deadpool relay secondary (2026-11-11)

Status: **OPEN — verified, three decisions pending.** Assignment
`FOUNDER-STARQBOT-PRIMARY-DELIVERY-20261111` [#18971, ACK #18972]. Findings #18975, test evidence
#18977. Read-only: no source, configuration, cursor, lease or process was changed; no restart;
no replay.

## Result in one paragraph

StarqBot is the only path that can currently reach the Founder. Until the test below it had
delivered nothing outbound on 2026-11-11: after the 15:50 PKT restart it processed more than
120 Room records and suppressed all of them, including the consolidated handover the Founder
had asked for. The Deadpool relay is an independent sender to the same Telegram chat, with no
filter, and has been failing since 2026-11-05. So there are no competing duplicates today, but
only because the second path is broken.

## StarqBot

Source `agent-comms/scripts/starq-bot-gateway.mjs` (outside version control, #18871). Live:
supervisor pid 26768, gateway pid 27696, lock held, no safety hold.

| Aspect | Finding |
|---|---|
| Telegram → Room | Works. Only the allowed user ID is accepted. Posts as `mustarq`, instance `starq-bot-gateway`, with the Telegram update ID in metadata [#18948] |
| Room → Founder filter | `isFounderNotificationEligible` (line 1079). A record is sent only if the broker type is ACTION_REQUIRED, **and** `mustarq` is in the audience (an `@mustarq` mention in the body), **and** the action-required text names the Founder — and where the text starts with an owner prefix, only that **first** owner is read |
| Everything else | Logged "suppressed non-actionable"; the cursor advances |
| Deduplication | Inbound Telegram records are skipped outbound by update ID. Founder-authored records are never notified back |
| Cursor and restart | One persisted Room cursor. Partial sends resume; ambiguous sends latch. No history replay. Restart recovery fails only on a dead-pid stale lock [#18950] |
| Success logging | The continuous path writes no log line when a record is sent |

Founder-directed records suppressed today:

| Record | Why it was not sent |
|---|---|
| #18962 consolidated handover, #18968 update | posted as context with action NONE |
| #18935, #18946 Founder decision requests | no `@mustarq` mention, so not ACTION_REQUIRED |
| #18958 ERP floor handover | ACTION_REQUIRED to `mustarq`, but the action text begins "codex: …; mustarq: …" and only the first owner is read. **Filter defect** |

## Deadpool relay

WSL Hermes cron job `room-relay-backup` (`b4d035545d41`), every minute, script
`~/.hermes/scripts/room-relay.py` (SHA-256 `02cd48ba…02bcb9`).

- **Independent delivery path, not an observer.** Its delivery target is the Founder Telegram chat, the same chat
  StarqBot uses.
- No filter: every new Room record, body cut at 3000 characters. Own checkpoint; no
  coordination with StarqBot.
- **Failing since 2026-11-05**: every Hermes cron delivery ends "platform 'telegram' not
  configured/enabled" (102 failures on 2026-11-11, none delivered).
- The checkpoint advances whether or not delivery succeeds, so it is not a failover: records
  missed while it fails are dropped.
- The Windows `watch/deadpool-room-watch.mjs` is a read-only observer and is not running on
  this host.

If its Telegram platform were re-enabled unchanged, the Founder would receive every Room record
from Deadpool plus StarqBot's copy of each directed one.

## Live test [#18975, #18977]

- Test event: Room #18975, a genuine findings report, ACTION_REQUIRED, audience
  `[mustarq, codex]`, action text beginning "mustarq:".
- StarqBot: #18974 and #18976 were logged as suppressed; there is no suppression line for
  #18975. Afterwards the cursor was at #18976 with no pending or failed send, relay HEALTHY.
  #18975 therefore passed the filter and was sent without error. This is inferred from state:
  there is no explicit success line, and Telegram itself was not read.
- Deadpool: no delivered row on 2026-11-11; latest rows all failed. It did not duplicate.
- Closing proof still needed: the Founder's confirmation of exactly one copy.

## Decisions pending

| # | Decision | Owner |
|---|---|---|
| 4a | Convention now, no code change: anything meant for the Founder mentions `@mustarq` and uses action-required beginning "mustarq:". Re-issue #18962/#18968 that way if the Founder has not seen them; no history replay | Codex |
| 4b | Gateway: read every owner in the action text, not only the first. Needs review, tests, version control for the source, and a planned restart | Founder / Codex |
| 4c | Deadpool relay: keep it off Telegram, or make it failover-only — send only when StarqBot is unhealthy, same filter, checkpoint advanced only after delivery | Founder / Deadpool |

Until 4c, the Deadpool relay is not a secondary path; it is a dead one.
