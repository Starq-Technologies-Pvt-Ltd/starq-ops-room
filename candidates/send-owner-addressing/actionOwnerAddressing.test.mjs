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

// ---- Revision 2: seat-qualified recipients (independent review, Room #19061) ----
const { selectWakeTargets } = await import(live('protocol/v1/sessionRouting.mjs'));
process.env.COMMS_DISPATCH_STATE_DIR = process.env.COMMS_DISPATCH_STATE_DIR || new URL('./.tmp-dispatch/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dispatcher = await import(live('scripts/room-dispatcher.mjs'));
import { rmSync } from 'node:fs';
process.on('exit', () => { try { rmSync(process.env.COMMS_DISPATCH_STATE_DIR, { recursive: true, force: true }); } catch {} });

const sess = (agent, id, pane) => ({ agent, agent_session: { value: id }, agent_status: 'idle', cwd: 'D:\StarqTech\projects\starqerp', pane_id: pane, workspace_id: pane.split(':')[0], _host: 'windows' });
const SEATS = [sess('claude', 'claude-erp', 'w1:p5'), sess('claude', 'claude-ops', 'w3:p1'), sess('codex', 'codex-1', 'w1:p1'), sess('antigravity', 'ag-hoadhaa', 'w2:p1'), sess('antigravity', 'ag-erp', 'w1:p3')];
const wakePanes = (from, body, action) => {
  const fixed = fix(from, body, action);
  const classified = route(from, fixed.body, action);
  const rec = { brokerSequence: 9, eventId: 'e9', evaluatedDeliveryType: classified.deliveryType, evaluatedAudience: classified.targetAudience,
    event: { senderHandle: from, body: fixed.body, mentions: [], metadata: { actionRequired: action } } };
  const routing = dispatcher.restrictToAddressed(selectWakeTargets(dispatcher.normalizeForRouting(rec), SEATS), rec);
  return { fixed, classified, panes: routing.wake.map((w) => w.pane).sort(), ambiguous: routing.ambiguous.map((a) => a.handle) };
};

test('rev2: two seats of one handle stay two owners and both are addressed and woken', () => {
  const action = 'claude#w3:p1: record this; claude#w1:p5: update the ERP lane';
  assert.deepEqual(namedOwners(action, resolveIdentity).map((o) => `${o.handle}#${o.qualifier}`), ['claude#w3:p1', 'claude#w1:p5']);
  const r = wakePanes('codex', 'Handback text with no recipient line.', action);
  assert.deepEqual(r.fixed.added, ['@claude#w3:p1', '@claude#w1:p5']);
  assert.equal(r.classified.deliveryType, 'ACTION_REQUIRED');
  assert.deepEqual(r.panes, ['w1:p5', 'w3:p1'], 'exactly the two named seats, nobody else');
  assert.deepEqual(r.ambiguous, []);
});

test('rev3: a seat-qualified owner that shares the sender handle is another seat and is addressed (live miss, Room #19102)', () => {
  // ERP Claude and Ops Claude share the handle claude; Ops posts to the ERP seat.
  const r = fix('claude', 'Report text.', 'claude#w1:p5: name a reviewer');
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, ['@claude#w1:p5']);
  const after = route('claude', r.body, 'claude#w1:p5: name a reviewer');
  assert.equal(after.deliveryType, 'ACTION_REQUIRED');
  assert.deepEqual(after.targetAudience, ['claude']);
  // the same post before the fix stayed a broadcast
  assert.equal(route('claude', 'Report text.', 'claude#w1:p5: name a reviewer').deliveryType, 'CC_CONTEXT');
  // both seats of the sender's handle, from a third handle, are unchanged behaviour
  assert.deepEqual(fix('codex', 'x', 'claude#w3:p1: a; claude#w1:p5: b').added, ['@claude#w3:p1', '@claude#w1:p5']);
});

test('rev3: a bare owner equal to the sender is still a note to self; the body mention satisfies a qualified own-handle owner', () => {
  assert.equal(fix('claude', 'x', 'claude: remember this').changed, false);
  assert.equal(fix('claude', 'x', 'claude: remember. codex: act').changed, true);
  assert.deepEqual(fix('claude', 'x', 'claude: remember. codex: act').added, ['@codex']);
  assert.equal(fix('claude', '@claude#w1:p5 please', 'claude#w1:p5: do it').changed, false);
  assert.deepEqual(namedOwners('claude#w1:p5: a', resolveIdentity, 'claude').map((o) => o.qualifier), ['w1:p5']);
});

test('rev2: identical seat named twice is one owner; same seat in different case too', () => {
  assert.equal(namedOwners('claude#w3:p1: a. claude#w3:p1: b; claude#W3:P1: c', resolveIdentity).length, 1);
});

test('rev2: a bare @claude in the body does not satisfy a seat-qualified owner', () => {
  const r = fix('codex', '@claude please look at this.', 'claude#w3:p1: do it');
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, ['@claude#w3:p1']);
  assert.ok(r.body.endsWith('@claude please look at this.'));
});

test('rev2: a mention of a different seat does not satisfy the owner seat', () => {
  const r = fix('codex', '@claude#w1:p5 FYI for the ERP seat.', 'claude#w3:p1: do it');
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, ['@claude#w3:p1']);
  const both = wakePanes('codex', '@claude#w1:p5 FYI for the ERP seat.', 'claude#w3:p1: do it');
  assert.equal(both.classified.deliveryType, 'ACTION_REQUIRED');
  assert.ok(both.panes.includes('w3:p1'), 'the owner seat is woken');
});

test('rev2: the matching seat in the body satisfies the owner; case and trailing punctuation do not matter', () => {
  for (const body of ['@claude#w3:p1 please.', '@Claude#W3:P1, please', 'Thanks @claude#w3:p1.']) {
    assert.equal(fix('codex', body, 'claude#w3:p1: do it').changed, false, body);
  }
});

test('rev2: an owner with no seat is satisfied by any mention of the handle, bare or qualified', () => {
  assert.equal(fix('codex', '@claude hi', 'claude: do it').changed, false);
  assert.equal(fix('codex', '@claude#w1:p5 hi', 'claude: do it').changed, false);
});

test('rev2: one record naming both seats of one handle and a second handle', () => {
  const r = wakePanes('mustarq', 'x', 'claude#w3:p1: a; claude#w1:p5: b; antigravity#w2:p1: c');
  assert.deepEqual(r.fixed.added, ['@claude#w3:p1', '@claude#w1:p5', '@antigravity#w2:p1']);
  assert.deepEqual(r.panes, ['w1:p5', 'w2:p1', 'w3:p1']);
  assert.ok(!r.panes.includes('w1:p3'), 'the other antigravity seat is not woken');
});
