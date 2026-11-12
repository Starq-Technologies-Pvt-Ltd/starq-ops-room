#!/usr/bin/env bash
# Rollback rehearsal for PR #3 activation (Founder #19122 item 5, Room #19125, #19138).
# Pristine exported copies only, under D:\StarqTech\scratch. Touches no live runtime file, lease, cursor or config.
# The only live file READ is room-dispatcher.mjs (to hash and copy as the stand-in for "the live dispatcher").
set -u
BASE=/d/StarqTech/scratch/ops-rehearsal-20261112
WT=/d/StarqTech/.worktrees/starq-ops-room-sender-fix-pr3
SEATPATCH=/d/StarqTech/.worktrees/_patches/pr3-seat-table-refresh-v3-20261112.patch
LIVEDISP=/d/StarqTech/agent-comms/scripts/room-dispatcher.mjs
export TMP='D:\StarqTech\scratch\ops-rehearsal-20261112\tmp' TEMP='D:\StarqTech\scratch\ops-rehearsal-20261112\tmp' TMPDIR='D:\StarqTech\scratch\ops-rehearsal-20261112\tmp'
export COMMS_IDENTITIES_PATH=tests/fixtures/identities.json
cd "$BASE" || exit 1
rm -rf R0 R1 tmp live backup candidate.patch; mkdir -p R0 R1 tmp live backup
now() { date +%s%N; }
T0=$(now); step() { local t=$(now); printf '%-58s %6d ms\n' "$1" $(( (t - T0) / 1000000 )); T0=$t; }
tree() { (cd "$1" && find . -type f -not -path './node_modules/*' -not -path './.git/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16); }

echo "== A. export pristine PR #3 head and candidate (git archive, no worktree touched)"
git -C "$WT" archive 99fe117 | tar -x -C R0;                         step "export 99fe117 -> R0"
git -C "$WT" archive 99fe117 | tar -x -C R1;                         step "export 99fe117 -> R1 (working copy)"
mkdir -p RC && rm -rf RC && mkdir RC && git -C "$WT" archive cefafce | tar -x -C RC; step "export cefafce -> RC (reference)"
echo "tree R0=$(tree R0) R1=$(tree R1) RC=$(tree RC)"
git -C "$WT" diff --binary 99fe117 cefafce > candidate.patch;         step "make candidate patch 99fe117..cefafce"
echo "candidate.patch sha256 $(sha256sum candidate.patch | cut -c1-16) lines $(wc -l < candidate.patch)"
echo "seat patch sha256 $(sha256sum "$SEATPATCH" | cut -c1-16)"

echo "== B. apply, check fidelity, run suite"
(cd R1 && git init -q . && git apply --whitespace=nowarn ../candidate.patch) && echo "candidate applied"; step "apply candidate patch"
echo "tree R1 after candidate=$(tree R1)  reference RC=$(tree RC)"
[ "$(tree R1)" = "$(tree RC)" ] && echo "FIDELITY OK: applied tree == cefafce export" || echo "FIDELITY FAIL"
(cd R1 && git apply --whitespace=nowarn "$SEATPATCH") && echo "seat patch applied"; step "apply seat-table patch v3"
echo "tree R1 with seat table=$(tree R1)"
(cd R1 && node --test tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"); step "full suite on applied copy"

echo "== C. revert (reverse-apply in opposite order) and prove byte-identity with the pristine export"
(cd R1 && git apply -R --whitespace=nowarn "$SEATPATCH") && echo "seat patch reverted"; step "revert seat-table patch"
(cd R1 && git apply -R --whitespace=nowarn ../candidate.patch) && echo "candidate reverted"; step "revert candidate patch"
rm -rf R1/.git
echo "tree R1 after rollback=$(tree R1)  pristine R0=$(tree R0)"
[ "$(tree R1)" = "$(tree R0)" ] && echo "ROLLBACK IDENTICAL to pristine" || echo "ROLLBACK DIFFERS"

echo "== D. dispatcher file + state procedure per the amended plan (stand-ins in ./live; nothing live is written)"
TAIL=$(cd /d/StarqTech/starq-ops-room && node --input-type=module -e "import { readRoomSnapshot } from '../agent-comms/scripts/room.mjs'; console.log(readRoomSnapshot().tailSequence)")
cp "$LIVEDISP" live/room-dispatcher.mjs                              # one live file READ, copied
mkdir -p live/state-old && printf '{"lastSeq":19000,"delivered":["18999:x"],"pending":[],"held":[{"seq":19050}]}
' > live/state-old/room-dispatch.json
step "stand-in live dispatcher + synthetic OLD state (lastSeq 19000)"
BK=backup/pr3-activation-rehearsal
mkdir -p $BK/state && cp live/room-dispatcher.mjs $BK/ && cp live/state-old/room-dispatch.json $BK/state/
(cd $BK && find . -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS); step "Amendment B: backup taken before cutover, with SHA256SUMS"
cut -c1-16,65- $BK/SHA256SUMS
# cutover: PR #3 dispatcher file installed; it writes ONLY its own v2 files in an isolated dir; the old dir stays frozen
cp R0/scripts/room-dispatcher.mjs live/room-dispatcher.mjs; mkdir -p live/state-new
printf '{"checkpoint":%s,"routingHolds":[{"seq":19133,"reason":"UNADDRESSED"}]}
' "$TAIL" > live/state-new/room-dispatch.v2.json; step "cutover (stand-in): PR3 dispatcher; NEW v2 state; old dir untouched"
echo "old dir lastSeq still: $(grep -o '"lastSeq":[0-9]*' live/state-old/room-dispatch.json)  (frozen at cutover)"
# ROLLBACK per Amendment A and rollback steps 1-4 (steps 1 and 5 need the live keeper: not rehearsable here)
cp $BK/room-dispatcher.mjs live/room-dispatcher.mjs
(cd $BK && sha256sum -c SHA256SUMS 2>&1 | head -3)
echo "restored dispatcher sha $(sha256sum live/room-dispatcher.mjs | cut -c1-16) == live original $(sha256sum "$LIVEDISP" | cut -c1-16)"
cp live/state-old/room-dispatch.json live/state-old/room-dispatch.json.pre-rollback
node advance-lastseq.cjs live/state-old/room-dispatch.json "$TAIL"
rm -f live/seat-table.json; step "rollback: file restored+verified, old lastSeq advanced to tail, seat table removed"
echo "old state lastSeq now $(grep -o '"lastSeq":[0-9]*' live/state-old/room-dispatch.json); delivered/pending/held kept: $(grep -c 18999:x live/state-old/room-dispatch.json) ; evidence copy: $(grep -o '"lastSeq":[0-9]*' live/state-old/room-dispatch.json.pre-rollback); new v2 file kept: $(ls live/state-new)"
echo "ALTERNATIVE (not chosen): leaving the old state as it was would re-plan records 19001..$TAIL = $((TAIL-19000)) records on the first poll"
echo "== E. seat-table checks on the applied copy"
cd R1 2>/dev/null; echo "(R1 is back to pristine; checks below run on a fresh applied copy)"; cd ..
rm -rf R2 && mkdir R2 && git -C "$WT" archive cefafce | tar -x -C R2 && (cd R2 && git init -q . && git apply --whitespace=nowarn "$SEATPATCH" && node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateSeatTable, verifySeatEnrollment } from './protocol/v1/seatBinding.mjs';
import { readRoomSnapshot } from 'file:///D:/StarqTech/agent-comms/scripts/room.mjs';
const t = JSON.parse(readFileSync('config/seat-table.candidate.json','utf8'));
console.log('validateSeatTable', JSON.stringify(validateSeatTable(t)));
const m = new Map(readRoomSnapshot().records.map(r=>[r.brokerSequence,r]));
for (const s of t.seats) if (s.backend==='windows/default') console.log(s.seatId, JSON.stringify(verifySeatEnrollment(s,m)));
"); step "validateSeatTable + verifySeatEnrollment on v3"
echo "== DONE"
