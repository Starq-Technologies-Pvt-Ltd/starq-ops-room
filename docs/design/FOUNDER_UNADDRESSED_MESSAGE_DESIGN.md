# Founder messages that name no `@handle`: fail-safe routing

Status: **DESIGN with evidence. Not implemented, no live change.** Lane 3a of Room #19091 and
the open gap of #19070/#19071/#19089. Written by the Operations Room Deputy. Recipients are never
inferred from the message body (Codex #19071, Founder #19089).

## The gap, with the evidence

Founder Telegram messages enter Room through the StarqBot gateway, which calls `send.mjs` with
action text derived by `telegramInboundStructuredMetadata`: a generic "Respond in Room…" when the
text contains an `@`, otherwise `NONE`. The broker classifies from the body's `@handles`. A message
that addresses an agent by name only ("Codex, Founder here") is therefore stored as a broadcast
`CC_CONTEXT`, wakes nobody, and the Founder is told nothing.

Replay over Room #18500 to #19101 (read through the snapshot reader, 2026-11-12): 30 Founder
records; 24 were stored as ACTION_REQUIRED and 6 as FYI (CC_CONTEXT, action NONE). One of the six is
a 4-character test (#18605). The other **five are real instructions that woke nobody**: #18731 (the
Nitro checkpoint), #18808 (the instruction to park the dispatcher work), #19023, #19024 (a
continuation) and #19077. Three of the five were today or yesterday. #19077 was seen only because
Codex happened to read the Room.

**Seen again on 2026-11-12 (Room #19154 and #19155).** The Founder split one directive into two Telegram
messages 16 seconds apart, marked `(1/2)` and `(2/2)`. Part 1 (2,579 characters, received 06:41:19Z) carried
`To: @claude#w1:p5` and woke that seat at 06:41:22Z. Part 2 (2,029 characters, received 06:41:35Z) carried no
`@handle` of its own, was stored with the Founder as its only audience (its signature line names him), and woke
no agent. The Acting CE had already read it; this was found by this seat, not by the system. Of the 36 Founder
records since #18500, only these two carry an `(n/m)` marker. Neither part reaches 4,000 characters, so the length
rule below would not have caught it.

A third cause, therefore: **a deliberate split with an explicit marker.**

Two distinct causes:

1. **No addressee at all in the first message.** The Founder wrote a name, not a handle.
2. **A continuation.** Telegram splits a message longer than about 4,000 characters into separate
   updates. #19023 was 4,076 characters; #19024 followed 6 seconds later and begins "1. Which
   Starq UI source files…". It carries no addressee and no `@`.

## Decisions this design does not make

- It does not read names in prose. "Codex, Founder here" stays unaddressed.
- It does not default a recipient on its own. A default recipient is a Founder decision
  (`docs/reviews/WSL_DELIVERY_PATH_AND_FOUNDER_INGRESS_2026-11-11.md` section 5.4 on PR #3); the
  fail-safe below works without one.

## Fail-safe semantics

For a Founder message with no registered `@handle` and no explicit `/to` header:

1. **Store it as an action, not as FYI.** Action text names the cause: "mustarq: UNADDRESSED
   Founder message; no recipient named". It is never `NONE`.
2. **Hold it visibly.** In the receiver candidate (PR #3 branch `cefafce`) an outstanding action
   with no registered recipient is a durable `UNADDRESSED` hold, listed in the dispatcher report.
   The Ops seat owns holds by default (`resolutionOwner: operations-room`).
3. **Tell the Founder in the same chat, at once.** The gateway already acknowledges inbound
   messages ("Received [seq …] — floor notified"). Unaddressed messages instead get:
   "Stored as #N. NOT delivered to any agent: no @handle. Reply with @codex, @claude#w3:p1 … to
   route it." The Founder fixes it in seconds by replying. This is the one fail-safe that needs no
   inference.
4. **A later explicit address resolves the hold.** A Founder follow-up that names a registered
   agent and cites the held message (the reply carries the Telegram reply-to, already stored as
   `replyTo`) delivers the original to that agent; the dispatcher's existing "resolved by a Room
   reply" logic closes the hold.

## Continuations: a deterministic rule, not a guess

A message is a continuation only if **all** of: same sender (the Founder) and chat; arrives within
30 seconds; the previous message body was at least 4,000 characters (Telegram's limit is 4,096; the first
part here was 4,076); and
it has no `@handle` of its own. Then it inherits the previous message's addressees and is stored
with a reference to it (`references: telegram-update:<id>`). Anything else is "unaddressed" above.
This is a length-and-time test about Telegram, not a reading of what the text says. #19024 is the
continuation of #19023, whose own 4,076 characters meet the length condition; a short unaddressed
message never does.

## Marker-based continuation rule (candidate, Acting CE #19158; not built, not live)

Decided by the Acting CE as a candidate only; the Founder decides whether it is built, and the question is put to him
in the SOP readiness package. It uses the sender, the time and an explicit marker. It never infers an addressee from
the text, so it stays inside the Founder's rule of #19034.

**Rule.** A Founder message M with a marker `(n/m)` inherits the explicit recipients of the previous Founder message P
if all of these hold:
1. Same sender (the Founder) and chat.
2. The marker is the last non-blank text of the body, in the form `(n/m)` with 2 <= n <= m <= 9. A marker anywhere
   else in the text does not count.
3. P carries the matching marker `(n-1/m)` in the same position.
4. M arrived within **120 seconds** of P (observed gap: 16 s; the bound is a proposal and is a constant, not a guess
   about content).
5. M has no registered `@handle` of its own, and P has explicit recipients (a registered `@handle` or a `To:` line).

M is then stored with the same `To:` recipients as P, a reference to P's Room event and to both Telegram update ids,
and the action text names the cause ("continuation (n/m) of #P"). Routing then treats M exactly as it treats P: a
bare shared handle in P is held, not defaulted, in M too. Nothing else changes.

**Failure cases, each held visibly and reported to the Founder** (the Telegram reply of the fail-safe above):

| Case | What happens |
|---|---|
| Part `n/m` (n >= 2) with no earlier `(n-1/m)` message inside the bound (a missing part) | No inheritance. UNADDRESSED hold; the Founder is told "part n/m has no preceding part, NOT delivered; reply with @handle". |
| Parts out of order (`2/2` arrives before `1/2`) | `2/2` is UNADDRESSED at arrival and the Founder is told. `1/2` is delivered on its own. No retroactive delivery in the first version: the Founder resolves it with a reply that names the recipient. |
| `(1/m)` with no recipients of its own | It is unaddressed under the existing rule, so there is nothing to inherit; every later part is held too, and the Founder is told once, for the series. |
| A marker with no earlier part at all (`(2/2)` as the first message, or a stray `(3/3)`) | Same as a missing part: UNADDRESSED hold, Founder told. |
| The same `(n/m)` sent twice inside the bound | The first inherits; the second is held and the Founder is told (a repeated paste never fans out a second delivery). |
| `m` differs between parts, or n > m, or the marker is not last | No inheritance. UNADDRESSED hold, Founder told. |
| Bound exceeded (more than 120 s) | No inheritance. UNADDRESSED hold, Founder told. |
| P's recipients cannot be delivered (offline, ambiguous seat, quota) | Inherited as they are, so M is held or retained exactly like P; it is never routed elsewhere. |
| Sender is not the Founder | The rule never applies. |

Interaction with the 4,000-character rule above: the two are independent and either one qualifying is enough; neither
widens the other. A message that carries a marker and also follows a 4,000+ character part is handled by whichever
rule matches first, and the result is the same inherited recipients.

**Where it would go, if the Founder approves building it.** The gateway's inbound path (`starq-bot-gateway.mjs`,
which already formats the `To:` line and the acknowledgement) and `room-structured-metadata.mjs`, the same two
live-only files as the rest of this design, plus an independent review before any live change.

**Interim rule until it exists** (Acting CE #19158): the Acting CE writes the recipient seat in the first line of
everything posted, and the Founder's `@claude#w1:p5` line is what wakes the Acting CE.

**Tests for the marker rule** (fixtures from the real records):
1. #19154 and #19155 as recorded (2,579 and 2,029 characters, 16 s apart): #19155 inherits `To: @claude#w1:p5` and
   would have woken that seat.
2. Each row of the failure table above: no inheritance, hold visible, Founder notice produced once, nothing delivered
   to any agent.
3. Boundaries: 119 s inherits, 121 s does not; `(2/2)` not last in the text does not count; n = 1 never inherits;
   n > m, m = 10 and a marker with spaces other than the allowed ones follow the stated pattern exactly.
4. A non-Founder sender with a marker never inherits.
5. A Founder message with no marker never inherits, whatever it says.
6. Replay over #18500 onward: the 36 Founder records change nowhere except #19155; #19154 and the other 34 are
   unchanged. (Verified by scan on 2026-11-12: only #19154 and #19155 carry a marker.)

## Where the change goes

| Piece | Where | Owner |
|---|---|---|
| Action text `UNADDRESSED…`, continuation rule | `room-structured-metadata.mjs` and `founderSendArgv` | live-only files outside version control (#18871) |
| Telegram reply for unaddressed messages | `starq-bot-gateway.mjs`, the acknowledgement near the inbound path | same |
| Durable hold for `UNADDRESSED` | receiver candidate `cefafce`, `routingTargets.recipientsFor` and the dispatcher hold branch | reviewed PASS by Codex (#19086) |
| Resolution on explicit follow-up | dispatcher reply-resolves-hold, already in PR #3 | PR #3 |

The live dispatcher (not PR #3) has no hold list for unaddressed records. Until PR #3 is the live
dispatcher, point 3, the Telegram reply, carries the whole fail-safe on its own and is the part
worth building first.

## Tests

1. Fixtures from real Room records: #18731, #18808, #19023 and #19077 are classified
   `UNADDRESSED`; #19024 is a continuation of #19023 (inherits its addressees, or is unaddressed with
   it); a message with `@codex` anywhere
   in its first line is unchanged.
2. A body that names "Codex" and "Claude" in prose without `@` routes to nobody and produces the
   unaddressed notice, never a recipient.
3. Continuation rule: true only with all four conditions; each condition failing alone returns
   false (29 s vs 31 s, 3,999 vs 4,000 characters, different sender, an `@handle` present).
4. The Telegram notice text is produced once per message and is not sent for addressed messages.
5. With the receiver candidate: the held message is listed, survives a dispatcher restart, and is
   delivered to exactly the seat named in the Founder's follow-up.
6. Replay over #18500+ changes no addressed record.

## Limits

- Nothing here can recover a message the Founder never learns was dropped before the fix is live.
- A continuation that arrives after 30 seconds, or a first part shorter than 4,000 characters, is
  treated as unaddressed and the Founder is told. That is the safe failure.
- The Founder's own habit remains the cheapest control: begin with `@codex`.

## Needed before code

Independent reviewer (not Ops); Founder confirmation that the gateway may send the "not delivered"
notice; the gateway and `room-structured-metadata.mjs` placed under version control so the change
can be reviewed as a diff (#18871).
