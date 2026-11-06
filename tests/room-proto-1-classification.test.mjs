import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEventRouting,
  isNoneActionRequired,
  isOutstandingAction,
} from '../protocol/v1/authorityPolicy.mjs';

test('ROOM-PROTO-1: isNoneActionRequired normalizes empty and NONE variants', () => {
  assert.equal(isNoneActionRequired('NONE'), true);
  assert.equal(isNoneActionRequired('none'), true);
  assert.equal(isNoneActionRequired('None'), true);
  assert.equal(isNoneActionRequired('NONE — WP-V1 in progress'), true);
  assert.equal(isNoneActionRequired('NONE - standing by'), true);
  assert.equal(isNoneActionRequired('NONE: done'), true);
  assert.equal(isNoneActionRequired(''), true);
  assert.equal(isNoneActionRequired('   '), true);

  assert.equal(isNoneActionRequired(null), false);
  assert.equal(isNoneActionRequired(undefined), false);
  assert.equal(isNoneActionRequired('@vision: review report'), false);
  assert.equal(isNoneActionRequired('Founder decision required'), false);
  assert.equal(isNoneActionRequired('NONEXISTENT_FLAG'), false);
});

test('ROOM-PROTO-1: CORE_AGENT ACK with actionRequired: "NONE" routes as CC_CONTEXT', () => {
  const result = evaluateEventRouting(
    'antigravity',
    'Reply to #18298: @claude @mustarq ACK and starting WP-R1',
    ['claude', 'mustarq'],
    { actionRequired: 'NONE — task execution started by @antigravity', action: 'started' }
  );

  assert.equal(result.deliveryType, 'CC_CONTEXT');
  assert.equal(result.authorityReason, 'Standard Transmission');
  assert.deepEqual(result.targetAudience, ['claude', 'mustarq']);
});

test('ROOM-PROTO-1: CORE_AGENT ACK of #18313 (@vision) routes as CC_CONTEXT under new rule', () => {
  // Re-evaluating exact Vision #18313 payload:
  const result = evaluateEventRouting(
    'vision',
    '@claude @mustarq — @vision READINESS + ROLE ACK (Session: vision-wp-v1-20261106)',
    ['claude', 'mustarq', 'antigravity'],
    {
      actionRequired: 'NONE — WP-V1 baseline in progress; standing by as independent reviewer for WP-R1',
      action: null,
      status: 'Posted',
    }
  );

  assert.equal(result.deliveryType, 'CC_CONTEXT');
  assert.equal(result.authorityReason, 'Standard Transmission');
});

test('ROOM-PROTO-1: CORE_AGENT genuine directive routes as ACTION_REQUIRED (Lane Dispatch)', () => {
  const result = evaluateEventRouting(
    'claude',
    'ROOM-PROTO-1 — OWNER @antigravity — Fix Room ACTION_REQUIRED mis-classification',
    ['antigravity', 'vision'],
    {
      actionRequired: '@antigravity: implement the classification fix per root cause; @vision reviews',
      action: null,
      status: 'Posted',
    }
  );

  assert.equal(result.deliveryType, 'ACTION_REQUIRED');
  assert.equal(result.authorityReason, 'Lane Dispatch');
  assert.deepEqual(result.targetAudience, ['antigravity', 'vision']);
});

test('ROOM-PROTO-1: Founder directive on directed mention remains ACTION_REQUIRED (Founder Directive)', () => {
  const result = evaluateEventRouting(
    'mustarq',
    '@antigravity proceed with WP-R1 report',
    ['antigravity'],
    { actionRequired: 'Deliver report' }
  );

  assert.equal(result.deliveryType, 'ACTION_REQUIRED');
  assert.equal(result.authorityReason, 'Founder Directive');
});

test('ROOM-PROTO-1: Founder broadcast remains ACTION_REQUIRED', () => {
  const result = evaluateEventRouting(
    'mustarq',
    '@all sitrep update for all agents',
    [],
    {}
  );

  assert.equal(result.deliveryType, 'ACTION_REQUIRED');
  assert.equal(result.authorityReason, 'Founder Directive');
  assert.equal(result.targetAudience, 'ALL');
});

test('ROOM-PROTO-1: Hermes-delegated Founder directive remains ACTION_REQUIRED', () => {
  const result = evaluateEventRouting(
    'deadpool',
    '@antigravity Founder instructs you to proceed',
    ['antigravity'],
    { onBehalfOf: 'mustarq', delegated: true }
  );

  assert.equal(result.deliveryType, 'ACTION_REQUIRED');
  assert.equal(result.authorityReason, 'Founder Directive (delegated)');
});

test('ROOM-PROTO-1: Backward compatibility: legacy CORE_AGENT mention without actionRequired defaults to ACTION_REQUIRED', () => {
  // Legacy call without structured actionRequired metadata preserves existing Lane Dispatch behavior
  const result = evaluateEventRouting(
    'codex',
    '@cursor please investigate schema drift',
    ['cursor'],
    {}
  );

  assert.equal(result.deliveryType, 'ACTION_REQUIRED');
  assert.equal(result.authorityReason, 'Lane Dispatch');
});

test('ROOM-PROTO-1: View-layer derivation correctly reclassifies historical Record #18313 as NOT outstanding', () => {
  // Exact historical Record #18313 structure from room.jsonl
  const record18313 = {
    brokerSequence: 18313,
    evaluatedAudience: ['claude', 'mustarq', 'vision', 'antigravity', 'copilot'],
    evaluatedDeliveryType: 'ACTION_REQUIRED', // Historical broker stamp
    event: {
      senderHandle: 'vision',
      body: '@claude @mustarq — @vision READINESS + ROLE ACK...',
      metadata: {
        subject: 'WP-V1 + reviewer/verifier role ACK',
        status: 'Posted',
        actionRequired: 'NONE — WP-V1 baseline in progress; standing by as independent reviewer for WP-R1',
      },
    },
  };

  // Under the derived view rule, #18313 is NOT an outstanding action for anyone
  assert.equal(isOutstandingAction(record18313), false);
  assert.equal(isOutstandingAction(record18313, 'claude'), false);
  assert.equal(isOutstandingAction(record18313, 'antigravity'), false);
  assert.equal(isOutstandingAction(record18313, 'mustarq'), false);
});

test('ROOM-PROTO-1: View-layer derivation classifies genuine assignment #18315 as outstanding', () => {
  const record18315 = {
    brokerSequence: 18315,
    evaluatedAudience: ['antigravity', 'vision', 'copilot'],
    evaluatedDeliveryType: 'ACTION_REQUIRED',
    event: {
      senderHandle: 'claude',
      body: 'ROOM-PROTO-1 — OWNER @antigravity — Fix Room ACTION_REQUIRED mis-classification',
      metadata: {
        subject: 'ROOM-PROTO-1 — fix ACTION_REQUIRED mis-classification of ACKs at source',
        status: 'Posted',
        actionRequired: '@antigravity: implement the classification fix per root cause; @vision reviews',
      },
    },
  };

  assert.equal(isOutstandingAction(record18315), true);
  assert.equal(isOutstandingAction(record18315, 'antigravity'), true);
  assert.equal(isOutstandingAction(record18315, 'vision'), true);
  assert.equal(isOutstandingAction(record18315, 'claude'), false); // Sender cannot have outstanding action on self
  assert.equal(isOutstandingAction(record18315, 'deadpool'), false); // Not in audience
});

test('ROOM-PROTO-1: View-layer derivation treats completed/accepted lifecycle with NONE as not outstanding', () => {
  const recordCompleted = {
    brokerSequence: 18300,
    evaluatedAudience: ['claude'],
    evaluatedDeliveryType: 'ACTION_REQUIRED',
    event: {
      senderHandle: 'antigravity',
      action: 'done',
      body: 'WP-R1 complete',
      metadata: {
        actionRequired: 'NONE',
        status: 'Awaiting Review',
      },
    },
  };

  assert.equal(isOutstandingAction(recordCompleted), false);
});
