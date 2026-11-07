# Evidence, provenance and review contract

## Every receipt answers five questions

1. **Which task and authority?** `project`, task ID, Cloudroom thread, originating Room dispatch, scope and decision refs.
2. **Who actually performed it?** Canonical handle, concrete `instanceId`/seat, harness identity, author/committer attribution, separate reviewer identity.
3. **What changed?** Repository, base SHA, branch/worktree, PR URL, immutable full head SHA, changed files and scope boundaries.
4. **How was it checked?** Exact commands, test counts with skipped/failures, CI run URLs, environment and known limitations; reviewer re-runs at reviewed SHA.
5. **What is the result?** Delivered ≠ accepted ≠ merged ≠ Cloudroom Done; link the separate records with eventIds and broker sequences.

## Machine-readable delivery receipt (example)

```json
{
  "taskId": "HOA-250",
  "dispatchEventId": "room-event-dispatch-id",
  "worker": {"handle": "antigravity", "instanceId": "hoadhaa-seat-uuid"},
  "repo": "Starq-Technologies-Pvt-Ltd/hoadhaa",
  "baseSha": "9c431a98ef97b2b71d4466ab9ca7e09f153084b1",
  "pr": "https://github.com/Starq-Technologies-Pvt-Ltd/hoadhaa/pull/6",
  "headSha": "56330510032c5078fe9482dcdd4984d8f0bc6b59",
  "checks": [
    {"command": "npm run test:core", "passed": 158, "failed": 0, "skipped": 0},
    {"command": "npm run test:arch:graph", "passed": 32, "failed": 0, "skipped": 0}
  ],
  "limitations": ["SF5 deferred; outside this engineering packet"],
  "status": "DELIVERED_FOR_REVIEW"
}
```

## Independent verification

Vision should inspect actual source at the PR head, re-run the relevant tests, identify any skipped assertions or unsupported claims, confirm that the candidate is the same immutable SHA being routed to merge, and post an attributable Room verdict. The reviewer does not become a builder or an auto-merge engine. Cloudroom may authorize merging a previously reviewed unchanged head only under a specific Founder instruction.

## Source and trust precedence

1. Current authenticated Founder decision and Cloudroom task requirements govern scope.
2. Room dispatch/corrections establish who was assigned what and when.
3. GitHub immutable commit/CI/PR evidence establishes code status.
4. Independent Vision verdict establishes review acceptance.
5. Cloudroom board establishes lifecycle status; the Room event is a corroborating record.
6. Starq Recall can locate historical decisions by seq and snapshot line; historic context is never automatically current authority.

## Do not mix review evidence with disclosure

Some operational records are useful internally but are not to be committed to a public source repository: raw Room history, identity registry, credentials, live company documents, user/customer communications or full archived search corpora. Commit code and sanitized fixtures; retain live evidence in its authoritative storage and link through controlled references.
