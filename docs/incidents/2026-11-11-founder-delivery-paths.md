# Founder delivery paths: StarqBot primary, Deadpool relay secondary (2026-11-11)

Status: **OPEN — verified, three decisions pending. CORRECTED 2026-11-11 21:30 PKT:** my first audit of the
Deadpool relay was wrong; see "Correction" below. Assignment
`FOUNDER-STARQBOT-PRIMARY-DELIVERY-20261111` [#18971, ACK #18972]. Findings #18975, test evidence
#18977. Read-only: no source, configuration, cursor, lease or process was changed; no restart;
no replay.

## Result in one paragraph

StarqBot is the only path that can currently reach the Founder. Until the test below it had
delivered nothing outbound on 2026-11-11: after the 15:50 PKT restart it processed more than
120 Room records and suppressed all of them, including the consolidated handover the Founder
had asked for. **Correction:** the Deadpool relay was not dead. A second, live relay job sent
every Room record to the Founder through Deadpool's own bot, unfiltered, so the Founder received
records twice from #19026 until Deadpool switched it off at 21:20 PKT. The "dead" job I audited
was the other one. See "Correction".

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

## Correction (Deadpool, Room #19058; verified read-only by the Ops seat)

My audit read only the default Hermes profile's cron jobs and drew the wrong conclusion.

- **Two** Hermes cron jobs were named `room-relay-backup` and shared one checkpoint file.
- Job `b4d035545d41` (default profile, `~/.hermes/scripts/room-relay.py`) is the one described
  below. It was dead from 2026-11-05 and advanced its checkpoint without delivering. Deadpool
  paused it at 16:19 PKT on 2026-11-11.
- Job `d0b0dd8dd799` (deadpool profile, `~/.hermes/profiles/deadpool/scripts/room-relay.py`) was
  **not audited by me**. It sends through the Telegram Bot API from Deadpool's own bot to the same
  Founder chat, with no filter, and advances its checkpoint only after Telegram returns ok. Its
  cron output reads "suppressed" because it prints nothing, so the delivery database showed no
  delivery for it. This is why my "no delivered row" check proved nothing.
- Whichever job fired first took each new record. Records taken by the dead job were dropped; the
  others were delivered. So Deadpool was a **live, unfiltered, partial** sender.
- After the dead job was paused, the live one delivered every Room record.
- **Duplicates:** #19026 to #19052 reached the Founder twice — once from the StarqBot mirror,
  once in the Deadpool bot chat. It stopped at 21:20 PKT, when Deadpool set the live relay to
  mode `off` (`~/.hermes/profiles/deadpool/comms/relay-config.json`). In that mode it sends
  nothing and its checkpoint follows the Room tail, so nothing replays if it is switched back.
  I confirmed on the WSL host the profile script, the mode file reading `off` and the old job
  paused. I did not read Deadpool's Telegram chat.
- **Backfill range #18872 to #19025:** some of these reached the Founder through the Deadpool bot
  chat and some were dropped. Nobody can list which: the relay kept no per-record log before
  tonight. From #19052 it logs every send with the Telegram message id. Codex's backfill should
  not assume the whole range is missing.
- **Wrong in my earlier posts:** "Deadpool did not duplicate" (#18977) and "dead since 11-05"
  (#18975) are retracted for the live job. Deadpool's own digest no longer posts to Room.
- Separate, already known: Room records addressed to Deadpool do not wake its WSL Hermes pane,
  because the dispatcher does not cover WSL. The relay copies such records to a local inbox file.

## Deadpool relay (the dead job, as audited)

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
- Deadpool: I reported "no delivered row; it did not duplicate". **Wrong** — see "Correction":
  the live job was delivering through a second bot, and the Founder received #19026 to #19052
  twice.
- **Receipt is UNCONFIRMED.** The Founder ruled that receipt of #18975 stays unconfirmed until
  he verifies it explicitly, and that delivery is not to be inferred from cursor progress
  [#18981]. The lines above show gateway acceptance only.

## Founder decisions [#18981]

4a, 4b and 4c are authorised as work for Operations Claude: addressing standard and selective
reissue (4a); prepare and test multi-recipient filtering (4b); design Deadpool as failover-only
(4c). Review and production-activation gates are unchanged: nothing is activated, restarted or
re-enabled without them [#18983].

## Decisions pending

| # | Decision | Owner |
|---|---|---|
| 4a | Convention now, no code change: anything meant for the Founder mentions `@mustarq` and uses action-required beginning "mustarq:". Re-issue #18962/#18968 that way if the Founder has not seen them; no history replay | Codex |
| 4b | Gateway: read every owner in the action text, not only the first. Needs review, tests, version control for the source, and a planned restart | Founder / Codex |
| 4c | Deadpool relay: keep it off Telegram, or make it failover-only — send only when StarqBot is unhealthy, same filter, checkpoint advanced only after delivery | Founder / Deadpool |

Until 4c, Deadpool's relay is neither a failover nor a competitor: it is **off by Deadpool's own
switch since 21:20 PKT** and stays off until the Founder or Operations says otherwise [#19058].
