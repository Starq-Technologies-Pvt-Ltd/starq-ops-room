# Stale-lock guard for `withLock` (candidate, not deployed)

Room #19126 (Acting CE). **Candidate only: no live change.** Needs an independent review first.

## Incident
2026-11-12: pid 53228 died holding `agent-comms\locks\ingress.lock`. `withLock` has no stale-holder check
and gives up after 50 attempts (about one second), so every Room post failed until the file was removed by
hand. The ledger was intact (the acting CE verified the tail at #19122).

## Three defects in the live `withLock` (sha `ef9c84781e7831a3`, identical to the repo copy)
1. No stale-holder check.
2. The release unlinks the lock even if it is no longer ours (after a reclaim, that would delete another
   writer's live lock).
3. Any error other than `EEXIST` throws. On Windows, while another process is deleting the lock file,
   `open(wx)` reports `EPERM`, `EACCES` or `EBUSY` instead of `EEXIST`. Found by the stress test here, not by
   reading the code: a post racing a release can fail outright. Plus: the wait is a busy loop.

## Rules (see the header of `ingressLock.mjs`)
- Reclaim only when the holder is provably gone: dead pid and lock at least 2 s old; empty or garbled content
  at least 2 s old; or older than 30 s whatever the pid says (pid reuse; the critical section is milliseconds).
  A lock younger than 2 s is never reclaimed.
- Reclaims are serialized by an exclusive `<lock>.reap` file, and the reaper removes the lock only if its
  content is exactly what was judged stale. A dead reaper's file expires after 5 s.
- Release removes only our own lock. `EPERM`/`EACCES`/`EBUSY` count as contention and are retried.
- Waits up to 5 s with `Atomics.wait`, not a busy loop. The failure message keeps the prefix
  `Could not acquire ingress lock` and adds the holder pid and age. Every reclaim is logged to stderr.

## Evidence
`ingressLock.test.mjs`: 11 tests, 11 pass on three consecutive runs (2026-11-12), including the incident case
(dead holder, old lock), a young dead-holder lock left alone, a live holder never reclaimed, pid-reuse ceiling,
garbled lock, own-lock-only release, reaper serialization, and a stress run of 4 processes x 60 locked
increments with a dead lock planted first (240 of 240, no lost update, no leftover lock). Run with
`INGRESS_LOCK_TEST_DIR=<dir under D:\StarqTech\scratch> node --test ingressLock.test.mjs`.

`ingress-stale-lock.patch` (sha `568b7e9ac5acfb15`): two hunks in `protocol/v1/ingress.mjs` (import and a
`withLock` that delegates) plus the new file `protocol/v1/ingressLock.mjs`. It applies cleanly to a copy of the
live `ingress.mjs`; `node --check` ok. Not applied to anything live.

## Limits
- It cannot help a lock holder that is alive but hung for under 30 s; those posts wait, then fail with the
  holder named.
- Long-running processes that already loaded `ingress.mjs` (gateway, dispatcher) keep the old `withLock` until
  they restart; `send.mjs` picks it up on its next invocation.
- Residual, stated: the age ceiling would reclaim the lock of a live holder that is stuck for over 30 s; in
  that case the holder's own release then leaves the new lock alone (rule 3), so no live lock is deleted, but
  the stuck holder's write could interleave. The critical section is a single append, so this is not expected.

## Activation (only after review and authorization)
Back up `protocol/v1/ingress.mjs`, copy `ingressLock.mjs` beside it, apply the patch, run one `send.mjs` post,
and check no lock file remains. Rollback: restore the backup and delete `ingressLock.mjs`.

## LIVE since 2026-11-12 (Founder #19148, Acting CE #19149, result in Room)
Applied with `apply-live.sh` (phase1 backup, phase2 apply and test). Before: `ingress.mjs` `ef9c84781e7831a3`;
after: `ingress.mjs` `3a15ee3a57c1ad82`, `ingressLock.mjs` `2f100588e2c4af84`. Backup:
`D:\StarqTech\agent-comms\backups\ingress-lock-20261112T063304Z`. Live check: two racing posts (#19151, #19152),
no lock file left. Rollback: `rollback-live.sh <backup dir>`, no restart. The gateway and dispatcher keep the old
`withLock` until they restart. No dead lock is planted in the live locks folder (Acting CE gate).
