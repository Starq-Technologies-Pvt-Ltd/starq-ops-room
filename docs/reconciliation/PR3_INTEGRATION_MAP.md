# Integration map: existing PR #3 versus proposed Room v2

**Read-only finding at 2026-11-07:** GitHub PR #3 `claude/ops-room-durable-foundation-20261107` is open at `c1c61a252f62a307ee5b769a32e4353f0c8efcce`; it must be preserved and independently reviewed. This design package does not modify that feature branch or the running Room.

| PR #3 capability | V2 addition | Recommended integration |
|---|---|---|
| `protocol/v1/authorityPolicy.mjs` | typed action owners | Keep v1 classifier canonical; adapt v2 envelope at broker ingress |
| `protocol/v1/identityProvider.mjs` | actor seat provenance | Keep live registry untracked; sanitized test fixture in repo |
| `protocol/v1/seatRouting.mjs` | explicit target and ambiguity hold | Prefer stable sessionId; test host/workspace name collisions |
| `protocol/v1/sessionRouting.mjs` | project-aware pure route reference | Reconcile precedence; don't derive a real owner from substring in cwd |
| `scripts/room-dispatcher.mjs` | delivery intent + retry + DLQ | Persist before checkpoint, recover by UUID, durable HOLD queue |
| `tests/room-dispatcher.test.mjs` | fault injection | Restart, partial state write, source offline, duplicate event, epoch change |
| `.github/workflows/ci.yml` | contract tests | Keep workflows independent until unified CI suite runs on sanitized fixtures |
| `docs/protocol/COMMUNICATION_CONTRACT.md` | Room v2 semantics | Append ADR; don't silently alter established v1 contract |

## Concrete risks to fix in proposed dispatcher

1. Its state-save helper catches and logs write failure but does not stop checkpoint advancement. Require failure propagation and durable write-then-advance ordering.
2. Pending queue stores old pane numbers, not re-resolved session UUIDs. A restarted Herdr can move a pane: rediscover before retry.
3. Ambiguities get logged, but need durable HOLD records with resolution owner and expiry.
4. Delivery retries are not worker ACKs; adding retries without idempotent recipient de-dup can repeat expensive agent work.
5. `COMMS_DISPATCH_SOURCES` must be tested against real Windows/WSL discovery shape; a healthy process at one host is not proof all sources were inspected.
6. Use registered project IDs and task bindings rather than only fuzzy `cwd` substring affinity.
7. Do not treat Vercel broker/proxy availability as equivalent to local Room health.

## Review recommendation

Land PR #3 after its own review, then develop the durable queue and broker adapters in a fresh task worktree. Only after integration tests should the universal dispatcher replace legacy watchers through a one-seat canary. This design package is documentation and pure reference contracts; there is **no live cutover** in it.
