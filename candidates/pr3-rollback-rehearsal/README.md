# PR #3 rollback rehearsal (2026-11-12, Room #19125, #19138, #19139)

Scratch-only: pristine `git archive` exports under `D:\StarqTech\scratch\ops-rehearsal-20261112`. No live file was
written; the only live file read is `agent-comms\scripts\room-dispatcher.mjs` (hashed and copied as the stand-in).
Run again with `bash rehearse.sh` (needs `advance-lastseq.cjs` beside it); `evidence.txt` is the output of the run
quoted in Room. The plan it follows is `docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md`.

`pr3-seat-table-refresh-v3-20261112.patch` (sha `1dda9fa304a812a6`) differs from the reviewed `28fb7de9cef4e3d2` only
in the erp-floor-lead evidence text (OpenCode's cosmetic point). Applies cleanly to pristine `cefafce`.

Honest note on the first run: the fidelity check reported FAIL because my hash function counted the `.git` folder I
had created in the working copy; fixed (excluded `.git`), rerun, now a real comparison. An inline `node -e` for the
state step also broke on an escaped newline and was moved to `advance-lastseq.cjs`.
