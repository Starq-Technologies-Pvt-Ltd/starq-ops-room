# Pluggable deployment, configuration and non-destructive import

**Founder requirement:** Preserve Cloudroom's configurability, existing board/task records, identity names, account/model flexibility, historical source material, GUI appearance and multi-floor Herdr sessions. Never rebuild history merely to migrate the interface.

## Suggested configuration layers (schema proposal)

| Layer | Example setting | Authority |
|---|---|---|
| Company | `companyId: starq`, product projects ERP/HOA, local path allowlist | Founder |
| Projects | Cloudroom task prefix and project ID, canonical GitHub repo, official local checkout | Cloudroom/GitHub |
| Personnel | Role and alias mapping, lease handle, stable seat IDs, reviewer separation | Room registry + Founder |
| Harnesses | Herdr discovery sources Windows/WSL, Hermes read-only/verification seat, future OpenRig capability adapters | Local operator |
| Providers | Model preference/fallback, per-account quota pools, capability flags, freshness policy | Local operator |
| Notifications | Founder action only, material digest, quiet-time, per-destination delivery receipts | Founder |
| Knowledge | Starq Recall snapshot path, Jevgrep approved roots, optional tools | Local operator |
| Presentation | Cloudroom UI theme, project navigation, read-only mission-control widgets | User-defined config |

**Do not commit live values.** Version a declarative example with placeholders. Store actual account tokens, Room identities, private state and credentials in the approved local runtime. Each adapter has `enabled`, `capabilities`, `lastObservedAt`, and an explicit status such as `available`, `unavailable`, `unknown`, or `held`.

## Import center design

1. **Discover:** enumerate existing Cloudroom project/task IDs, room records, GitHub repositories, Herdr sessions, provider profiles, source docs/handovers, Jev index and any optional OpenRig manifests.
2. **Dry-run:** produce an identity-preserving mapping matrix with `unchanged`, `would_add`, `conflict`, `requires_manual_resolution` and provenance. Never synthesize new task IDs when an old ID exists.
3. **Deduplicate:** preserve stable GitHub remote and SHA, real Room `eventId` and sequence, Cloudroom thread IDs, current Room lease instance, documented historical lineage and task status.
4. **Apply additively:** store only references and adapter configuration; do not clone full chat histories or write into two task boards.
5. **Verify:** compare before/after counts, IDs, task-to-thread links, acceptance references and sample search results. Keep a rollback plan for adapter config—not a destructive database rewrite.

## Safe default first-run

- Room read access and broker epoch integrity check.
- Cloudroom task and GitHub read-only discovery.
- Herdr seat discovery (no auto-wake in dry-run), then targeted canary.
- Starq Recall read-only index; Jevgrep only on explicitly approved code roots.
- Import preview and Founder-friendly reconciliation report.
- Optional integrations stay disabled until configured and supported.

## No second system

`starq-ops-room` may expose APIs, read projections or the provider/harness registry that Starq Command uses, but it does not own the editable Cloudroom Kanban, a new chat product, a checkout/payment experience, or the Herdr execution engine.
