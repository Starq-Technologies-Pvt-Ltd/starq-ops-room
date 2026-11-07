import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapHerdrAgentToHandle,
  normalizeSession,
  sessionMatchesToken,
  sessionMatchesProject,
  explicitTargetsFor,
  selectWakeTargets,
} from '../protocol/v1/sessionRouting.mjs';

// Live-shaped `herdr agent list` entries. Two concurrent claude seats in
// different workspaces, codex, two antigravity seats (ERP vs Hoadhaa), an
// unroutable devin, and a WSL claude worker supplied with host/role context.
const CLAUDE_ERP = { agent: 'claude', agent_session: { value: 'e2a03456-6d97-4d8d-bb4c-532f4a8227d3' }, agent_status: 'working', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: 'w1:p5', workspace_id: 'w1', state_change_seq: 614 };
const CLAUDE_OPS = { agent: 'claude', agent_session: { value: '7db2e99c-6595-47fb-afe5-bea257dce6d3' }, agent_status: 'working', cwd: 'D:\\StarqTech\\starq-ops-room', pane_id: 'w3:p1', workspace_id: 'w3', state_change_seq: 625 };
const CODEX = { agent: 'codex', agent_session: { value: '01a1afd8-94f3-7881-9b97-9def9e297fe5' }, agent_status: 'idle', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: 'w1:p1', workspace_id: 'w1', state_change_seq: 613 };
const AGY_ERP = { agent: 'agy', agent_session: { value: 'd96020cd-65be-4736-9043-354f9a96a602' }, agent_status: 'idle', cwd: 'D:\\StarqTech\\projects\\starqerp', pane_id: 'w1:p3', workspace_id: 'w1', state_change_seq: 624 };
const AGY_HOA = { agent: 'agy', agent_session: { value: '7779151a-c6f4-46a4-b86d-3dfd1b2c6bd4' }, agent_status: 'working', cwd: 'D:\\StarqTech\\Projects\\hoadhaa', pane_id: 'w2:p1', workspace_id: 'w2', state_change_seq: 623 };
const DEVIN = { agent: 'devin', agent_session: { value: 'elderly-sage' }, agent_status: 'done', cwd: 'D:\\StarqTech\\Projects\\Hoadhaa', pane_id: 'w2:p2', workspace_id: 'w2', state_change_seq: 627 };
// WSL claude worker (separate floor): host/role supplied by the dispatcher.
const CLAUDE_WSL = { agent: 'claude', agent_session: { value: 'wsl11111-2222-3333-4444-555555555555' }, agent_status: 'idle', cwd: '/mnt/d/StarqTech/projects/starqerp', pane_id: 'w1:p4', workspace_id: 'w1', state_change_seq: 500 };

const ALL = [CLAUDE_ERP, CLAUDE_OPS, CODEX, AGY_ERP, AGY_HOA, DEVIN];
// Dispatcher context: tag hosts/roles not present in the raw agent list.
const EXTRA = (s) => {
  if (s === CLAUDE_WSL) return { host: 'wsl', role: 'worker' };
  if (s === CLAUDE_ERP) return { host: 'windows', role: 'floor-lead' };
  if (s === CLAUDE_OPS) return { host: 'windows', role: 'ops-room' };
  return {};
};

function rec({ sender = 'codex', body = '', actionRequired = undefined, deliveryType = 'ACTION_REQUIRED', audience = ['claude'], project = undefined, subject = undefined, metadata: extraMd = {} } = {}) {
  const metadata = { ...extraMd };
  if (actionRequired !== undefined) metadata.actionRequired = actionRequired;
  if (project !== undefined) metadata.project = project;
  if (subject !== undefined) metadata.subject = subject;
  return { brokerSequence: 1, evaluatedDeliveryType: deliveryType, evaluatedAudience: audience, event: { senderHandle: sender, body, mentions: audience, metadata } };
}
const panes = (r) => r.wake.map((s) => s.pane).sort();

// ---- mapping / normalization ------------------------------------------------
test('map herdr agent kinds -> canonical handles', () => {
  assert.equal(mapHerdrAgentToHandle('claude'), 'claude');
  assert.equal(mapHerdrAgentToHandle('agy'), 'antigravity');
  assert.equal(mapHerdrAgentToHandle('devin'), null);
  assert.equal(mapHerdrAgentToHandle('omp'), null);
});
test('normalizeSession carries host/role from dispatcher extra', () => {
  const s = normalizeSession(CLAUDE_WSL, undefined, { host: 'wsl', role: 'worker' });
  assert.equal(s.handle, 'claude'); assert.equal(s.pane, 'w1:p4');
  assert.equal(s.host, 'wsl'); assert.equal(s.role, 'worker'); assert.equal(s.cwdBase, 'starqerp');
});
test('token + project matchers (uuid prefix, host, role, pane, cwd)', () => {
  const wsl = normalizeSession(CLAUDE_WSL, undefined, { host: 'wsl', role: 'worker' });
  assert.equal(sessionMatchesToken(wsl, 'wsl'), true);        // host
  assert.equal(sessionMatchesToken(wsl, 'worker'), true);     // role
  assert.equal(sessionMatchesToken(wsl, 'wsl11111'), true);   // uuid prefix
  assert.equal(sessionMatchesToken(wsl, 'p4'), true);         // bare pane
  assert.equal(sessionMatchesToken(wsl, 'w3'), false);
  assert.equal(sessionMatchesProject(normalizeSession(AGY_HOA), 'hoadhaa'), true);
});

// ---- explicit target extraction ---------------------------------------------
test('explicitTargets from qualifier, metadata, and subject hint', () => {
  assert.deepEqual(explicitTargetsFor(rec({ actionRequired: '@claude#wsl go' }), 'claude'), ['wsl']);
  assert.deepEqual(explicitTargetsFor(rec({ metadata: { targetInstance: '7db2e99c' } }), 'claude'), ['7db2e99c']);
  assert.deepEqual(explicitTargetsFor(rec({ subject: '[OPS\u00b7w3:p1] ERP-9 note' }), 'claude'), ['w3:p1']);
});

// ---- Precedence 1: explicit target ------------------------------------------
test('explicit targetInstance UUID -> exactly that session (ERP vs Ops)', () => {
  const r = rec({ actionRequired: '@claude review', metadata: { targetInstance: '7db2e99c' } });
  assert.deepEqual(panes(selectWakeTargets(r, ALL)), ['w3:p1']);
});
test('@claude#wsl -> the WSL worker (cross-host)', () => {
  const r = rec({ actionRequired: '@claude#wsl implement' });
  assert.deepEqual(panes(selectWakeTargets(r, [...ALL, CLAUDE_WSL], { sessionExtra: EXTRA })), ['w1:p4']);
});
test('explicit target matching nothing live -> unreachable, held (no wake)', () => {
  const r = rec({ actionRequired: '@claude#cloudroom deploy' });
  const res = selectWakeTargets(r, ALL);
  assert.equal(res.wake.length, 0);
  assert.deepEqual(res.unreachable, [{ handle: 'claude', token: 'cloudroom' }]);
});

// ---- Precedence 2/3: unambiguous project affinity ---------------------------
test('unqualified @claude + ERP project -> only ERP claude (not Ops)', () => {
  assert.deepEqual(panes(selectWakeTargets(rec({ actionRequired: '@claude: review', project: 'starqerp' }), ALL)), ['w1:p5']);
});
test('unqualified @claude + ops-room project -> only Ops claude', () => {
  assert.deepEqual(panes(selectWakeTargets(rec({ actionRequired: '@claude: review', project: 'starq-ops-room' }), ALL)), ['w3:p1']);
});
test('ERP Antigravity vs Hoadhaa Antigravity disambiguated by project', () => {
  assert.deepEqual(panes(selectWakeTargets(rec({ sender: 'mustarq', audience: ['antigravity'], actionRequired: '@antigravity build', project: 'hoadhaa' }), ALL)), ['w2:p1']);
  assert.deepEqual(panes(selectWakeTargets(rec({ sender: 'mustarq', audience: ['antigravity'], actionRequired: '@antigravity build', project: 'starqerp' }), ALL)), ['w1:p3']);
});

// ---- Precedence 4: ambiguity is HELD, never guessed or broadcast ------------
test('unqualified @claude, no project, 2 seats -> HELD ambiguous, wake nobody', () => {
  const res = selectWakeTargets(rec({ actionRequired: '@claude: review' }), ALL);
  assert.equal(res.wake.length, 0);
  assert.equal(res.ambiguous.length, 1);
  assert.equal(res.ambiguous[0].handle, 'claude');
  assert.equal(res.ambiguous[0].candidates.length, 2);
});
test('Founder @all with 2 claude + 2 agy -> those handles HELD, single-session handles wake', () => {
  const res = selectWakeTargets(rec({ sender: 'mustarq', audience: 'ALL', actionRequired: '@all stand up' }), ALL);
  // codex is the only single-session addressed handle -> it wakes; claude & agy are held.
  assert.deepEqual(panes(res), ['w1:p1']);
  assert.ok(res.ambiguous.some((a) => a.handle === 'claude'));
  assert.ok(res.ambiguous.some((a) => a.handle === 'antigravity'));
});

// ---- ROOM-PROTO-1 gate + cross-agent + unroutable ---------------------------
test('NONE ack wakes nobody', () => {
  assert.equal(selectWakeTargets(rec({ deliveryType: 'CC_CONTEXT', actionRequired: 'NONE — fyi' }), ALL).wake.length, 0);
});
test('cross-agent @codex assignment wakes only codex', () => {
  const r = rec({ sender: 'mustarq', audience: ['codex', 'claude'], actionRequired: '@codex: build' });
  assert.deepEqual(panes(selectWakeTargets(r, ALL)), ['w1:p1']);
});
test('unroutable agents (devin) are reported, never woken', () => {
  const res = selectWakeTargets(rec({ sender: 'mustarq', audience: 'ALL', actionRequired: '@all x' }), ALL);
  assert.ok(res.unroutable.some((s) => s.agent === 'devin'));
  assert.ok(!res.wake.some((s) => s.agent === 'devin'));
});
test('role-targeted: @claude#floor-lead -> the ERP floor-lead seat', () => {
  const r = rec({ actionRequired: '@claude#floor-lead coordinate' });
  assert.deepEqual(panes(selectWakeTargets(r, [...ALL, CLAUDE_WSL], { sessionExtra: EXTRA })), ['w1:p5']);
});
