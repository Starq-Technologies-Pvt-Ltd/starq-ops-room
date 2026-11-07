# Interoperability research — borrow standards, keep Starq authority

**Research date:** 2026-11-07. **Decision:** Keep STARQ ROOM-PROTO as the internal authoritative event/evidence contract. Use standards at the **edges**, not as replacements for Cloudroom Kanban, Room ledger, or GitHub merge authority.

## A2A (Agent2Agent)

A2A specifies agent cards, multi-agent task exchange, long-running task states, streaming and push notifications. It is useful for **external** agent-system integration where Starq does not control the other harness. Internally, our Room task identity/evidence already exists; an A2A adapter should map one A2A task to an existing Cloudroom task ID and Room `correlationId`, avoiding duplicate task boards. Do not expose private Room history or agent credentials through an agent card.

Official specification: https://github.com/a2aproject/A2A/blob/main/docs/specification.md (latest released version reported as 1.0.0 when researched).

## MCP (Model Context Protocol)

MCP is a tool/resource transport, not the operational task ledger. A **read-only Room MCP tool** could support `room.get_event(sequence)`, `room.search(taskId,range)`, `room.get_task_evidence(taskId)` and historical `starq-recall` queries. A separately authorized write tool could call existing authenticated ingress, not bypass `send.mjs` or forge identity. MCP's 2026-07-28 release adds a stateless core, updated routing and authorization hardening; pin the actual SDK/spec version before implementation.

Spec / release: https://blog.modelcontextprotocol.io/posts/2026-07-28/ and https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2026-07-28

## CloudEvents

CloudEvents standardizes event wrappers (`id`, `source`, `type`, `specversion`), enabling transport adapters to other message systems. Map STARQ `eventId -> id`, `Room ledger URI -> source`, `kind -> type`, `occurredAt -> time`, and keep authority/reply/epoch/task identifiers as extension fields or event data. **Do not replace** Room's signed broker sequencing, ledger epoch or hash-chain provenance with CloudEvents IDs.

Reference: https://github.com/cloudevents/spec (v1.0.2 specification).

## OpenTelemetry / W3C Trace Context

A trace links Cloudroom dispatch, broker append, Herdr wake, worker ACK, GitHub PR and Vision review for troubleshooting. It is not a source of acceptance authority. `traceparent` propagation is optional and must not accidentally include private Room bodies in spans.

References: https://www.w3.org/TR/trace-context/ and https://opentelemetry.io/docs/concepts/context-propagation/

## NATS JetStream (later, only if needed)

JetStream offers durable streams, consumer acknowledgments and at-least-once delivery. The existing single-laptop Room JSONL/broker is enough for now; do not add NATS, Kafka or a second central message database merely to imitate enterprise infrastructure. Adopt only if multiple hosts and delivery volume make the current broker a demonstrated bottleneck. Even then, duplicate delivery and idempotent consumers remain necessary.

Reference: https://docs.nats.io/concepts/jetstream

## Recommended Starq-owned edge capabilities

- **Cloudroom adapter:** map task + thread IDs to durable Room cycle events; return review/closure into same thread.
- **Herdr adapter:** discover sessions, target one seat by UUID, deliver short pointers, receive work ACK/evidence.
- **GitHub adapter:** verify PR head, CI, merge state, enforce no-drift before a permitted merge.
- **Deadpool/StarqBot adapter:** owner-aware Founder notifications, delivery-gap audit, replay of missed notification only.
- **Starq Recall adapter:** historical search with Room seq/snapshot citations; never assume historic decisions override current authority.

**Interop does not mean sending raw company archives into model-provider search services.** Keep historical Room stores and identity data on the approved local side; export only specifically authorized content.
