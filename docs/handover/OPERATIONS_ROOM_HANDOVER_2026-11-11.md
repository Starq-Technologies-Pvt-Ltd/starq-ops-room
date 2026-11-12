# Operations Room handover (current; refreshed 2026-11-12, file named for its first date)

From: Operations Room Deputy (Claude, Nitro Windows `w3:p1`, session `509bf943-f40a-463e-9912-6e8cc3a7ded3`). Current to
Room tail #19180 (2026-11-12). This is the **single current handover**: refreshed in place, no third dated copy. The
previous one is `OPERATIONS_ROOM_HANDOVER_2026-11-07.md`, kept as history. Read `docs/operations/FACTORY_STARTUP_SOP.md`
(Parts 0 to 10) first, then `docs/operations/COMMS_RECOVERY_RUNBOOK.md` if anything in communications is broken.

## As of 2026-11-12

| Item | State | Source |
|---|---|---|
| Acting Chief Engineer | Elder, Claude ERP seat `w1:p5`; Codex is the permanent Chief Engineer and was at his usage limit until about 2026-11-14 | #19096, SOP Part 2 |
| Founder holds | Push and merge of this handbook; PR #3 activation, receiver cutover, seat-table activation, replay; Vision's models and configuration; bridge retries; new project work packages | #19089, #19122, #19155, #19163, #19166 |
| StarqBot | gateway pids 38284 and 47608 (unchanged by today's changes); mirror of every record live; keeper task `StarqTech-StarqBot-Logon` Ready (logon and every 5 minutes) | status checks 2026-11-12 |
| Room dispatcher | pid 51700 (restarted once at 08:59Z by the keeper for the Vision wake change); state `state\room-dispatch-codex-live` | #19179 |
| Ingress stale-lock guard | live since 2026-11-12 (#19153); rollback ready | incident file |
| Owner-addressing sender fix | revision 3 live (#19116) | |
| Vision terminal | Herdr `w1:p0`, routed to `vision`; wake verified (#19178) | #19179 |
| Vision's four specialists | blocked: their model's free period ended; the Founder is recovering inference himself; bridge has **NOT** passed real-host acceptance | #19161, #19163, #19166 |
| PR #3 receiver and seat table | reviewed PASS (#19138), rollback rehearsal accepted (#19146), **held** | |
| Starq Command | the Cloudroom desktop app was running (8 processes seen 2026-11-12). The lifecycle services (`ui 5173` ... `herdr 5179`) were last known down with `recover` refused by the closeout guard, which was not bypassed; **not rechecked in this refresh: UNVERIFIED now** | `AGENTS.md` procedure |
| Unattended startup after a Nitro reboot | **UNVERIFIED**: no reboot test has been run | SOP Part 8 |

## Mandate

Room #18903 (task `FOUNDER-OPS-STARTUP-20261111`), hierarchy in #18912 (supersedes #18905) and #19096, #19144, #19154,
#19155: this seat is Operations Deputy / Communications Engineering Lead ("Communications, routing, infrastructure and
operational continuity", #19144). It owns this repository and its documentation, and, under #19154 and #19155, the
consolidation of the authoritative SOP; the Acting Chief Engineer reviews and resolves inconsistencies. Completion and
blockers go to the Acting Chief Engineer through Room. Merges and releases stay with the Founder.

## Recovering this seat in a new session

1. Complete the startup gate in `D:\StarqTech\AGENTS.md`. Post as `claude` with the harness session ID as `--instance`.
2. Bind by pane `w3:p1` and the harness session ID. Herdr may list this pane under an older session value; do not trust it.
3. Read this file, then the newest file in `docs/journal/`.
4. Read Room from the last sequence the journal names, through `readRoomSnapshot()`.
5. Check infrastructure read-only (SOP Part 8, step 1) and compare with the table above.
6. Scratch files stay under `D:\StarqTech` (a worktree or `D:\StarqTech\scratch`); never the harness temp directory and never `D:\!starq`.

## Repository state

| Checkout | Branch | Head |
|---|---|---|
| `D:\StarqTech\starq-ops-room` | `main` = `origin/main` | `2d56dd4` |
| `.worktrees\starq-ops-room-durable-foundation` | PR #3 branch | `99fe117` (open, mergeable, reviewed, held) |
| `.worktrees\starq-ops-room-sender-fix-pr3` | `claude/pr3-owner-routing-reconcile-20261111` (receiver candidate) | `cefafce` |
| `.worktrees\starq-ops-room-v2-protocol` | PR #4 branch | `acd8e4b` (open, unreviewed, preserved) |
| `.worktrees\starq-ops-room-ops-records` | `claude/ops-records-20261111`, **PR #5** (these records) | local, 30 commits ahead of GitHub's `4350bbc`; see below |

**Unpublished work.** The harness at this pane denies `git push`; the Founder holds the push and merge of this
consolidation for his review (#19155 item 5). Check `git status -sb` and the commit list below before publication.

**Commit authors for the publication review (decision for the Founder, flagged by the Acting CE in #19162).** Of the 30
unpublished commits, 6 carry the author name `Mustarq` (made with the machine's default Git identity after a session
reset): `6dc3be0`, `20cd01b`, `fc62d68`, `3efc68a`, `ef6079f`, `4ba5293`. 23 carry `Claude (Ops Room Deputy)` (the name used
before the Acting CE specified `Claude (Operations Deputy)`), and 1 carries `Claude (Operations Deputy)`. The Durable
Engineering Activity standard asks for the real contributor. Nothing was rewritten; the Founder chooses between leaving
the unpublished history as it is, or correcting the author on the unpublished commits before the first push. New commits
use `Claude (Operations Deputy)` and the Standard A email with a `Co-Authored-By` trailer for the actual model.

## Policy conflicts and the Acting CE's rulings (#19184; Ops flagged them, the Acting CE resolved or referred them)

Rulings: 1 follow #19144 and keep the contract's schemas; 2 follow #19166 (the split is the adopted organization; no running
session migrated); 3 confirmed on that reading, but see the note below; 4 Vision's SOP stays Vision's file, Ops does not
edit it, flag it to the Founder; 5 follow #19154 (no additional hosts), JARVIS and FORGE stay as departments; 6 follow the
stricter, later #19132; 7 AGENTS.md is outside this repository and will not be edited: list the pointer as a Founder
decision with exact wording. The commit-author correction is accepted and the list stays for the Founder's choice.
Note on ruling 3: it counts my #19174 as the assessment #19164 asked for. #19174 covers the Room-to-Herdr wake only;
session ownership, gateway compatibility and Command-versus-Herdr surface conflicts beyond the wake have not been
assessed by Ops, and the SOP says so. The original conflict list follows.

1. Cloudroom to Herdr contract §1 (Cloudroom prepares the package; "Repeat" selects the next task) versus Founder #19144
   (Elder prepares and dispatches through Room; the next task starts only when the Founder initiates it). Handled in SOP
   Part 4 by following #19144; the contract's package and receipt schemas are kept.
2. Contract §1 and standard §5 ("Vision has no Herdr pane and does not need one") versus Founder #19164 and #19166 (Herdr
   Vision, `w1:p0`). Handled in SOP Part 6.
3. #19164 ("proposed, not authorization to migrate or change running sessions", assess first) versus #19166 ("Proceed with
   our planned separation"). Recorded as: the role split is the adopted organization; no running session is migrated until
   the Acting CE's assessment is done. Please confirm that reading.
4. Vision's own `PROJECT-MANAGEMENT-SOP.md` (read-only; not edited): it makes Cloudroom the authoritative surface and
   names Vision "Project Manager and Official Verifier" on one surface; it does not describe the Command PM and Herdr
   Verifier split or stage 5 and 7 of the 8-stage lifecycle. Its 2026-11-07 bridge warning is already marked superseded
   inside the file. Vision reported the same gaps itself (#19165 section 5). Vision reconciles its own file; Ops lists the
   gaps.
5. #19096 told Elder to coordinate JARVIS, FORGE and other nodes; #19154 says not to expand to additional hosts. The later
   decision is followed (SOP Part 2).
6. #19122 item 3 authorized controlled cleanup of confirmed idle resources; #19132 says no WSL restart or disruptive cleanup
   without further authorization. The stricter later one is followed.
7. `D:\StarqTech\AGENTS.md` (outside this repository) does not mention the Acting Chief Engineer arrangement; a session that
   reads only AGENTS.md would take Codex as the active Chief Engineer. SOP Part 0 and Part 2 cover it; adding a pointer in
   AGENTS.md is a change outside this repository and needs authorization.

## For the Founder's publication review (pieces of the readiness package, #19155 item 5)

The Acting CE assembles the final package; these are the Operations parts, as of this draft.
1. **Commit authors** (list above): leave the unpublished history as it is, or correct the author on the unpublished commits
   before the first push. Ops rewrote nothing.
2. **AGENTS.md pointer** (a file outside this repository; the Founder decides). Proposed wording, to add under the Codex
   role section: "Acting Chief Engineer (Founder #19096, 2026-11-11). While Codex is at his usage limit, Elder (the Claude
   seat at Herdr `w1:p5`) is Acting Chief Engineer and Project Director with company-wide orchestration. Codex remains
   the permanent Chief Engineer and his decisions stand. The arrangement lasts until the Founder says Codex has resumed.
   The operating handbook is the `starq-ops-room` repository, `docs/operations/FACTORY_STARTUP_SOP.md`; read it with
   this file."
3. **Vision's own `PROJECT-MANAGEMENT-SOP.md`** does not describe the Command PM and Herdr Verifier split or lifecycle
   stages 5 and 7; Vision reconciles it (Vision reported the same gaps in #19165).
4. **Decisions still held:** PR #3 activation, the Telegram "not delivered" notice, Vision's specialists' model recovery,
   publication of this handbook; and the **unverified** items: unattended startup after a reboot (never tested), the
   Cloudroom board records behind each task key, Deadpool's scope.
5. **Independent review:** OpenCode reviews the draft (#19184); its verdict and any corrections are part of the package.

## Known communications defects (status 2026-11-12)

1. Founder messages with no `@handle` wake nobody and the Founder is not told; split messages are a variant (#19154 and
   #19155). Designs and the marker candidate are in `docs/design/FOUNDER_UNADDRESSED_MESSAGE_DESIGN.md`; the Telegram notice
   needs the Founder's decision. **Open.**
2. The Deadpool relay re-derives recipients without routing metadata; owner decision open (`docs/design/DEADPOOL_FAILOVER_SENDER_DESIGN.md`).
3. WSL delivery backend is unverified; the live dispatcher discovers Windows panes only. **Held.**
4. The `claude` handle is shared by three seats and `antigravity` by two; a bare mention is held, not defaulted (#19034).
5. Herdr session values drift after restarts; bind by pane plus the harness's own session id.
6. Seat capacity is invisible to the dispatcher (`docs/design/SEAT_CAPACITY_GATE_DESIGN.md`). **Design only.**
7. The StarqBot logon task now exists and ran last at 13:57 local with result 0; **unattended startup after a reboot is still
   unproven** (no reboot test).
8. Herdr completion signal fails on XPS and works on Fold 4; out of scope now.
9. A long Room body was cut off silently once (#18912): read long posts back.
10. Vision's department: blocked by the specialists' expired model (`docs/incidents/2026-11-12-vision-specialists-model-expired.md`).
11. The dispatcher is supervised by the keeper (a restart through it was done on 2026-11-12, #19179).
12. Fixed on 2026-11-12: Room writes blocked by a dead process's lock (`docs/incidents/2026-11-12-ingress-lock-held-by-dead-process.md`);
    Herdr kind `hermes` routed to `deadpool` (runbook, "Herdr agent kind to handle mapping").
13. Quote no handle in a body you do not mean to address; copy `--reply-to` event ids in full (SOP Part 7, Decisions log).

## Reviews and held items

- PR #204 (StarqERP, head `808ad84b`): independent verification waits for the department bridge.
- HOA-253 (Hoadhaa), candidate `4edf2dab`: verification waits for the bridge; PR #8 preserved as a draft.
- PR #3, the receiver candidate `cefafce`, seat-table patch v3 (`1dda9fa304a812a6`) and the rollback plan: independent review done
  (OpenCode #19138), rehearsal accepted (#19146); activation needs a verified readiness report and the Founder's separate
  authorization (#19089, #19122).
- The Command Vision and Herdr Vision assessment (#19164) is with the Acting CE.

## Pending for this seat

- Continue the SOP consolidation per #19162 and #19170 (this refresh is part of it); post a short progress record when the
  draft is ready for the independent reviewer the Acting CE will name. Hold every push and merge.
- Fold in the Acting CE's answers to the conflicts above and the Vision assessment.
- Nothing else is assigned. No new commercial project package starts until the Founder initiates it in Command.

## Other hosts and out-of-scope items

Out of scope for now (#19154): XPS/JARVIS, Fold 4/FORGE and other hosts. Earlier notes: XPS is reachable two-way with
JARVIS heading six on-demand profiles and no StarqERP GitHub access (#18912); Fold 4's FORGE was ready, supplementary only
(#18915). Deadpool and the WSL Claude: Deadpool's scope is UNVERIFIED until its inventory (#19088) arrives.

## Task stage table (Command, Room, Herdr lifecycle; Founder #19144)

Standard: `docs/operations/FACTORY_STARTUP_SOP.md`, Part 4. Seeded 2026-11-12 from Acting CE #19145 section 1 and the Room
records cited on each line; no stage is advanced beyond what those records say. Task keys (ERP-465, HOA-253, HOA-255,
ERP-543) are written as Room writes them, and `none in Room` where Room gives none. **The Cloudroom board record behind
each key is UNVERIFIED:** `room-cli` (checked 2026-11-12) exposes projects and threads, not board task records, and no
thread was read. Updated 2026-11-12 after #19161 to #19180.

- [ERP-465 (PR #204) | Room #19122, #19145, #19165 | evidence: PR #204 head `808ad84b829e37a300778aef5d79a66d6280f814`, CI 5 of 5 green per Vision's report] stage 4/8 results and evidence returned: built and CI green; stage 6 (verification) waits for the department bridge.
- [VISION-BRIDGE-REPAIR (Room task tag; Cloudroom ID none in Room) | Room #19109, #19113, #19122, #19123, #19134, #19136, #19137, #19159, #19161, #19163, #19166 | evidence: `D:\StarqTech\_worktrees\vision-hermes-bridge-repair-20261108`, run copy `D:\StarqTech\scratch\vision-bridge-e2e-20261112`, receipts there] stage 3/8 execution: repair built, pre-read PASS; real-host synthetic E2E stopped (profile_mismatch, then timeout) because the four specialists' model expired; the Founder is recovering inference; the bridge has NOT passed real-host acceptance; no retries until he confirms.
- [HOA-253 and Hoadhaa PR #8 (task key HOA-253 as written in Room) | Room #19122, #19124, #19131, #19145 | evidence: candidate `4edf2da` on `room/hoa-253-hoa-218-wp-1-search-through-grap-s5jg`; PR #8 head `49fd4ad`] stage 6/8 blocked: verification waits on the bridge; AG's reconciliation (#19131, as cited in #19145; not read by Ops) says the candidate supersedes PR #8, and the draft is preserved (#19122 item 2).
- [HOA-255 (task key as written in Room) | Room #19145 | evidence: none cited in Room] stage 4/8: complete locally and awaiting review, per #19145.
- [ERP-543 / B8 | Room #19145 | evidence: none] stage 1/8 not started: waits for PR #204 and for the Founder to initiate it.
- [Operations infrastructure, not a project task: PR #3 and the sender fix | Room task COMMS-PR3-REVIEW-REHEARSAL | Room #19089, #19122 item 5, #19138, #19142, #19146 | evidence: `candidates/pr3-rollback-rehearsal`, `docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md`] reviewed change: OpenCode PASS, rehearsal accepted, activation on hold.
- [Operations infrastructure: ingress stale-lock guard | Room task COMMS-INGRESS-LOCK-GUARD | Room #19126, #19135, #19143, #19148, #19153 | evidence: `candidates/ingress-stale-lock`] **live** (#19153).
- [Operations infrastructure: Vision wake | Room task VISION-ROOM-WAKE-20261112 | Room #19170, #19173, #19175, #19176, #19178, #19179 | evidence: backup `agent-comms\backups\vision-wake-map-20261112T085809Z`] **live**; wake verified on `w1:p0`; Vision's own confirmation of receipt is with the Acting CE.
- [OPS-SOP-CONSOLIDATION-20261112 | Room #19154, #19155, #19156, #19160, #19162, #19170 | evidence: this repository, PR #5 branch] draft in progress; push and merge held.

## What this seat may do without asking

Documentation, journal, handover and incident records; designs and candidates; read-only status commands and Room reads;
local commits and a documentation-only branch.

## What needs authorisation

Any start or restart (StarqBot, Command, dispatcher, watchers); lock release; edits under `D:\StarqTech\agent-comms`
(a controlled change under a prior authorization, SOP Part 9); dispatcher, agent-map or seat-table changes; WSL routing;
code changes to PR #3 or PR #4; push, merge or deploy; takeover of a live lease; any change to Vision's models,
credentials, gateway or configuration (Founder only).

## Open decisions

Listed in `docs/operations/DECISIONS_AND_LESSONS_2026-11-10_to_12.md` ("Open") and in `docs/journal/2026-11-11.md` ("Open decisions").
