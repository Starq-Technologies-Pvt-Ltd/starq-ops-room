# Observability, health and operating targets

**Metrics must describe truth, not claim the system is healthy because a process exists.** Targets are suggested starting points to measure locally before setting service-level promises.

| Measurement | Suggested signal | Initial target / handling |
|---|---|---|
| Broker ledger continuity | last stable epoch/seq, gaps, integrity check result | Zero unexplained gaps |
| Room→Herdr delivery latency | appendAt → transportAckAt, by destination | p95 under 30s for awake local seats; alarm sustained deviation |
| Assignment ACK latency | dispatchAt → workerAckAt | Report unacknowledged after 5 minutes; quota-held treated separately |
| Delivery pending age | oldest retryable pointer, count by host | Escalate after retries exhausted |
| Ambiguous owner holds | held target resolution records | Zero indefinite silent holds; coordinator queue |
| Notification coverage | expected eligible vs attempted vs provider ACK | No missing eligible Founder alerts without explanation |
| Task stalled | last Room progress/receipt vs live work | Show, do not forcibly restart or duplicate coding |
| Reviewer queue | delivered PRs awaiting Vision | By task, exact SHA and reason |
| Merge queue | Vision ACCEPT head vs Founder authorization | No merge without matching authorization |
| Runtime health | broker, dispatcher, Cloudroom bridge, watchers, Telegram | Show UNKNOWN if source not checked |
| Quota headroom | account pool, observedAt, remaining, reset | UNKNOWN is not zero; stale measurements don't admit work |

## Structured logs

Log `ledgerEpoch, brokerSequence, eventId, correlationId, taskId, actorInstanceId, targetSessionId, deliveryKey, attempt, routeDecision, failureCode, observedAt`, with tokens and private bodies excluded. Logs are local runtime data. Keep human-friendly Room record numbers and machine identifiers side by side.

## Trace propagation

Use a `correlationId` for the business task lifecycle and a per-transport `deliveryId` for attempts. Optionally adopt W3C traceparent / OpenTelemetry spans at bridge boundaries, never in place of the immutable Room broker event ID. Sampling can reduce debugging noise but must not sample away durable authority/evidence events.

## Sample dashboard groupings (not another Kanban)

**Dispatch health:** recent Room seq, pending wakes, held ambiguous, dead-letter items. **Capacity:** active seats by product and quota pool, freshness. **Evidence:** delivery/review/merge queues. **Founder decisions:** only decisions truly addressed to Founder. **Runtime:** service heartbeat and recovery actions. Each view deep-links to the authoritative Room/Cloudroom/GitHub record.
