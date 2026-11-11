# Factory Startup SOP

Status: **DRAFT v0.1 (2026-11-11)** — written by the Operations Room Deputy under Room #18903.
Not yet reviewed. It becomes the authoritative startup record once reviewed and merged by the
Founder.

This file records the order in which the engineering floor is brought up and the gate each step
must pass. It points to the governing rules; it does not restate or replace them. Where this file
and an authority below disagree, the authority wins and this file is corrected.

## Authorities

| Subject | Authority |
|---|---|
| Roles and boundaries | corporate-library Chapter 22, "Development Studio Governance Charter" |
| Session startup gate, task ACK, cadence | `D:\StarqTech\AGENTS.md` (Founder #15794) |
| Canonical handles | `agent-comms/protocol/v1/identities.json` plus the live Room assignment |
| Room-first coordination and metadata | Room directives #10664, #10665 |
| Durable engineering activity | `projects/starqerp/docs/governance/DURABLE_ENGINEERING_ACTIVITY_STANDARD_2026-11-06.md` |
| Current hierarchy | Room #18912 (Founder correction; supersedes #18905), #18903 (Ops Deputy) |

## Hierarchy at startup (as of Room #18912)

| Role | Holder | Seat | Reports to |
|---|---|---|---|
| Chief Engineer / Project Director | Codex | Nitro Windows `w1:p1` | Founder |
| ERP Engineering Floor Lead | Claude (ERP) | Nitro Windows `w1:p5` | Codex |
| ERP floor deputy | Antigravity (ERP) | Nitro Windows `w1:p3` | ERP Floor Lead |
| Hoadhaa Engineering Floor Lead | Antigravity (Hoadhaa) | Nitro Windows `w2:p1` | Codex |
| Operations Deputy / Communications Engineering Lead | Claude (Ops) | Nitro Windows `w3:p1` | Codex |
| Head of General Engineering Support | JARVIS | XPS `w1:p1` | coordinated by Codex |
| Head of X-Men Department | FORGE | Fold 4 | coordinated by Codex |
| Independent departments | Deadpool, Vision | — | organisation-wide coordination |

Rules stated with the hierarchy [#18912]:

- Codex holds overall engineering authority, coordination, supervision and accountability across
  every floor and department.
- Delegation is execution ownership. It does not transfer Codex's accountability.
- Every lead reports upward. Every assignment has one owner. Completion and blockers return
  through the reporting chain.

These are assignment-specific acting roles. They are not corporate designations and are not
inferred from one another.

## Startup order

Each step is complete only when the named seat has posted its own record in Room. A pane label,
an idle prompt, or Herdr's `agent_status` is not readiness.

1. **Host and infrastructure check (read-only).**
   - `node agent-comms\scripts\gateway-supervisor.mjs --status` — StarqBot gateway.
   - `node 00_STARQ_HQ\operations\starq-command\scripts\command-lifecycle.mjs status` — Starq Command.
   - Room reader: `readRoomSnapshot()` returns `state: OK`, `stable: true`.
   - A stopped service is started only by the seat authorised to do so, by the procedure in
     `AGENTS.md`. Other seats report the state and do not restart it.
2. **Chief Engineer seat.** The Founder starts Codex. Codex completes the session startup gate and
   reads the Room tail.
3. **Floor leads.** Codex posts each floor lead's assignment in Room, then sends a pane pointer to
   that sequence. Each lead completes the startup gate under its own identity.
4. **Floor seats.** Each floor lead brings up its own seats one at a time, verifying the real
   process and session in each pane and watching host memory between starts. Each seat posts its
   own readiness record. Existing unresolved prompts or assignments in a seat are preserved, not
   cleared.
5. **Operations seat.** Codex starts or reuses the Ops seat. It completes the startup gate,
   reconciles the Ops state, and opens the day's journal.
6. **Remaining hosts.** Nitro WSL, Deadpool, XPS/JARVIS, Fold 4/FORGE and other remote agents are
   synchronised last. Until each has posted its own record they are listed as unverified. A remote
   host counts as reachable only after a two-way check: a prompt sent from Nitro, a reply in the
   remote pane, and a readback of that reply from Nitro. On-demand agent profiles are recorded as
   on-demand, not as running seats; a profile inference probe shows the profile answers, not that
   its tools work.
7. **Work resumes.** Assignments are issued only to seats with a readiness record for the current
   session.

## Per-seat gate (summary; the full text is in `AGENTS.md`)

1. Resolve the canonical handle; inspect the lease with `send.mjs --whoami <handle>`.
2. Bind the live process, pane, stable session ID and working directory.
3. Read the Room tail and assignment through `readRoomSnapshot()` only.
4. Post one startup record through `send.mjs --room` and confirm it appears under that sender.

Run once per new session and again after a material continuity break. Later assignments in the
same session need only a concise task ACK.

## Known traps

- **Shared handles.** Several seats post as `claude`. Address a seat by pane (`w3:p1`), not by the
  bare handle.
- **Herdr session values drift.** Herdr can keep listing a pane under a previous session ID. Bind
  by pane plus the harness's own session ID.
- **Wrong sender.** A harness may post under another agent's handle if told to (Room #18884,
  corrected in #18889). Check the sender on every readiness record.
- **Scratch location.** Session scratch must stay under `D:\StarqTech`. A harness whose temp
  directory resolves elsewhere reports it and stops (Room #18901).
- **Who started a seat.** Record it. A seat the Founder started personally is not started again by
  a lead; the lead monitors its reports, dependencies and blockers (Room #18912, Hoadhaa seats).
- **Completion signals.** Herdr's finished notification and `agent_status: done` are not a
  completion receipt. Completion is the seat's own Room record. See
  `docs/incidents/2026-11-11-herdr-completion-notification.md`.
- **Truncated Room posts.** A long body can be cut off on the way into Room (Room #18912). After
  posting, read the stored record back and check that it ends where it should.
- **After a host reboot** nothing restarts by itself unless its logon task exists. Check step 1
  before assuming Telegram relay or Command are up. See
  `docs/incidents/2026-11-11-starqbot-gateway-down-after-reboot.md`.

## Records

| Record | Path |
|---|---|
| Daily journal | `docs/journal/YYYY-MM-DD.md` |
| Handover and next-session recovery | `docs/handover/OPERATIONS_ROOM_HANDOVER_YYYY-MM-DD.md` |
| Comms incidents | `docs/incidents/YYYY-MM-DD-<slug>.md` |

Every entry cites the Room sequence it came from. Room is the operating record; these files are
the summary that survives a session.
