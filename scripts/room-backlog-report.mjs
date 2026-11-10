#!/usr/bin/env node
/**
 * room-backlog-report.mjs — READ-ONLY reconciliation of a preserved legacy checkpoint range.
 *
 * COMMS-ROUTING-20261110 phase 1 (Room #18737 item 7). The production checkpoint
 * agent-comms/state/room-dispatch.json stopped at a legacy sequence and is kept
 * as evidence. This tool lists what lies between that checkpoint and the Room
 * tail and how the hardened routing WOULD classify each record.
 *
 * It never delivers, never replays, never writes dispatcher state and never
 * touches the legacy checkpoint (it is opened read-only, for its hash and
 * lastSeq only). Every actionable entry is reported as UNVERIFIED_HOLD with
 * delivered=false: whether an agent already acted on it is unknown to this tool
 * and must be settled by an operator, not by replay.
 *
 * Usage:
 *   node room-backlog-report.mjs --room-module <room.mjs> --seat-table <file> --out <dir>
 *        (--from-seq <n> | --legacy-checkpoint <room-dispatch.json>)
 */
import nodeFs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planRecord } from './room-dispatcher.mjs';
import { emptyState } from '../protocol/v1/deliveryStore.mjs';
import { validateSeatTable } from '../protocol/v1/seatBinding.mjs';
import { senderInstanceOf } from '../protocol/v1/routingTargets.mjs';

export const BACKLOG_STATUS = 'UNVERIFIED_HOLD';

/** Pure: classify records in (afterSeq, tail] against a seat table. Nothing is delivered. */
export function buildBacklogReport({ records, afterSeq, seatTable, now = Date.now() }) {
  const tv = validateSeatTable(seatTable);
  if (!tv.ok) throw new Error(`seat table invalid: ${tv.errors.join('; ')}`);
  const scratch = emptyState(now); // throwaway planning state, never persisted
  const inRange = (records || []).filter((r) => Number.isInteger(r.brokerSequence) && r.brokerSequence > afterSeq)
    .sort((a, b) => a.brokerSequence - b.brokerSequence);
  const counts = { total: inRange.length, notOutstanding: 0, unaddressed: 0, selfOnly: 0, actionable: 0, wouldPlan: 0, wouldHold: 0 };
  const entries = [];
  for (const rec of inRange) {
    const { entry } = planRecord(scratch, rec, seatTable, now);
    if (entry.outcome === 'NOOP') {
      if (entry.reason === 'NOT_OUTSTANDING') counts.notOutstanding++;
      else if (entry.reason === 'SELF_ONLY') counts.selfOnly++;
      else counts.unaddressed++;
      if (entry.reason === 'NOT_OUTSTANDING') continue; // FYI/ACK traffic is counted, not listed
    } else {
      counts.actionable++;
      if (entry.deliveries.length) counts.wouldPlan++;
      if (entry.holds.length) counts.wouldHold++;
    }
    const e = rec.event || {}; const md = e.metadata || {};
    entries.push({
      seq: rec.brokerSequence, eventId: rec.eventId || null, sender: e.senderHandle || null, senderInstance: senderInstanceOf(rec),
      subject: String(md.subject || '').slice(0, 140), actionRequired: String(md.actionRequired ?? '').slice(0, 200),
      routingBasis: entry.reason, wouldTargetSeats: entry.deliveries, wouldHold: entry.holds,
      status: entry.outcome === 'NOOP' ? 'NOT_ROUTED' : BACKLOG_STATUS, delivered: false,
    });
  }
  return {
    schema: 'starq.backlog-report/1', generatedAt: new Date(now).toISOString(), afterSeq,
    firstSeq: inRange[0]?.brokerSequence ?? null, lastSeq: inRange.at(-1)?.brokerSequence ?? null,
    statement: 'Read-only. Nothing in this report was delivered or replayed by the hardened dispatcher. Actionable entries are UNVERIFIED_HOLD.',
    counts, entries,
  };
}

export function renderMarkdown(report, meta = {}) {
  const lines = [
    `# Room backlog / HOLD reconciliation — #${report.afterSeq + 1} to #${report.lastSeq ?? '-'}`,
    '', `Generated ${report.generatedAt}. ${report.statement}`, '',
    ...(meta.legacy ? [`Legacy checkpoint (opened read-only, unchanged): \`${meta.legacy.path}\`, lastSeq ${meta.legacy.lastSeq}, sha256 ${meta.legacy.sha256}.`, ''] : []),
    ...(meta.seatTable ? [`Seat table: \`${meta.seatTable}\`.`, ''] : []),
    '| Count | Value |', '|---|---|',
    ...Object.entries(report.counts).map(([k, v]) => `| ${k} | ${v} |`), '',
    '| Seq | Sender (instance) | Status | Routing basis | Would target | Would hold | Subject |', '|---|---|---|---|---|---|---|',
    ...report.entries.map((e) => `| #${e.seq} | ${e.sender} (${e.senderInstance || '-'}) | ${e.status} | ${e.routingBasis} | ${e.wouldTargetSeats.join(', ') || '-'} | ${e.wouldHold.join(', ') || '-'} | ${e.subject.replace(/\|/g, '/')} |`),
    '',
  ];
  return lines.join('\n');
}

function argValue(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const fail = (m) => { console.error(`room-backlog-report: ${m}`); process.exit(2); };
  const roomModule = argValue('--room-module'); const seatTablePath = argValue('--seat-table'); const out = argValue('--out');
  if (!roomModule || !seatTablePath || !out) fail('--room-module, --seat-table and --out are required');
  const outAbs = path.resolve(out);
  if (outAbs.replace(/\\/g, '/').toLowerCase().split('/').includes('agent-comms')) fail('refusing to write a report inside the live runtime tree');

  let afterSeq = argValue('--from-seq') ? Number(argValue('--from-seq')) - 1 : null;
  let legacy = null;
  const legacyPath = argValue('--legacy-checkpoint');
  if (legacyPath) {
    const bytes = nodeFs.readFileSync(legacyPath); // read-only
    legacy = { path: legacyPath, lastSeq: JSON.parse(bytes.toString('utf8')).lastSeq, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (afterSeq == null) afterSeq = legacy.lastSeq;
  }
  if (!Number.isInteger(afterSeq)) fail('give --from-seq <n> or --legacy-checkpoint <file>');

  const seatTable = JSON.parse(nodeFs.readFileSync(seatTablePath, 'utf8'));
  const { readRoomSnapshot } = await import(pathToFileURL(path.resolve(roomModule)).href);
  const snap = readRoomSnapshot();
  if (snap.state !== 'OK' || !snap.stable) fail(`Room snapshot not usable (state=${snap.state})`);
  const report = buildBacklogReport({ records: snap.records, afterSeq, seatTable });
  report.roomTail = snap.tailSequence; report.roomSha256Prefix = snap.sha256Prefix; report.legacyCheckpoint = legacy;
  nodeFs.mkdirSync(outAbs, { recursive: true });
  const base = path.join(outAbs, `backlog-${afterSeq + 1}-${snap.tailSequence}`);
  nodeFs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 1));
  nodeFs.writeFileSync(`${base}.md`, renderMarkdown(report, { legacy, seatTable: seatTablePath }));
  console.log(JSON.stringify({ json: `${base}.json`, markdown: `${base}.md`, counts: report.counts }, null, 1));
}
