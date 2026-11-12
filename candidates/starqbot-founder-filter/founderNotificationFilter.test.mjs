import test from 'node:test';
import assert from 'node:assert/strict';
import { isFounderNotificationEligible as candidate } from './founderNotificationFilter.mjs';
import { isFounderNotificationEligible as current } from './currentFilter.reference.mjs';

function rec({
  type = 'ACTION_REQUIRED', audience = ['mustarq'], sender = 'codex', action = 'mustarq: decide', metadata,
} = {}) {
  return {
    evaluatedDeliveryType: type,
    evaluatedAudience: audience,
    event: { senderHandle: sender, metadata: metadata === undefined ? { actionRequired: action } : metadata },
  };
}

// Action texts taken from real Room records of 2026-11-11.
const ROOM_18958 = 'codex: consolidate into the Founder handover. mustarq: decide PR #204 review route and SoD policy items 4b-4d';
const ROOM_18975 = 'mustarq: confirm this message reached you on Telegram once, from StarqBot only, and choose 4b and 4c. codex: route 4a.';
const ROOM_18990 = 'claude#w3:p1: consolidate into the Operations record. mustarq/codex: PR #204 review-route decision still outstanding';

test('the defect: a later Founder owner is now delivered', () => {
  const r = rec({ audience: ['claude', 'mustarq', 'codex'], sender: 'claude', action: ROOM_18958 });
  assert.equal(current(r), false);
  assert.equal(candidate(r), true);
});

test('a later shared owner list naming the Founder is delivered', () => {
  const r = rec({ audience: ['claude', 'mustarq', 'codex'], sender: 'claude', action: 'codex: route. mustarq/codex: decide' });
  assert.equal(candidate(r), true);
  const semi = rec({ action: 'codex: route; @mustarq: decide' });
  assert.equal(candidate(semi), true);
  const newline = rec({ action: 'codex: route\nFounder: decide' });
  assert.equal(candidate(newline), true);
});

test('a first Founder owner is delivered, as today', () => {
  for (const action of [ROOM_18975, 'mustarq: decide', '@mustarq/codex: decide', 'Founder - approve', 'ALI: approve']) {
    const r = rec({ action });
    assert.equal(current(r), true, action);
    assert.equal(candidate(r), true, action);
  }
});

test('owners that never name the Founder stay suppressed', () => {
  for (const action of [
    'codex: route the decision',
    'codex: do this. claude: do that',
    'claude: consolidate. Note: mustarq was informed earlier',
    'codex: tell the Founder later',
    'codex: read the well-known mustarq-style note',
  ]) {
    const r = rec({ action });
    assert.equal(candidate(r), false, action);
  }
});

test('a qualified first handle falls back to the word match, as today', () => {
  // "claude#w3:p1:" is not an owner prefix for either version; both use the fallback.
  const r = rec({ audience: ['claude', 'mustarq'], sender: 'claude', action: ROOM_18990 });
  assert.equal(current(r), candidate(r));
});

test('authorization, audience, type, sender and NONE gates are unchanged', () => {
  assert.equal(candidate(rec({ type: 'CC_CONTEXT', action: ROOM_18958 })), false);
  assert.equal(candidate(rec({ audience: 'ALL', action: ROOM_18958 })), false);
  assert.equal(candidate(rec({ audience: ['codex'], action: ROOM_18958 })), false);
  assert.equal(candidate(rec({ sender: 'mustarq', action: ROOM_18958 })), false);
  assert.equal(candidate(rec({ sender: 'ali', action: ROOM_18958 })), false);
  for (const action of ['NONE', 'none', 'NONE: nothing', 'NONE - nothing', '', 'UNKNOWN']) {
    assert.equal(candidate(rec({ action })), false, JSON.stringify(action));
  }
  assert.equal(candidate(rec({ metadata: {} })), false);
  assert.equal(candidate(rec({ metadata: null })), false);
  assert.equal(candidate(null), false);
  assert.equal(candidate({}), false);
});

test('the candidate never removes a delivery the current filter makes', () => {
  const owners = ['mustarq', '@mustarq', 'Founder', 'ali', 'codex', 'claude', 'claude#w3:p1', 'mustarq/codex', 'codex, mustarq'];
  const seps = [': ', ' - ', ' — ', ':'];
  const tails = [
    'decide', 'decide. codex: route', 'decide; mustarq: confirm', 'ask the Founder', 'do it at 15:30. Then stop',
    'note. Re: mustarq decision', 'x\nmustarq: y', '',
  ];
  const texts = ['Founder to decide', 'mustarq please confirm', 'please route', 'Decision needed. 15:30 deadline for Founder',
    'NONE', 'Respond in Room to this Founder-directed message'];
  for (const o of owners) for (const s of seps) for (const t of tails) texts.push(`${o}${s}${t}`);
  let added = 0;
  for (const action of texts) {
    for (const audience of [['mustarq'], ['codex', 'mustarq'], ['codex'], 'ALL']) {
      for (const type of ['ACTION_REQUIRED', 'CC_CONTEXT']) {
        for (const sender of ['codex', 'claude', 'mustarq']) {
          const r = rec({ action, audience, type, sender });
          const was = current(r);
          const now = candidate(r);
          if (was) assert.equal(now, true, `regression for ${JSON.stringify(action)}`);
          if (!was && now) added += 1;
        }
      }
    }
  }
  assert.ok(added > 0, 'the candidate should add at least one delivery in this table');
});
