// Backlog report: read-only classification, nothing delivered (Room #18737 item 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';
const here = path.dirname(fileURLToPath(import.meta.url));
const { buildBacklogReport, renderMarkdown, BACKLOG_STATUS } = await import('../scripts/room-backlog-report.mjs');
const TABLE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'seat-table.json'), 'utf8'));

const rec = (seq, actionRequired, extra = {}) => ({
  brokerSequence: seq, eventId: `evt-${seq}`, evaluatedDeliveryType: extra.deliveryType ?? 'ACTION_REQUIRED', evaluatedAudience: 'ALL',
  event: { senderHandle: extra.sender ?? 'mustarq', body: extra.body ?? '', metadata: { subject: `s${seq}`, actionRequired, senderInstanceId: extra.senderInstance ?? 'starq-bot-gateway', ...(extra.routing ? { routing: extra.routing } : {}) } },
});

test('backlog entries are UNVERIFIED_HOLD, never delivered, and the range starts after the legacy checkpoint', () => {
  const records = [
    rec(18497, '@codex: before the checkpoint'),
    rec(18498, '@codex: build'),
    rec(18499, 'NONE'),
    rec(18500, '@claude: review'),
    rec(18501, 'Claude: free text ask', { body: '@claude @codex quoted' }),
    rec(18502, 'x', { routing: { schema: 'starq.routing/1', targets: [{ handle: 'claude', role: 'ops-room-deputy' }] } }),
  ];
  const frozen = JSON.stringify(records);
  const report = buildBacklogReport({ records, afterSeq: 18497, seatTable: TABLE, now: 0 });
  assert.equal(JSON.stringify(records), frozen, 'input records are not mutated');
  assert.equal(report.firstSeq, 18498);
  assert.deepEqual(report.counts, { total: 5, notOutstanding: 1, unaddressed: 1, selfOnly: 0, actionable: 3, wouldPlan: 2, wouldHold: 1 });
  assert.ok(report.entries.every((e) => e.delivered === false));
  const bySeq = Object.fromEntries(report.entries.map((e) => [e.seq, e]));
  assert.equal(bySeq[18498].status, BACKLOG_STATUS);
  assert.deepEqual(bySeq[18498].wouldTargetSeats, ['codex-chief']);
  assert.deepEqual(bySeq[18500].wouldHold, ['claude:NO_DEFAULT_SEAT']);
  assert.equal(bySeq[18501].status, 'NOT_ROUTED');
  assert.equal(bySeq[18499], undefined, 'FYI traffic is counted, not listed');
  const md = renderMarkdown(report);
  assert.match(md, /Nothing in this report was delivered or replayed/);
  assert.match(md, /\| #18502 \|.*UNVERIFIED_HOLD.*ops-room-deputy/);
});

test('an invalid seat table is an error, not an empty report', () => {
  assert.throws(() => buildBacklogReport({ records: [], afterSeq: 1, seatTable: { schema: 'x' } }), /seat table invalid/);
});

test('candidate seat table is valid and encodes the Floor Lead answers (#18741, #18742)', async () => {
  const { validateSeatTable, resolveTarget } = await import('../protocol/v1/seatBinding.mjs');
  const candidate = JSON.parse(fs.readFileSync(path.join(here, '..', 'config', 'seat-table.candidate.json'), 'utf8'));
  assert.deepEqual(validateSeatTable(candidate), { ok: true, errors: [] });
  const codex = resolveTarget({ handle: 'codex', role: null, instance: null, backend: null }, candidate);
  assert.deepEqual(codex.seats.map((s) => `${s.seatId} ${s.pane}`), ['codex-chief-engineer w1:p1'], 'a post directed to @codex wakes Codex');
  assert.equal(candidate.seats.filter((s) => s.handle === 'codex' && s.default).length, 1);
  for (const handle of ['claude', 'antigravity']) {
    assert.equal(resolveTarget({ handle, role: null, instance: null, backend: null }, candidate).hold.reason, 'NO_DEFAULT_SEAT', `bare @${handle} holds`);
  }
  const ops = candidate.seats.find((s) => s.seatId === 'ops-room-deputy');
  assert.equal(ops.instance, 'e97d7e67-fd68-40a1-9c4e-a7e8be387554');
  assert.equal(ops.herdrAgentSession, undefined, 'stale Herdr agent_session is not asserted');
  assert.ok(candidate.seats.every((s) => s.instance !== '7db2e99c-6595-47fb-afe5-bea257dce6d3' && s.herdrAgentSession === undefined));
  assert.equal(candidate.seats.find((s) => s.pane === 'w1:p3').neverWake, true);
  assert.equal(candidate.backends.find((b) => b.key === 'wsl/default').delivery, 'unverified');
});
