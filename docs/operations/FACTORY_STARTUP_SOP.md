# Starq Technologies Engineering Operating Handbook (Factory Startup SOP)

Status: **DRAFT v0.2 (2026-11-12), consolidation under Founder #19154 and #19155, assigned by the Acting Chief
Engineer in #19156 and #19162.** Written by the Operations Room Deputy. Not yet independently reviewed. The push and
the merge of this draft are held for the Founder's review (#19155 item 5).

This is the first operational reference for Codex, every Acting Chief Engineer, deputies and Floor Leads. A fresh
leadership session should be able to recover how Starq operates from this repository without any chat memory. It
points to the governing rules and does not replace them: where this file and an authority in Part 1 disagree, the
authority wins and this file is corrected. Every statement is tied to a Room sequence (`#n`), a file or a command.
Anything Ops could not verify is marked **UNVERIFIED**; nothing is guessed. The file keeps its path because Room records
cite it. It supersedes the v0.1 startup draft; what changed is listed in the "Superseded by" table at the end.

Document map: `README.md` (index and reading order), this file (the spine), `docs/operations/COMMS_RECOVERY_RUNBOOK.md`
(recovery), `docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md` (held activation), `docs/operations/DECISIONS_AND_LESSONS_2026-11-10_to_12.md`
(Part 10), `docs/handover/OPERATIONS_ROOM_HANDOVER_2026-11-11.md` (the current handover and the task stage table),
`docs/journal/` (daily record), `docs/incidents/` (what broke and how), `docs/design/` (held designs).

## Part 0. Recover from zero

Read in this order, then verify live. Do not rely on a prior session's memory or on a pane label.

1. `D:\StarqTech\AGENTS.md`: session startup gate, task ACK, Room-first rules, StarqBot and Command checks.
2. This file, then the current handover (`docs/handover/OPERATIONS_ROOM_HANDOVER_2026-11-11.md`, the single current
   handover, refreshed in place) and the latest journal.
3. `docs/operations/COMMS_RECOVERY_RUNBOOK.md` when anything in communications is broken.
4. The Room tail through `readRoomSnapshot()` only (never `room.jsonl` directly). Search history with Starq Recall
   where it is accessible (`AGENTS.md`), and cite the sequence.

Verify live before acting (read-only; each is a command or file named in this handbook):
- Room reader returns `state: OK`, `stable: true`.
- StarqBot gateway: `node agent-comms\scripts\gateway-supervisor.mjs --status` (Part 8).
- Dispatcher and gateway running: `agent-comms\scripts\keep-starq-comms.ps1 -StatusOnly` reports each (read-only).
- Panes: `herdr agent list` for what is really running, and the seat you are about to address. A seat counts only when
  it has posted its own record for the current session (Part 8).
- Quota: Herdr's `agent_status` does not show whether an account can run (Part 7, quota-aware delegation).
- Whether Codex is back (he was at his usage limit until about 2026-11-14), which decides who the Chief Engineer seat is
  (Part 2).

## Part 1. Authorities and precedence

| Subject | Authority |
|---|---|
| Founder direction | Room records from `@mustarq`; the Founder's decisions of 2026-11-10 to 12 are quoted in Part 10 |
| Roles and boundaries | corporate-library Chapter 22, "Development Studio Governance Charter" |
| Session startup gate, task ACK, cadence, floor-lead role | `D:\StarqTech\AGENTS.md` (Founder #15794 and later) |
| Canonical handles | `agent-comms/protocol/v1/identities.json` plus the live Room assignment |
| Room-first coordination and metadata | Room directives #10664, #10665 |
| Durable engineering activity (Room, GitHub, Cloudroom) | `projects/starqerp/docs/governance/DURABLE_ENGINEERING_ACTIVITY_STANDARD_2026-11-06.md` (#18319) |
| Cloudroom to Herdr handoff, package and receipt | `projects/starqerp/docs/governance/CLOUDROOM_HERDR_HANDOFF_CONTRACT_2026-11-06.md` (#18325, #18326), as amended by Part 4 |
| Vision's verification procedure | `D:\AgentRuntimes\Hermes\profiles\vision\workspace\department\PROJECT-MANAGEMENT-SOP.md` (Vision's own file; read-only for Ops) |
| Git commit identity | Git Identity Standard A (Founder; context in #18538) |
| Current hierarchy | #18905, #18912, #19096, #19144 (Part 2) |
| Task lifecycle | Founder #19144 (Part 4) |
| Operations repository as the engineering handbook | Founder #19154 and #19155 |

Precedence when two disagree: a newer Founder decision in Room beats an older document; `AGENTS.md` beats this handbook;
an authority document beats a design or a candidate. A conflict between a Founder decision and existing text is flagged
to the Acting Chief Engineer, who resolves it; it is never settled silently. Open conflicts of this kind are listed in
the handover under "Policy conflicts for the Acting CE".

## Part 2. Organization and responsibilities

### Who does what

The Founder's own wording, from #19144 (2026-11-12):

- Codex: Permanent Chief Engineer.
- You, Elder: Deputy and Acting Chief Engineer, coordinating both environments.
- ERP Antigravity: ERP execution deputy and engineering team coordinator.
- Hoadhaa AG: Hoadhaa Floor Lead.
- Operations Claude: Communications, routing, infrastructure and operational continuity.
- WSL Claude and specialists: Delegated engineering execution.
- Vision: Independent verification and project-board management.
- Deadpool: Monitoring and reporting.

Elder was appointed Acting Chief Engineer and Project Director in #19096 (2026-11-11) because Codex reached his usage
limit; the Acting CE is the ERP Claude seat (Herdr `w1:p5`, session instance `claude-herdr-w1p5-ce2c1fda`). The
appointment is company-wide orchestration "until Codex returns" and does not revoke any of Codex's decisions or
authority. The Founder's authority to Elder for Operations engineering (#19155 item 4): direct Operations engineering,
approve bounded technical corrections, organize independent reviews and maintain operational continuity. Product
floors keep their leads: StarqERP and Hoadhaa "remain under their existing Floor Leads" (#19154 item 1).

Earlier role clarification, still in force (#18905): each lead owns day-to-day coordination only within the named floor
or role and reports to Codex or the Founder through Room; roles do not transfer product or task authority across
floors or change task assignments, review gates, or merge and release authorization.

### Seats as of 2026-11-12 (source: `herdr agent list`, Room records cited; recheck before use)

| Pane | Agent | Role | Source |
|---|---|---|---|
| `w1:p1` | Codex | Permanent Chief Engineer; at his usage limit (the pane banner says to retry 2026-11-14 12:55 AM) | `docs/design/SEAT_CAPACITY_GATE_DESIGN.md`, #19096 |
| `w1:p5` | Claude "Elder" (ERP Claude) | Acting Chief Engineer and Project Director; ERP floor | #19096 |
| `w1:p3` | Antigravity (ERP) | ERP execution deputy | #19144 |
| `w2:p1` | Antigravity (Hoadhaa) | Hoadhaa Floor Lead | #18912 |
| `w3:p1` | Claude (Ops) | Operations Deputy and Communications Engineering Lead | #18912 |
| `w1:p0` | Hermes (Vision) | Vision's Herdr terminal: Herdr Vision, independent Verifier (Part 6); routed to `vision` from 2026-11-12 | #19166, #19173, #19179 |
| `w1:pY` | OpenCode | independent reviewer seat | #19113, #19138, #19143 |
| `w1:p6` | Cursor | executor and reviewer | #19112, #19123 |
| `w1:p7` | Copilot | risk-based specialist assurance (Part 9); about 99% of its plan was used on 2026-11-12 | standard §5, SEAT_CAPACITY_GATE_DESIGN |
| WSL `w1:p4` | Claude (WSL) | delegated engineering execution; the WSL Herdr is not covered by the live dispatcher | #19109 |
| WSL | Deadpool | monitoring and reporting; its current scope is **UNVERIFIED** until its inventory (#19088) arrives | #19162 |
| `w2:p2`, `w2:p4`, `w2:p5` | Devin, Goose, OMP | present in Herdr; their roles are **UNVERIFIED** (not established in the records Ops read) | `herdr agent list` |
| XPS `w1:p1` | JARVIS | Head of General Engineering Support: a department, retained; its host is out of scope | #18912 |
| Fold 4 `w1:p2` | FORGE | Head of X-Men Department, supplementary: a department, retained; its host is out of scope | #18912, #18915 |

Several seats post as `claude` and two as `antigravity`; address a seat by pane (Part 7). The default Chief Engineer seat
is Codex's when he is available; while he is out, the Acting CE holds the role and delegates execution. JARVIS and FORGE
stay as departments in the organization, with no new host work: other hosts and any expansion are out of scope for now
(#19154 item 6; Acting CE ruling #19184).

### Rules that hold regardless of who holds a role

- Direction travels down, reports travel up. A lead directs only the agents it owns. Every assignment has exactly one owner.
- Delegation is execution ownership. It does not transfer the delegating role's accountability [#18912, #18915].
- Merge, release and acceptance authority stays with the Founder (Part 9).
- An official corporate designation (Chapter 22) and an assignment-specific acting role are separate facts; never infer
  one from the other.
- Save mode (#18981), still the working practice: the leader commands and spends capacity on direction and decisions;
  floor leads execute and report without being asked twice; Operations Claude consolidates handovers; the organization
  keeps working when one seat is at its limit. Escalate to the Chief Engineer only what needs his judgement and to the
  Founder only what needs Founder authority.

## Part 3. Architecture: Command, Cloudroom, Room, Herdr

```
Founder -- initiates --> Starq Command (Cloudroom): project conversations, board, child threads
                              | Elder prepares the work package
                              v
                         Room: the ledger (broker records, hash chain, ROOM-PROTO-1)  --mirror--> StarqBot --> Founder's Telegram
                              | dispatcher wakes only the addressed seat
                              v
                         Herdr: Nitro Windows and WSL panes: floor leads, deputies, workers, Herdr Vision
                              | results and evidence return through Room
                              v
                         Elder picks up in Command --> task child thread with Vision --> Vision verifies
                              --> Founder accepts --> Vision (PM) closes the board task and the thread
```

Command directs. Room connects. Herdr executes. Vision verifies. Founder accepts. (#19144)

- **Starq Command (Cloudroom)** is the management environment: the project conversations (StarqERP-Dev, Hoadhaa-Dev),
  the project board, and child threads. Cloudroom task records and thread lifecycle are authoritative for project
  management; GitHub, Room, Herdr and engineering artifacts are evidence (Vision's SOP, "Scope and sources"). Child
  threads for Vision review are created under the project headquarters thread with the `acp-hermes-agent` provider and
  attached to the task; precedents are #18611 (interim review dispatched), #18614 (verdict), #18639 and #18642. The
  Acting CE's `spawn-hermes-child` skill does this; **Ops has not read that skill: UNVERIFIED**. How Command runs on the
  host is in `AGENTS.md` (Command lifecycle commands, ports `ui 5173`, `pm 5176`, `data 5177`, `building 5178`,
  `herdr 5179`).
- **Room** is the communication bridge and the operational record: authorized work packages, assignments,
  acknowledgments, results and evidence, each with session attribution. It is an append-only ledger with a hash chain
  and one writer (`ingress.emitEvent`); records are read only through `readRoomSnapshot()`. ROOM-PROTO-1
  (`docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md`) decides what is an action: the body's `@handles` address, the
  action-required text names the owner.
- **Herdr** is the execution factory: panes and seats on the Nitro Windows host and the Nitro WSL host, floor leads,
  deputies, workers and specialists. Herdr's `agent_status` shows a process is busy, not that an account can run.
- **StarqBot** relays Room to the Founder's Telegram and the Founder's Telegram into Room. Every committed record is
  mirrored (`state\starq-bot-config.json`: `mirrorAll: true`), from a durable cursor; it is a system on the Windows host.
- **Three durable records, kept distinct** (standard §1): Room holds the operation, GitHub the output, Cloudroom the
  progress. Publishing a branch or a PR never authorizes a merge.
- **Hosts in scope now:** Nitro Windows and Nitro WSL, the two project floors, Operations Room (#19154 item 6). The live
  dispatcher discovers Windows panes only.

## Part 4. The task lifecycle (Founder-initiated)

Founder #19144 (2026-11-12): "Mandatory lifecycle for every project task".

| # | Stage | Who |
|---|---|---|
| 1 | The Founder initiates the task in its Command project conversation (StarqERP-Dev or Hoadhaa-Dev). | Founder |
| 2 | Elder prepares the work package and dispatches it through Room. | Elder (Acting Chief Engineer) |
| 3 | Herdr floor leads coordinate execution. | Floor leads |
| 4 | Completed work and evidence return through Room. | Floor leads, executors |
| 5 | Elder picks up the handover in Command and creates a task-specific child thread with Vision. | Elder |
| 6 | Vision independently verifies; Elder discusses the outcome and the final decision with the Founder. | Vision, Founder |
| 7 | After acceptance, Vision updates and closes the board task, and the child thread closes. | Vision |
| 8 | The next task starts only when the Founder initiates it through Command. | Founder |

Updated by #19164 and #19166: Vision is verifier in Herdr and project manager in Command (Part 6). The workflow line the
Acting CE recorded (#19170): Founder initiates in Command, Elder dispatches through Room, Herdr executes, results return
to Room, Vision verifies through Herdr, Elder discusses findings with the Founder in Command, Vision PM closes the task,
the board record and the child thread.

Rules for the records Ops keeps:
- **Stage line.** Every task in the journal or the handover carries one:
  `[<Cloudroom task ID> | Room #<seq>[, #<seq>...] | evidence <path>] stage <n>/8 <stage name>: <state, one sentence>`.
  The Cloudroom task ID is written `none in Room` where Room gives none; never invent one. The current table is in the
  handover ("Task stage table").
- **Evidence only from Room.** A stage is not advanced on a status label.
- **No self-started work.** Ops launches no StarqERP or Hoadhaa work package. Operations infrastructure changes (comms,
  routing, locks, mappings) are not project tasks; they run as reviewed changes with their own Room task tag and wait
  for Founder or Acting CE authorization (Part 9).
- **Do not claim what the Founder has not.** Until the department bridge is accepted, no record says it passed real-host
  acceptance (Part 6).

The older Cloudroom cycle ("Cloudroom prepares, Herdr executes, Cloudroom verifies, repeat") in the November 6 contract
differs in three places that #19144, #19164 and #19166 changed: who prepares the package (Elder, in Room), who starts the
next task (only the Founder), and whether Vision has a Herdr terminal (yes). Those are in the "Superseded by" table; the
contract's package and receipt content stays valid and is used in Part 5.

## Part 5. Work packages: from creation to return handover

1. **Create (stage 2).** Elder prepares the package. It must carry (contract §2): task identity (Cloudroom task ID and
   title); objective and bounded scope; reconciliation of existing implementations and GitHub history; verified
   dependencies; acceptance criteria and the evidence that closes them; the authorization reference (the Room sequence
   authorizing the work, and any Founder-reserved decision).
2. **Dispatch.** The full assignment is posted in Room under the sender's own identity with the Cloudroom task ID in
   `--task`. The pane gets only a short pointer to that Room sequence, signed with the sender's name
   (`AGENTS.md`). Name every recipient on its own `To:` line (Part 7).
3. **Acknowledge.** The assignee posts its own concise task ACK in Room (task reference, understood next action, any
   blocker) before starting. An ACK seen in a terminal, or relayed by a lead, is not the ACK [#18964, #18970].
4. **Execute.** One owner per assignment. Builder and reviewer are different agents (Part 9). Check the live pane,
   process and session before any dispatch (Part 8).
5. **Evidence and return (stage 4).** The result record in Room carries the delivery receipt (contract §3): the same task
   identity; GitHub output (commits, branches, PRs, correct contributor); test results; the independent review (reviewer
   identity and verdict, with Room references); acceptance mapping, each criterion to its evidence; and open items that
   need Founder authority, stated explicitly.
6. **Handover to Command (stage 5).** Elder reads the return in Room, checks the evidence, and creates the task-specific
   child thread with Vision.

Message tracking, mandatory from #18915: the sender of an assignment tracks five states and never treats an earlier one
as a later one.

| State | What proves it |
|---|---|
| Delivered | The Herdr agent surface accepted the prompt, or the Room record is stored and reads back complete |
| Working | The seat is observed working or blocked: Herdr state, or the live pane and process |
| ACK | The seat's own task ACK in Room, under its own identity [#18964, #18970] |
| Done | The seat's own result record in Room |
| Evidence | The commit, PR, file path or output the result names, checked by the receiver |

Procedure: put the full assignment in Room and send only a pointer to the pane; wait for an observed working, blocked or
settled state; read the completion output and confirm the ACK and result are in Room. If the prompt call returns
`agent_prompt_stalled` or no completion signal arrives: do not resend (it may be running), inspect the live pane and
process, wait and read the output, and record what was seen; only an inspected, confirmed non-delivery justifies a
second send, and that send says it is a retry (see `docs/incidents/2026-11-11-herdr-completion-notification.md`).

## Part 6. Vision: independent verification, review threads, board closure

**Role separation (Founder #19164, confirmed in #19166, acknowledged by Vision in #19167).** The same Vision, with the
same identity, profiles and department. No replacement system and no new department.
- **Command Vision (Project Manager):** task preparation, project boards, review-thread coordination, and closure after
  Founder acceptance.
- **Herdr Vision (Verifier):** independent engineering verification of delivered work and evidence-based verdicts
  returned through Room, specialist coordination.

Vision's terminal is Herdr `w1:p0` (kind `hermes`). From 2026-11-12 a Room record addressed to Vision wakes that pane
through the existing dispatcher (verified: #19178 woke `w1:p0`, #19179). The same established Vision environment
supports both roles (#19164). The Founder asked the Acting CE for an assessment of feasibility, session ownership,
gateway compatibility and conflicts between Vision's Command and Herdr surfaces, with a recommendation before any
implementation (#19164). Two Founder records bear on it and are both kept: #19164 called it a proposed arrangement and
"not authorization to migrate or change running sessions"; #19166, later the same day, says "Proceed with our planned
separation" and to incorporate it into this SOP. The Acting CE ruled (#19184): the role split is the adopted
organization, and no running session has been migrated or is to be reconfigured until the assessment is done. What is
done: the Room-to-Herdr wake for Vision's terminal (assessment #19174, implemented #19179). What is **not** covered by
that and has not been assessed by Ops: session ownership, gateway compatibility and conflicts between the Command and
Herdr operating surfaces beyond the wake (open; Ops has asked the Acting CE to confirm who owns it).

**Vision's own SOP stays Vision's file.** `PROJECT-MANAGEMENT-SOP.md` does not describe the split or stages 5 and 7;
Vision reconciles it, Ops does not edit it, and the gap is listed for the Founder in the readiness package
(Acting CE #19184 ruling 4).

**How verification runs** (Vision's `PROJECT-MANAGEMENT-SOP.md`, summarized; the file is the authority): bind the task
and thread explicitly (never by title); one correlated group review dispatched to the existing Hermes group through the
bridge; Sentinel, Evidence, Planner and Reporter each report their part; Vision matches the evidence to the acceptance
criteria independently, makes only supported routine board corrections, reports in the Cloudroom child thread and
records a durable receipt. Vision stops short of Done when independent review is pending, evidence is missing, a merge
is a gate, or Founder-reserved acceptance is outstanding.

**Bridge status, exactly as the Founder set it (#19163, #19166):** the four specialists are blocked by their expired
model; the Founder is handling the inference recovery himself; the department bridge has **NOT** passed real-host
acceptance. No document claims otherwise. Do not change Vision's models, credentials or configuration, and start no
bridge retries until the Founder confirms the department is operational. Root cause and evidence:
`docs/incidents/2026-11-12-vision-specialists-model-expired.md`. Until then PR #204 and HOA-253 verification wait, and an
interim one-off Vision review needs the Founder's authorization (precedents #18611, #18639).

## Part 7. Communications: addressing, routing, identities, sessions, quota

### Addressing a message (Founder decision 4a; reinforced 2026-11-12)
- Name the sender seat and **every addressee on an explicit recipient line**: `To: @handle#pane`. Use canonical
  handles and qualify a shared handle with its pane (`@claude#w3:p1`). The Acting CE's interim practice while the
  no-handle routing is not built: write the recipient seat in the first line of everything, and the Founder's
  `@claude#w1:p5` line is what wakes the Acting CE (#19158).
- A handle quoted anywhere in a body addresses that handle; do not quote a handle you do not mean to address.
- **Every post carries its Cloudroom task ID** in `--task` (and `--action started|blocked|done` where it applies) so a
  result closes the task it belongs to.
- **`--reply-to` must be a real event id**, copied in full from `readRoomSnapshot()`; never typed from memory or
  shortened. A reply body that starts "Reply to #n" needs one (`send.mjs` refuses otherwise), but `send.mjs` checks only
  that an id is present, not that it is real: a guessed id is stored and silently breaks the thread (seen on
  2026-11-12, corrected in #19180). Read the stored `replyTo` back.
- **A Room post is not proof of delivery.** Read the stored record back and check it ends where it should (long bodies
  were truncated once, #18912); then follow Delivery is not receipt below.
- A missed record is reissued once, as a new record that cites the original sequence. History is never replayed.
- For the Founder use `@mustarq`; the Founder's own messages with no `@handle` are the open gap below.

### Delivery is not receipt
| Level | Evidence | What it proves |
|---|---|---|
| Stored | the Room record reads back complete | the message exists |
| Accepted | gateway cursor past the record with no failure, or the Telegram API returned ok | the transport took it |
| **Received** | the recipient says so, in Room or by replying | the person or seat has it |

Only the third is receipt. Cursor progress, an API ok and a pane showing text are never reported as receipt [#18981].

### What is live (as of 2026-11-12)
- **Selective wake.** The dispatcher (`agent-comms\scripts\room-dispatcher.mjs`, state `state\room-dispatch-codex-live`)
  wakes only the addressed seat, excludes the sender's own pane, retains records for offline seats for 24 hours, and
  HOLDS an ambiguous shared handle instead of defaulting it (Founder #19034). A Herdr pane is routed by its agent kind
  through `DEFAULT_HERDR_AGENT_MAP`; `hermes` maps to `vision` (a gap that previously woke Vision's pane for records
  addressed to Deadpool, #19060 and #19088; see the runbook).
- **Owner-addressing sender fix (revision 3).** `send.mjs` prepends `To: @owner` when an owner is named only in the
  action-required text (live check #19116).
- **Ingress stale-lock guard (live, #19149 and #19153).** A Room write no longer fails for good because a process died
  holding `locks\ingress.lock`: a dead holder's lock older than 2 seconds is reclaimed, and release removes only the
  writer's own lock. Rollback and evidence: `candidates/ingress-stale-lock`. Long-running processes keep the old code
  until they restart.
- **StarqBot mirror, self-recovery.** Every committed record goes to the Founder's Telegram; the keeper (scheduled task
  `StarqTech-StarqBot-Logon`, at logon and every 5 minutes) restarts a crashed gateway and the dispatcher and clears a
  dead-pid stale lock; a network failure before a send is retried, not treated as ambiguous (#19052 delivered once).
- **Identity.** One canonical handle per agent in `identities.json`, a lease per session, session binding by pane plus
  the harness's own session id (Part 8).

### What remains held (as of 2026-11-12; each needs separate Founder authorization)
- **PR #3** (receiver, seat table, durable holds): independently reviewed PASS (OpenCode #19138) and a rollback
  rehearsal accepted (#19146); activation, merge, cutover and any historical replay are on HOLD (#19122 item 5).
  Plan: `docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md`.
- **Seat capacity gate** (do not wake a quota-blocked seat): design only (`docs/design/SEAT_CAPACITY_GATE_DESIGN.md`).
- **Founder messages with no `@handle`:** stored as an action, wake nobody, and the Founder is not told. Design and the
  marker-based continuation candidate for split messages: `docs/design/FOUNDER_UNADDRESSED_MESSAGE_DESIGN.md`. The
  Telegram "not delivered" notice needs the Founder's decision. Observed again on 2026-11-12 (#19155 reached no agent).
- **WSL routing** (delivery path unverified) and the Deadpool failover sender design.
- **Unattended startup after a reboot of Nitro is UNVERIFIED:** no reboot test has been run (Part 8).

### Quota-aware delegation
Never infer quota or readiness from an idle label; an unknown quota is an unknown metric, not a readiness failure
(`AGENTS.md`). Herdr's `agent_status` reads `done` or `idle` for an account that cannot run: on 2026-11-12 Codex's pane
said it had hit its usage limit and Copilot's said 99% used, while both read as available. Before assigning, read the
seat's live pane, prefer seats with verified capacity, route bounded grind work to free seats and targeted review to
paid ones, and report a blocked seat and the next staffing path instead of waiting on it. The Acting CE's practice: do
not let one department's capacity block the rest (#19096).

## Part 8. Workspaces, ownership, startup, monitoring and continuity

### Startup order
Each step is complete only when the named seat has posted its own record in Room. A pane label, an idle prompt, or
Herdr's `agent_status` is not readiness.

1. **Host and infrastructure check (read-only).**
   - `node agent-comms\scripts\gateway-supervisor.mjs --status` (StarqBot gateway).
   - `node 00_STARQ_HQ\operations\starq-command\scripts\command-lifecycle.mjs status` (Starq Command). A stopped or
     degraded Command is handled by the procedure in `AGENTS.md`; a seat told not to restart services reports the state.
   - Room reader returns `state: OK`, `stable: true`.
   - **StarqBot must be HEALTHY before any session starts assigned work** [Founder, #18952, #18953]. If not, recover it
     (below), verify HEALTHY, then proceed; if safe recovery does not produce HEALTHY, report the exact blocker and stop.
   - **Check for a stale ingress lock before assuming Room is down**: `agent-comms\locks\ingress.lock` naming a dead
     process blocked every post for minutes on 2026-11-12 (`docs/incidents/2026-11-12-ingress-lock-held-by-dead-process.md`).
2. **Chief Engineer seat.** The Founder starts Codex when he is available; otherwise the Acting CE holds the role. The seat
   completes the session startup gate and reads the Room tail.
3. **Floor leads.** The Chief Engineer seat posts each lead's assignment in Room, then sends a pane pointer to that
   sequence. Each lead completes the gate under its own identity. A floor the Founder starts personally is
   Founder-driven: it is overseen, not re-activated (Hoadhaa on 2026-11-11, #18912, #18915, #18917).
4. **Floor seats.** Each lead brings up its own seats one at a time, verifying the real process and session in each pane
   and watching host memory between starts. Each seat posts its own readiness record. Unresolved prompts or assignments
   in a seat are preserved, not cleared.
5. **Operations seat.** It completes the gate, reconciles Ops state and opens the day's journal.
6. **Remaining hosts.** Out of scope now (#19154). When they are in scope again, a remote host counts as reachable only
   after a two-way check: a prompt sent from Nitro, a reply in the remote pane, and a readback of that reply from Nitro.
   On-demand agent profiles are recorded as on-demand, not running seats.
7. **Work resumes.** Assignments go only to seats with a readiness record for the current session. **Verify the live
   pane, process and session before any dispatch**; a Herdr session value can lag a restart, so bind by pane plus the
   harness's own session id.

### Per-seat gate (summary; the full text is in `AGENTS.md`)
1. Resolve the canonical handle; inspect the lease with `send.mjs --whoami <handle>`. 2. Bind the live process, pane,
stable session id and working directory. 3. Read the Room tail and assignment through `readRoomSnapshot()` only. 4. Post
one startup record through `send.mjs --room` and confirm it appears under that sender. Run once per new session and after a
material continuity break; later assignments need only a concise task ACK.

### StarqBot recovery
From `AGENTS.md`, #18952 and the incident of 2026-11-11 (`docs/incidents/2026-11-11-starqbot-gateway-down-after-reboot.md`).
1. Check: `node agent-comms\scripts\gateway-supervisor.mjs --status`.
2. If not healthy, start it through `agent-comms\scripts\start-starq-bot-if-needed.ps1`, and check again.
3. **Dead-pid stale lock.** Only when both are confirmed (the recorded pid is dead and no gateway or wrapper process is
   running), clear that one stale lock with the supervisor, then run the wrapper again. Never release a lock whose pid is
   alive.
4. Preserve the safety hold, the relay cursor and any pending or ambiguous outbound state; never reset the cursor or
   replay the backlog as a routine step.
5. Verify: lock held by a live pid, safety hold as before, relay HEALTHY, cursor advancing to the Room tail. Record the
   recovery in Room.

### Monitoring and continuity
- The keeper restarts the gateway and the dispatcher at logon and every 5 minutes; `agent-comms\scripts\verify-comms-after-reboot.ps1`
  checks the whole stack after a reboot. **No reboot test has been performed; unattended startup of Nitro is UNVERIFIED** (the
  Founder or the host owner must schedule one).
- Deadpool's monitoring scope: **UNVERIFIED** until its factory inventory (#19088) arrives.
- Continuity must never depend on keeping a conversation alive: a durable work package, a delivery receipt, Room and the
  handover and journal connect sessions (contract §4). Update the handover and the stage table whenever a stage changes.
- Workspace and ownership: each floor lead owns its floor's seats; Ops owns communications, routing, infrastructure,
  the Operations repository and the keeper; the seat table and the agent map are Ops-maintained (a mapping or table
  change is a controlled change, Part 9).

### Known traps
- **Shared handles.** Several seats post as `claude`. Address a seat by pane (`w3:p1`), not by the bare handle.
- **Wrong sender.** A harness may post under another agent's handle if told to (#18884, corrected in #18889). Check the
  sender on every readiness record.
- **Scratch location.** Session scratch stays under `D:\StarqTech` and never under `D:\!starq`. A harness whose temp
  directory resolves elsewhere reports it and stops (#18901). A tool that uses `/tmp` from a POSIX shell is outside the
  rule.
- **Who started a seat.** Record it. A seat the Founder started personally is not started again by a lead.
- **Completion signals.** Herdr's finished notification and `agent_status: done` are not a completion receipt;
  completion is the seat's own Room record.
- **Configured is not running.** A persistent profile on a host is not capacity until it has been activated and answered.
- **Report in Room, not in the terminal.** A report that exists only in a pane has not been delivered; post it, read the
  stored record back, and cite its sequence [#18947].
- **Reaching the Founder.** Every committed Room record is mirrored to his Telegram. A record he needs to act on names
  him with `@mustarq` and an action-required line that begins `mustarq:`. His own messages with no `@handle` reach Room
  but wake no agent (Part 7, held).
- **After a host reboot** nothing restarts by itself unless its logon task exists. Check step 1 before assuming Telegram
  relay or Command are up.
- **Independent review depends on Vision's bridge** until it has a real-package receipt and Vision's verdict (Part 6).

## Part 9. Engineering reviews, repository maintenance, authorization and recovery

### Reviews
- **Builder and independent reviewer are different agents**, with identity verified before a result is attributed
  (`AGENTS.md`). Observed reviewers in November 2026: Codex (#19086), Cursor (#19112), OpenCode (#19113, #19138, #19143).
  Copilot is risk-based specialist assurance for security, architecture, migration or other high-risk changes, not a
  mandatory reviewer for routine packages (standard §5). Project verification is Vision's (Part 6).
- A review verdict is PASS or CORRECTIONS-REQUIRED per item with file and line evidence and a statement of what was
  not verified. The Acting CE assigns the reviewer; the author does not.
- Before a branch-specific review the assigner checks the live PR head sha in GitHub and names it in the assignment.

### Who may authorize what
| Decision | Authority |
|---|---|
| Merge, release, acceptance, publication of this handbook and of any branch | Founder (a push or a PR never authorizes a merge) |
| PR #3 activation, receiver cutover, seat-table activation, historical replay | Founder, after a verified readiness report (#19089, #19122 item 5) |
| Model, billing or provider changes (Vision's specialists); WSL restart; new project work packages; host expansion | Founder |
| Bounded technical corrections, independent reviews, Operations engineering, scoped live changes under a prior Founder authorization | Acting Chief Engineer (#19155 item 4, #19173) |
| Routine Ops records, designs, candidates, local commits, read-only checks | Operations Claude without asking |

### Controlled live change (the procedure used on 2026-11-11 and 12)
For any change to a live runtime file: confirm the preconditions (live file sha as reviewed); take a backup with sha256
sums and post its path and shas in Room **before** the change; make one change; `node --check`; one focused live test
that does not plant failures in live state; verify the dispatcher, gateway and sessions that must be preserved are
untouched; keep the rollback ready, and run it at once if a check fails; report shas before and after, the sequence used
as the test, and the rollback state. Examples: owner-addressing revision 3 (#19099, #19116), ingress stale-lock guard
(#19150 to #19153), Vision wake mapping (#19176 to #19179).

### Repository maintenance (this repository)
- The Operations repository is internal engineering infrastructure, not a commercial product; maintaining it is not
  blocked by the pause on new commercial work (#19155 item 4).
- Update and revise existing documents; do not create duplicate policies or a parallel operating system. Superseded
  text goes in the "Superseded by" table, not in silent deletions. Every entry cites its Room sequence.
- **Commits:** clean and evidence-backed. New commits carry the author name "Claude (Operations Deputy)" with the Git
  Identity Standard A email, and a `Co-Authored-By` trailer for the actual model (#19162). Existing local commits that
  carry another author name are not rewritten; the Founder decides at the publication review (list in the handover).
- **Branch:** the existing PR #5 branch `claude/ops-records-20261111`. Local commits stay local; **no push and no merge**
  until the Founder authorizes publication (#19155 item 5), after which publication is coordinated through Ops.
- **Secrets:** no credentials, tokens, chat ids or private auth material in any document, journal or commit.
- Scratch and temp files stay under `D:\StarqTech`.

### Recovery and rollback
`docs/operations/COMMS_RECOVERY_RUNBOOK.md` (communications recovery, ingress lock, agent map);
`docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md` (held activation, state-directory decision, timed rehearsal in
`candidates/pr3-rollback-rehearsal`); `candidates/ingress-stale-lock/rollback-live.sh`; the backups under
`agent-comms\backups\` named in each Room result.

## Part 10. Decisions and lessons, 10 to 12 November 2026

The dated log, with Room sequences, effects and what each supersedes, is
`docs/operations/DECISIONS_AND_LESSONS_2026-11-10_to_12.md`. It is a log, kept out of this spine so the handbook
stays readable; Part 1 names its precedence.

## Records

| Record | Path |
|---|---|
| Index and reading order | `README.md` |
| Daily journal | `docs/journal/YYYY-MM-DD.md` |
| Current handover, stage table, open conflicts | `docs/handover/OPERATIONS_ROOM_HANDOVER_2026-11-11.md` (refreshed in place) |
| Decisions and lessons | `docs/operations/DECISIONS_AND_LESSONS_2026-11-10_to_12.md` |
| Comms incidents | `docs/incidents/YYYY-MM-DD-<slug>.md` |

Every entry cites the Room sequence it came from. Room is the operating record; these files are the summary that
survives a session.

## Superseded by

| Replaced text (v0.1 of this file, or the document named) | Replaced by | Why |
|---|---|---|
| "Chain of command: Founder, Codex, Floor or Department Lead, owned agents" as the only chain | Part 2 (Acting CE arrangement) | Founder #19096: Elder is Acting Chief Engineer while Codex is at his limit; Codex's decisions stand |
| Hierarchy table as of #18912, which put the XPS and Fold 4 seats in the startup set | Part 2 seat table (JARVIS and FORGE kept as departments) and Part 8 step 6 | Founder #19154 item 6: no additional hosts for now; Acting CE #19184: the departments stay, with no new host work |
| "Save mode" section as a standalone section | Part 2, last rule | Same practice, folded in; Codex-centred wording updated |
| Addressing text saying a record naming another owner first is not sent to Telegram until filter 4b | Part 7 and Known traps | StarqBot now mirrors every record (`mirrorAll`, live) |
| "Reaching the Founder" trap: only `@mustarq` plus `mustarq:` reaches Telegram | Part 8, Known traps | same |
| Task lifecycle section added 2026-11-12 | Part 4 | folded into the spine, with the Vision split |
| Cloudroom to Herdr contract §1 cycle: Cloudroom prepares the package and "Repeat" selects the next task | Part 4 (stages 2 and 8) | Founder #19144: Elder prepares through Room; the next task starts only when the Founder initiates it |
| Contract §1 and standard §5: Vision "has no Herdr pane and does not need one" | Part 6 | Founder #19164 and #19166: Herdr Vision is the Verifier on `w1:p0` |
| Vision's SOP milestone text treating Cloudroom alone as PM and verifier surface | Part 6 (flagged to the Acting CE; Vision's file is not edited by Ops) | Command PM and Herdr Verifier surfaces |
| "Independent review depends on Vision's bridge" trap | Part 6 and Part 8 trap | status updated: specialists blocked by an expired model, Founder handling recovery |
| Records table without an index | `README.md` index and this file's Records table | one reading order |
| `OPERATIONS_ROOM_HANDOVER_2026-11-07.md` | `OPERATIONS_ROOM_HANDOVER_2026-11-11.md` (current) | one current handover, no third dated copy |
