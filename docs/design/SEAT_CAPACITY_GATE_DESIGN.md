# Seat capacity gate: do not assign work to a quota-blocked seat

Status: **DESIGN with evidence. Not implemented, no live change.** Lane 3b of Room #19091
(Founder #19089; the underlying failure is #19044). Written by the Operations Room Deputy.
Independent review is required before any code is written against it.

## Why the monitor missed Copilot and Codex

Read-only check, 2026-11-12, every live Herdr agent pane, last 25 lines, no model calls:

| Pane | Herdr `agent_status` | What the pane actually says |
|---|---|---|
| `w1:p1` Codex | `done` | "You've hit your usage limit … try again at Nov 14th, 2026 12:55 AM." and "Goal hit usage limits" |
| `w1:p7` Copilot | `idle` | "Plan ■■■■■ 99% used · resets in 19 days · 1,497 / 1,500 AIC" |
| every other pane | `idle` or `working` | no banner |

Herdr's status says whether the process is busy, not whether the account can run. A quota-blocked
seat reads `done` or `idle`, exactly like an available one. And, from the source (Codex, #19083):
the live dispatcher carries `agent_status` but never gates a wake on it, so a new assignment goes
to a blocked seat and is lost. Two separate gaps: no signal, and no gate.

## States, per seat

| State | Meaning | Evidence required |
|---|---|---|
| `AVAILABLE` | can execute | fresh read, no banner in the last 12 non-empty lines, and the harness is one the pattern table knows |
| `LOW` | works now, nearly exhausted | a percent-used banner at 95% or more, with **no hard-stop wording**, and no earlier rule applies |
| `QUOTA_BLOCKED` | cannot execute | **hard-stop wording** matched in the last 12 non-empty lines **and** `agent_status` is not `working` |
| `OFFLINE` | no live session | not in `herdr agent list` |
| `UNKNOWN` | cannot tell | read failed, harness not in the table, or conflicting signals |

**Precedence** (independent review, Room #19112, found that one Copilot pane could be both `LOW` and
`QUOTA_BLOCKED`; one rule order fixes it). Evaluate top to bottom, first match wins:

1. Pane absent from `herdr agent list`: `OFFLINE`.
2. Read failed, or harness has no table row: `UNKNOWN`.
3. `agent_status` is `working`: `AVAILABLE`. A working pane is never blocked, whatever text it shows.
4. Hard-stop wording matched ("hit your usage limit", "Usage limit reached", "monthly quota",
   an exhausted allowance such as 100% used or N / N units): `QUOTA_BLOCKED`.
5. A percent-used banner at 95% or more, no hard-stop wording: `LOW`.
6. Otherwise: `AVAILABLE`.

Copilot at 1,497 of 1,500 units is 99.8% used with the pane idle and no hard-stop wording: `LOW`. It
becomes `QUOTA_BLOCKED` only when its own wording says the plan is exhausted. Codex's "hit your usage
limit" is a hard stop: `QUOTA_BLOCKED`.

`UNKNOWN` is never `AVAILABLE`. This follows the standing rule that an unknown quota is an unknown
metric, not a readiness claim (AGENTS.md).

## The signal: pane text, zero premium cost

`herdr agent read <pane> --source recent --lines 25` is a local terminal read. A pattern table maps
each harness to its banner. Observed wording, 2026-11-12:

| Harness | Banner pattern (case-insensitive) | Also parse |
|---|---|---|
| Codex | `hit your usage limit` or `Goal hit usage limits` | `try again at <date time>` |
| Copilot | `\d{2,3}% used` with `resets in \d+ (days?\|hours?)` | percent used, AIC used / total |
| Claude | `Usage limit reached` or `You've hit your limit` | `resets <time>` (seen on the WSL and Ops panes on 2026-11-11, Room #18943, #19092) |

Other harnesses start as `UNKNOWN` until their banner is recorded. A new row is data, not code.

**False positives.** My own pane matched a first draft of the pattern because it was printing the
pattern. Rules that prevent it: only the last 12 non-empty lines are scanned; a pane whose
`agent_status` is `working` is never `QUOTA_BLOCKED`; the match must also fit the harness's own
table row, not a generic word list.

## Where it runs

In the dispatcher, **only when a wake is about to be sent**, plus one re-read per blocked seat every
5 minutes. No polling of every pane, no timers per seat, no LLM calls. A read takes milliseconds.
The result is written to `state/seat-capacity.json` (atomic write; one entry per seat: state,
since, evidence line, parsed reset time, the Herdr `state_change_seq` seen).

## The gate

Before `doWake`, the dispatcher asks for the target's capacity.

- `AVAILABLE`, `LOW`: wake as today. `LOW` adds a line to the log.
- `QUOTA_BLOCKED`, `OFFLINE`, `UNKNOWN`: **do not wake.** The record is retained, not dropped. The
  live dispatcher already keeps a retention list (`state.held`, 24 h TTL) for offline seats; this
  adds the reason `QUOTA_BLOCKED` to it. Delivery happens when the seat is `AVAILABLE` again.
- A record explicitly addressed to a blocked seat stays held, visibly, and is listed in the status
  output. It is never silently rerouted to another agent.

## Restoring eligibility: never assume a reset

A seat leaves `QUOTA_BLOCKED` only when **a fresh read** shows no banner in the last 12 lines.
A parsed reset time is only a reason to look sooner; the time passing does not clear the state.
(Founder #19044 item 6.) Evidence: Codex's banner says "try again at Nov 14th 12:55 AM"; until a
read after that time shows no banner, Codex stays blocked even on the 15th.

## Telling the Operations Room

A transition (`AVAILABLE` to `QUOTA_BLOCKED`, and back) must be visible in Room once, not on every
poll. The dispatcher is not a Room writer, and giving it an identity would be a new trust decision.
Two options, for the Chief Engineer to choose:

1. The keeper script (already runs every 5 minutes) reads `seat-capacity.json` and posts one
   transition record through `send.mjs` under the Ops seat's identity. Smallest change; the Ops
   seat is itself a seat that can be blocked.
2. The dispatcher writes the transition to its log only, and Wade Wire reports it. No new writer,
   but Room sees it up to a digest interval late.

Recommendation: option 1 with a fallback to option 2 when the Ops seat is itself `QUOTA_BLOCKED`.

## Tests (fake Herdr, fixtures of the real banner text above)

1. Each observed banner in its harness gives the state the precedence list assigns (Codex hard stop:
   `QUOTA_BLOCKED`; Copilot 99% with no hard-stop wording: `LOW`); the same text in a
   `working` pane gives `AVAILABLE`.
2. A pane with no banner is `AVAILABLE`; a harness with no table row is `UNKNOWN`.
3. The pattern appearing only in older scrollback (line 13 and beyond) is ignored.
4. A wake to a blocked seat is not sent, is retained, and is delivered after a fresh banner-free
   read, exactly once.
5. A reset time in the past does not clear the state without a fresh read.
6. A shared handle with one blocked seat and one available seat: a seat-qualified record to the
   blocked one is held; nothing is redirected to the other.
7. A failed read gives `UNKNOWN` and holds; it never defaults to `AVAILABLE`.
8. A replay of today's two real panes (Codex, Copilot) produces `QUOTA_BLOCKED` and `LOW`.

## Out of scope and limits

- WSL panes are not discovered by the live dispatcher (Windows Herdr only).
- Quota exhaustion that shows no text (a silent API-side rate limit) is not detectable from here.
  The gate then does nothing; this is stated, not hidden.
- Provider quota APIs would be exact but need credentials and per-provider code. Not proposed.
- Banner wording changes with harness releases; the table needs an owner and a test that fails
  when a known banner stops matching.

## Needed before code

Independent reviewer (not Ops; Codex is at its limit, Copilot is blocked itself); Founder or Acting
Chief Engineer choice between notification options 1 and 2; agreement that the live dispatcher may
gain a read-only call to `herdr agent read`.
