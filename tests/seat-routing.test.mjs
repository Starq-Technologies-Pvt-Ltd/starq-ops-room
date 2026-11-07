import test from 'node:test';
import assert from 'node:assert/strict';
import { seatTargetsFor, shouldWakeSeat, seatFromEnv } from '../protocol/v1/seatRouting.mjs';

function rec({ seq = 100, sender = 'codex', body = '', actionRequired = undefined,
  deliveryType = 'ACTION_REQUIRED', audience = ['claude'] } = {}) {
  const metadata = {};
  if (actionRequired !== undefined) metadata.actionRequired = actionRequired;
  return {
    brokerSequence: seq,
    evaluatedDeliveryType: deliveryType,
    evaluatedAudience: audience,
    event: { senderHandle: sender, body, mentions: audience, metadata },
  };
}

const HERDR = { handle: 'claude', seatId: 'herdr-elder', role: 'floor', isDefault: true };
const WSL = { handle: 'claude', seatId: 'wsl', role: 'builder-wsl', isDefault: false };
const CLOUD = { handle: 'claude', seatId: 'cloudroom', role: 'coordinator', isDefault: false };

// ---- seatTargetsFor ----------------------------------------------------------
test('seatTargets: unqualified -> []', () => {
  assert.deepEqual(seatTargetsFor(rec({ actionRequired: '@claude review this' }), 'claude'), []);
});
test('seatTargets: #id and :role captured', () => {
  assert.deepEqual(seatTargetsFor(rec({ actionRequired: '@claude#wsl build' }), 'claude'), ['wsl']);
  assert.deepEqual(seatTargetsFor(rec({ actionRequired: '@claude:floor coordinate' }), 'claude'), ['floor']);
});
test('seatTargets: multiple, de-duped', () => {
  assert.deepEqual(seatTargetsFor(rec({ actionRequired: '@claude#wsl and @claude:floor and @claude#wsl' }), 'claude'), ['wsl', 'floor']);
});
test('seatTargets: qualifier for a different handle is ignored', () => {
  assert.deepEqual(seatTargetsFor(rec({ actionRequired: '@codex#x build; @claude review' }), 'claude'), []);
});

// ---- shouldWakeSeat: unqualified -> only default ----------------------------
test('unqualified @claude directive wakes ONLY the default seat', () => {
  const r = rec({ actionRequired: '@claude: review the report' });
  assert.equal(shouldWakeSeat(r, HERDR), true);   // default
  assert.equal(shouldWakeSeat(r, WSL), false);    // not default
  assert.equal(shouldWakeSeat(r, CLOUD), false);  // not default
});

// ---- shouldWakeSeat: qualified -> only matching seat ------------------------
test('@claude#wsl wakes only the wsl seat (by seatId)', () => {
  const r = rec({ actionRequired: '@claude#wsl implement the fix' });
  assert.equal(shouldWakeSeat(r, WSL), true);
  assert.equal(shouldWakeSeat(r, HERDR), false);  // default does NOT steal a seat-targeted action
  assert.equal(shouldWakeSeat(r, CLOUD), false);
});
test('@claude:coordinator wakes the cloud seat (by role)', () => {
  const r = rec({ actionRequired: '@claude:coordinator sequence the work' });
  assert.equal(shouldWakeSeat(r, CLOUD), true);
  assert.equal(shouldWakeSeat(r, HERDR), false);
  assert.equal(shouldWakeSeat(r, WSL), false);
});
test('multi-seat target wakes each named seat', () => {
  const r = rec({ actionRequired: '@claude#wsl @claude:floor divide the lanes' });
  assert.equal(shouldWakeSeat(r, WSL), true);
  assert.equal(shouldWakeSeat(r, HERDR), true);   // matched by role 'floor'
  assert.equal(shouldWakeSeat(r, CLOUD), false);
});

// ---- ROOM-PROTO-1 gate still applies to every seat --------------------------
test('NONE ack wakes no seat', () => {
  const r = rec({ deliveryType: 'CC_CONTEXT', actionRequired: 'NONE — standing by' });
  for (const s of [HERDR, WSL, CLOUD]) assert.equal(shouldWakeSeat(r, s), false);
});
test('cross-agent assignment (@codex) wakes no claude seat', () => {
  const r = rec({ audience: ['codex', 'claude'], actionRequired: '@codex: build the module' });
  for (const s of [HERDR, WSL, CLOUD]) assert.equal(shouldWakeSeat(r, s), false);
});
test('Founder @all broadcast (ACTION_REQUIRED) wakes the default seat only', () => {
  const r = rec({ sender: 'mustarq', audience: 'ALL', actionRequired: '@all stand up' });
  assert.equal(shouldWakeSeat(r, HERDR), true);
  assert.equal(shouldWakeSeat(r, WSL), false);
});

// ---- seatFromEnv -------------------------------------------------------------
test('seatFromEnv reads config with safe defaults', () => {
  assert.deepEqual(
    seatFromEnv('claude', { COMMS_SEAT_ID: 'wsl', COMMS_SEAT_ROLE: 'builder-wsl', COMMS_SEAT_DEFAULT: '0' }),
    { handle: 'claude', seatId: 'wsl', role: 'builder-wsl', isDefault: false },
  );
  assert.deepEqual(
    seatFromEnv('claude', { COMMS_SEAT_DEFAULT: 'true' }),
    { handle: 'claude', seatId: null, role: null, isDefault: true },
  );
  // No env -> single-seat-safe (not default unless opted in)
  assert.equal(seatFromEnv('claude', {}).isDefault, false);
});
