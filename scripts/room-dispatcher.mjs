#!/usr/bin/env node
/**
 * room-dispatcher.mjs — ONE universal Room→agent dispatcher (hardened candidate).
 *
 * Founder directive 2026-11-07: "One Room protocol, one universal dispatcher,
 * independently addressable sessions across supported floors."
 * Hardening: COMMS-ROUTING-20261110 phase 1 (Room #18737), from audit #18736.
 *
 * Each poll:
 *   1. READ the Room through readRoomSnapshot() (never room.jsonl directly).
 *   2. DISCOVER every backend declared in the seat table (`herdr agent list`).
 *      If ANY declared backend is unavailable the checkpoint is FROZEN: no new
 *      record is consumed until every source answers again.
 *   3. PLAN each new record from structured metadata only
 *      (protocol/v1/routingTargets.mjs) and resolve recipients to seats by exact
 *      match against the seat table (protocol/v1/seatBinding.mjs). Anything
 *      ambiguous, invalid or unknown becomes a durable HOLD. Nothing is ever
 *      broadcast to all seats of a shared handle.
 *   4. PERSIST planned deliveries and holds together with the checkpoint in one
 *      atomic write BEFORE any pane is touched. A failed write throws and stops
 *      the dispatcher.
 *   5. DELIVER: immediately before every attempt and retry the seat is
 *      checked for enrollment evidence (the Room record the seat table cites
 *      must come from that handle with that exact instance) and re-verified on
 *      its own backend (pane, agent kind, cwd, optional session, foreground pid). A stale or unverifiable binding is a recoverable HOLD.
 *      The pointer is a short single-line ASCII reference to the Room record.
 *
 * Delivery states are kept apart: submitted, delivered (herdr accepted),
 * agent-ACK (the target instance replied in Room) and Room-response. Retries
 * use bounded exponential backoff and end in dead-letter. A delivery whose
 * submit outcome is unknown after a crash is HELD, never blindly re-sent.
 *
 * DEFAULT MODE IS DRY-RUN AND IT IS PURE: no state file, no checkpoint, no log
 * file, no lock, no pane prompt. Delivery requires the explicit --deliver flag.
 *
 * Usage:
 *   node room-dispatcher.mjs --seat-table <file> --state-dir <dir> [--room-module <room.mjs>]
 *                            [--deliver] [--once] [--print]
 *
 *   --seat-table   versioned seat table (schema starq.seats/1). Required.
 *   --state-dir    explicit isolated state directory. Required. The live
 *                  agent-comms tree and any directory holding a legacy
 *                  room-dispatch.json are refused.
 *   --room-module  module exporting readRoomSnapshot() (default: ./room.mjs beside this file)
 *   --deliver      arm delivery. Without it the run is a pure dry-run.
 *   --once         one poll then exit
 *   --print        echo activity to stdout (always on in dry-run)
 */
import nodeFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, execFile } from 'node:child_process';
import { recipientsFor, senderInstanceOf, targetKey, canonicalHandle } from '../protocol/v1/routingTargets.mjs';
import { validateSeatTable, resolveTarget, verifySeatBinding, verifySeatEnrollment, RECOVERABLE_HOLDS } from '../protocol/v1/seatBinding.mjs';
import { deliveryKey, createDelivery, canAttempt, recordAttempt, recordTransportAck, recordFailure } from '../protocol/v2/deliveryLedger.mjs';
import { assertIsolatedStateDir, loadState, saveState, STATE_FILENAME } from '../protocol/v1/deliveryStore.mjs';

export const DEFAULT_OPTIONS = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 5 * 60_000,
  holdTtlMs: 24 * 60 * 60_000,
});

const RESPONSE_ACTIONS = new Set(['done', 'blocked', 'accepted', 'rejected']);

/** Short, single-line, printable-ASCII pointer. The instruction itself stays in Room. */
export function buildPointer(record) {
  const e = record.event || {};
  const md = e.metadata || {};
  const ascii = (v, max) => String(v ?? '').replace(/[^\x20-\x7E]+/g, ' ').replace(/["`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const eventId = String(record.eventId || e.eventId || '');
  const subject = ascii(md.subject || e.taskId || '(no subject)', 100);
  return `Room #${record.brokerSequence} (${eventId.slice(0, 8)}) from ${ascii(e.senderHandle || 'unknown', 32)}: ${subject}. `
    + `Read it via readRoomSnapshot() and reply in Room with --reply-to ${eventId}. - Room dispatcher`;
}

function addHold(state, hold, now, opts) {
  const prev = state.holds[hold.key];
  if (prev && prev.status === 'open' && prev.reason === hold.reason) return false;
  state.holds[hold.key] = {
    status: 'open', recoverable: RECOVERABLE_HOLDS.has(hold.reason), firstHeldAt: prev?.firstHeldAt ?? now,
    expiresAt: prev?.expiresAt ?? now + opts.holdTtlMs, resolutionOwner: 'operations-room', detail: null, candidates: [],
    ...hold, updatedAt: now,
  };
  return true;
}

function resolveHold(state, key, how, now) {
  const h = state.holds[key];
  if (!h || h.status !== 'open') return false;
  h.status = how; h.updatedAt = now;
  return true;
}

function newDelivery(rec, seat, now) {
  return {
    ...createDelivery(String(rec.eventId), seat.instance, now),
    seq: rec.brokerSequence, seatId: seat.seatId, handle: seat.handle, pointer: buildPointer(rec),
    submittedAt: null, roomResponseAt: null, holdKey: null,
  };
}

/** A reply in Room from the exact target instance is the agent ACK / Room response. */
function applyRoomReply(state, rec, now) {
  const replyTo = rec?.event?.replyTo;
  const inst = senderInstanceOf(rec);
  if (!replyTo || !inst) return false;
  const d = state.deliveries[`${replyTo}::${inst}`];
  if (!d) return false;
  let changed = false;
  if (d.workAckAt == null) {
    if (d.transportAckAt == null) { d.transportAckAt = now; d.transportAckSource = 'room-reply'; }
    if (d.status !== 'dead_letter') d.status = 'transport_acknowledged';
    d.workAckAt = now; d.workAckSeq = rec.brokerSequence;
    if (d.holdKey) { resolveHold(state, d.holdKey, 'resolved-by-room-reply', now); d.holdKey = null; }
    changed = true;
  }
  const action = rec?.event?.metadata?.action;
  if (d.roomResponseAt == null && (RESPONSE_ACTIONS.has(action) || d.workAckSeq !== rec.brokerSequence)) {
    d.roomResponseAt = now; d.roomResponseSeq = rec.brokerSequence; changed = true;
  }
  return changed;
}

/** Plan one record into `state`. Returns { changed, entry } where entry is the audit line. */
export function planRecord(state, rec, table, now, opts = DEFAULT_OPTIONS) {
  const seq = rec.brokerSequence;
  const entry = { seq, eventId: rec.eventId || null, outcome: 'NOOP', reason: null, deliveries: [], holds: [], self: [] };
  const r = recipientsFor(rec);
  entry.reason = r.reason;
  if (!r.actionable) return { changed: false, entry };
  let changed = false;
  if (!rec.eventId) {
    changed = addHold(state, { key: `seq-${seq}::routing`, stage: 'routing', eventId: null, seq, reason: 'NO_EVENT_ID' }, now, opts) || changed;
    entry.outcome = 'HOLD'; entry.holds.push('NO_EVENT_ID');
    return { changed, entry };
  }
  const eventId = String(rec.eventId);
  const sender = senderInstanceOf(rec);
  if (r.reason === 'INVALID_ROUTING' || r.reason === 'BROADCAST_NOT_ROUTED') {
    changed = addHold(state, { key: `${eventId}::routing`, stage: 'routing', eventId, seq, reason: r.reason,
      detail: r.invalid.flatMap((i) => i.errors).join('; ').slice(0, 400) || null }, now, opts) || changed;
    entry.outcome = 'HOLD'; entry.holds.push(r.reason);
    return { changed, entry };
  }
  for (const target of r.targets) {
    const res = resolveTarget(target, table, sender);
    entry.self.push(...res.self);
    if (res.hold) {
      changed = addHold(state, { key: `${eventId}::${targetKey(target)}`, stage: 'routing', eventId, seq, handle: target.handle,
        target, senderInstance: sender, reason: res.hold.reason, candidates: res.hold.candidates }, now, opts) || changed;
      entry.holds.push(`${target.handle}:${res.hold.reason}`);
      continue;
    }
    for (const seat of res.seats) {
      const key = deliveryKey(eventId, seat.instance);
      if (state.deliveries[key]) { entry.deliveries.push(`${seat.seatId}:DUPLICATE`); continue; }
      state.deliveries[key] = newDelivery(rec, seat, now);
      entry.deliveries.push(seat.seatId);
      changed = true;
    }
  }
  entry.outcome = entry.deliveries.length ? (entry.holds.length ? 'PARTIAL' : 'PLANNED') : (entry.holds.length ? 'HOLD' : 'NOOP');
  if (entry.outcome === 'NOOP' && entry.self.length) entry.reason = 'SELF_ONLY';
  return { changed, entry };
}

/**
 * One poll. All I/O is injected so the suite never touches a pane or a real file.
 *
 * deps: { snapshot, seatTable, discover(), probe(seat, backend), wake(seat, backend, text),
 *         store: { load(), save(state) }, now(), deliver, log(line), options }
 *
 * Throws StateError when state cannot be read or written (fail closed).
 */
export async function pollOnce(deps) {
  const { snapshot, seatTable, discover, probe, wake, store, deliver = false, log = () => {} } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...(deps.options || {}) };
  const report = { mode: deliver ? 'deliver' : 'dry-run', status: 'OK', writes: 0, frozenSources: [], plan: [], attempts: [], holds: [], lastSeq: null };

  const tv = validateSeatTable(seatTable);
  if (!tv.ok) { report.status = 'SEAT_TABLE_INVALID'; report.errors = tv.errors; log(`SEAT TABLE INVALID: ${tv.errors.join('; ')}`); return report; }
  if (!snapshot || snapshot.state !== 'OK' || !snapshot.stable) {
    report.status = 'SNAPSHOT_UNUSABLE'; log(`snapshot not usable (state=${snapshot?.state} stable=${snapshot?.stable}); nothing consumed`); return report;
  }

  // Dry-run works on a private copy and never calls store.save.
  const state = structuredClone(store.load());
  const persist = () => { if (deliver) { store.save(state); report.writes++; } };
  const backends = new Map(seatTable.backends.map((b) => [b.key, b]));
  const seatByInstance = new Map(seatTable.seats.map((s) => [s.instance, s]));

  // A. Crash recovery: a submit whose outcome was never recorded is not re-sent.
  let dirty = false;
  for (const [key, d] of Object.entries(state.deliveries)) {
    if (d.status !== 'inflight') continue;
    addHold(state, { key: `${key}::binding`, stage: 'binding', eventId: d.eventId, seq: d.seq, handle: d.handle, deliveryKey: key,
      reason: 'SUBMIT_OUTCOME_UNKNOWN', detail: 'submitted before a restart; cleared only by the agent replying in Room or by an operator' }, now, opts);
    d.status = 'held'; d.holdKey = `${key}::binding`; dirty = true;
  }
  if (dirty) persist();

  // B. Discovery of every declared backend.
  const discovery = discover();
  const down = seatTable.backends.filter((b) => !discovery[b.key]?.ok);
  const downVerified = down.filter((b) => b.delivery === 'verified').map((b) => b.key);
  const downUnverified = down.filter((b) => b.delivery !== 'verified').map((b) => b.key);
  report.frozenSources = downVerified;
  report.unverifiedUnavailableSources = downUnverified;
  if (downUnverified.length) {
    report.status = 'PARTIAL';
    log(`UNVERIFIED SOURCE UNAVAILABLE ${downUnverified.join(',')}: affected recipients will be held; verified sources continue`);
  }
  const outageKey = downVerified.join(',');
  if (downVerified.length) {
    if (state.sourceOutage?.sources !== outageKey) {
      state.sourceOutage = { sources: outageKey, since: now, reasons: Object.fromEntries(downVerified.map((k) => [k, String(discovery[k]?.reason || 'no answer').slice(0, 200)])) };
      persist();
    }
    log(`SOURCE UNAVAILABLE ${outageKey}: checkpoint frozen`);
  } else if (state.sourceOutage) { state.sourceOutage = null; persist(); }

  // C. First run: seed at the tail. Legacy backlog is never replayed.
  const records = (snapshot.records || []).filter((r) => Number.isInteger(r.brokerSequence)).sort((a, b) => a.brokerSequence - b.brokerSequence);
  if (state.checkpoint.lastSeq == null) {
    state.checkpoint.lastSeq = snapshot.tailSequence; state.checkpoint.seededAt = new Date(now).toISOString();
    persist();
    report.status = 'SEEDED'; report.lastSeq = state.checkpoint.lastSeq;
    log(`SEEDED checkpoint at #${snapshot.tailSequence} (no replay)`);
    return report;
  }

  // D. Ingest new records while every delivery-verified source is available.
  // An unverified backend cannot deliver regardless of discovery; its targeted
  // deliveries become durable holds without freezing unrelated verified seats.
  if (!downVerified.length) {
    let pendingCheckpoint = false;
    for (const rec of records) {
      if (rec.brokerSequence <= state.checkpoint.lastSeq) continue;
      const acked = applyRoomReply(state, rec, now);
      const { changed, entry } = planRecord(state, rec, seatTable, now, opts);
      report.plan.push(entry);
      state.checkpoint.lastSeq = rec.brokerSequence;
      // Deliveries/holds and the checkpoint that covers them go out in ONE atomic write.
      if (changed || acked) { persist(); pendingCheckpoint = false; } else pendingCheckpoint = true;
      if (entry.outcome !== 'NOOP') log(`PLAN #${entry.seq} ${entry.outcome} deliveries=[${entry.deliveries}] holds=[${entry.holds}]`);
    }
    if (pendingCheckpoint) persist();
  } else report.status = 'FROZEN';

  // E. Holds: expire, or retry routing now that the seat table may have changed.
  for (const [key, h] of Object.entries(state.holds)) {
    if (h.status !== 'open') continue;
    if (now >= h.expiresAt) {
      h.status = 'expired'; h.updatedAt = now;
      const d = h.deliveryKey ? state.deliveries[h.deliveryKey] : null;
      if (d && d.status === 'held') { d.status = 'dead_letter'; d.lastError = `hold expired: ${h.reason}`; d.holdKey = null; }
      persist(); log(`HOLD EXPIRED ${key} (${h.reason})`);
      continue;
    }
    if (h.stage === 'routing' && h.recoverable && h.target) {
      const res = resolveTarget(h.target, seatTable, h.senderInstance || null);
      if (!res.hold && res.seats.length) {
        const rec = records.find((r) => r.eventId === h.eventId);
        if (!rec) continue; // record no longer in the snapshot window: stays held
        for (const seat of res.seats) {
          const dk = deliveryKey(h.eventId, seat.instance);
          if (!state.deliveries[dk]) state.deliveries[dk] = newDelivery(rec, seat, now);
        }
        resolveHold(state, key, 'resolved', now); persist(); log(`HOLD RESOLVED ${key}`);
      }
    }
  }

  // F. Attempts. Enrollment evidence and the live binding are both re-verified
  //    immediately before every submit.
  const recordBySeq = new Map(records.map((r) => [r.brokerSequence, r]));
  for (const [key, d] of Object.entries(state.deliveries)) {
    const heldBinding = d.status === 'held' && d.holdKey && state.holds[d.holdKey]?.status === 'open'
      && state.holds[d.holdKey].recoverable && state.holds[d.holdKey].reason !== 'SUBMIT_OUTCOME_UNKNOWN';
    if (!(heldBinding || canAttempt(d, now))) continue;

    const seat = seatByInstance.get(d.sessionId);
    const backend = seat ? backends.get(seat.backend) : undefined;
    const source = seat ? discovery[seat.backend] : undefined;
    // A never-wake seat is refused by the binding check before anything else.
    const enrolled = seat && !seat.neverWake ? verifySeatEnrollment(seat, recordBySeq, canonicalHandle) : { ok: true };
    const check = !seat ? { ok: false, reason: 'INSTANCE_NOT_IN_SEAT_TABLE', detail: d.sessionId }
      : !enrolled.ok ? enrolled
      : verifySeatBinding(seat, backend, source, backend && source?.ok && !seat.neverWake ? probe(seat, backend) : null);

    if (!check.ok) {
      const holdKey = `${key}::binding`;
      const isNew = addHold(state, { key: holdKey, stage: 'binding', eventId: d.eventId, seq: d.seq, handle: d.handle, deliveryKey: key,
        reason: check.reason, detail: check.detail }, now, opts);
      if (isNew || d.status !== 'held') { d.status = 'held'; d.holdKey = holdKey; persist(); log(`HOLD #${d.seq} ${d.seatId} ${check.reason}${check.detail ? ' (' + check.detail + ')' : ''}`); }
      report.holds.push({ key: holdKey, reason: check.reason });
      continue;
    }
    if (d.status === 'held') { resolveHold(state, d.holdKey, 'resolved', now); d.holdKey = null; d.status = 'pending'; d.nextAttemptAt = now; }

    if (!deliver) { report.attempts.push({ key, seatId: d.seatId, seq: d.seq, result: 'WOULD_SUBMIT', pane: `${seat.backend} ${seat.pane}` }); log(`DRY #${d.seq} would submit to ${d.seatId} (${seat.backend} ${seat.pane})`); continue; }

    // SUBMITTED is durable before the pane is touched.
    Object.assign(d, recordAttempt(d, now), { submittedAt: now });
    persist();
    let ok = false; let ambiguous = false; let failure = 'wake failed';
    try {
      const res = await wake(seat, backend, d.pointer);
      ok = res === true || res?.ok === true;
      if (!ok && res?.reason) failure = res.reason;
      ambiguous = !ok && res?.outcomeUnknown === true;
    } catch (e) { failure = e.message; ambiguous = true; }
    if (ok) { Object.assign(d, recordTransportAck(d, now)); log(`DELIVERED #${d.seq} ${d.seatId} (${seat.backend} ${seat.pane})`); }
    else if (ambiguous) {
      const holdKey = `${key}::binding`;
      addHold(state, { key: holdKey, stage: 'binding', eventId: d.eventId, seq: d.seq, handle: d.handle, deliveryKey: key,
        reason: 'SUBMIT_OUTCOME_UNKNOWN', detail: `${failure}; not retried because prompt acceptance is uncertain` }, now, opts);
      Object.assign(d, { status: 'held', holdKey, lastError: String(failure) });
      log(`SUBMIT OUTCOME UNKNOWN #${d.seq} ${d.seatId}: held; no retry`);
    }
    else { Object.assign(d, recordFailure(d, now, failure, opts)); log(`SUBMIT FAILED #${d.seq} ${d.seatId}: ${failure} -> ${d.status}`); }
    persist();
    report.attempts.push({ key, seatId: d.seatId, seq: d.seq, result: ok ? 'DELIVERED' : ambiguous ? 'SUBMIT_OUTCOME_UNKNOWN' : d.status === 'dead_letter' ? 'DEAD_LETTER' : 'RETRY_SCHEDULED' });
  }

  report.lastSeq = state.checkpoint.lastSeq;
  report.openHolds = Object.values(state.holds).filter((h) => h.status === 'open').length;
  return report;
}

// ---------------------------------------------------------------------------------
// Real runtime wiring (only reached from the CLI; the test suite injects everything).
// ---------------------------------------------------------------------------------

/** argv for one herdr call on a backend. No PATH lookup: backend.bin is explicit. */
export function herdrArgv(backend, rest) {
  return [...(backend.args || []), ...(backend.session ? ['--session', backend.session] : []), ...rest];
}

export function makeHerdrRuntime({ run = execFileSync, runAsync = execFile } = {}) {
  return {
    discoverAll(table) {
      const out = {};
      for (const b of table.backends) {
        try {
          const parsed = JSON.parse(run(b.bin, herdrArgv(b, ['agent', 'list']), { timeout: 15000, encoding: 'utf8', windowsHide: true }));
          const agents = parsed?.result?.agents;
          out[b.key] = Array.isArray(agents) ? { ok: true, agents, reason: null } : { ok: false, agents: [], reason: 'unexpected agent list shape' };
        } catch (e) { out[b.key] = { ok: false, agents: [], reason: String(e.stderr || e.message || e) }; }
      }
      return out;
    },
    probe(seat, backend) {
      try {
        const parsed = JSON.parse(run(backend.bin, herdrArgv(backend, ['pane', 'process-info', '--pane', seat.pane]), { timeout: 15000, encoding: 'utf8', windowsHide: true }));
        return parsed?.result?.process_info || null;
      } catch { return null; }
    },
    wake(seat, backend, text) {
      return new Promise((done) => {
        runAsync(backend.bin, herdrArgv(backend, ['agent', 'prompt', seat.pane, text]), { windowsHide: true, timeout: 20000 },
          (err) => {
            if (!err) return done({ ok: true });
            const outcomeUnknown = err.killed === true || Boolean(err.signal) || err.code === 'ETIMEDOUT';
            done({ ok: false, outcomeUnknown, reason: err.message || String(err) });
          });
      });
    },
  };
}

function argValue(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const DELIVER = process.argv.includes('--deliver');
  const ONCE = process.argv.includes('--once');
  const PRINT = process.argv.includes('--print') || !DELIVER;
  const fail = (msg) => { console.error(`room-dispatcher: ${msg}`); process.exit(2); };

  const seatTablePath = argValue('--seat-table');
  const stateDirArg = argValue('--state-dir');
  if (!seatTablePath) fail('--seat-table <file> is required');
  if (!stateDirArg) fail('--state-dir <dir> is required (explicit, isolated; never the live agent-comms tree)');
  let stateDir;
  try { stateDir = assertIsolatedStateDir(stateDirArg); } catch (e) { fail(e.message); }
  let seatTable;
  try { seatTable = JSON.parse(nodeFs.readFileSync(seatTablePath, 'utf8')); } catch (e) { fail(`cannot read seat table: ${e.message}`); }
  const tv = validateSeatTable(seatTable);
  if (!tv.ok) fail(`seat table invalid: ${tv.errors.join('; ')}`);
  // "env:NAME" keeps machine-specific binary paths out of the tracked table.
  for (const b of seatTable.backends) {
    if (b.bin.startsWith('env:')) {
      const v = process.env[b.bin.slice(4)];
      if (!v) fail(`backend ${b.key}: environment variable ${b.bin.slice(4)} is not set`);
      b.bin = v;
    }
  }

  const roomModule = argValue('--room-module') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'room.mjs');
  if (!nodeFs.existsSync(roomModule)) fail(`room module not found: ${roomModule} (pass --room-module)`);
  const { readRoomSnapshot } = await import(pathToFileURL(roomModule).href);

  const logFile = path.join(stateDir, 'room-dispatch.v2.log');
  const log = (line) => {
    const msg = `[${new Date().toISOString()}] ${line}`;
    if (DELIVER) nodeFs.appendFileSync(logFile, msg + '\n'); // dry-run writes no file at all
    if (PRINT) console.log(msg);
  };

  // Singleton lock, deliver mode only. Exclusive create; a stale lock is reported, never stolen.
  const lockFile = path.join(stateDir, 'room-dispatch.v2.lock');
  if (DELIVER) {
    nodeFs.mkdirSync(stateDir, { recursive: true });
    try { nodeFs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); }
    catch { fail(`lock ${lockFile} exists (pid ${(() => { try { return nodeFs.readFileSync(lockFile, 'utf8').trim(); } catch { return '?'; } })()}); confirm that process is gone and remove the lock deliberately`); }
    const release = () => { try { if (nodeFs.readFileSync(lockFile, 'utf8').trim() === String(process.pid)) nodeFs.unlinkSync(lockFile); } catch { /* already gone */ } };
    process.on('exit', release);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  }

  const rt = makeHerdrRuntime();
  const store = { load: () => loadState(stateDir), save: (s) => saveState(stateDir, s) };
  log(`room-dispatcher starting mode=${DELIVER ? 'DELIVER' : 'dry-run (pure)'} once=${ONCE} state=${path.join(stateDir, STATE_FILENAME)} backends=${seatTable.backends.map((b) => b.key).join(',')} pid=${process.pid}`);

  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      const report = await pollOnce({ snapshot: readRoomSnapshot(), seatTable, discover: () => rt.discoverAll(seatTable), probe: rt.probe, wake: rt.wake, store, deliver: DELIVER, log });
      if (ONCE || !DELIVER) console.log(JSON.stringify(report, null, 1));
    } catch (e) {
      // Fail closed: state could not be read or written. Stop instead of looping.
      log(`FATAL ${e.code || 'ERROR'}: ${e.message}; dispatcher stopping`);
      process.exit(3);
    } finally { running = false; }
  };
  await tick();
  if (ONCE || !DELIVER) process.exit(0); // a dry-run is always a single pure pass
  setInterval(tick, Number(process.env.COMMS_DISPATCH_POLL_MS || 2000));
}
