import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionRequiredOwners,
  isActionAddressedTo,
  isOutstandingAction,
} from '../protocol/v1/authorityPolicy.mjs';
import { isRelevant, isSuppressedDeadpoolDigest } from '../scripts/room-watch-claude-herdr.mjs';

// Build a raw broker record in the shape readRoomSnapshot() yields.
function rec({ seq = 100, sender = 'codex', body = '', subject = '', actionRequired = undefined,
  action = undefined, deliveryType = 'ACTION_REQUIRED', audience = ['claude'] } = {}) {
  const metadata = { subject };
  if (actionRequired !== undefined) metadata.actionRequired = actionRequired;
  if (action !== undefined) metadata.action = action;
  return {
    brokerSequence: seq,
    eventId: `evt-${seq}`,
    evaluatedDeliveryType: deliveryType,
    evaluatedAudience: audience,
    event: { senderHandle: sender, body, mentions: audience, metadata, action },
  };
}

// ---- actionRequiredOwners ---------------------------------------------------
test('owners: NONE / empty / absent -> []', () => {
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: 'NONE' })), []);
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: 'NONE — standing by' })), []);
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: '' })), []);
  assert.deepEqual(actionRequiredOwners(rec({})), []);
});
test('owners: @all/@team/@everyone -> [all]', () => {
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: '@all review the plan' })), ['all']);
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: '@team sync' })), ['all']);
});
test('owners: named seats are extracted and de-duped', () => {
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: '@codex build; @claude review' })), ['codex', 'claude']);
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: '@claude @claude confirm' })), ['claude']);
});
test('owners: free-text ask with no @handle -> []', () => {
  assert.deepEqual(actionRequiredOwners(rec({ actionRequired: 'review the PR before EOD' })), []);
});

// ---- isActionAddressedTo ----------------------------------------------------
test('addressedTo: named owner matches / cc-only does not', () => {
  assert.equal(isActionAddressedTo(rec({ actionRequired: '@claude review' }), 'claude'), true);
  assert.equal(isActionAddressedTo(rec({ actionRequired: '@codex build' }), 'claude'), false);
  assert.equal(isActionAddressedTo(rec({ actionRequired: '@codex @claude note' }), 'claude'), true);
  assert.equal(isActionAddressedTo(rec({ actionRequired: '@all review' }), 'claude'), true);
  assert.equal(isActionAddressedTo(rec({ actionRequired: 'review the PR' }), 'claude'), true); // no owner -> not excluded
  assert.equal(isActionAddressedTo(rec({ actionRequired: 'NONE' }), 'claude'), true);          // no owner -> not excluded (outstanding gate handles NONE)
});

// ---- isRelevant (the watcher's wake decision) -------------------------------
test('relevant: genuine directive addressed to claude -> wake', () => {
  assert.equal(isRelevant(rec({ sender: 'codex', actionRequired: '@claude: review the reconciliation report' })), true);
});
test('relevant: ACK with actionRequired NONE -> suppress', () => {
  assert.equal(isRelevant(rec({ sender: 'vision', deliveryType: 'CC_CONTEXT', actionRequired: 'NONE — standing by as reviewer' })), false);
});
test('relevant: cross-agent assignment (claude only cc) -> suppress', () => {
  assert.equal(isRelevant(rec({ sender: 'codex', audience: ['codex', 'claude'], actionRequired: '@codex: build the module' })), false);
});
test('relevant: own posts -> suppress', () => {
  assert.equal(isRelevant(rec({ sender: 'claude', actionRequired: '@claude review' })), false);
});
test('relevant: Founder posts always surface', () => {
  assert.equal(isRelevant(rec({ sender: 'mustarq', deliveryType: 'CC_CONTEXT', actionRequired: 'NONE' })), true);
  assert.equal(isRelevant(rec({ sender: 'ali', deliveryType: 'CC_CONTEXT' })), true);
});
test('relevant: WATCHER-TEST hook surfaces from any sender', () => {
  assert.equal(isRelevant(rec({ sender: 'deadpool', body: '[WATCHER-TEST] ping', deliveryType: 'CC_CONTEXT' })), true);
});
test('relevant: Deadpool routine digest suppressed; escalation evaluated canonically', () => {
  assert.equal(isSuppressedDeadpoolDigest(rec({ sender: 'deadpool', subject: 'Wade Wire morning brief' })), true);
  assert.equal(isRelevant(rec({ sender: 'deadpool', subject: 'Wade Wire morning brief', deliveryType: 'CC_CONTEXT' })), false);
  // escalation digest is not force-suppressed; falls through to canonical classifier
  assert.equal(isSuppressedDeadpoolDigest(rec({ sender: 'deadpool', subject: 'Floor Drop', body: 'blocker: build failure, action required' })), false);
});
test('relevant: legacy ACTION_REQUIRED (no structured field) addressed to claude still wakes', () => {
  assert.equal(isRelevant(rec({ sender: 'codex', body: '@claude please route this', audience: ['claude'], deliveryType: 'ACTION_REQUIRED' /* actionRequired absent */ })), true);
});
test('relevant: broadcast CC_CONTEXT with no action -> suppress', () => {
  assert.equal(isRelevant(rec({ sender: 'codex', deliveryType: 'CC_CONTEXT', audience: 'ALL' })), false);
});
