# STARQ Operations Room

This repository has two jobs. It is the **engineering operating handbook** of Starq Technologies (the first thing a fresh
Codex, Acting Chief Engineer, deputy or Floor Lead reads), and it carries the private deployment surface for the
Operations Room (the Vercel proxy described below). Status of the handbook: **draft under Founder review**; push and
merge are held for his decision (Founder #19155).

## Read in this order

1. `D:\StarqTech\AGENTS.md` (outside this repository): session startup gate and Room-first rules.
2. `docs/operations/FACTORY_STARTUP_SOP.md`: the spine, Parts 0 to 10 (recover from zero, authorities, organization,
   architecture, the Command-Room-Herdr lifecycle, work packages, Vision, communications, startup and continuity,
   reviews and authorization, decisions).
3. `docs/handover/OPERATIONS_ROOM_HANDOVER_2026-11-11.md`: the single current handover, the task stage table and the
   open policy conflicts.
4. The latest file in `docs/journal/`, then anything below that your task touches.

## Document map

| Path | What it is | Status |
|---|---|---|
| `docs/operations/FACTORY_STARTUP_SOP.md` | the handbook spine | draft v0.2 |
| `docs/operations/DECISIONS_AND_LESSONS_2026-11-10_to_12.md` | Founder decisions and lessons, with Room sequences | log |
| `docs/operations/COMMS_RECOVERY_RUNBOOK.md` | communications recovery, ingress lock, agent map | live procedures |
| `docs/operations/PR3_ACTIVATION_ROLLBACK_PLAN.md` | activation and rollback of the PR #3 receiver | **held**, not authorized |
| `docs/ROOM_PROTO_1_ACTION_REQUIRED_SEMANTICS.md` | what makes a Room record an action | reference |
| `docs/design/*` | seat capacity gate, no-handle Founder routing and marker rule, Deadpool failover sender | **designs, not built** |
| `docs/handover/` | handovers; the 2026-11-11 Ops one is current, the 2026-11-07 one and the Founder-command one are history | current and historical |
| `docs/journal/` | one file per day | record |
| `docs/incidents/` | what broke and how it was fixed or is still open | record |
| `docs/reconciliation/` | live runtime versus repository drift (2026-11-07) | history |
| `candidates/` | reviewed candidate code and patches, each with tests and a README (not deployed unless its README says so) | candidates |
| `live-changes/` | patches applied to the live runtime on 2026-11-11, with their tests | record |
| `protocol/`, `scripts/`, `tests/`, `watch/` | Room protocol, sender and watcher code kept in this repository | code |

The live runtime lives outside this repository in `D:\StarqTech\agent-comms` and is not under version control; a change
to it is a controlled change with a backup and a rollback (SOP Part 9).

## Maintaining the handbook

Update an existing document rather than adding a parallel policy; put replaced text in the SOP's "Superseded by" table;
cite the Room sequence for every statement; mark what you could not verify as UNVERIFIED; never write credentials,
tokens or chat ids. New commits carry the author name "Claude (Operations Deputy)" with the Git Identity Standard A email
and a `Co-Authored-By` trailer for the actual model. Nothing is pushed or merged without the Founder's authorization.

---

## Vercel deployment surface

This repository intentionally contains no live Room data, identities, inboxes, cursors, logs, or credentials. The Vercel deployment is a secure proxy surface and requires an authenticated upstream configured through environment variables.

### Vercel configuration

Set these environment variables in the private Vercel project:

- `OPS_ROOM_UPSTREAM_URL`: HTTPS URL of the authenticated Room API.
- `OPS_ROOM_UPSTREAM_TOKEN`: upstream bearer token.

The proxy returns `503` until both values are configured. Never commit either value.

### Local development

```text
npm install
npm run dev
```

This scaffold is deliberately not connected to the local `agent-comms` files. Connect a separately authenticated upstream before sharing the Vercel URL.
