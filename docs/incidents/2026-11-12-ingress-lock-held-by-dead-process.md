# Room writes blocked by an ingress lock held by a dead process (2026-11-12)

Status: **RESOLVED for new Room writers** (guard live, Room #19153); one limit remains open (below).
Recorded by the Operations Room Deputy. Room: #19126, #19132, #19135, #19143, #19148, #19149, #19150 to #19153.

## What was observed

A process (pid 53228) died while holding `agent-comms\locks\ingress.lock`. `withLock` in
`agent-comms\protocol\v1\ingress.mjs` retried 50 times (about one second) and then failed, so every Room post failed with
"Could not acquire ingress lock after 50 attempts" for a few minutes (Acting CE, #19126). My own first acknowledgment of
#19125 failed this way and was posted again afterwards. The Acting CE confirmed the holder was dead and the ledger intact
at #19122 with a clean tail, then removed that one lock file; posting worked immediately. Nothing else was touched.

## Cause

The live `withLock` (sha `ef9c84781e7831a3`) had three defects, found when the guard was written:
1. No stale-holder check, so a lock whose owner died was never released.
2. Release removed the lock file unconditionally, even if it was no longer the writer's own.
3. Any error other than "already exists" threw. On Windows, while another process is deleting the lock file, an open
   attempt reports a permission or busy error instead, so a post racing a release could fail with no dead holder at all.
   This one was found by a stress test, not by reading the code. The wait was also a busy loop.

## Fix

Guard designed as a candidate (`candidates/ingress-stale-lock`, #19135), independently reviewed PASS (OpenCode #19143),
approved by the Founder (#19148), applied live by Operations Claude (#19149 to #19153): a lock is reclaimed only when its
holder is provably gone (dead pid and at least 2 seconds old; garbled and at least 2 seconds old; or older than 30
seconds whatever the pid), reclaiming is serialized, release removes only the writer's own lock, and the contention
errors are retried. Live check: two senders posting at the same moment, #19151 and #19152, both stored, no lock file left.
Live file `ingress.mjs` `ef9c84781e7831a3` to `3a15ee3a57c1ad82`, new `ingressLock.mjs` `2f100588e2c4af84`; backup
`agent-comms\backups\ingress-lock-20261112T063304Z`. Rollback: `candidates/ingress-stale-lock/rollback-live.sh`, no restart.

## Open limits (disclosed, not hidden)

- A holder that is alive but hung for under 30 seconds is not rescued: the post waits up to 5 seconds and then fails,
  naming the holder (pid and age).
- A process that loaded the old `ingress.mjs` before the change keeps the old behaviour until it restarts. New `send.mjs`
  runs already use the guard. Whether the gateway holds its own copy is **UNVERIFIED**.
- OpenCode noted a microseconds-wide residual window in the reclaim (between its last check and the delete) that a
  rename-based takeover would close; judged acceptable for a one-append critical section.

## What to do if it happens again

Look at `agent-comms\locks\ingress.lock`: if its recorded pid is not running, a new post now clears it itself after two
seconds. If posts still fail, check that the failing process loaded the new code, and report the exact message; do not
delete a lock whose pid is alive.
