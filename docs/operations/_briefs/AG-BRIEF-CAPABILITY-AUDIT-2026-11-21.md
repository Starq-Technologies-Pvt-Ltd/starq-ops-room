# AG BRIEF — Comprehensive Read-Only Capability & Integration Audit

From: Ops Room Vision (w3:p1). Commissioned by Command Vision, on Founder Mustarq's directive.
To: Ops AG (w3:p2).
Date: 2026-11-21.
Mission: AUDIT (inspection only). AG is the technical inspector; Ops Room Vision consolidates.

---

## HARD RULE — READ-ONLY

- **No installs. No config edits. No restarts. No credential actions. No destructive changes.
  No disruption to any working system.** Inspection only. If an inspection command would
  mutate state, DO NOT run it — describe what you would need instead.
- Do NOT interrupt any running agent. Do NOT send prompts to other seats unless strictly
  needed for read-only probing and clearly bounded (one short read query, no state change).
  Prefer inspecting files/configs/manifests over prompting live agents.
- Prefer file reads and CLI `--help` / `list` / `status` / `--version` style commands.
- Honor Founder gates (DEC-072): report evidence + proposed state only; never self-close.

## SCOPE (comprehensive, Nitro + any reachable cross-host + active mobile Hermes if reachable)

For EACH capability below, classify with EVIDENCE (path / command / actual output):
**INSTALLED / CONFIGURED / VERIFIED-OPERATIONAL / DEGRADED / INCOMPLETE / PLANNED-ONLY /
UNKNOWN-BLOCKED**.

Distinguish clearly: *present in config* vs. *verified actually working*. If you cannot
verify operational behavior without mutation, mark CONFIGURED and state what probe would
be needed (do not run it).

Capabilities (not exhaustive — add anything material you find):
1. **Jevgrep** — presence, version, config, index state, where it is wired in.
2. **Ruflo** — install, config, data sources, MCP exposure, actual query path.
3. **Graphify** — install, config, MCP exposure, build/query path, current graph state.
4. **Hermes plugins & skills** — profile inventory for `vision`, `claude` and any others
   discoverable on Nitro; which plugins/skills are declared vs loaded vs dead; overlaps,
   duplicates, and missing links; per-skill last-modified / origin (plugin vs profile).
5. **Memory Wiki** — presence, schema, size, recency, who writes to it, who reads it.
6. **Advanced Delegation** — plugin presence, config, model/provider mapping, which seats
   can delegate to which seats, the `delegation.max_concurrent_children` ceiling, evidence
   of an actual recent delegate call.
7. **Security** — authority policy files (`protocol/v1/authorityPolicy.mjs`,
   `identities.json`), signature/HMAC presence, gateway ingress/egress rules, secret/credential
   storage locations (do NOT read secret values — only inventory). Note any world-readable
   credential files as DEGRADED without quoting them.
8. **Ponytail** — presence, config, scope.
9. **PM plugin** — presence, config, data store, which seats hit it.
10. **Provider authentication & fallbacks** — per-profile provider ladder (anthropic / openai-codex /
    openrouter / nous / etc.), which providers are LOGGED IN per profile (`hermes auth status`
    or equivalent), fallback chains, known-dead legs.
11. **Specialist configurations** — per-officer specialist configs if any are reachable from Nitro
    (ERP's PICARD officers are an ERP-chain slice — see cross-chain section).
12. **Cross-host routing** — `herdr --machine <label> ...` configured machines, SSH readiness
    (connectivity probe only, no action), room/gateway cross-host paths.
13. **Existing automation infrastructure** — crons, watchers (`scripts/room-watch-*.mjs`),
    schedulers, gateway supervisors; which are running, which are stale, which are unused.
14. **Mobile Hermes environment(s)** — identify any active mobile sessions (gateway/room
    records, profile dirs). If reachable read-only from this host, probe for profile +
    version. If NOT reachable from here, mark **UNKNOWN-BLOCKED** and list exactly what
    would be needed (handoff surface, credential path, network reachability test). Do NOT
    fabricate.

## CROSS-CHAIN SLICES (authority boundary — DO NOT execute these)

Ops Room does NOT command XPS or ERP chains. Command Vision is commissioning those slices
separately and will HAND US the output for consolidation:

- **XPS slice**: inspection commissioned via Hoadhaa → DEADPOOL → JARVIS / XPS AG.
- **ERP slice**: specialist configs + PICARD-runtime providers via ERP Vision → PICARD.

Do NOT send audit prompts into those chains. When their reports arrive, Ops Room Vision
will give them to you for merging into the single capability matrix.

## ADDITIONAL DELIVERABLES (beyond the matrix)

- **Missing integrations**: capabilities that exist in isolation but are not wired into
  the operational pipelines they should be (cite the gap with evidence).
- **Duplication / overlap**: two or more capabilities doing the same job (cite both,
  propose which is canonical).
- **Efficiency opportunities** that do NOT disrupt working systems — concrete, bounded,
  reversible (e.g. "skill X is loaded twice from profile and plugin — can be deduped by
  removing the profile copy, reversible via git").

## PRIORITIZED PLAN

Separate every opportunity into:
- **(a) Safe under existing authority** — reversible, non-credential, non-production,
  non-destructive, no new recurring execution.
- **(b) Founder-gated** — credentials, security policy, production/provider changes,
  irreversible or costly actions, activation of new recurring execution.

Each item cites: current state evidence, proposed change, blast radius, how to reverse.

## OUTPUT

Write the audit to:
`docs/operations/CAPABILITY-AUDIT-2026-11-21.md`

Structure:
1. Executive summary (≤ 20 lines).
2. Capability matrix (table).
3. Missing integrations.
4. Duplication / overlap.
5. Efficiency opportunities.
6. Prioritized plan — part (a) safe, part (b) Founder-gated.
7. UNKNOWN-BLOCKED items with exactly what is needed to resolve each.
8. Appendix: command inventory used (so Ops Room Vision can re-verify any row).

**Return in this pane** when the audit doc is written:
1. Absolute path of the audit doc.
2. Executive summary verbatim.
3. Top 3 opportunities under (a) safe-authority and top 3 items under (b) Founder-gated.
4. UNKNOWN-BLOCKED count + the mobile Hermes reachability verdict.

STOP after reporting. Do NOT activate anything. Do NOT commit. Do NOT send prompts into
XPS / ERP chains. If a probe would require a mutation, describe what you would do and
STOP that probe.
