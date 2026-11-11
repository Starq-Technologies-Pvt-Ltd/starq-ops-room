// Exercise the real Room sender CLI's structured-target path without touching
// the canonical Room, identity leases, Herdr, or any agent. The sender's
// runtime-only imports are minimal test doubles in a fresh OS temp directory;
// the candidate authority policy, identity resolution, routing validation and
// dispatcher are the real branch modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const identities = path.join(here, 'fixtures', 'identities.json');
const seatTable = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'seat-table.json'), 'utf8'));
const candidateTable = JSON.parse(fs.readFileSync(path.join(root, 'config', 'seat-table.candidate.json'), 'utf8'));
const { pollOnce } = await import('../scripts/room-dispatcher.mjs');
const { emptyState } = await import('../protocol/v1/deliveryStore.mjs');
const { parseExplicitAddress } = await import('../protocol/v1/explicitAddress.mjs');

const files = {
  'scripts/send.mjs': path.join(root, 'scripts', 'send.mjs'),
  'protocol/v1/authorityPolicy.mjs': path.join(root, 'protocol', 'v1', 'authorityPolicy.mjs'),
  'protocol/v1/identityProvider.mjs': path.join(root, 'protocol', 'v1', 'identityProvider.mjs'),
  'protocol/v1/routingInput.mjs': path.join(root, 'protocol', 'v1', 'routingInput.mjs'),
  'protocol/v1/routingTargets.mjs': path.join(root, 'protocol', 'v1', 'routingTargets.mjs'),
};

function writeTreeFile(base, relative, contents) {
  const dest = path.join(base, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
}

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starq-send-routing-'));
  for (const [relative, source] of Object.entries(files)) {
    const dest = path.join(dir, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.copyFileSync(identities, path.join(dir, 'tests', 'identities.json'));

  // Test doubles for modules that are intentionally runtime-only in this repo.
  writeTreeFile(dir, 'scripts/room.mjs', `export const VALID_AGENTS = ['codex','claude','antigravity','cursor','copilot','opencode','devin','goose','omp','deadpool','hermes','mustarq'];\nexport function postToRoom(){ throw new Error('not used by Room sender test'); }\n`);
  writeTreeFile(dir, 'scripts/room-structured-metadata.mjs', `export function buildStructuredRoomMetadata(v){ return { subject:v.subject||null, status:v.status||'Posted', action:v.action||null, actionRequired:v.actionRequired??null, references:v.references||[], replyTo:v.replyTo||null, deliveryType:v.deliveryType }; }\n`);
  writeTreeFile(dir, 'protocol/v1/identityLease.mjs', `export function computeInstanceId(v){ return String(v||'synthetic-instance'); }\nexport function registerSharedHolder(handle, instanceId){ return { mode:'shared', entry:{ handle, instanceId, hostname:'test', pid:1 } }; }\nexport function listActiveHolders(){ return []; }\nexport function getLeaseStatus(){ return { held:false, holders:[] }; }\nexport function claimOrRenewLease(){ return { ok:true, wasTakeover:false }; }\n`);
  writeTreeFile(dir, 'protocol/v1/reviewer-separation.mjs', `export const REVIEW_VERBS=['accepted','rejected'];\nexport function evaluateReview(){ return { decision:'ACCEPTED' }; }\n`);
  writeTreeFile(dir, 'protocol/v1/ingress.mjs', `import fs from 'node:fs';\nimport { randomUUID } from 'node:crypto';\nimport { evaluateEventRouting } from './authorityPolicy.mjs';\nlet seq=0;\nexport function emitEvent(p){ const r=evaluateEventRouting(p.sender,p.body,p.explicitMentions||[],p.metadata||{}); const id=randomUUID(); const event={protocolVersion:'1.0',eventId:id,senderHandle:p.sender,body:p.body,mentions:r.mentions,replyTo:p.replyTo||null,metadata:p.metadata||{}}; const record={brokerRecordVersion:'1.0',brokerSequence:++seq,eventId:id,evaluatedDeliveryType:r.deliveryType,evaluatedAudience:r.targetAudience,event}; fs.appendFileSync(process.env.TEST_ROOM_FILE,JSON.stringify(record)+'\\n'); return record; }\n`);
  return dir;
}

function publish({ targets, routingDocument, body = 'synthetic protocol check', actionRequired = 'notify named seat', extraEnv = {} } = {}) {
  const dir = makeSandbox();
  const room = path.join(dir, 'room.jsonl');
  const bodyFile = path.join(dir, 'body.txt');
  const routeFile = path.join(dir, 'routing.json');
  fs.writeFileSync(bodyFile, body);
  const route = routingDocument ?? (targets !== undefined ? { schema: 'starq.routing/1', targets } : undefined);
  if (route !== undefined) fs.writeFileSync(routeFile, JSON.stringify(route));
  const args = [path.join(dir, 'scripts', 'send.mjs'), '--from', 'codex', '--instance', 'synthetic-codex-0001', '--shared', '--room', '--body-file', bodyFile, '--action-required', actionRequired];
  if (route !== undefined) args.push('--routing-file', routeFile);
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, COMMS_ROOM_PATH: '', COMMS_IDENTITIES_PATH: path.join(dir, 'tests', 'identities.json'), TEST_ROOM_FILE: room, ...extraEnv },
  });
  const record = fs.existsSync(room) ? JSON.parse(fs.readFileSync(room, 'utf8').trim().split(/\r?\n/).at(-1)) : null;
  return { dir, result, record, room };
}

function mockDeps(table) {
  const state = emptyState(0);
  state.checkpoint.lastSeq = 0;
  const wakes = [];
  const backends = Object.fromEntries(table.backends.map((b) => [b.key, {
    ok: true,
    agents: table.seats.filter((s) => s.backend === b.key).map((s) => ({ pane_id:s.pane, agent:s.herdrAgent, cwd:s.cwd, agent_status:'idle',
      ...(s.herdrAgentSession ? { agent_session:{ value:s.herdrAgentSession } } : {}) })),
  }]));
  const store = { load: () => structuredClone(state), save: (next) => Object.assign(state, structuredClone(next)) };
  return {
    state, wakes,
    deps: { seatTable:table, snapshot:null, discover:()=>backends,
      probe:(s)=>({pane_id:s.pane,foreground_processes:[{pid:s.pid}]}),
      wake:async(s,b)=>{wakes.push({seatId:s.seatId,backend:b.key,pane:s.pane});return {ok:true};},
      store, deliver:true, now:()=>1000 },
  };
}

async function routePublished(record, table = seatTable) {
  const h = mockDeps(table);
  // Enrollment evidence the dispatcher now requires: each seat's cited Room record,
  // from that seat's own handle and instance. The checkpoint sits above all of them.
  const evidence = table.seats.filter((s) => s.enrollmentSeq).map((s) => ({ brokerSequence:s.enrollmentSeq, eventId:`enroll-${s.seatId}`,
    evaluatedDeliveryType:'CC_CONTEXT', evaluatedAudience:'ALL', event:{ senderHandle:s.handle, body:'', metadata:{ actionRequired:'NONE', senderInstanceId:s.instance } } }));
  const OFFSET = 1_000_000;
  h.state.checkpoint.lastSeq = OFFSET;
  record = { ...record, brokerSequence: OFFSET + record.brokerSequence };
  h.deps.snapshot = { state:'OK', stable:true, tailSequence:record.brokerSequence, records:[...evidence, record] };
  const report = await pollOnce(h.deps);
  return { ...h, report };
}

test('send CLI -> structured Room event -> dispatcher routes only the named role', async () => {
  const p = publish({ targets:[{handle:'claude',role:'ops-room-deputy'}], body:'Forwarded text says @copilot and @all, but this synthetic post targets the Ops role.' });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    assert.ok(p.record);
    assert.deepEqual(p.record.event.metadata.routing, {schema:'starq.routing/1',targets:[{handle:'claude',role:'ops-room-deputy'}]});
    assert.equal(p.record.evaluatedDeliveryType, 'ACTION_REQUIRED');
    assert.deepEqual(p.record.evaluatedAudience, ['claude'], 'body mentions and quoted @all cannot expand a structured audience');
    assert.deepEqual(p.record.event.mentions, ['claude']);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes.map((w)=>w.seatId), ['ops-room-deputy']);
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
});

test('explicit ingress address -> sender -> dispatcher wakes only validated recipients', async () => {
  const parsed = parseExplicitAddress(
    '/to @claude role=ops-room-deputy; @antigravity role=hoadhaa-lead\nQuoted text: @all @cursor please wake.',
  );
  assert.equal(parsed.ok, true);
  const p = publish({ routingDocument:parsed.routing, body:parsed.body, actionRequired:parsed.actionRequired });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    assert.deepEqual(p.record.event.metadata.routing, parsed.routing);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes.map((w)=>w.seatId).sort(), ['hoadhaa-lead','ops-room-deputy']);
    assert.equal(r.wakes.some((w)=>w.seatId==='codex-chief'||w.seatId==='erp-cursor'), false);
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }

  const unaddressed = parseExplicitAddress('Forwarded message: @claude and @all\nPlease note.');
  assert.equal(unaddressed.ok, true);
  const plain = publish({ body:unaddressed.body, actionRequired:unaddressed.actionRequired });
  try {
    assert.equal(plain.result.status, 0, plain.result.stderr);
    const r = await routePublished(plain.record);
    assert.deepEqual(r.wakes, []);
  } finally { fs.rmSync(plain.dir,{recursive:true,force:true}); }
});

test('@mustarq is never emitted as a Herdr wake target', async () => {
  const parsed = parseExplicitAddress('/to @mustarq\nFounder FYI only.');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.routing, null);
  const p = publish({ body:parsed.body, actionRequired:parsed.actionRequired });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes, []);
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
});

test('explicit bare shared Claude address is held instead of waking multiple sessions', async () => {
  const parsed = parseExplicitAddress('/to @claude\nPlease review the routing change.');
  assert.equal(parsed.ok, true);
  const p = publish({ routingDocument:parsed.routing, body:parsed.body, actionRequired:parsed.actionRequired });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    const r = await routePublished(p.record, candidateTable);
    assert.deepEqual(r.wakes, []);
    assert.ok(Object.values(r.state.holds).some((h)=>h.reason==='NO_DEFAULT_SEAT'));
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
});

test('send CLI explicit multi-recipient plans each exact seat once', async () => {
  const p = publish({ targets:[{handle:'codex'},{handle:'claude',role:'erp-floor-lead'},{handle:'antigravity',role:'hoadhaa-lead'}] });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes.map((w)=>w.seatId).sort(), ['codex-chief','erp-floor-lead','hoadhaa-lead']);
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
});

test('candidate table routes Cursor exactly and holds WSL until delivery context is verified', async () => {
  const cursor = publish({ targets:[{handle:'cursor',role:'erp-fullstack-studio-lead',instance:'cursor-session-fixed',backend:'windows/default'}] });
  try {
    assert.equal(cursor.result.status, 0, cursor.result.stderr);
    const r = await routePublished(cursor.record,candidateTable);
    assert.deepEqual(r.wakes.map((w)=>w.seatId), ['erp-cursor']);
  } finally { fs.rmSync(cursor.dir,{recursive:true,force:true}); }

  const wsl = publish({ targets:[{handle:'claude',role:'erp-wsl-verification',instance:'claudewsl-wsl-w1p4-20261110',backend:'wsl/default'}] });
  try {
    assert.equal(wsl.result.status, 0, wsl.result.stderr);
    const r = await routePublished(wsl.record,candidateTable);
    assert.deepEqual(r.wakes, []);
    assert.ok(Object.values(r.state.holds).some((h)=>h.reason==='BACKEND_DELIVERY_UNVERIFIED'));
  } finally { fs.rmSync(wsl.dir,{recursive:true,force:true}); }
});

test('send CLI does not route quoted body mentions or unaddressed posts', async () => {
  const p = publish({ targets:[{handle:'codex'}], body:'Quoted: @claude please wake every pane.' });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes.map((w)=>w.seatId), ['codex-chief']);
    assert.ok(!r.wakes.some((w)=>w.seatId==='erp-floor-lead'||w.seatId==='ops-room-deputy'));
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
  const legacy = publish({ body:'Unaddressed post mentions @claude in a quote.', actionRequired:'NONE' });
  try {
    assert.equal(legacy.result.status, 0, legacy.result.stderr);
    assert.equal(legacy.record.event.metadata.routing, undefined, 'omitting --routing-file must preserve the legacy metadata shape');
    const r = await routePublished(legacy.record);
    assert.deepEqual(r.wakes, []);
  } finally { fs.rmSync(legacy.dir,{recursive:true,force:true}); }
});

test('contradictory selectors hold without a wake; invalid identity is refused before Room append', async () => {
  const p = publish({ targets:[{handle:'claude',role:'ops-room-deputy',instance:'claude-erp-0001'}] });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    const r = await routePublished(p.record);
    assert.deepEqual(r.wakes, []);
    assert.ok(Object.values(r.state.holds).some((h)=>h.reason==='CONTRADICTORY_TARGET'));
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
  const bad = publish({ targets:[{handle:'no-such-agent'}] });
  try {
    assert.notEqual(bad.result.status, 0);
    assert.match(bad.result.stderr, /REFUSED/);
    assert.equal(bad.record, null);
  } finally { fs.rmSync(bad.dir,{recursive:true,force:true}); }
  const schema = publish({ routingDocument:{schema:'wrong',targets:[{handle:'codex'}]} });
  try {
    assert.notEqual(schema.result.status, 0);
    assert.match(schema.result.stderr, /schema must be exactly/);
    assert.equal(schema.record, null);
  } finally { fs.rmSync(schema.dir,{recursive:true,force:true}); }
});

test('legacy sender invocation without routing-file emits no routing metadata', async () => {
  const p = publish({ body:'Legacy-compatible plain Room post.', actionRequired:'NONE' });
  try {
    assert.equal(p.result.status, 0, p.result.stderr);
    assert.ok(p.record);
    assert.equal(Object.hasOwn(p.record.event.metadata,'routing'), false);
  } finally { fs.rmSync(p.dir,{recursive:true,force:true}); }
});

test('sender warns on stderr whenever COMMS_ROOM_PATH redirects the post, and is silent otherwise', () => {
  const plain = publish({ targets:[{handle:'codex'}] });
  const redirected = publish({ targets:[{handle:'codex'}], extraEnv:{ COMMS_ROOM_PATH: path.join(os.tmpdir(), 'starq-isolated-room', 'room.jsonl') } });
  const legacy = publish({ body:'legacy @cursor ping', actionRequired:'@cursor: synthetic', extraEnv:{ COMMS_ROOM_PATH: path.join(os.tmpdir(), 'starq-isolated-room', 'room.jsonl') } });
  try {
    assert.equal(plain.result.status, 0, plain.result.stderr);
    assert.doesNotMatch(plain.result.stderr, /COMMS_ROOM_PATH/);

    for (const p of [redirected, legacy]) {
      assert.equal(p.result.status, 0, p.result.stderr);
      assert.match(p.result.stderr, /WARNING: COMMS_ROOM_PATH is set\. This post goes to an ISOLATED Room file, NOT the canonical Room/);
      assert.ok(p.result.stderr.includes(path.join('starq-isolated-room', 'room.jsonl')), 'names the redirect target');
      assert.match(p.result.stderr, /WARNING: record #\d+ was written to the ISOLATED Room/);
      assert.doesNotMatch(p.result.stdout, /COMMS_ROOM_PATH|ISOLATED/, 'stdout is unchanged for callers that parse it');
    }
    assert.equal(redirected.result.stdout, plain.result.stdout.replace(/\[[0-9a-f]{8}\]/, redirected.result.stdout.match(/\[[0-9a-f]{8}\]/)[0]));
  } finally { for (const p of [plain, redirected, legacy]) fs.rmSync(p.dir, { recursive:true, force:true }); }
});
