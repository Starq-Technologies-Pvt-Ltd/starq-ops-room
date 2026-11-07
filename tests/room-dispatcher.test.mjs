import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Isolate dispatcher state + roles BEFORE importing the module (it reads env at load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'room-dispatch-test-'));
process.env.COMMS_DISPATCH_STATE_DIR = TMP;
process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';
const ERP_ELDER_UUID = 'e2a03456-6d97-4d8d-bb4c-532f4a8227d3';
process.env.COMMS_SESSION_ROLES = JSON.stringify({ [ERP_ELDER_UUID]: 'floor-lead' });

const { pollOnce, buildPointer } = await import('../scripts/room-dispatcher.mjs');

// --- live-shaped sessions -----------------------------------------------------
const CLAUDE_ERP = { agent: 'claude', agent_session: { value: ERP_ELDER_UUID }, agent_status: 'working', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: 'w1:p5', workspace_id: 'w1', state_change_seq: 614, _host: 'windows' };
const CLAUDE_OPS = { agent: 'claude', agent_session: { value: '7db2e99c-6595-47fb-afe5-bea257dce6d3' }, agent_status: 'working', cwd: 'D:\\StarqTech\\starq-ops-room', pane_id: 'w3:p1', workspace_id: 'w3', state_change_seq: 625, _host: 'windows' };
const CODEX = { agent: 'codex', agent_session: { value: '01a1afd8-94f3-7881-9b97-9def9e297fe5' }, agent_status: 'idle', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: 'w1:p1', workspace_id: 'w1', state_change_seq: 613, _host: 'windows' };
const CLAUDE_WSL = { agent: 'claude', agent_session: { value: 'wsl11111-2222-3333-4444-555555555555' }, agent_status: 'idle', cwd: '/mnt/d/StarqTech/projects/starqerp', pane_id: 'w1:p4', workspace_id: 'w1', state_change_seq: 500, _host: 'wsl' };

function brokerRec(seq, { sender = 'codex', actionRequired, deliveryType = 'ACTION_REQUIRED', audience = ['claude'], project, subject } = {}) {
  const metadata = {};
  if (actionRequired !== undefined) metadata.actionRequired = actionRequired;
  if (project !== undefined) metadata.project = project;
  if (subject !== undefined) metadata.subject = subject;
  return { brokerSequence: seq, eventId: `evt${seq}`, evaluatedDeliveryType: deliveryType, evaluatedAudience: audience, event: { senderHandle: sender, body: '', mentions: audience, metadata } };
}

// Driver: each call supplies the live records + discovered sessions; captures wakes.
function makeHarness(sessions) {
  const wakes = [];
  const snapshotFor = (records) => () => ({ state: 'OK', stable: true, records, tailSequence: records.at(-1)?.brokerSequence ?? 0 });
  const discover = () => ({ sessions, sourceReport: [{ host: 'windows', ok: true, count: sessions.length }] });
  const doWake = async (source, pane) => { wakes.push(pane); return true; };
  return { wakes, run: (records) => pollOnce({ readSnapshot: snapshotFor(records), discover, doWake, dry: false }) };
}

test('pointer is short and references the Room sequence + eventId', () => {
  const p = buildPointer(brokerRec(42, { subject: 'ERP-541 correction' }));
  assert.match(p, /Room #42/);
  assert.ok(p.includes('evt42'), 'pointer references the eventId');
  assert.match(p, /reply in Room/i);
  assert.ok(p.length < 300, 'pointer stays short');
});

test('end-to-end: seed, route, dedup, FYI-suppress, pane-rebind, WSL completion->ERP Elder', async () => {
  const sessions = [CLAUDE_ERP, CLAUDE_OPS, CODEX, CLAUDE_WSL];
  const h = makeHarness(sessions);

  // 1. First poll seeds the checkpoint at the tail — NO history replay.
  await h.run([brokerRec(100, { actionRequired: '@claude#w1 should-not-fire' })]);
  assert.deepEqual(h.wakes, [], 'seed poll must not wake anything');

  // 2. New @codex assignment (sole codex session) -> wakes codex only.
  await h.run([brokerRec(100), brokerRec(101, { sender: 'mustarq', audience: ['codex'], actionRequired: '@codex: build', project: 'starqerp' })]);
  assert.deepEqual(h.wakes, ['w1:p1']);

  // 3. Re-poll same records + an explicit @claude#<ops-uuid> -> dedup codex, wake OPS by UUID.
  await h.run([brokerRec(101, { sender: 'mustarq', audience: ['codex'], actionRequired: '@codex: build' }),
               brokerRec(102, { actionRequired: '@claude#7db2e99c review' })]);
  assert.deepEqual(h.wakes, ['w1:p1', 'w3:p1'], 'codex not re-woken; ops claude woken by durable UUID');

  // 4. FYI / NONE never wakes.
  await h.run([brokerRec(103, { deliveryType: 'CC_CONTEXT', actionRequired: 'NONE — fyi from hoadhaa' })]);
  assert.deepEqual(h.wakes, ['w1:p1', 'w3:p1'], 'FYI suppressed');

  // 5. Pane REASSIGNMENT: ops claude moves to w3:p9 (same UUID). Durable-UUID target still resolves.
  const moved = { ...CLAUDE_OPS, pane_id: 'w3:p9' };
  const h2 = makeHarness([CLAUDE_ERP, moved, CODEX, CLAUDE_WSL]);
  // seed h2 then target by UUID
  await h2.run([brokerRec(200)]);
  await h2.run([brokerRec(200), brokerRec(201, { actionRequired: '@claude#7db2e99c re-check' })]);
  assert.deepEqual(h2.wakes, ['w3:p9'], 'rebinding: same UUID, new pane');

  // 6. WSL Claude completion -> routed to the ERP floor-lead coordinator (by role).
  await h2.run([brokerRec(201, { actionRequired: '@claude#7db2e99c re-check' }),
                brokerRec(202, { sender: 'claude', audience: ['claude'], actionRequired: '@claude#floor-lead ERP-541 completion posted; please verify', project: 'starqerp' })]);
  assert.deepEqual(h2.wakes, ['w3:p9', 'w1:p5'], 'completion woke ERP floor-lead (w1:p5) by role');
});

test('ambiguous unqualified @claude is HELD, nobody woken', async () => {
  const h = makeHarness([CLAUDE_ERP, CLAUDE_OPS]);
  await h.run([brokerRec(300)]);                                             // seed
  const res = await h.run([brokerRec(300), brokerRec(301, { actionRequired: '@claude review' })]);
  assert.deepEqual(h.wakes, [], 'two claude seats, no project -> held, not woken');
  assert.equal(res.summary.held, 1);
});
