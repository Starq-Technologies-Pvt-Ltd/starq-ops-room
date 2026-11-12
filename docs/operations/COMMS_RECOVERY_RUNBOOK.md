# Starq communications — how it runs and how it recovers

Written 2026-11-11 by the Operations Room Deputy under the Founder's convergence directive.
Everything below was changed in the live runtime (`D:\StarqTech\agent-comms`) and tested there on
2026-11-11. The exact diffs are in `live-changes/2026-11-11-comms-hardening/`. Nothing here has
had independent review yet.

## What runs

| Part | Process | Started by | State it keeps |
|---|---|---|---|
| Room | no daemon; records are appended by `send.mjs` | each sender | `room.jsonl` (read only through `readRoomSnapshot()`) |
| Room dispatcher | `node scripts\room-dispatcher.mjs` | keeper | `state\room-dispatch-codex-live\room-dispatch.json` |
| StarqBot | wrapper → `gateway-supervisor.mjs` → `starq-bot-gateway.mjs` | keeper | `logs\starq-bot-gateway-state.json` |
| Cloudroom backend | `Starq Command.exe` | keeper | Cloudroom's own |
| Keeper | `scripts\keep-starq-comms.ps1` | scheduled task | `logs\keep-starq-comms.log` |

## Automatic startup and self-recovery

Scheduled task **`StarqTech-StarqBot-Logon`** runs the keeper at logon and every 5 minutes. The
keeper starts only what is missing and never restarts a healthy process. A crashed StarqBot or
dispatcher is back within 5 minutes without anyone acting.

- StarqBot's own supervisor also restarts the gateway process if it exits or stalls.
- After a crash or reboot the gateway lock names a dead process. The launcher now clears that
  one stale lock, but only when no gateway, supervisor or wrapper process exists. The safety
  hold, cursor and outbound state are never touched.
- The dispatcher is started only once Herdr is running; until then the keeper retries.

Limit: the task runs when the Founder's Windows account logs on. Nitro must reach the desktop
(auto-logon or a manual sign-in) for anything to start.

## StarqBot mirror

`state\starq-bot-config.json` contains `{ "mirrorAll": true }`. With it, every new committed
Room record is sent to the Founder's Telegram with its sequence number, sender, recipients,
subject and full body. Remove the file, or set `"mirrorAll": false`, and restart the gateway to
return to Founder-action-only delivery.

- Not mirrored: the Founder's own Telegram messages, which he already has.
- Delivery state: one cursor, advanced only after Telegram accepts a record. After a restart the
  gateway continues from the cursor, so records committed while it was down are sent then.
- Telegram rate limit (429): the gateway waits the time Telegram asks for and sends again. A
  429 means the message was not accepted, so this cannot duplicate.
- **Network down.** A send that fails before any connection to Telegram exists (DNS failure,
  connection refused, network unreachable) is certain not to have been delivered. It is marked
  failed, not ambiguous; the supervisor restarts the gateway and the record is sent once the
  network is back. Before this change, such a failure stopped the mirror until a person ran a
  duplicate-confirmation (seen on 5 Nov). Active since 21:18 PKT on 2026-11-11 (gateway restarted
  through the keeper; Room #19052, posted during the restart, was delivered once).
- Any other failed send stops the mirror at that record until the gateway process restarts. The
  supervisor or the keeper restarts it and the record is retried. An ambiguous send (the call
  threw) is not retried automatically, by design: it could duplicate.
- Each delivered record writes a line in `logs\starq-bot-gateway.log`.

**Layout (Founder #19039).** The gateway has two layouts. `classic` (default, in use) shows
the full header block. `mobile` puts a bold subject first, then one line with sequence, sender
and recipients, then PKT time and kind, a separated Founder action, and the body verbatim; empty
metadata is left out. Switch with `"layout": "mobile"` in `statestarq-bot-config.json` and a
gateway restart. Not switched on: that is a live cutover awaiting approval [#19043].

When running the gateway test suites in the live tree, set `STARQ_BOT_MIRROR_ALL=0` and
`STARQ_BOT_LAYOUT=classic`, because the live config file changes the defaults those suites expect.

Deadpool's separate relay is not part of this. It was live and unfiltered until 21:20 PKT on
2026-11-11 and sent every record to the Founder in a second bot chat, so #19026 to #19052
arrived twice [#19058]. It is now in mode `off` (`relay-config.json` in Deadpool's profile) and
must stay off; its old twin job is paused.

## Tag routing

The dispatcher reads new Room records and wakes only the seat a record is addressed to.

- Addressed to one live seat: that pane gets a short pointer. No other pane is touched.
- **Seat offline, or an explicit seat (`@claude#w3:p1`) not live: the record is retained** in
  the dispatcher state and delivered when that seat appears, for up to 24 hours.
- **Shared handle with several live seats and no qualifier (`@claude`, `@antigravity`): held,
  never guessed** — Founder decision, Room #19034: no arbitrary defaults. It is not delivered
  automatically, even if seats later leave. Address the exact seat: `@claude#w1:p5`,
  `@claude#w3:p1`, `@antigravity#w2:p1`. (The code can read a default-seat file; none exists
  and none should be created without the Founder.)
- **Only addressed handles are woken** (Room #19034). A handle that is merely quoted in a
  message no longer wakes its seat. The addressees are, in order: owner prefixes in the
  action-required text (`codex: …; mustarq/claude: …`), else `@handles` in the action text,
  else `@handles` in the opening line of the body and in leading `To:`/`Cc:` lines. If none
  of these names anyone, every handle in the audience is woken as before, so nothing is dropped.
- **A seat is never woken by its own post.** `send.mjs` stamps the sender's Herdr pane on each
  record and the dispatcher excludes that pane.
- After a dispatcher restart it continues from its checkpoint, so records committed while it was
  down are routed then. Delivery is de-duplicated per record and seat.
- The dispatcher never starts an agent or creates a session. A seat that is not running is
  simply waited for.

Not covered: WSL and remote hosts. The dispatcher's only source is Windows Herdr.

## Check

```
powershell -File D:\StarqTech\agent-comms\scripts\keep-starq-comms.ps1 -StatusOnly
node D:\StarqTech\agent-comms\scripts\gateway-supervisor.mjs --status
```

Healthy: three "running" lines; lock HELD by a live pid; safety hold NONE; relay HEALTHY.

## After a reboot

1. Sign in to Windows and open Herdr. Nothing else is needed.
2. Wait up to 5 minutes for the keeper task, then run
   `powershell -File D:StarqTechagent-commsscriptserify-comms-after-reboot.ps1`.
   It is read-only and prints PASS or FAIL for: keeper task ran since boot, StarqBot running with
   lock held and relay healthy, Herdr, dispatcher, Cloudroom app, mirror cursor at the Room tail,
   no pending outbound failure. Exit code 0 means all passed.
3. Gap test: post one Room record while Nitro is down or just after sign-in and confirm the
   gateway log shows `delivered record #<seq>` once.

Run on 2026-11-11 with no reboot: all 8 checks pass (the "since boot" checks compare with the
last boot at 05:37).

## If something is wrong

| Symptom | Do |
|---|---|
| A service is not running | Run the keeper without `-StatusOnly`, or wait 5 minutes |
| Lock STALE and the keeper does not recover | Read `logs\keep-starq-comms.log` and `logs\starq-bot-gateway-wrapper.log`. Exit code 5 is a failed preflight: fix its stated cause |
| Safety hold active | A person set it. Do not release it without that person or the Founder |
| Mirror stopped at one record | `--status` shows the failure. Restart the gateway (kill the three gateway processes; the keeper restarts them). If the record is marked ambiguous, use `--recover-batch 1 --confirm-duplicate` under the standing duplicate authorisation |
| A tag reached nobody | Search `state\room-dispatch-codex-live\room-dispatch.log` for the sequence: `RETAINED` means the seat is offline; `HELD` means the handle is ambiguous and must be re-sent with a seat qualifier |
| Roll back | Backups sit beside the live files with the suffixes `.pre-mirror-20261111`, `.pre-retain-20261111`, `.pre-autostart-20261111`, `.pre-senderpane-20261111`. Copy one back and restart that process. `Unregister-ScheduledTask StarqTech-StarqBot-Logon` removes autostart |

Never: reset a cursor, replay the backlog as routine, release a lock whose pid is alive, or take
over a live identity lease.

## Tests run on 2026-11-11

| Test | Result | Evidence |
|---|---|---|
| Gateway mirror unit tests (new) | 6 pass | `tests\starq-bot-gateway-mirror.test.mjs` |
| Existing gateway suites | unchanged from the pre-change baseline: 6 failures that also fail on the original file | batch-recovery 5, delivery 1 |
| Dispatcher tests | 16 pass (13 new) | `tests\room-dispatcher-retention.test.mjs`, `tests\room-dispatcher-addressing.test.mjs`, `tests\room-dispatcher.test.mjs` |
| Dispatcher killed, no manual action | restarted by the task's own 5-minute timer after 4 minutes | killed 20:53:13, started 20:57:12 PKT |
| Quoted handles | only the addressee woken | Room #19041, dispatcher log 16:01:31Z |
| Seat addressing its own pane | not woken | Room #19042 |
| Founder's Telegram receipt | confirmed by the Founder | Room #19034 |
| Network down during a send (unit tests with real Node error shapes) | retried and delivered once; mid-send reset stays ambiguous | `testsstarq-bot-gateway-network-retry.test.mjs`, 3 pass |
| StarqBot crash with stale lock → restart by the scheduled task | recovered in about 30 s | keeper log 20:45:50 PKT |
| Record committed while StarqBot was down | sent after restart | Room #19026, gateway log 15:46:23Z |
| Mirror of ordinary records | #19026–#19030 each logged as delivered | gateway log |
| Dispatcher killed, tagged record posted, restart by the task | only `w1:p1` woken | Room #19028, dispatcher log 15:47:01Z |
| Codex acknowledgement | ACK 29 s after the tag | Room #19030 |
| Offline registered seat | retained, nobody else woken | Room #19029, `RETAINED seq=19029` |

Not tested: an actual reboot of Nitro. It would end every agent session on the floor and needs
someone at the machine to sign in, so it is the Founder's to schedule.

## Sender fix live (Founder #19089), applied 2026-11-12

`send.mjs` now addresses an owner named only in `--action-required`: if the body does not already
mention that owner, one `To: @owner` line is put in front of it and a NOTE is printed. Without it
such a post was stored as a broadcast FYI and woke nobody (21 posts between #18500 and #19051).

- Files: `scriptsactionOwnerAddressing.mjs` (new, sha 8dccad5f5ae06241, the reviewed helper) and
  `scriptssend.mjs` (one reviewed hunk; sha 53cb880be6474c1a). Reviewed PASS by Codex (#19065,
  #19086). No restart: `send.mjs` is read on every call.
- Live check: Room #19099 (owner only in the action text, naming the Founder) was stored
  ACTION_REQUIRED to the Founder with the `To:` line, mirrored to Telegram, and woke no seat.
- **Rollback:** `copy scriptssend.pre-owneraddressing-20261111.mjs scriptssend.mjs` (sha
  8185191beff01c4f); or reverse the patch, verified with `git apply -R --check`. The helper file
  may stay; nothing imports it once the old `send.mjs` is back.
- **Revision 3 live (2026-11-12, Room #19116).** A post from one seat to another seat of the SAME shared handle
  (Ops Claude to ERP Claude) used to stay a broadcast FYI, because the helper treated an owner equal to the
  sender's handle as a note to self (found Room #19102/#19103). Revision 3 (commit 7bccf62, helper sha
  fc90c63a2a56324d) keeps a **seat-qualified** owner of the sender's own handle. Independent review: Cursor
  PASS (#19112); applied under the Acting Chief Engineer (#19114). Live check #19116: stored ACTION_REQUIRED,
  To line added, only pane w1:p5 woken. **Rollback:** copy `scriptsactionOwnerAddressing.rev2-20261111.mjs`
  (sha 8dccad5f5ae06241) over `scriptsactionOwnerAddressing.mjs`.
- Not covered: Founder messages that name an agent without an `@handle`
  (`docs/design/FOUNDER_UNADDRESSED_MESSAGE_DESIGN.md`), and quota-blocked seats
  (`docs/design/SEAT_CAPACITY_GATE_DESIGN.md`).

## Known defects still open (seen live on 2026-11-11)

1. Fixed 2026-11-11 21:01 PKT: a quoted handle woke its seat [#19031, #19032]. Verified live
   with #19041 (two quoted handles, only the addressee woken) and by replay over 1,541 real
   records: 119 false wake-ups removed, 2 previously dropped addressees restored, no other
   change. Still true: the broker lists a quoted handle in a record's audience, and a quoted
   handle in the **opening line** is treated as addressed.
2. Fixed 2026-11-11 21:03 PKT: a seat woken by its own post. Verified live with #19042.
3. Unqualified shared handles are held, by Founder decision (see "Tag routing").
5. WSL and remote seats are outside the dispatcher. Polling WSL from Windows would start the
   WSL VM whenever it is stopped, and that delivery path was never verified; not enabled.
6. Nitro does not sign in by itself (auto-logon is off) and the Herdr app is not started
   automatically. After a reboot someone signs in and opens Herdr; StarqBot and the Cloudroom
   app start at sign-in, the dispatcher starts as soon as Herdr is up, and records committed in
   between are mirrored and routed from the saved checkpoints.
4. Records #18872 to #19025 were committed while the mirror was filtering and were not sent to
   Telegram. No backfill was run by the Ops seat; Codex holds that lane [#19025, #19027].
