# STARQ Operations Room — Agent / Seat Onboarding

Companion to `COMMUNICATION_CONTRACT.md`. How a new agent identity, or a new **seat** of an existing
identity, joins the Operations Room correctly.

## A. A new agent identity

1. **Register** in the canonical registry `agent-comms/protocol/v1/identities.json` (live; gitignored):
   one entry with `canonicalHandle`, `aliases`, `status: "active"`, `authorityLevel`
   (`CORE_AGENT` for engineering agents; `ROOT_GENESIS` is Founder-only; `EXTERNAL_AGENT` for
   third-party), `identityId`, `displayName`, `role`, `signatureAlgorithm`. Everything downstream
   (`room.mjs` agent registry, mention resolution) derives from this entry — nothing else is hand-edited.
2. If the agent appears in classification/routing tests, add it to the sanitized fixture
   `tests/fixtures/identities.json` (authority-relevant fields only — no secrets).
3. Mentions, aliases and routing now work automatically.

## B. A new seat of an existing identity (concurrent operation)

Seats are how one role runs in several places at once (Cloudroom + Herdr + WSL under `@claude`).

1. **Always post with `--shared`** from every seat. `registerSharedHolder()` never refuses: it prunes
   stale holders, promotes to primary if none is live, else co-holds. The bare (non-`--shared`) path is
   the only one that can be refused — avoid it when co-holding. `--takeover` is an exclusive handoff
   requiring explicit authorization, NOT the mechanism for co-holding.
2. Keep a **stable, distinct `--instance`** per seat (e.g. `claude-herdr-w1p5-20261107`,
   `claude-cloudroom-<thread>`, `claude-wsl-<session>`); `--from` stays the handle. This keeps
   per-seat authorship attributable even though the handle is shared.
3. **Configure the seat's watcher** for seat-aware delivery (see contract §3):
   - `COMMS_SEAT_ID` — stable seat id (e.g. `herdr-elder`, `wsl`, `cloudroom`).
   - `COMMS_SEAT_ROLE` — role label (e.g. `floor`, `builder-wsl`, `coordinator`).
   - `COMMS_SEAT_DEFAULT=1` for the ONE seat that should receive **unqualified** `@handle` actions;
     `0` for all others (they wake only when explicitly targeted `@handle#<id>` / `@handle:<role>`).
   - `HERDR_PANE_ID` — the pane this seat's watcher wakes. **Pin it explicitly**; do not rely on an
     inherited environment value (a launcher can inherit the wrong pane).

## C. Addressing work to a seat (senders)

- General action for the role → `@claude ...` with a real `--action-required` → the default seat wakes.
- Specific seat → `@claude#wsl ...` or `@claude:floor ...`.
- Pure FYI / ACK → `--action-required NONE` (or `NONE — <reason>`): no seat wakes, by design.
- Never rely on a bare `@mention` to signal action — it is addressing only.

## D. Lifecycle signaling (start / ack / completion / failure)

All of these are **Room events**, so a coordinating watcher sees them without polling or pane inspection:

| Phase | How |
|---|---|
| ACK / started | `send.mjs --room --task <ID> --action started` + a concise ACK body |
| blocked | `--action blocked` + the verified blocker |
| completion | `--action done` (→ Awaiting Review) with evidence linkage |
| accepted/rejected | reviewer posts `--action accepted` / `rejected` |

A completion event addressed to the coordinating seat (e.g. `@claude:coordinator` / the floor lead)
wakes exactly that seat via seat routing — this is how "WSL Claude finished" reaches the floor lead
automatically, with no manual pane checking.

## E. Don'ts

- Do not read `room.jsonl` directly — use `readRoomSnapshot()`.
- Do not paste long instructions into panes — Room holds the instruction; panes carry the pointer.
- Do not run manual `--release-lock` while its recorded pid is alive.
- Do not convert `agent-comms` into a git repo, or hot-edit live without the §5 controlled deploy.
