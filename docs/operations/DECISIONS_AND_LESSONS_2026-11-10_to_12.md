# Decisions and lessons, 10 to 12 November 2026

Part 10 of `docs/operations/FACTORY_STARTUP_SOP.md`. A log, not policy: each row says what was decided, where, what it
changed and what it replaced. Every row cites the Room sequence it came from; the Room record is the authority and this
table is the index. Written by the Operations Room Deputy, 2026-11-12. Anything not verified is marked **UNVERIFIED**.

## Founder decisions

| Room | Date | Decision (short; the record has the full text) | Effect | Supersedes |
|---|---|---|---|---|
| #18905, #18912 | 11-11 | Leadership clarification, then hierarchy correction: Codex Chief Engineer; ERP Claude ERP floor lead; Antigravity Hoadhaa floor lead; Operations Claude Ops Deputy and Communications Engineering Lead; roles do not transfer authority across floors | SOP Part 2 | #18905 is superseded by #18912 where they differ |
| #18952, #18953 | 11-11 | StarqBot must be healthy before any session starts assigned work | SOP Part 8 step 1 | |
| #18981 | 11-11 | Save mode: Codex commands, leads execute, specialists assist, Operations Claude keeps continuity, Vision verifies | SOP Part 2 last rule | |
| #19034 | 11-11 | Ambiguous shared handles stay on HOLD; use registered exact seats; no arbitrary defaults | dispatcher holds `claude` and `antigravity` when bare; seat table has defaults only on single-seat handles | |
| #19089 | 11-11 | Sender fix may proceed under the documented review, controlled application and rollback; PR #3 receiver stays isolated, refresh the enrollment, independent review; WSL routing outside activation scope; no merge, production cutover or historical replay without a verified readiness report and explicit authorization; assign owners for no-handle Founder addressing and quota-blocked seats | SOP Part 7 held list | |
| #19096 | 11-11 | Claude (ERP Claude, the Elder seat) is Acting Chief Engineer and Project Director while Codex is at his usage limit, with company-wide orchestration; Operations Claude keeps communications, infrastructure, documentation and continuity | SOP Part 2 | the single chain "Founder, Codex, Floor Lead" |
| #19122 | 11-12 | PR #204 waits for the repaired bridge E2E and Vision's acceptance; Hoadhaa PR #8 reconciled against HOA-253, draft preserved; controlled cleanup of confirmed idle resources only; synthetic-only real-host bridge E2E authorized; independent review of PR #3 and a rollback rehearsal authorized, **activation on HOLD** | OpenCode review #19138, rehearsal #19142 | |
| #19132 | 11-12 | Priorities: complete the bridge E2E, get PR #8 reconciliation, complete PR #3 review and rehearsal; preserve sessions, manage RAM conservatively, no WSL restart; delegate the ingress-lock safeguard design to Operations Claude | ingress guard candidate #19135 | |
| #19144 | 11-12 | The Command, Room, Herdr operating workflow and the 8-stage Founder-initiated task lifecycle; "Command directs. Room connects. Herdr executes. Vision verifies. Founder accepts."; no new StarqERP or Hoadhaa packages independently; scope: existing Nitro Windows and WSL, the two floors, Operations Room | SOP Parts 3 and 4 | contract §1 cycle, in part |
| #19148 | 11-12 | The reviewed ingress stale-lock safeguard is approved, applied by Operations Claude with a verified backup, focused live test and rollback, no unnecessary restart | live #19153 | |
| #19154, #19155 | 11-12 | The Operations repository becomes the authoritative engineering handbook; Operations Claude owns it; Elder reviews; repository maintenance is not blocked by the commercial pause; **hold the final push and merge for the Founder's review**, with the readiness package he listed | this consolidation | the v0.1 startup draft |
| #19163 | 11-12 | The Founder restores Vision and its four specialists personally; do not change Vision's models or configuration; no further bridge retries until he confirms the department is operational | SOP Part 6 | |
| #19164 | 11-12 | Proposed: Command Vision (project manager) and Herdr Vision (verifier) on the same environment; assess feasibility, session ownership, gateway compatibility and conflicts; report a recommendation before implementation; not authorization to migrate running sessions | SOP Part 6, assessment open | "Vision has no Herdr pane" |
| #19166 | 11-12 | Proceed with the separation; incorporate it in the SOP and reconcile Vision's own SOP; keep Vision's identity, profiles and department; the four specialists stay blocked, the Founder is handling inference recovery; **do not claim the bridge passed real-host acceptance** | SOP Part 6 | |
| #19173 | 11-12 | A Room record addressed to Vision must reach its Herdr terminal `w1:p0` automatically, through the existing dispatcher; verify with a fresh controlled message | live #19179 | |

## Technical results of the period (each verified in Room)

| Room | Result |
|---|---|
| #19052, #19099, #19116 | Telegram delivery retried after a network failure and delivered once; owner-addressing sender fix live (revision 3 proven in #19116) |
| #19086, #19112, #19138, #19146 | PR #3 receiver and seat table: Codex PASS, Cursor PASS, OpenCode PASS on the code and CORRECTIONS-REQUIRED on the rollback plan (docs only), rehearsal accepted |
| #19126 to #19153 | Room writes blocked by a dead process's lock; guard designed (#19135), OpenCode PASS (#19143), live (#19153) |
| #19161 | Vision's four specialists cannot answer: their model's free period ended (HTTP 404); bridge E2E attempts #19134 and #19159 recorded; Founder handling recovery |
| #19174 to #19179 | Vision's terminal wired into the dispatcher (`hermes` mapped to `vision`); four wakes verified |
| #19158 | Marker-based continuation rule for split Founder messages, candidate only |

## Lessons, stated as rules (each came from a real event)

1. **Every post carries its Cloudroom task ID.** Without `--task`, a worker's completion did not close its task
   (`AGENTS.md`); the stage table makes gaps visible (#19145).
2. **One explicit recipient line per addressee, and no stray handles.** Quoting seat handles in a result woke another
   seat (#19031, corrected in #19032), and #19174 quoted two handles in prose and addressed both.
3. **`--reply-to` is a real event id, copied in full.** A guessed id was stored without complaint and broke a thread
   (#19048 corrected in #19049; #19179 corrected in #19180). `send.mjs` checks presence only.
4. **A Room post is not proof of delivery, and a live check is not a live check unless it exercises the live path.** My
   post #19102 stored as context, and I called it a live check when it was not; retracted in #19103 and fixed (#19116).
5. **Check for a stale lock before assuming Room is down.** A lock held by a dead pid blocked every post for minutes
   (#19126); the guard now heals new writers, but processes that loaded the old code keep it until they restart.
6. **Verify the live pane, process and session before any dispatch**, and check what an agent kind maps to before enrolling
   a pane: `hermes` mapped to `deadpool`, so records addressed to Deadpool reached Vision's pane (#19060, #19088 at
   06:47Z on 2026-11-12) until fixed.
7. **A message the system cannot route is silently lost.** Founder messages with no `@handle` (five real instructions
   since #18500, and #19155 on 2026-11-12) wake nobody. Interim practice: the recipient seat on the first line of every
   post. Candidate rules are in `FOUNDER_UNADDRESSED_MESSAGE_DESIGN.md`, held.
8. **Herdr's `agent_status` is not capacity.** Codex and Copilot read as available while out of quota (#19044, design
   `SEAT_CAPACITY_GATE_DESIGN.md`).
9. **State what a rehearsal's first failure was.** My rollback rehearsal first reported a fidelity failure caused by my
   own hash function counting a `.git` folder, not by the candidate (#19142); report harness faults as harness faults.
10. **Audit claims need the same evidence as the system they audit.** My Deadpool relay audit missed a profile job and was
    corrected after #19058.
11. **Scratch stays under `D:\StarqTech`.** A POSIX shell's `/tmp` is outside it; a first draft of a live-apply script
    used it and was fixed before it ran.
12. **Hold what the Founder holds.** PR #3 activation, the push and the merge of this handbook, bridge retries and
    Vision's configuration are all on hold by decision; "ready" is a report, not an authorization.

## Open at 2026-11-12 (see the handover for the current state)
- Unattended Nitro startup after a reboot: **UNVERIFIED** (no reboot test has been run).
- PR #3 activation, the seat capacity gate, no-handle Founder routing, the Telegram "not delivered" notice, WSL routing:
  held, each needing separate Founder authorization.
- Vision's specialists' model recovery and the Command/Herdr Vision assessment: Founder and Acting CE.
- The Ops commits are local only; the Founder decides whether the unpublished history keeps the author name "Mustarq"
  or is corrected before the first push (handover lists the commits).
