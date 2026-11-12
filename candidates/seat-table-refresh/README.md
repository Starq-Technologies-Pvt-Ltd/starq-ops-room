# Seat-table refresh for the PR #3 receiver candidate (Room #19112, #19114)

**Candidate, not applied.** Nothing here edits PR #3, the receiver branch, or any live file.

- `refresh-seat-pids.mjs`: reads each Windows seat's pid from live `herdr pane process-info`, and takes it
  **only** when the pane's foreground process is that seat's own harness (codex.exe, claude.exe, agy.exe,
  Cursor's PowerShell running cursor-agent). A live process of the wrong kind is refused: two stale pids of
  the shipped table were alive as `crashpad_handler` and `MSPCManagerService`. No match, several matches or an
  unknown harness means REFUSED and the pid is left alone. Never edits in place; WSL seats are skipped.
  5 tests pass. Run against the live panes on 2026-11-12: all six Windows seats UPDATED, exit 0.
- Patch (outside git, next to the other candidate patches):
  `D:\StarqTech\.worktrees\_patches\pr3-seat-table-refresh-20261112.patch`, sha `1e8a28d1f94e07ef`, applies
  cleanly to a pristine export of receiver head `cefafce`. It supersedes
  `pr3-seat-table-ops-refresh-20261111.patch` and `pr3-seat-table-cursor-default-20261111.patch`.

## What the patch changes

| Row | Change | Evidence |
|---|---|---|
| all six Windows seats | `pid` from the refresh tool | live process-info 2026-11-12 |
| `ops-room-deputy` | instance `509bf943-…`, enrollmentSeq 18895 | first post under that instance |
| `erp-floor-lead` | instance `claude-herdr-w1p5-ce2c1fda`, enrollmentSeq 18877 | Cursor's finding, #19112 |
| `hoadhaa-lead` | instance `95a400c8-0085-4aba-b14c-fdcaf7ed87d8`, enrollmentSeq 18892 | Cursor's finding; #18891 is the lease-takeover notice, #18892 the first genuine post |
| `erp-cursor` | `default` true | single seat; claude and antigravity stay unflagged (Founder #19034) |
| test `room-backlog-report` | pins the refreshed instances and "defaults only on codex and cursor" | the old test pinned the previous Ops instance |

## Checks, with the real PR #3 functions

- `validateSeatTable`: ok. `verifySeatEnrollment` against the live Room: OK for all six Windows seats.
- `verifySeatBinding` against live `agent list` and `process-info`: OK for five; `erp-antigravity` reports
  SEAT_NEVER_WAKE, which is its table entry's own setting.
- Full PR #3 candidate suite with the patch applied: 129/129. The branch was reverted afterwards and is clean
  at `cefafce`.

## Not changed, found on the way

- The `codex-chief-engineer` row still names instance `01a1c4c0-…` (last used #18871); Codex's current posts
  carry `codex-herdr-w1p1-20261107`. PR #3's self-exclusion compares instances, so this needs the same
  correction before activation. Not in the findings list of #19114, so left alone and reported.
- The pid is still required by PR #3's validation and is checked live at every delivery; this tool is the
  activation-time refresh, and any later restart needs it again.

## Update 2026-11-12 (Acting CE, Room #19118)

The stale `codex-chief-engineer` row is folded in: instance `codex-herdr-w1p1-20261107`, enrollment
Room #18461 (the first Codex record under that instance; the earlier `01a1c4c0` instance last posted
#18871). Current patch: `D:\StarqTech\.worktrees\_patches\pr3-seat-table-refresh-codexrow-20261112.patch`,
sha `28fb7de9cef4e3d2` (2 files; it supersedes `1e8a28d1f94e07ef`). Applies cleanly to pristine
`cefafce`; `validateSeatTable` ok; `verifySeatEnrollment` ok for all six Windows seats against the live
Room; full PR #3 suite 129/129 when run as CI does, with `COMMS_IDENTITIES_PATH=tests/fixtures/identities.json`
(without it 20 identity tests fail on a missing `protocol/v1/identities.json`, pristine branch included).
The refresh tool's refuse rules are unchanged.

Reading the pid live (Cursor's recommendation): `verifySeatBinding` already receives the pane's live
foreground processes at every wake and only compares them to the stored `seat.pid`. Replacing that
comparison with the harness matcher used here (`HARNESS_MATCHERS`) would remove the stored pid and the
re-run after every restart. Identity stays pinned by the enrollment record and instance, not by the pid.
Cost: a restarted harness in the same pane would pass the binding check without a table edit, which is the
intent. A PR #3 change, so not made here.
