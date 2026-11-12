import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(process.cwd(), 'tests', '.tmp-dispatch-addr-'));
process.env.COMMS_DISPATCH_STATE_DIR = TMP;
process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });
const { pollOnce, addressedHandles } = await import('../scripts/room-dispatcher.mjs');

const sess = (agent, id, pane) => ({ agent, agent_session: { value: id }, agent_status: 'idle', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: pane, workspace_id: pane.split(':')[0], _host: 'windows' });
const CODEX = sess('codex', 'codex-1', 'w1:p1');
const CURSOR = sess('cursor', 'cursor-1', 'w1:p6');
const COPILOT = sess('copilot', 'copilot-1', 'w1:p7');
const CLAUDE_OPS = sess('claude', 'stale-herdr-session', 'w3:p1');
const rec = (seq, { sender = 'mustarq', audience, action, body = '', metadata = {} } = {}) => ({
  brokerSequence: seq, eventId: `evt${seq}`, evaluatedDeliveryType: 'ACTION_REQUIRED', evaluatedAudience: audience,
  event: { senderHandle: sender, body, mentions: audience, metadata: { actionRequired: action, ...metadata } },
});
let base = 0;
function harness(sessions) {
  base += 100; const b = base;
  const wakes = []; let records = [rec(b, { audience: ['none'], action: 'NONE' })];
  const run = () => pollOnce({
    readSnapshot: () => ({ state: 'OK', stable: true, records, tailSequence: records.at(-1).brokerSequence }),
    discover: () => ({ sessions, sourceReport: [] }), doWake: async (_s, pane) => { wakes.push(pane); return true; }, dry: false,
  });
  return { wakes, run, add: (r) => { r.brokerSequence += b; r.eventId = `evt${r.brokerSequence}`; records = [...records, r]; } };
}
const a = (action, body = '') => { const s = addressedHandles({ event: { body, metadata: { actionRequired: action } } }); return s ? [...s].sort() : null; };

test('addressedHandles: owner prefixes win over handles quoted later in the action text', () => {
  assert.deepEqual(a('mustarq: decide the default seat for bare @claude and @antigravity. codex: note the boundary.'), ['codex', 'mustarq']);
  assert.deepEqual(a('@cursor: review the plan; @mustarq: decide after review'), ['cursor', 'mustarq']);
  assert.deepEqual(a('claude#w3:p1: consolidate. mustarq/codex: decision outstanding'), ['claude', 'codex', 'mustarq']);
  assert.deepEqual(a('codex: see https://example.test/x: nothing'), ['codex']);
});

test('addressedHandles: without prefixes, @handles in the action text are the addressees', () => {
  assert.deepEqual(a('Please ask @cursor to review'), ['cursor']);
});

test('addressedHandles: generic action falls back to the opening line and To:/Cc: lines', () => {
  const generic = 'Respond in Room to this Founder-directed message';
  assert.deepEqual(a(generic, '@codex Founder here.\n\nPlease read what @cursor and @copilot wrote.'), ['codex']);
  assert.deepEqual(a(generic, 'To: @codex\nCc: @cursor\nFrom: @mustarq\nSubject: x\nBody mentions @copilot'), ['codex', 'cursor']);
  assert.equal(a(generic, 'No handle on the first line.\nLater @codex appears.'), null);
});

test('a handle quoted in the body is not woken; the addressed seat is', async () => {
  const h = harness([CODEX, CURSOR, COPILOT]);
  await h.run();
  h.add(rec(2, { audience: ['codex', 'cursor', 'copilot'], action: 'Respond in Room to this Founder-directed message', body: '@codex Founder here.\nForwarded note: @cursor and @copilot said the build is fine.' }));
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p1']);
});

test('a handle quoted in the action text after an owner prefix is not woken', async () => {
  const h = harness([CODEX, CURSOR, COPILOT]);
  await h.run();
  h.add(rec(2, { sender: 'copilot', audience: ['codex', 'cursor'], action: 'codex: decide whether @cursor should build this', body: 'x' }));
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p1']);
});

test('no recognisable addressee keeps the legacy behaviour: nobody in the audience is dropped', async () => {
  const h = harness([CODEX, CURSOR]);
  await h.run();
  h.add(rec(2, { audience: ['codex', 'cursor'], action: 'Please pick this up', body: 'Status first.\nThen @codex and @cursor take it.' }));
  await h.run();
  assert.deepEqual(h.wakes.sort(), ['w1:p1', 'w1:p6']);
});

test('a seat is not woken by its own post even when Herdr lists it under an old session ID', async () => {
  const h = harness([CODEX, CLAUDE_OPS]);
  await h.run();
  const own = { senderInstanceId: 'current-claude-session', senderPane: 'w3:p1', senderHost: 'windows' };
  h.add(rec(2, { sender: 'claude', audience: ['claude', 'codex'], action: 'codex: review. claude#w3:p1: record it', body: '@codex @claude#w3:p1', metadata: own }));
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p1']);
  h.add(rec(3, { sender: 'codex', audience: ['claude'], action: 'claude#w3:p1: do it', body: '@claude#w3:p1', metadata: { senderPane: 'w1:p1', senderHost: 'windows' } }));
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p1', 'w3:p1'], 'another seat can still wake it');
});
