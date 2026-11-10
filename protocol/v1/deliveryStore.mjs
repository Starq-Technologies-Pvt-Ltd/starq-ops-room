// Durable dispatcher state (COMMS-ROUTING-20261110 phase 1).
//
// One versioned file holds the checkpoint, every delivery record and every
// HOLD. It is written atomically (temp file, fsync, rename) and EVERY write
// error is thrown to the caller: the dispatcher must stop rather than continue
// with state it could not persist. A corrupt file is an error, never a silent
// re-seed.
//
// The state directory must be chosen explicitly and must be isolated: the
// legacy production location (agent-comms/state, file room-dispatch.json) is
// refused so a candidate run can never overwrite or re-seed the preserved
// production checkpoint.
//
// Delivery records use the PR #4 reference contract (protocol/v2/deliveryLedger.mjs)
// and its state names, extended with the fields this runtime needs:
//
//   ledger status           meaning here
//   pending                 planned, persisted, not yet submitted (or waiting for backoff)
//   inflight                SUBMITTED: intent persisted, herdr call outcome not yet recorded
//   transport_acknowledged  DELIVERED: herdr accepted the prompt for the verified pane
//   dead_letter             attempts or hold lifetime exhausted
//   held                    (extension) parked behind a HOLD; see state.holds
//   workAckAt               AGENT-ACK: the target instance replied in Room to the event
//   roomResponseAt          ROOM-RESPONSE: the target instance posted a result/blocker reply

import nodeFs from 'node:fs';
import path from 'node:path';

export const STATE_SCHEMA = 'starq.dispatch-state/2';
export const STATE_FILENAME = 'room-dispatch.v2.json';
const LEGACY_FILENAME = 'room-dispatch.json';

export class StateError extends Error {
  constructor(code, message) { super(message); this.name = 'StateError'; this.code = code; }
}

/** Throw unless `dir` is an explicit, isolated state directory. */
export function assertIsolatedStateDir(dir, fs = nodeFs) {
  if (typeof dir !== 'string' || !dir.trim()) throw new StateError('STATE_DIR_REQUIRED', 'an explicit state directory is required');
  const abs = path.resolve(dir);
  const segments = abs.replace(/\\/g, '/').toLowerCase().split('/');
  if (segments.includes('agent-comms')) throw new StateError('STATE_DIR_IS_PRODUCTION', `refusing state directory inside the live runtime: ${abs}`);
  if (fs.existsSync(path.join(abs, LEGACY_FILENAME))) throw new StateError('STATE_DIR_HAS_LEGACY_CHECKPOINT', `refusing state directory that contains a legacy ${LEGACY_FILENAME}: ${abs}`);
  return abs;
}

export function emptyState(now = Date.now()) {
  return { schema: STATE_SCHEMA, createdAt: new Date(now).toISOString(), checkpoint: { lastSeq: null, seededAt: null }, deliveries: {}, holds: {}, sourceOutage: null };
}

/** Load state. Missing file -> fresh empty state. Unreadable/corrupt/wrong schema -> throws. */
export function loadState(dir, fs = nodeFs, now = Date.now()) {
  const file = path.join(dir, STATE_FILENAME);
  if (!fs.existsSync(file)) return emptyState(now);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new StateError('STATE_UNREADABLE', `dispatch state is unreadable or corrupt (${e.message}); refusing to re-seed`); }
  if (!parsed || parsed.schema !== STATE_SCHEMA || typeof parsed.checkpoint !== 'object' || parsed.checkpoint === null
    || typeof parsed.deliveries !== 'object' || typeof parsed.holds !== 'object') {
    throw new StateError('STATE_SCHEMA_MISMATCH', `dispatch state does not match ${STATE_SCHEMA}; refusing to continue`);
  }
  return parsed;
}

/** Atomically persist state. Throws StateError on any failure. */
export function saveState(dir, state, fs = nodeFs) {
  const file = path.join(dir, STATE_FILENAME);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify(state, null, 1)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw new StateError('STATE_WRITE_FAILED', `dispatch state write failed: ${e.message}`);
  }
}
