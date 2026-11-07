# Standards research and reuse rationale

**Reviewed 7 November 2026.** The target is not an abstract universal agent framework. It is a small, local-first, durable communications protocol for the existing STARQ engineering floor, with carefully defined boundary adapters.

## Comparison

| Standard/pattern | Useful elements | Our decision |
|---|---|---|
| **A2A (Agent2Agent)** | Capability/agent discovery, cross-agent tasks and artifact handback, push/stream updates | Optional external-agent adapter. Cloudroom IDs and Room remain authoritative; an A2A task may *reference* them, not create shadow tasks. |
| **MCP (Model Context Protocol)** | Tool/resource discovery and access to context | Optional Room MCP server with read-only `get_event`, `search`, `get_task_evidence`, `recall`. Writes only through existing authenticated broker and explicit policy. |
| **CloudEvents v1.0.2** | `source` + `id` uniqueness, event `type`, `subject`, `time` and extension fields | Map Room v2 to CloudEvents at integration edges; don't rebase existing `room.jsonl` history. |
| **OpenTelemetry** | Cross-system message spans, event names, causation and failure observability | Propagate correlation/trace IDs where available, avoid payload/secret leakage. Messaging semantic conventions continue to evolve; pin instrumentations. |
| **Transactional outbox / inbox** | Persist-before-deliver, deduplicate on consumer, retry after crash | Essential to local Room dispatcher. Avoid promise of exactly-once execution; target at-least-once pointer delivery + idempotent work acceptance. |
| **CQRS projections** | Separate write authority from views | Room ledger, Cloudroom Kanban, GitHub repo and Founder's read projection stay distinct. |

## Primary references

- A2A specification, official versioned portal: https://a2a-protocol.org/v0.3.0/specification/
- A2A specification repository: https://github.com/a2aproject/A2A
- MCP July 2026 specification release: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP specification repository: https://github.com/modelcontextprotocol/modelcontextprotocol
- CloudEvents core specification: https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
- CloudEvents distributed tracing extension: https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md
- OpenTelemetry messaging semantic conventions: https://opentelemetry.io/docs/specs/semconv/messaging/

## Why custom Starq Room instead of replacing it

STARQ has an established broker epoch, hash/sequence lineage, shared leases, task ID and Room evidence practices. Replacing these with a generic inter-agent protocol would lose Founder's governance and real operating continuity. Own the **Starq-specific authority, delivery and evidence contract** while importing proven standard patterns at the edges.

## Explicit implementation cautions

- Event ordering is by the Room broker within one epoch. Cross-host agent completion can be out of order; use causal parent `eventId` and immutable artifact SHA.
- `provider_accepted` for Telegram means the provider accepted a request, **not** the Founder viewed it.
- An outbound dispatch should retry its *pointer*, never automatically replay a model execution when work status is unknown.
- Durable `HOLD` needs a visible owner and recovery route. It must not be counted as delivered merely because it was logged.
- Failures in persisting checkpoint/pending state must stop delivery progress, not be swallowed.
