# PR #3 activation and rollback plan (amended)

Status: **PLAN. Nothing is activated.** Production activation is on HOLD pending separate Founder authorization
(Founder #19122 item 5). Amended after OpenCode's independent review (Room #19138, item 5): the original
rollback sketch in #19121 had the right order but left two things open, now closed below.

## Scope
Receiver candidate `cefafce` on PR #3 (`99fe117`), seat-table patch `28fb7de9cef4e3d2`, the pid refresh tool.
The live dispatcher today is `agent-comms\scripts\room-dispatcher.mjs` with state in
`agent-comms\state\room-dispatch-codex-live`. PR #3's dispatcher is a different code base with its own state
directory (it refuses the live agent-comms tree and the legacy `room-dispatch.json`).

## Amendment A: the state directory on rollback (decision made from the source, Acting CE #19139)
Evidence, read from both dispatchers' source on 2026-11-12:
- The PR #3 dispatcher requires an explicit isolated `--state-dir` and refuses the live agent-comms tree and the
  legacy `room-dispatch.json` (`assertIsolatedStateDir`); it writes only `room-dispatch.v2.json`, `.v2.log`
  and `.v2.lock` there (`deliveryStore.mjs`).
- The live dispatcher reads only `<its own dir>oom-dispatch.json` (`stateoom-dispatch-codex-live`), with
  `lastSeq`, `delivered`, `pending`, `held`. If `lastSeq` is null it seeds at the Room tail with no replay.
So the old dispatcher **cannot read the new state files**, and the new dispatcher **never writes the old directory**.
Restoring "the old state" is therefore a no-op: the old directory is still frozen at the cutover checkpoint. The real
risk is that the old dispatcher resumes at that stale `lastSeq` and re-plans every record since the cutover, which
the new receiver already delivered or held: duplicate wakes.
**Decision:** with the old dispatcher stopped, take a copy of the old `room-dispatch.json` (evidence), then set its
`lastSeq` to the current Room tail through `readRoomSnapshot()` and keep its `delivered`, `pending` and `held`
lists. The old dispatcher then resumes with checkpoint continuity and no replay. Do not delete the old or the new
state directory; both stay as evidence.
Consequences, written down:
- Records the new receiver delivered or held between cutover and rollback are not re-planned by the old dispatcher.
  Holds the new receiver created (UNADDRESSED, INVALID_ROUTING, ambiguous seat) are not understood by the old one;
  they stay visible in `room-dispatch.v2.json` and the rollback report lists them for the Ops seat to resolve by
  hand. Routing holds expire after 24 h (status `expired`, still recorded, no longer open): include them in the
  operator sweep.
- A record that arrived after the tail was read and before the old dispatcher started is covered, because the old
  dispatcher plans everything above `lastSeq` on its first poll.
- Alternative not chosen: deleting the old `room-dispatch.json` also gives "seed at the tail, no replay", but it
  drops the old `delivered` dedupe list and the 24 h retention list of offline seats.

## Amendment B: the backup is taken at activation, with hashes, before any cutover
Not "the saved dispatcher" of some earlier day. Immediately before the cutover step, in this order:
1. Confirm the dispatcher and keeper are healthy and the Room tail is clean (read through `readRoomSnapshot()`).
2. Create `agent-comms\backups\pr3-activation-<UTC timestamp>\` containing: the live `room-dispatcher.mjs`, a copy of
   the state directory `state\room-dispatch-codex-live`, the live seat/default files if any, and `SHA256SUMS` over
   all of them. Record the directory path and the hashes in Room in the activation record.
3. Only then change anything. A cutover without that Room record does not start.

## Activation sequence (for the Founder to authorize as one step)
1. Independent review: done (Room #19138 PASS on code; plan amended here).
2. Pid refresh: run `refresh-seat-pids.mjs` against the live panes into a new file; exit code 0 required (2 = a seat
   refused, stop). The stored pid is checked at every wake, so the refresh is re-run after any seat restart.
3. Backup per Amendment B.
4. Merge PR #3 and the candidate (separate Founder authorization), install the seat table and the receiver.
5. Start the PR #3 dispatcher with its own new state directory, no replay (first run seeds at the tail).
6. Checks: one addressed post wakes exactly its seat and no other; a post to a shared handle without a seat is held,
   not defaulted; an unaddressed post becomes a visible hold; the StarqBot mirror still shows each record once.

## Rollback (timed in the rehearsal)
1. Stop the PR #3 dispatcher (the keeper must not restart it: disable that start first).
2. Restore the saved `room-dispatcher.mjs` from the activation backup; verify its sha256 against `SHA256SUMS`.
3. State (Amendment A): copy the old `room-dispatch.json` aside, set its `lastSeq` to the current Room tail, keep the
   rest. Keep the new `room-dispatch.v2.*` files in place.
4. Remove the seat table file from the active location.
5. Restart through the keeper task (`StarqTech-StarqBot-Logon`); verify one addressed post wakes only its seat.
6. Post the rollback record in Room with hashes, the held records left over, and the elapsed time.

## Limits
A scratch rehearsal proves the apply/revert procedure, the file fidelity and the timing. The keeper restart on the
live runtime and real pane wakes cannot be proven on a copy; they are activation-time facts and the reason step 6 of
activation and step 5 of the rollback exist.
