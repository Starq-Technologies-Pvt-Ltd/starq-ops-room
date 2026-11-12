#!/usr/bin/env bash
# CONTROLLED LIVE APPLICATION of the ingress stale-lock guard, under Founder #19148 and Acting CE #19149.
# Reviewed material: commit ef6079f, OpenCode PASS #19143, patch sha 568b7e9ac5acfb15.
# No restart of the gateway, dispatcher or any session; no state, cursor or lease touched; nothing planted in
# agent-comms\locks. Long-running processes keep the old withLock until they restart (accepted).
#   bash apply-live.sh phase1            preconditions + verified backup; prints the backup path (post it in Room)
#   bash apply-live.sh phase2 <backup>   apply the reviewed diff, node --check, focused live test
set -euo pipefail
LIVE=/d/StarqTech/agent-comms
HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="$HERE/ingress-stale-lock.patch"
INSTANCE=509bf943-f40a-463e-9912-6e8cc3a7ded3
EXPECT_INGRESS=ef9c84781e7831a309c9d5356e7f133e8bee0223aaf675cfb869634b400a74a4
EXPECT_PATCH=568b7e9ac5acfb150d8c1e8ef252476eefc558436e3ac2b7fc54307af360e255
EXPECT_LOCKMOD=2f100588e2c4af84cc49db7e9a585978a8ebb433710197b4a6a9c11d260da6c4
t0=$(date +%s%N); lap() { local t=$(date +%s%N); printf '%-56s %6d ms\n' "$1" $(( (t - t0) / 1000000 )); t0=$t; }

phase1() {
  echo "== 1. preconditions"
  [ "$(sha256sum "$LIVE/protocol/v1/ingress.mjs" | cut -d' ' -f1)" = "$EXPECT_INGRESS" ] || { echo "ABORT: live ingress.mjs differs from the reviewed version"; exit 1; }
  [ "$(sha256sum "$PATCH" | cut -d' ' -f1)" = "$EXPECT_PATCH" ] || { echo "ABORT: patch sha differs from the reviewed one"; exit 1; }
  [ ! -e "$LIVE/protocol/v1/ingressLock.mjs" ] || { echo "ABORT: ingressLock.mjs already exists live"; exit 1; }
  [ ! -e "$LIVE/locks/ingress.lock" ] || { echo "ABORT: ingress.lock exists right now (someone is mid-write or a stale lock); look first"; exit 1; }
  lap "preconditions"
  echo "== 2. verified backup, before any change"
  BK="$LIVE/backups/ingress-lock-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BK" && cp "$LIVE/protocol/v1/ingress.mjs" "$BK/ingress.mjs"
  (cd "$BK" && sha256sum ingress.mjs > SHA256SUMS && sha256sum -c SHA256SUMS)
  echo "BACKUP_DIR=$BK"; lap "backup + sha check"
}

phase2() {
  BK="${1:?backup dir required}"
  [ -f "$BK/SHA256SUMS" ] && (cd "$BK" && sha256sum -c SHA256SUMS >/dev/null) || { echo "ABORT: backup missing or does not verify"; exit 1; }
  [ "$(sha256sum "$LIVE/protocol/v1/ingress.mjs" | cut -d' ' -f1)" = "$EXPECT_INGRESS" ] || { echo "ABORT: live ingress.mjs changed since the backup"; exit 1; }
  [ ! -e "$LIVE/protocol/v1/ingressLock.mjs" ] || { echo "ABORT: ingressLock.mjs already exists live"; exit 1; }
  echo "== 3. apply only the reviewed diff (built in scratch first, then two files copied)"
  S="/d/StarqTech/scratch/ingress-lock-apply-$$"; rm -rf "$S"; mkdir -p "$S/protocol/v1"
  cp "$LIVE/protocol/v1/ingress.mjs" "$S/protocol/v1/ingress.mjs"
  (cd "$S" && git init -q . && git apply --whitespace=nowarn "$PATCH")
  [ "$(sha256sum "$S/protocol/v1/ingressLock.mjs" | cut -d' ' -f1)" = "$EXPECT_LOCKMOD" ] || { echo "ABORT: module sha differs from the reviewed one"; exit 1; }
  node --check "$S/protocol/v1/ingress.mjs" && node --check "$S/protocol/v1/ingressLock.mjs" && echo "node --check ok on both"
  cp "$S/protocol/v1/ingressLock.mjs" "$LIVE/protocol/v1/ingressLock.mjs"
  cp "$S/protocol/v1/ingress.mjs" "$LIVE/protocol/v1/ingress.mjs"
  echo "AFTER ingress.mjs $(sha256sum "$LIVE/protocol/v1/ingress.mjs" | cut -d' ' -f1)"
  echo "AFTER ingressLock.mjs $(sha256sum "$LIVE/protocol/v1/ingressLock.mjs" | cut -d' ' -f1)"
  lap "apply"
  echo "== 4. focused live test: two senders racing, then no lock left behind"
  cd "$LIVE"
  node --check protocol/v1/ingress.mjs && node --check protocol/v1/ingressLock.mjs
  post() { node scripts/send.mjs --room --from claude --instance "$INSTANCE" --task COMMS-INGRESS-LOCK-GUARD --action done \
    --subject "Live check $1: ingress stale-lock guard applied" --action-required NONE \
    --body "Live focused check $1 of the stale-lock guard (Founder #19148, Acting CE #19149). Two posts were sent at the same moment; both must be stored. No action needed." 2>&1; }
  post A > "$S/ilg-a.out" & PA=$!
  post B > "$S/ilg-b.out" & PB=$!
  RA=0; RB=0; wait $PA || RA=$?; wait $PB || RB=$?
  echo "exit codes A=$RA B=$RB"; head -2 "$S/ilg-a.out"; head -2 "$S/ilg-b.out"; rm -f "$S/ilg-a.out" "$S/ilg-b.out"
  [ "$RA" = 0 ] && [ "$RB" = 0 ] || { echo "FAIL: a post failed; run rollback-live.sh $BK NOW"; exit 2; }
  [ ! -e locks/ingress.lock ] && [ ! -e locks/ingress.lock.reap ] && echo "OK: no ingress.lock or .reap left behind" || { echo "FAIL: lock file remains; run rollback-live.sh $BK"; exit 2; }
  lap "live test (two racing posts)"
  echo "== DONE. Backup $BK. Rollback: bash rollback-live.sh $BK"
}

case "${1:-}" in phase1) phase1 ;; phase2) shift; phase2 "$@" ;; *) echo "usage: $0 phase1 | phase2 <backup dir>"; exit 1 ;; esac
