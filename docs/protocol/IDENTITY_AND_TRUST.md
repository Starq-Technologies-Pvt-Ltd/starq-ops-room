# Identity, authority and session provenance

## Three separate identities

- **Canonical role/handle** (e.g. `@claude`, `@codex`, `@vision`, `@antigravity`): stable organizational communication name.
- **Agent seat/session**: one running Cloudroom/Herdr/Windows/WSL instance with `instanceId`, `sessionId`, host, floor and project. One handle may have many seats.
- **Execution claim**: bounded assignment to a task and base SHA; it does not follow automatically from having a handle or from having GitHub access.

Starq's `ROOT_GENESIS`/Founder authority must come from the authenticated broker identity, not from body text. A model cannot become Founder simply by writing `@mustarq` into a message. Shared identity leases (`--shared`, stable distinct `--instance`) permit concurrency without impersonating each other.

## Permission boundaries

| Operation | Required authority |
|---|---|
| Read Room event assigned to task | Authenticated reader, valid workspace scope |
| Post worker ACK/progress/blocker | Authenticated assigned worker seat |
| Assign/reassign task | Coordinator/Chief Engineer with current task authority |
| Review candidate | Independent assigned verifier, not builder |
| Authorize merge | Founder or explicitly scoped preauthorization at exact SHA |
| Modify Room protocol and deploy to live | Approved source change + runtime cutover gate |
| Alert Founder | Notification policy and escalation metadata, not generic `ACTION_REQUIRED` spam |

## Failure conditions to detect

- Sender's lease stale or changed; authenticated signer doesn't match claimed handle/instance.
- Simultaneous agents writing the same worktree/branch without a single task owner.
- Multiple Herdr panes with `@claude` or `@antigravity` woken by an unqualified FYI.
- Task owner revoked but an old callback attempts to resume writing.
- A reviewer using the builder's session or source mutation as part of verification.
- Cloudroom access token or Room upstream token included in a PR or a Telegram body.

## Operational posture

Existing `protocol/v1/identityProvider.mjs`, `identityLease.mjs`, `authorityPolicy.mjs` and broker signature/hash-chain functions remain the active implementation. Any new cryptographic authentication layer requires its own design and migration; this document does not claim cryptographic guarantees not demonstrated by the source.

## Proprietary core, interoperable edges

Starq can own its routing policy, lifecycle semantics, evidence schema, worker admission, recovery rules and gateway integrations without forking or claiming ownership of Cloudroom, Herdr, MCP or A2A. Compatibility adapters should not leak Starq's internal identity registry or Room ledger into external providers.
