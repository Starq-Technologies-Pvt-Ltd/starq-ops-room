import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(process.cwd(), 'tests', '.tmp-dispatch-retain-'));
process.env.COMMS_DISPATCH_STATE_DIR = TMP;
process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });
const { pollOnce } = await import('../scripts/room-dispatcher.mjs');

const sess = (agent, id, pane, cwd = 'D:\StarqTech\projects\starqerp') => ({ agent, agent_session: { value: id }, agent_status: 'idle', cwd, pane_id: pane, workspace_id: pane.split(':')[0], _host: 'windows' });
const CODEX = sess('codex', 'codex-1', 'w1:p1');
const CLAUDE_ERP = sess('claude', 'claude-erp', 'w1:p5');
const CLAUDE_OPS = sess('claude', 'claude-ops', 'w3:p1', 'D:\StarqTech\starq-ops-room');
const CURSOR = sess('cursor', 'cursor-1', 'w1:p6');
const rec = (seq, { sender = 'mustarq', audience, action, body = '', subject } = {}) => ({
  brokerSequence: seq, eventId: `evt${seq}`, evaluatedDeliveryType: 'ACTION_REQUIRED', evaluatedAudience: audience,
  event: { senderHandle: sender, body, mentions: audience, metadata: { actionRequired: action, ...(subject ? { subject } : {}) } },
});
function harness() {
  const wakes = []; let sessions = []; let records = [];
  const run = () => pollOnce({
    readSnapshot: () => ({ state: 'OK', stable: true, records, tailSequence: records.at(-1)?.brokerSequence ?? 0 }),
    discover: () => ({ sessions, sourceReport: [] }), doWake: async (_s, pane) => { wakes.push(pane); return true; }, dry: false,
  });
  return { wakes, run, set: (s, r) => { sessions = s; if (r) records = r; } };
}
const state = () => JSON.parse(fs.readFileSync(path.join(TMP, 'room-dispatch.json'), 'utf8'));

test('offline seat: message is retained and delivered once, only to that seat, when it comes online', async () => {
  const h = harness();
  h.set([CODEX], [rec(1, { audience: ['codex'], action: 'codex: seed' })]);
  await h.run(); // seeds checkpoint at 1, no replay
  h.set([CODEX, CLAUDE_ERP], [rec(1, { audience: ['codex'], action: 'x' }), rec(2, { audience: ['cursor'], action: 'cursor: review the change' })]);
  await h.run();
  assert.deepEqual(h.wakes, [], 'nobody else is woken while cursor is offline');
  assert.deepEqual(state().held.map((x) => [x.seq, x.waiting]), [[2, ['cursor']]]);
  await h.run();
  assert.deepEqual(h.wakes, []);
  h.set([CODEX, CLAUDE_ERP, CURSOR]);
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p6']);
  assert.equal(state().held.length, 0);
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p6'], 'no duplicate wake');
});

test('explicit seat target not live is retained, then delivered to exactly that seat', async () => {
  const h = harness();
  const r = rec(3, { audience: ['claude'], action: 'claude: do the ops task', body: '@claude#w3:p1 please' });
  h.set([CODEX, CLAUDE_ERP], [rec(2, { audience: ['cursor'], action: 'x' }), r]);
  await h.run();
  assert.deepEqual(h.wakes, [], 'the other claude seat is not woken');
  assert.deepEqual(state().held.map((x) => x.seq), [3]);
  h.set([CODEX, CLAUDE_ERP, CLAUDE_OPS]);
  await h.run();
  assert.deepEqual(h.wakes, ['w3:p1']);
  assert.equal(state().held.length, 0);
});

test('ambiguous shared handle is held and never guessed, even if one seat later leaves', async () => {
  const h = harness();
  h.set([CODEX, CLAUDE_ERP, CLAUDE_OPS], [rec(3, { audience: ['claude'], action: 'x' }), rec(4, { audience: ['claude'], action: 'claude: someone do this' })]);
  await h.run();
  assert.deepEqual(h.wakes, []);
  assert.deepEqual(state().held.map((x) => [x.seq, x.waiting, x.ambiguous]), [[4, [], ['claude']]]);
  h.set([CODEX, CLAUDE_OPS]);
  await h.run();
  assert.deepEqual(h.wakes, [], 'not auto-delivered to the remaining seat');
});

test('a normal addressed record still wakes only its seat and holds nothing', async () => {
  const h = harness();
  h.set([CODEX, CLAUDE_ERP, CURSOR], [rec(4, { audience: ['claude'], action: 'x' }), rec(5, { audience: ['codex'], action: 'codex: decide' })]);
  await h.run();
  assert.deepEqual(h.wakes, ['w1:p1']);
  assert.ok(!state().held.some((x) => x.seq === 5));
});

test('default seat: an unqualified shared handle goes to the configured seat only; without config it stays held', async () => {
  const { applyDefaultSeats } = await import('../scripts/room-dispatcher.mjs');
  const mk = () => ({ wake: [], unreachable: [], ambiguous: [{ handle: 'claude', candidates: [{ pane: 'w1:p5', sessionId: 'claude-erp', host: 'windows' }, { pane: 'w3:p1', sessionId: 'claude-ops', host: 'windows' }] }] });
  const sessions = [CLAUDE_ERP, CLAUDE_OPS];
  assert.equal(applyDefaultSeats(mk(), sessions, {}).wake.length, 0);
  const r = applyDefaultSeats(mk(), sessions, { claude: 'w3:p1' });
  assert.deepEqual(r.wake.map((w) => w.pane), ['w3:p1']); assert.equal(r.ambiguous.length, 0);
  const off = applyDefaultSeats(mk(), sessions, { claude: 'w9:p9' });
  assert.equal(off.wake.length, 0); assert.equal(off.ambiguous.length, 1);
});
