#!/usr/bin/env bash
# ROLLBACK of the ingress stale-lock guard. NOT RUN. Needs no restart: send.mjs loads ingress.mjs per invocation.
# Usage: bash rollback-live.sh <backup directory printed by apply-live.sh>
set -euo pipefail
LIVE=/d/StarqTech/agent-comms
BK="${1:?backup directory required}"
INSTANCE=509bf943-f40a-463e-9912-6e8cc3a7ded3
[ -f "$BK/ingress.mjs" ] && [ -f "$BK/SHA256SUMS" ] || { echo "ABORT: not a valid backup directory"; exit 1; }
(cd "$BK" && sha256sum -c SHA256SUMS)
cp "$BK/ingress.mjs" "$LIVE/protocol/v1/ingress.mjs"
rm -f "$LIVE/protocol/v1/ingressLock.mjs"
echo "restored ingress.mjs $(sha256sum "$LIVE/protocol/v1/ingress.mjs" | cut -c1-16); module removed"
cd "$LIVE"
node scripts/send.mjs --room --from claude --instance "$INSTANCE" --task COMMS-INGRESS-LOCK-GUARD --action done \
  --subject "Rollback check: ingress stale-lock guard removed" --action-required NONE \
  --body "Rollback of the stale-lock guard verified by this post; the original ingress.mjs is back. No action needed." 2>&1 | head -3
[ ! -e locks/ingress.lock ] && echo "OK: no lock file left behind" || { echo "FAIL: lock file remains"; exit 2; }
