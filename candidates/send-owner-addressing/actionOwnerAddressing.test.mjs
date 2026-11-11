import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Real identity registry and real broker routing from the live tree, read-only.
process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'D:/StarqTech/agent-comms/tests/fixtures/identities.json';
const live = (rel) => pathToFileURL('D:/StarqTech/agent-comms/' + rel).href;
const { resolveIdentity } = await import(live('protocol/v1/identityProvider.mjs'));
const { evaluateEventRouting } = await import(live('protocol/v1/authorityPolicy.mjs'));
const { ensureOwnersAddressed, namedOwners } = await import('./actionOwnerAddressing.mjs');

const route = (from, body, actionRequired) => evaluateEventRouting(from, body, [], { actionRequired });
const fix = (from, body, actionRequired) => ensureOwnersAddressed({ body, actionRequired, sender: from, resolveIdentity });

// Shapes taken from Room #19050 and #19051 (text shortened).
const R19050 = { from: 'claude', action: 'codex: review the diff and say whether to switch the layout on; activation needs a gateway restart.', body: 'Telegram readability (#19039, delegated in #19043) - implementation and evidence from Ops Deputy, pane w3:p1. Not activated.\nWHAT: a second layout.' };
const R19051 = { from: 'claude', action: 'codex: include this change in the review of #19050.', body: 'Network-failure gap closed in StarqBot - Ops Deputy. For Codex\'s review alongside #19050.' };

test('the defect: an owner named only in the action text is broadcast as CC_CONTEXT today', () => {
  for (const r of [R19050, R19051]) {
    const before = route(r.from, r.body, r.action);
    assert.equal(before.deliveryType, 'CC_CONTEXT');
    assert.equal(before.targetAudience, 'ALL');
  }
});

test('with the fix the same records route as ACTION_REQUIRED to the owner only', () => {
  for (const r of [R19050, R19051]) {
    const fixed = fix(r.from, r.body, r.action);
    assert.equal(fixed.changed, true);
    assert.deepEqual(fixed.added, ['@codex']);
    assert.ok(fixed.body.startsWith('To: @codex\n\n'));
    assert.ok(fixed.body.endsWith(r.body), 'original body kept verbatim after the header');
    const after = route(r.from, fixed.body, r.action);
    assert.equal(after.deliveryType, 'ACTION_REQUIRED');
    assert.deepEqual(after.targetAudience, ['codex']);
  }
});

test('ordinary FYIs are unchanged: NONE, empty, missing, free text, and owner words that are not identities', () => {
  for (const action of ['NONE', 'none', 'NONE: nothing needed', 'NONE - fyi', '', null, undefined, 'UNKNOWN',
    'Please look at this when you can', 'Decision: pick one', 'Note: nothing here']) {
    const r = fix('claude', 'Plain status post.', action);
    assert.equal(r.changed, false, JSON.stringify(action));
    assert.equal(r.body, 'Plain status post.');
  }
});

test('a body that already @mentions the owner is left alone', () => {
  const r = fix('claude', '@codex please review.', 'codex: review');
  assert.equal(r.changed, false);
  assert.equal(r.body, '@codex please review.');
});

test('several owners: only the missing ones are added, qualifiers are kept', () => {
  const r = fix('mustarq', '@codex hello', 'codex: a. claude#w3:p1: b; antigravity#w2:p1: c');
  assert.deepEqual(r.added, ['@claude#w3:p1', '@antigravity#w2:p1']);
  assert.ok(r.body.startsWith('To: @claude#w3:p1 @antigravity#w2:p1\n\n@codex hello'));
});

test('owner lists, the Founder aliases, and the sender itself', () => {
  assert.deepEqual(namedOwners('mustarq/codex: decide', resolveIdentity).map((o) => o.handle), ['mustarq', 'codex']);
  assert.deepEqual(namedOwners('Founder: decide', resolveIdentity).map((o) => o.handle), ['mustarq']);
  assert.deepEqual(namedOwners('claude: note to self. codex: act', resolveIdentity, 'claude').map((o) => o.handle), ['codex']);
  const self = fix('claude', 'x', 'claude: remember this');
  assert.equal(self.changed, false);
});

test('a URL colon is not an owner prefix, and retired seats are not addressed', () => {
  assert.equal(fix('claude', 'x', 'see https://example.test/a: nothing').changed, false);
  assert.equal(fix('claude', 'x', 'nexus: something').changed, false);
});

test('a Founder-directed record that carries no owner text is not touched', () => {
  const r = fix('mustarq', '@codex hello', 'Respond in Room to this Founder-directed message');
  assert.equal(r.changed, false);
});

test('regression over real Room history: every owner-only CC_CONTEXT handback is found, FYIs are not', async () => {
  const { readRoomSnapshot } = await import(live('scripts/room.mjs'));
  const snap = readRoomSnapshot();
  assert.equal(snap.state, 'OK');
  let ownerOnly = 0; let wouldChange = 0; let none = 0; let noneChanged = 0;
  for (const rec of snap.records) {
    if (rec.brokerSequence < 18500 || rec.evaluatedDeliveryType !== 'CC_CONTEXT') continue;
    const ar = rec.event?.metadata?.actionRequired;
    let owners; try { owners = namedOwners(ar, resolveIdentity, null); } catch { continue; }
    if (/^\s*none\b/i.test(String(ar ?? ''))) { none += 1; const r = ensureOwnersAddressed({ body: String(rec.event.body ?? ''), actionRequired: ar, sender: rec.event.senderHandle, resolveIdentity }); if (r.changed) noneChanged += 1; continue; }
    if (owners.length) ownerOnly += 1;
    const r = ensureOwnersAddressed({ body: String(rec.event.body ?? ''), actionRequired: ar, sender: rec.event.senderHandle, resolveIdentity });
    if (r.changed) wouldChange += 1;
  }
  assert.equal(noneChanged, 0, 'no record with action NONE is ever changed');
  assert.ok(none > 20, 'enough NONE records were exercised');
  assert.ok(wouldChange >= 2, 'at least #19050 and #19051 are caught');
  console.log(`# history #18500+: CC_CONTEXT with NONE: ${none} (changed 0); CC_CONTEXT naming an owner: ${ownerOnly}; would be addressed: ${wouldChange}`);
});
