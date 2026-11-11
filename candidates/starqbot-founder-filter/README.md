# StarqBot Founder-notification filter — candidate (decision 4b)

**Not deployed.** Prepared under Founder #18981, Room #18983 and #18993. The live gateway
(`D:\StarqTech\agent-comms\scripts\starq-bot-gateway.mjs`) was not edited, copied or restarted.

| File | Purpose |
|---|---|
| `founderNotificationFilter.mjs` | proposed replacement for `isFounderNotificationEligible` |
| `currentFilter.reference.mjs` | verbatim copy of the function running on 2026-11-11, for comparison only |
| `founderNotificationFilter.test.mjs` | tests; run `node --test` in this folder |

## The change

When the action-required text begins with an owner prefix, the live function reads only that
first owner. A record such as Room #18958 — "codex: …. mustarq: …" — is suppressed although it
is addressed to the Founder. The candidate also reads owner prefixes that follow a clause
boundary (`.`, `;` or a new line) and end in a colon.

Unchanged: broker type must be ACTION_REQUIRED, `mustarq` must be in the audience, the sender
must not be the Founder, NONE and empty action text are refused. The candidate only adds
deliveries.

The whole diff against the live function is the block after `const first = …`:

```diff
-  if (ownerPrefix) {
-    const owners = ownerPrefix[1].split(/[\/,]/).map((owner) => owner.trim().replace(/^@/, ''));
-    return owners.some((owner) => owner === 'MUSTARQ' || owner === 'ALI' || owner === 'FOUNDER');
-  }
+  if (first) {
+    if (namesFounder(ownersOf(first[1]))) return true;
+    for (const later of normalized.matchAll(LATER_OWNER_PREFIX)) {
+      if (namesFounder(ownersOf(later[1]))) return true;
+    }
+    return false;
+  }
```

## Evidence (2026-11-11, local)

- `node --test`: 7 tests, 7 pass.
- Read-only comparison over 8,995 real Room records (#10000 to #18994) through
  `readRoomSnapshot()`: 365 delivered by both versions, **0 lost**, 41 gained. The gained set
  includes #18958.

## Known limits

- A first owner written with a pane qualifier (`claude#w3:p1: …`) is not recognised as an owner
  prefix by either version; both fall back to a word match. Not changed here.
- Later owners are recognised only with a colon, by design, to avoid treating dashes inside a
  sentence as owners.
- The 41 historical gains were not individually read; some may be records the Founder would
  consider noise.

## Before activation

1. A versioned home for the gateway source (#18871), so the change can be applied as a real
   diff and reviewed.
2. Independent review of this candidate.
3. Apply to the gateway and run the gateway's own existing tests in the live tree.
4. A planned gateway restart, with Founder approval. No cursor reset, no replay.
