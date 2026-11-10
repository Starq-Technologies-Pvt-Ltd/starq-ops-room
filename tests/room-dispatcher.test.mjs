// Hardened dispatcher suite (COMMS-ROUTING-20261110 phase 1, Room #18737 item 5).
//
// Everything here is synthetic: an in-memory state store, a synthetic seat table,
// fabricated discovery results and a recording fake for the pane prompt. No herdr
// binary is executed and no agent can be woken by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const { pollOnce, buildPointer, herdrArgv, makeHerdrRuntime } = await import('../scripts/room-dispatcher.mjs');
const { recipientsFor, validateTarget, canonicalHandle } = await import('../protocol/v1/routingTargets.mjs');
const { validateSeatTable, resolveTarget, verifySeatBinding, verifySeatEnrollment, normalizeCwd } = await import('../protocol/v1/seatBinding.mjs');
const { assertIsolatedStateDir, loadState, saveState, emptyState, StateError, STATE_FILENAME } = await import('../protocol/v1/deliveryStore.mjs');

const TABLE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'seat-table.json'), 'utf8'));
const cloneTable = () => structuredClone(TABLE);
const R = 'starq.routing/1';

// ---- synthetic Room records ---------------------------------------------------------
function rec(seq, o = {}) {
  const metadata = { subject: o.subject ?? `subject ${seq}`, senderInstanceId: o.senderInstance ?? 'codex-inst-0001' };
  if (o.actionRequired !== undefined) metadata.actionRequired = o.actionRequired;
  if (o.targets) metadata.routing = { schema: R, targets: o.targets };
  if (o.routing !== undefined) metadata.routing = o.routing;
  if (o.action) metadata.action = o.action;
  return {
    brokerSequence: seq, eventId: o.eventId ?? `evt-${seq}`,
    evaluatedDeliveryType: o.deliveryType ?? 'ACTION_REQUIRED', evaluatedAudience: o.audience ?? 'ALL',
    event: { senderHandle: o.sender ?? 'codex', body: o.body ?? '', replyTo: o.replyTo ?? null, metadata },
  };
}

// ---- harness ------------------------------------------------------------------------
function makeHarness({ table = cloneTable(), state } = {}) {
  const h = {
    table, wakes: [], saves: 0, clock: 1_000_000, failSaveAt: null, wakeResult: true,
    persisted: state ?? emptyState(0),
    down: new Set(), missingPanes: new Set(), pidOverride: new Map(), agentOverride: new Map(),
    unenrolled: new Set(), enrollInstance: new Map(),
  };
  h.store = {
    load: () => structuredClone(h.persisted),
    save: (s) => {
      h.saves++;
      if (h.failSaveAt != null && h.saves >= h.failSaveAt) throw new StateError('STATE_WRITE_FAILED', 'synthetic write failure');
      h.persisted = structuredClone(s);
    },
  };
  h.discover = () => {
    const out = {};
    for (const b of h.table.backends) {
      if (h.down.has(b.key)) { out[b.key] = { ok: false, agents: [], reason: 'synthetic outage' }; continue; }
      const agents = h.table.seats.filter((s) => s.backend === b.key && !h.missingPanes.has(`${b.key} ${s.pane}`))
        .map((s) => ({ pane_id: s.pane, agent: s.herdrAgent, cwd: s.cwd, agent_status: 'idle', agent_session: { value: `herdr-${s.seatId}` }, ...(h.agentOverride.get(s.seatId) || {}) }));
      out[b.key] = { ok: true, agents, reason: null };
    }
    return out;
  };
  h.probe = (seat) => ({ pane_id: seat.pane, foreground_processes: [{ pid: h.pidOverride.get(seat.seatId) ?? seat.pid }] });
  h.wake = async (seat, backend, text) => { h.wakes.push({ seatId: seat.seatId, backend: backend.key, pane: seat.pane, argv: herdrArgv(backend, ['agent', 'prompt', seat.pane, text]) }); return h.wakeResult; };
  // Enrollment evidence: each seat's cited Room record, posted by that seat's own
  // handle and instance. Sequences are below the seed point, so they are never planned.
  h.enrollment = () => h.table.seats.filter((s) => s.enrollmentSeq && !h.unenrolled.has(s.seatId)).map((s) => rec(s.enrollmentSeq, { sender: s.handle, senderInstance: h.enrollInstance.get(s.seatId) ?? s.instance, actionRequired: 'NONE', deliveryType: 'CC_CONTEXT' }));
  h.poll = (records, { deliver = true, options } = {}) => pollOnce({
    snapshot: { state: 'OK', stable: true, records: [...h.enrollment(), ...records], tailSequence: records.at(-1)?.brokerSequence ?? 0 },
    seatTable: h.table, discover: h.discover, probe: h.probe, wake: h.wake, store: h.store, now: () => h.clock, deliver, options,
  });
  h.woken = () => h.wakes.map((w) => w.seatId);
  return h;
}
/** Seed at #100, then deliver the given records. */
async function seeded(records, opts) {
  const h = makeHarness(opts);
  await h.poll([rec(100, { actionRequired: 'NONE' })]);
  const report = await h.poll([rec(100, { actionRequired: 'NONE' }), ...records]);
  return { h, report };
}

// ---- 1. single-recipient routing ----------------------------------------------------
test('first poll seeds at the tail and never replays', async () => {
  const h = makeHarness();
  const report = await h.poll([rec(99, { actionRequired: '@codex: old work' }), rec(100, { actionRequired: '@codex: old work' })]);
  assert.equal(report.status, 'SEEDED');
  assert.equal(h.persisted.checkpoint.lastSeq, 100);
  assert.deepEqual(h.wakes, []);
});

test('Codex-only: unqualified owner in actionRequired goes to the documented default seat', async () => {
  const { h } = await seeded([rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build it' })]);
  assert.deepEqual(h.woken(), ['codex-chief']);
  assert.equal(h.wakes[0].pane, 'w1:p1');
  assert.equal(h.persisted.deliveries['evt-101::codex-inst-0001'].status, 'transport_acknowledged');
});

test('Ops-only: role target reaches only the Operations Room Deputy seat', async () => {
  const { h } = await seeded([rec(101, { actionRequired: 'audit the watcher', targets: [{ handle: 'claude', role: 'ops-room-deputy' }] })]);
  assert.deepEqual(h.woken(), ['ops-room-deputy']);
});

test('ERP Claude-only: exact instance target reaches only the ERP Floor Lead seat', async () => {
  const { h } = await seeded([rec(101, { actionRequired: 'coordinate', targets: [{ handle: 'claude', instance: 'claude-erp-0001' }] })]);
  assert.deepEqual(h.woken(), ['erp-floor-lead']);
});

test('WSL Claude-only: backend-qualified role uses the WSL backend and its absolute herdr path', async () => {
  const { h } = await seeded([rec(101, { actionRequired: 'verify', targets: [{ handle: 'claude', role: 'erp-wsl-verification', backend: 'wsl/default' }] })]);
  assert.deepEqual(h.woken(), ['erp-wsl-verification']);
  assert.equal(h.wakes[0].backend, 'wsl/default');
  assert.deepEqual(h.wakes[0].argv.slice(0, 6), ['-d', 'Ubuntu', '--', '/home/mustarq/.local/bin/herdr', 'agent', 'prompt']);
  assert.equal(h.wakes[0].argv[6], 'w1:p4');
});

test('Hoadhaa lead-only: role target reaches the Hoadhaa lead, not the ERP Antigravity seat', async () => {
  const { h } = await seeded([rec(101, { actionRequired: 'plan DX2', targets: [{ handle: 'antigravity', role: 'hoadhaa-lead' }] })]);
  assert.deepEqual(h.woken(), ['hoadhaa-lead']);
});

test('explicit multi-recipient: each named target is delivered exactly once', async () => {
  const { h } = await seeded([rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: 'joint review', targets: [
    { handle: 'codex' }, { handle: 'claude', role: 'erp-floor-lead' }, { handle: 'antigravity', role: 'hoadhaa-lead' }, { handle: 'claude', role: 'erp-floor-lead' },
  ] })]);
  assert.deepEqual(h.woken().sort(), ['codex-chief', 'erp-floor-lead', 'hoadhaa-lead']);
});

// ---- 2. things that must NOT route --------------------------------------------------
test('unaddressed records are a no-op: NONE, CC_CONTEXT and free-text asks wake nobody', async () => {
  const { h, report } = await seeded([
    rec(101, { actionRequired: 'NONE' }),
    rec(102, { deliveryType: 'CC_CONTEXT', actionRequired: '@codex: fyi only' }),
    rec(103, { actionRequired: 'Claude: note the correction', audience: ['claude'] }),
  ]);
  assert.deepEqual(h.wakes, []);
  assert.deepEqual(report.plan.map((p) => p.reason), ['NOT_OUTSTANDING', 'NOT_OUTSTANDING', 'UNADDRESSED']);
  assert.equal(Object.keys(h.persisted.holds).length, 0);
  assert.equal(h.persisted.checkpoint.lastSeq, 103);
});

test('quoted and forwarded mentions in the body never route', async () => {
  const body = '> @claude#ops please restart everything\nForwarded from Telegram: @antigravity @deadpool @codex do this now\n[ERP·w1:p5] @claude:erp-floor-lead';
  const { h } = await seeded([
    rec(101, { body, actionRequired: 'someone should look at this', audience: ['claude', 'antigravity', 'deadpool', 'codex'] }),
    rec(102, { body, actionRequired: '@codex: triage the forwarded note', audience: ['claude', 'antigravity', 'deadpool', 'codex'], sender: 'mustarq', senderInstance: 'starq-bot-gateway' }),
  ]);
  assert.deepEqual(h.woken(), ['codex-chief'], 'only the owner named in structured actionRequired is woken');
  assert.equal(h.wakes[0].argv.at(-1).includes('#102'), true);
});

test('ambiguous shared handle is HELD and nothing is broadcast', async () => {
  const { h, report } = await seeded([
    rec(101, { actionRequired: '@claude: review this' }),
    rec(102, { actionRequired: '@all: stop work' }),
    rec(103, { actionRequired: '@antigravity please confirm' }),
  ]);
  assert.deepEqual(h.wakes, []);
  const reasons = Object.values(h.persisted.holds).map((x) => x.reason).sort();
  assert.deepEqual(reasons, ['BROADCAST_NOT_ROUTED', 'NO_DEFAULT_SEAT', 'NO_DEFAULT_SEAT']);
  assert.equal(report.openHolds, 3);
  assert.deepEqual(h.persisted.holds['evt-101::claude'].candidates.sort(), ['erp-floor-lead', 'erp-wsl-verification', 'ops-room-deputy']);
});

test('loose or malformed targets are rejected, never guessed', async () => {
  assert.equal(validateTarget({ handle: 'claude', pane: 'p5' }).ok, false, 'pane is not a routable field');
  assert.equal(validateTarget({ handle: 'nobody' }).ok, false);
  const { h } = await seeded([
    rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', instance: 'claude-erp' }] }),          // partial instance id
    rec(102, { actionRequired: 'x', routing: { schema: R, targets: [{ handle: 'claude', pane: 'p1' }] } }), // bare pane suffix
    rec(103, { actionRequired: 'x', routing: { targets: [{ handle: 'codex' }] } }),                        // missing schema
    rec(104, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'erp-floor-lead', backend: 'wsl/default' }] }), // right role, wrong backend
  ]);
  assert.deepEqual(h.wakes, []);
  assert.equal(h.persisted.holds['evt-101::claude|instance=claude-erp'].reason, 'INSTANCE_NOT_IN_SEAT_TABLE');
  assert.equal(h.persisted.holds['evt-102::routing'].reason, 'INVALID_ROUTING');
  assert.equal(h.persisted.holds['evt-103::routing'].reason, 'INVALID_ROUTING');
  assert.equal(h.persisted.holds['evt-104::claude|role=erp-floor-lead|backend=wsl/default'].reason, 'CONTRADICTORY_TARGET');
});

test('multiple target qualifiers are conjunctive; contradictory selectors HOLD without choosing either seat', async () => {
  const { h } = await seeded([
    rec(101, { actionRequired: 'review', targets: [{ handle: 'claude', role: 'ops-room-deputy', instance: 'claude-erp-0001' }] }),
    rec(102, { actionRequired: 'verify', targets: [{ handle: 'claude', role: 'ops-room-deputy', backend: 'wsl/default' }] }),
  ]);
  assert.deepEqual(h.wakes, []);
  assert.equal(h.persisted.holds['evt-101::claude|role=ops-room-deputy|instance=claude-erp-0001'].reason, 'CONTRADICTORY_TARGET');
  assert.equal(h.persisted.holds['evt-102::claude|role=ops-room-deputy|backend=wsl/default'].reason, 'CONTRADICTORY_TARGET');
});

test('alias mapping: aliases resolve to the canonical handle, in owners and in targets', async () => {
  assert.equal(canonicalHandle('@elder'), 'claude');
  assert.equal(canonicalHandle('dp'), 'deadpool');
  assert.equal(canonicalHandle('ali'), null, 'retired identity is not routable');
  const { h } = await seeded([
    rec(101, { actionRequired: '@dp: relay status' }),
    rec(102, { actionRequired: 'x', targets: [{ handle: 'elder', role: 'ops-room-deputy' }] }),
  ]);
  assert.deepEqual(h.woken(), ['wsl-operator', 'ops-room-deputy']);
});

test('self-exclusion uses the real sender instance, so one seat can still address another seat of the same handle', async () => {
  const { h, report } = await seeded([
    rec(101, { sender: 'claude', senderInstance: 'claude-ops-0001', actionRequired: 'x', targets: [{ handle: 'claude', role: 'ops-room-deputy' }] }),
    rec(102, { sender: 'claude', senderInstance: 'claude-wsl-0001', actionRequired: 'done, please verify', targets: [{ handle: 'claude', role: 'erp-floor-lead' }] }),
  ]);
  assert.deepEqual(h.woken(), ['erp-floor-lead']);
  assert.equal(report.plan[0].reason, 'SELF_ONLY');
  assert.equal(Object.keys(h.persisted.holds).length, 0);
});

// ---- 3. binding ---------------------------------------------------------------------
test('cross-host pane/workspace collision: same pane id on two backends never crosses over', async () => {
  const { h } = await seeded([
    rec(101, { actionRequired: '@deadpool: relay' }),   // wsl/starq-wsl-deadpool w1:p1
    rec(102, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' }), // windows/default w1:p1
  ]);
  assert.deepEqual(h.wakes.map((w) => `${w.backend} ${w.pane}`), ['wsl/starq-wsl-deadpool w1:p1', 'windows/default w1:p1']);
  assert.deepEqual(h.wakes[0].argv.slice(0, 8), ['-d', 'Ubuntu', '--', '/home/mustarq/.local/bin/herdr', '--session', 'starq-wsl-deadpool', 'agent', 'prompt']);
  assert.equal(h.wakes[1].argv.includes('--session'), false, 'default session carries no --session flag');
});

test('real WSL shape: absolute herdr path, default and named sessions are separate sources', () => {
  const calls = [];
  const run = (bin, args) => { calls.push([bin, ...args].join(' ')); return JSON.stringify({ result: { agents: [], process_info: null } }); };
  const rt = makeHerdrRuntime({ run });
  const d = rt.discoverAll(TABLE);
  assert.deepEqual(Object.keys(d), ['windows/default', 'wsl/default', 'wsl/starq-wsl-deadpool']);
  assert.deepEqual(calls, [
    'C:/synthetic/herdr.exe agent list',
    'wsl.exe -d Ubuntu -- /home/mustarq/.local/bin/herdr agent list',
    'wsl.exe -d Ubuntu -- /home/mustarq/.local/bin/herdr --session starq-wsl-deadpool agent list',
  ]);
  // A bare `herdr` (PATH lookup) is exit 127 through wsl.exe; the failure is a down source, not an empty one.
  const bad = makeHerdrRuntime({ run: () => { const e = new Error('exit 127'); e.stderr = '/bin/bash: line 1: herdr: command not found'; throw e; } }).discoverAll(TABLE);
  assert.equal(bad['wsl/default'].ok, false);
  assert.match(bad['wsl/default'].reason, /command not found/);
});

test('offline/stale session is a recoverable HOLD and delivers once the pane is back', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'erp-floor-lead' }] })];
  await h.poll(records.slice(0, 1));
  h.missingPanes.add('windows/default w1:p5');
  await h.poll(records);
  assert.deepEqual(h.wakes, []);
  const d = h.persisted.deliveries['evt-101::claude-erp-0001'];
  assert.equal(d.status, 'held');
  assert.equal(h.persisted.holds[d.holdKey].reason, 'PANE_NOT_FOUND');
  assert.equal(h.persisted.holds[d.holdKey].recoverable, true);
  h.missingPanes.clear();
  await h.poll(records);
  assert.deepEqual(h.woken(), ['erp-floor-lead']);
  assert.equal(h.persisted.holds['evt-101::claude-erp-0001::binding'].status, 'resolved');
});

test('PID/pane rebind: a changed pid holds; the corrected seat table delivers to the new pane', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'ops-room-deputy' }] })];
  await h.poll(records.slice(0, 1));
  h.pidOverride.set('ops-room-deputy', 4242); // harness restarted: same pane, different process
  await h.poll(records);
  assert.deepEqual(h.wakes, []);
  assert.equal(h.persisted.holds['evt-101::claude-ops-0001::binding'].reason, 'PID_MISMATCH');
  // Operator re-verifies the seat and records the new binding (pane moved as well).
  const seat = h.table.seats.find((s) => s.seatId === 'ops-room-deputy');
  seat.pid = 4242; seat.pane = 'w3:p9';
  await h.poll(records);
  assert.deepEqual(h.wakes.map((w) => `${w.seatId} ${w.pane}`), ['ops-room-deputy w3:p9']);
});

test('binding checks: agent kind, cwd, optional Herdr session, blocked agent, never-wake and unverified backends all HOLD', async () => {
  const seat = TABLE.seats.find((s) => s.seatId === 'ops-room-deputy');
  const backend = TABLE.backends[0];
  const agent = { pane_id: 'w3:p1', agent: 'claude', cwd: 'D:\\Work\\ops-room\\', agent_status: 'working', agent_session: { value: 'stale-herdr-value' } };
  const src = (a) => ({ ok: true, agents: [a] });
  const pi = { pane_id: 'w3:p1', foreground_processes: [{ pid: 1031 }] };
  assert.equal(verifySeatBinding(seat, backend, src(agent), pi).ok, true, 'Herdr agent_session is not compared unless the seat declares it');
  assert.equal(verifySeatBinding({ ...seat, herdrAgentSession: 'expected' }, backend, src(agent), pi).reason, 'SESSION_MISMATCH');
  assert.equal(verifySeatBinding(seat, backend, src({ ...agent, agent: 'codex' }), pi).reason, 'AGENT_MISMATCH');
  assert.equal(verifySeatBinding(seat, backend, src({ ...agent, cwd: 'D:\\Work\\ops-room-other' }), pi).reason, 'CWD_MISMATCH');
  assert.equal(verifySeatBinding(seat, backend, src({ ...agent, cwd: 'D:\\Work' }), pi).reason, 'CWD_MISMATCH', 'a parent directory is not a match');
  assert.equal(verifySeatBinding(seat, backend, src({ ...agent, agent_status: 'blocked' }), pi).reason, 'AGENT_BLOCKED');
  assert.equal(verifySeatBinding(seat, backend, src(agent), null).reason, 'PID_UNVERIFIED');
  assert.equal(verifySeatBinding(seat, backend, src(agent), { pane_id: 'w1:p1', foreground_processes: [{ pid: 1031 }] }).reason, 'PID_UNVERIFIED');
  assert.equal(verifySeatBinding(seat, { ...backend, delivery: 'unverified' }, src(agent), pi).reason, 'BACKEND_DELIVERY_UNVERIFIED');
  assert.equal(verifySeatBinding(seat, backend, { ok: false, reason: 'down' }, pi).reason, 'SOURCE_UNAVAILABLE');
  assert.equal(normalizeCwd('D:\\Work\\ERP\\'), normalizeCwd('d:/work/erp'));
  assert.notEqual(normalizeCwd('/mnt/d/Work/ERP'), normalizeCwd('/mnt/d/work/erp'), 'POSIX paths stay case-sensitive');

  const { h } = await seeded([rec(101, { actionRequired: 'x', targets: [{ handle: 'antigravity', role: 'erp-ui-lead' }] })]);
  assert.deepEqual(h.wakes, []);
  assert.equal(h.persisted.holds['evt-101::agy-erp-0001::binding'].reason, 'SEAT_NEVER_WAKE');
});

test('seat table validation rejects duplicates, two defaults, undeclared backends and PATH-style pane ids', () => {
  assert.equal(validateSeatTable(TABLE).ok, true);
  const t = cloneTable();
  t.seats[1].default = true; t.seats[2].default = true;   // two default claude seats
  t.seats[3].backend = 'wsl/unknown';
  t.seats[4].pane = 'p1';
  t.seats[5].instance = t.seats[4].instance;
  const v = validateSeatTable(t);
  assert.equal(v.ok, false);
  for (const needle of ['more than one default seat', 'not declared', 'full pane id', 'duplicate instance']) {
    assert.ok(v.errors.some((e) => e.includes(needle)), needle);
  }
  assert.deepEqual(resolveTarget({ handle: 'claude', role: 'erp-floor-lead', instance: null, backend: null }, TABLE).seats.map((s) => s.seatId), ['erp-floor-lead']);
});

test('enrollment guard: no delivery unless the cited Room record comes from that handle with that exact instance', async () => {
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'erp-floor-lead' }] })];
  const key = 'evt-101::claude-erp-0001';

  // 1. The seat table cites a record that is not in the Room.
  const a = makeHarness(); await a.poll(records.slice(0, 1));
  a.unenrolled.add('erp-floor-lead');
  await a.poll(records);
  assert.deepEqual(a.wakes, []);
  assert.equal(a.persisted.holds[`${key}::binding`].reason, 'ENROLLMENT_RECORD_NOT_FOUND');
  a.unenrolled.clear();                       // the seat posts its own startup record
  await a.poll(records);
  assert.deepEqual(a.woken(), ['erp-floor-lead'], 'recoverable once the evidence exists');

  // 2. The cited record exists but was posted under a different instance of the same handle.
  const b = makeHarness(); await b.poll(records.slice(0, 1));
  b.enrollInstance.set('erp-floor-lead', 'claude-ops-0001');
  await b.poll(records);
  assert.deepEqual(b.wakes, []);
  assert.equal(b.persisted.holds[`${key}::binding`].reason, 'ENROLLMENT_EVIDENCE_MISMATCH');

  // 3. The seat cites nothing at all: an operator's table entry alone is not enough.
  const c = makeHarness(); await c.poll(records.slice(0, 1));
  delete c.table.seats.find((s) => s.seatId === 'erp-floor-lead').enrollmentSeq;
  await c.poll(records);
  assert.deepEqual(c.wakes, []);
  assert.equal(c.persisted.holds[`${key}::binding`].reason, 'INSTANCE_NOT_ENROLLED');

  // 4. Evidence does not replace the live binding: enrolled seat, wrong pid, still held.
  const d = makeHarness(); await d.poll(records.slice(0, 1));
  d.pidOverride.set('erp-floor-lead', 9999);
  await d.poll(records);
  assert.deepEqual(d.wakes, []);
  assert.equal(d.persisted.holds[`${key}::binding`].reason, 'PID_MISMATCH');

  // Pure function: wrong handle, alias resolution, invalid citation.
  const seat = TABLE.seats.find((s) => s.seatId === 'erp-floor-lead');
  const by = (o) => new Map([[seat.enrollmentSeq, rec(seat.enrollmentSeq, o)]]);
  assert.equal(verifySeatEnrollment(seat, by({ sender: 'codex', senderInstance: seat.instance })).reason, 'ENROLLMENT_EVIDENCE_MISMATCH');
  assert.equal(verifySeatEnrollment(seat, by({ sender: 'elder', senderInstance: seat.instance }), canonicalHandle).ok, true);
  assert.equal(verifySeatEnrollment({ ...seat, enrollmentSeq: 0 }, new Map()).reason, 'INSTANCE_NOT_ENROLLED');
  assert.ok(validateSeatTable({ ...cloneTable(), seats: [{ ...seat, enrollmentSeq: -3 }] }).errors.some((e) => e.includes('enrollmentSeq')));
});

// ---- 4. durability ------------------------------------------------------------------
test('duplicate event: the same eventId at a later sequence is delivered once', async () => {
  const { h, report } = await seeded([
    rec(101, { eventId: 'evt-dup', sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' }),
    rec(102, { eventId: 'evt-dup', sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' }),
  ]);
  assert.deepEqual(h.woken(), ['codex-chief']);
  assert.deepEqual(report.plan[1].deliveries, ['codex-chief:DUPLICATE']);
});

test('restart/dedup: a new process on the same state does not re-deliver', async () => {
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  const a = makeHarness();
  await a.poll(records.slice(0, 1)); await a.poll(records);
  assert.equal(a.wakes.length, 1);
  const b = makeHarness({ state: a.persisted });
  await b.poll(records); await b.poll(records);
  assert.deepEqual(b.wakes, []);
  assert.equal(b.persisted.checkpoint.lastSeq, 101);
});

test('pending is durable before the checkpoint advances and before any pane is touched', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  await h.poll(records.slice(0, 1));
  const seen = [];
  const realSave = h.store.save;
  h.store.save = (s) => { seen.push({ lastSeq: s.checkpoint.lastSeq, status: s.deliveries['evt-101::codex-inst-0001']?.status ?? null, wakes: h.wakes.length }); realSave(s); };
  await h.poll(records);
  assert.deepEqual(seen, [
    { lastSeq: 101, status: 'pending', wakes: 0 },               // delivery + checkpoint in one write
    { lastSeq: 101, status: 'inflight', wakes: 0 },              // SUBMITTED recorded before the prompt
    { lastSeq: 101, status: 'transport_acknowledged', wakes: 1 },
  ]);
});

test('simulated write failure: the error propagates, nothing is woken and the checkpoint does not move', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  await h.poll(records.slice(0, 1));
  h.failSaveAt = h.saves + 1;
  await assert.rejects(() => h.poll(records), (e) => e instanceof StateError && e.code === 'STATE_WRITE_FAILED');
  assert.deepEqual(h.wakes, []);
  assert.equal(h.persisted.checkpoint.lastSeq, 100);
  h.failSaveAt = null;                       // disk recovers: exactly one delivery, no storm
  await h.poll(records); await h.poll(records);
  assert.equal(h.wakes.length, 1);
});

test('simulated crash after submit: outcome unknown is HELD, not re-sent, and a Room reply from the target clears it', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  await h.poll(records.slice(0, 1));
  h.failSaveAt = h.saves + 3;                // plan ok, submitted ok, post-prompt write dies
  await assert.rejects(() => h.poll(records), StateError);
  assert.equal(h.wakes.length, 1, 'the prompt went out before the crash');
  assert.equal(h.persisted.deliveries['evt-101::codex-inst-0001'].status, 'inflight');

  const b = makeHarness({ state: h.persisted });   // restart
  await b.poll(records);
  assert.deepEqual(b.wakes, [], 'not re-sent blindly');
  const d = b.persisted.deliveries['evt-101::codex-inst-0001'];
  assert.equal(d.status, 'held');
  assert.equal(b.persisted.holds[d.holdKey].reason, 'SUBMIT_OUTCOME_UNKNOWN');
  assert.equal(b.persisted.holds[d.holdKey].recoverable, false);

  const reply = rec(102, { sender: 'codex', senderInstance: 'codex-inst-0001', replyTo: 'evt-101', actionRequired: 'NONE' });
  await b.poll([...records, reply]);
  const d2 = b.persisted.deliveries['evt-101::codex-inst-0001'];
  assert.equal(d2.status, 'transport_acknowledged');
  assert.equal(d2.transportAckSource, 'room-reply');
  assert.equal(d2.workAckSeq, 102);
  assert.deepEqual(b.wakes, []);
});

test('submitted, delivered, agent-ACK and Room-response are separate states', async () => {
  const h = makeHarness();
  const base = [rec(100, { actionRequired: 'NONE' }), rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'erp-floor-lead' }] })];
  await h.poll(base.slice(0, 1)); await h.poll(base);
  const key = 'evt-101::claude-erp-0001';
  let d = h.persisted.deliveries[key];
  assert.ok(d.submittedAt != null && d.transportAckAt != null);
  assert.equal(d.workAckAt, null); assert.equal(d.roomResponseAt, null);
  // A reply from a DIFFERENT instance of the same handle is not this seat's ACK.
  const other = rec(102, { sender: 'claude', senderInstance: 'claude-ops-0001', replyTo: 'evt-101', actionRequired: 'NONE' });
  await h.poll([...base, other]);
  assert.equal(h.persisted.deliveries[key].workAckAt, null);
  const ack = rec(103, { sender: 'claude', senderInstance: 'claude-erp-0001', replyTo: 'evt-101', actionRequired: 'NONE', action: 'started' });
  await h.poll([...base, other, ack]);
  d = h.persisted.deliveries[key];
  assert.equal(d.workAckSeq, 103); assert.equal(d.roomResponseAt, null);
  const done = rec(104, { sender: 'claude', senderInstance: 'claude-erp-0001', replyTo: 'evt-101', actionRequired: 'NONE', action: 'done' });
  await h.poll([...base, other, ack, done]);
  assert.equal(h.persisted.deliveries[key].roomResponseSeq, 104);
});

test('failed submits back off within bounds and end in dead-letter', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  const options = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 1500 };
  await h.poll(records.slice(0, 1));
  h.wakeResult = { ok: false, reason: 'agent_blocked' };
  await h.poll(records, { options });
  const key = 'evt-101::codex-inst-0001';
  assert.equal(h.persisted.deliveries[key].status, 'pending');
  assert.equal(h.persisted.deliveries[key].nextAttemptAt, h.clock + 1000);
  await h.poll(records, { options });
  assert.equal(h.wakes.length, 1, 'not retried before the backoff elapses');
  h.clock += 1000; await h.poll(records, { options });
  assert.equal(h.persisted.deliveries[key].nextAttemptAt, h.clock + 1500, 'delay is capped');
  h.clock += 1500; await h.poll(records, { options });
  assert.equal(h.persisted.deliveries[key].status, 'dead_letter');
  h.clock += 60_000; await h.poll(records, { options });
  assert.equal(h.wakes.length, 3, 'dead-letter is never retried');
});

test('holds expire into dead-letter instead of living forever', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { actionRequired: 'x', targets: [{ handle: 'claude', role: 'erp-floor-lead' }] })];
  await h.poll(records.slice(0, 1));
  h.missingPanes.add('windows/default w1:p5');
  await h.poll(records, { options: { holdTtlMs: 5000 } });
  h.clock += 5000;
  await h.poll(records, { options: { holdTtlMs: 5000 } });
  assert.equal(h.persisted.deliveries['evt-101::claude-erp-0001'].status, 'dead_letter');
  assert.equal(h.persisted.holds['evt-101::claude-erp-0001::binding'].status, 'expired');
  assert.deepEqual(h.wakes, []);
});

test('any unavailable source freezes the checkpoint; nothing is consumed until it returns', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' })];
  await h.poll(records.slice(0, 1));
  h.down.add('wsl/default');                 // codex lives on windows, but one source is blind
  const report = await h.poll(records);
  assert.equal(report.status, 'FROZEN');
  assert.deepEqual(report.frozenSources, ['wsl/default']);
  assert.equal(h.persisted.checkpoint.lastSeq, 100);
  assert.equal(h.persisted.sourceOutage.sources, 'wsl/default');
  assert.deepEqual(h.wakes, []);
  const saves = h.saves; await h.poll(records);
  assert.equal(h.saves, saves, 'an unchanged outage is not rewritten every poll');
  h.down.clear();
  await h.poll(records);
  assert.deepEqual(h.woken(), ['codex-chief']);
  assert.equal(h.persisted.sourceOutage, null);
});

test('unusable snapshot or invalid seat table consumes nothing', async () => {
  const h = makeHarness();
  const r1 = await pollOnce({ snapshot: { state: 'UNSTABLE', stable: false, records: [] }, seatTable: h.table, discover: h.discover, probe: h.probe, wake: h.wake, store: h.store, deliver: true });
  assert.equal(r1.status, 'SNAPSHOT_UNUSABLE');
  const r2 = await pollOnce({ snapshot: { state: 'OK', stable: true, records: [], tailSequence: 5 }, seatTable: { schema: 'nope' }, discover: h.discover, probe: h.probe, wake: h.wake, store: h.store, deliver: true });
  assert.equal(r2.status, 'SEAT_TABLE_INVALID');
  assert.equal(h.saves, 0);
});

// ---- 5. dry-run and state isolation -------------------------------------------------
test('dry-run is pure: no state write, no checkpoint movement, no pane prompt', async () => {
  const h = makeHarness();
  const records = [rec(100, { actionRequired: 'NONE' }), rec(101, { sender: 'mustarq', senderInstance: 'starq-bot-gateway', actionRequired: '@codex: build' }), rec(102, { actionRequired: '@claude: review' })];
  const seed = await h.poll(records.slice(0, 1), { deliver: false });
  assert.equal(seed.status, 'SEEDED');
  assert.equal(h.saves, 0);
  assert.equal(h.persisted.checkpoint.lastSeq, null, 'a dry-run does not even seed');
  await h.poll(records.slice(0, 1));         // real seed
  const before = JSON.stringify(h.persisted); const saves = h.saves;
  const report = await h.poll(records, { deliver: false });
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.writes, 0);
  assert.equal(h.saves, saves);
  assert.equal(JSON.stringify(h.persisted), before);
  assert.deepEqual(h.wakes, []);
  assert.deepEqual(report.attempts.map((a) => `${a.seatId}:${a.result}`), ['codex-chief:WOULD_SUBMIT']);
  assert.deepEqual(report.plan.map((p) => p.outcome), ['PLANNED', 'HOLD']);
});

test('state directory must be explicit and isolated; corrupt state and failed writes are errors', () => {
  assert.throws(() => assertIsolatedStateDir(''), (e) => e.code === 'STATE_DIR_REQUIRED');
  assert.throws(() => assertIsolatedStateDir('D:\\StarqTech\\agent-comms\\state'), (e) => e.code === 'STATE_DIR_IS_PRODUCTION');
  assert.throws(() => assertIsolatedStateDir('/mnt/d/StarqTech/agent-comms/state/v2'), (e) => e.code === 'STATE_DIR_IS_PRODUCTION');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-store-'));
  try {
    fs.writeFileSync(path.join(tmp, 'room-dispatch.json'), '{"lastSeq":1}');
    assert.throws(() => assertIsolatedStateDir(tmp), (e) => e.code === 'STATE_DIR_HAS_LEGACY_CHECKPOINT');
    fs.unlinkSync(path.join(tmp, 'room-dispatch.json'));
    assert.equal(assertIsolatedStateDir(tmp), path.resolve(tmp));

    assert.equal(loadState(tmp).checkpoint.lastSeq, null, 'missing file is a fresh state');
    const s = emptyState(0); s.checkpoint.lastSeq = 7;
    saveState(tmp, s);
    assert.equal(loadState(tmp).checkpoint.lastSeq, 7);
    assert.deepEqual(fs.readdirSync(tmp), [STATE_FILENAME], 'no temp file left behind');

    fs.writeFileSync(path.join(tmp, STATE_FILENAME), '{ truncated');
    assert.throws(() => loadState(tmp), (e) => e.code === 'STATE_UNREADABLE');
    fs.writeFileSync(path.join(tmp, STATE_FILENAME), JSON.stringify({ lastSeq: 18497, delivered: [], pending: [] }));
    assert.throws(() => loadState(tmp), (e) => e.code === 'STATE_SCHEMA_MISMATCH', 'a legacy-shaped file is never adopted');

    const failingFs = { ...fs, renameSync: () => { throw new Error('EACCES synthetic'); } };
    assert.throws(() => saveState(tmp, s, failingFs), (e) => e.code === 'STATE_WRITE_FAILED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('pointer is one short printable-ASCII line that names the Room record', () => {
  const p = buildPointer(rec(42, { eventId: 'abcdef1234567890', subject: '🔔 ERP-541 "correction"\nsecond line $(rm -rf) `x`' }));
  assert.match(p, /^Room #42 \(abcdef12\) from codex: /);
  assert.ok(p.includes('--reply-to abcdef1234567890'));
  assert.ok(/^[\x20-\x7E]+$/.test(p), 'printable ASCII only');
  assert.ok(!/["`$\\\n]/.test(p), 'no shell-significant characters');
  assert.ok(p.length < 320);
});

test('recipientsFor reads only structured fields', () => {
  const quoted = rec(1, { body: '@codex @claude#ops @all', actionRequired: 'please look', audience: ['codex', 'claude'] });
  assert.deepEqual(recipientsFor(quoted).targets, []);
  assert.equal(recipientsFor(quoted).reason, 'UNADDRESSED');
  const noisy = rec(2, { actionRequired: '@thread:thr_abc @codex: see card' });
  assert.deepEqual(recipientsFor(noisy).targets.map((t) => t.handle), ['codex']);
  assert.deepEqual(recipientsFor(noisy).ignoredOwners, ['thread']);
});
