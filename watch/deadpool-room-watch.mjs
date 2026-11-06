#!/usr/bin/env node
// The single canonical, read-only Room observer. It authenticates every new
// broker record, advances only over complete lines, and never prompts agents.
import {
  appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, mkdirSync,
  openSync, readFileSync, readSync, renameSync, writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeEventId } from '../protocol/v1/envelope.mjs';
import { computeRecordHash } from '../protocol/v1/hashChain.mjs';
import { verifyCurrentEpoch, readCurrentEpoch, readEpochDiscontinuity } from '../protocol/v1/ledger-epoch.mjs';
import { evaluateEventRouting, isOutstandingAction } from '../protocol/v1/authorityPolicy.mjs';
import { resolveIdentity } from '../protocol/v1/identityProvider.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const COMMS_ROOT = join(__dir, '..');
export const DEFAULT_ROOM = join(COMMS_ROOT, 'room.jsonl');
const stamp = () => new Date().toISOString();

function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, file);
}

function readEndingRecord(roomPath, offset) {
  if (!Number.isSafeInteger(offset) || offset <= 0) throw new Error('cursor must point after a complete record');
  const fd = openSync(roomPath, 'r');
  try {
    const size = fstatSync(fd).size;
    if (offset > size) throw new Error(`cursor ${offset} is beyond Room size ${size}`);
    const start = Math.max(0, offset - 1024 * 1024);
    const bytes = Buffer.alloc(offset - start);
    readSync(fd, bytes, 0, bytes.length, start);
    if (bytes.length === 0 || bytes.at(-1) !== 0x0a) throw new Error('cursor is not on a complete line boundary');
    const end = bytes.length - 1;
    const priorNewline = bytes.lastIndexOf(0x0a, end - 1);
    if (priorNewline < 0 && start > 0) throw new Error('cannot safely locate the cursor record within 1 MiB');
    const raw = bytes.subarray(priorNewline + 1, end).toString('utf8');
    if (!raw.trim()) throw new Error('cursor points after an empty line');
    return JSON.parse(raw);
  } finally { closeSync(fd); }
}

export function validateBrokerRecord(record, previousHash = null, previousSequence = null, epoch = null) {
  if (!record || typeof record !== 'object' || !record.event || !Number.isSafeInteger(record.brokerSequence)) {
    throw new Error('record is missing event or brokerSequence');
  }
  if (!/^[0-9a-f]{64}$/.test(String(record.eventId || '')) || computeEventId(record.event) !== record.eventId) {
    throw new Error(`eventId verification failed at seq ${record.brokerSequence}`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(record.recordHash || '')) || computeRecordHash(record) !== record.recordHash) {
    throw new Error(`recordHash verification failed at seq ${record.brokerSequence}`);
  }
  if (previousHash && record.previousRecordHash !== previousHash) {
    throw new Error(`previousRecordHash chain break at seq ${record.brokerSequence}`);
  }
  if (previousSequence != null) {
    const discontinuity = readEpochDiscontinuity(epoch);
    if (discontinuity && record.brokerSequence >= discontinuity.firstNewOperationalSequence
        && record.ledgerEpochId !== epoch.epochId) {
      throw new Error(`ledgerEpochId mismatch at seq ${record.brokerSequence}`);
    }
    const isDeclaredFirstSuccessor = discontinuity
      && previousSequence === discontinuity.afterSequence
      && record.brokerSequence === discontinuity.firstNewOperationalSequence
      && previousHash === discontinuity.checkpoint.recordHash;
    const inReservedRange = discontinuity
      && record.brokerSequence > discontinuity.afterSequence
      && record.brokerSequence <= discontinuity.reservedThroughSequence;
    if (inReservedRange) {
      throw new Error(`brokerSequence ${record.brokerSequence} occupies reserved unresolved range`);
    }
    if (!isDeclaredFirstSuccessor && record.brokerSequence !== previousSequence + 1) {
      throw new Error(`brokerSequence discontinuity at seq ${record.brokerSequence}`);
    }
  }
  const expected = evaluateEventRouting(
    record.event.senderHandle,
    String(record.event.body ?? ''),
    Array.isArray(record.event.mentions) ? record.event.mentions : [],
  );
  if (record.authorityDecision?.allowed !== true
      || record.evaluatedDeliveryType !== expected.deliveryType
      || record.authorityDecision?.reason !== expected.authorityReason
      || record.authorityDecision?.senderAuthorityLevel !== expected.senderAuthorityLevel
      || JSON.stringify(record.evaluatedAudience) !== JSON.stringify(expected.targetAudience)) {
    throw new Error(`broker authority/routing verification failed at seq ${record.brokerSequence}`);
  }
  return record;
}

export function isActionRequiredFor(record, target) {
  const identity = resolveIdentity(target);
  const canonical = identity?.canonicalHandle;
  const sender = resolveIdentity(record.event?.senderHandle || record.sender)?.canonicalHandle;
  return Boolean(identity && identity.status === 'active' && canonical === target
    && sender !== canonical
    && record.authorityDecision?.allowed === true
    && isOutstandingAction(record, canonical));
}

export function loadCursor(roomPath, statePath, epochId, verifyLedger = verifyCurrentEpoch,
  epochAnchorSequence = readCurrentEpoch()?.anchor?.brokerSequence) {
  if (!existsSync(statePath)) throw new Error('cursor state is missing; refusing an implicit EOF start');
  const fd = openSync(roomPath, 'r');
  let roomSize;
  try { roomSize = fstatSync(fd).size; } finally { closeSync(fd); }
  const raw = readFileSync(statePath, 'utf8').trim();
  const legacyOffset = /^\d+$/.test(raw) ? Number(raw) : null;
  let cursor;
  if (legacyOffset != null) {
    const audit = verifyLedger();
    if (!audit.ok) throw new Error(`current Room epoch verification failed (${audit.failureCount ?? 'unknown'} failures)`);
    const prior = validateBrokerRecord(readEndingRecord(roomPath, legacyOffset));
    cursor = { schemaVersion: 1, offset: legacyOffset, epochId, lastSequence: prior.brokerSequence,
      lastEventId: prior.eventId, lastRecordHash: prior.recordHash };
  } else {
    cursor = JSON.parse(raw);
    if (cursor.schemaVersion !== 1 || cursor.epochId !== epochId
        || !Number.isSafeInteger(cursor.offset) || cursor.offset <= 0
        || !Number.isSafeInteger(cursor.lastSequence)
        || !/^[0-9a-f]{64}$/.test(String(cursor.lastRecordHash || ''))) {
      throw new Error('cursor state is malformed or belongs to another epoch');
    }
    const prior = validateBrokerRecord(readEndingRecord(roomPath, cursor.offset));
    if (prior.brokerSequence !== cursor.lastSequence || prior.eventId !== cursor.lastEventId
        || prior.recordHash !== cursor.lastRecordHash) throw new Error('cursor anchor does not match the Room record');
  }
  if (cursor.offset > roomSize) throw new Error(`cursor ${cursor.offset} is beyond Room size ${roomSize}`);
  if (Number.isSafeInteger(epochAnchorSequence) && cursor.lastSequence < epochAnchorSequence) {
    throw new Error('cursor points before the current ledger epoch anchor');
  }
  return cursor;
}

export function seedCheckpointCursor({
  roomPath, statePath, epoch = readCurrentEpoch(), verifyLedger = verifyCurrentEpoch, replaceExisting = false,
} = {}) {
  if (!roomPath || !statePath) throw new Error('roomPath and statePath are required');
  if (extname(statePath) !== '.offset') throw new Error('cursor statePath must use the .offset suffix');
  const destination = resolve(statePath);
  const room = resolve(roomPath);
  if (destination === room || destination.toLowerCase() === room.toLowerCase()) {
    throw new Error('refusing to overwrite roomPath');
  }
  const discontinuity = readEpochDiscontinuity(epoch);
  if (!discontinuity) throw new Error('no declared epoch discontinuity');
  if (existsSync(statePath) && replaceExisting !== true) {
    throw new Error('cursor state already exists; refusing overwrite without replaceExisting');
  }
  const audit = verifyLedger({ epoch, roomPath });
  if (!audit.ok) throw new Error(`current Room epoch verification failed (${audit.failureCount ?? 'unknown'} failures)`);
  const fd = openSync(roomPath, 'r');
  let roomSize;
  try { roomSize = fstatSync(fd).size; } finally { closeSync(fd); }
  const prior = validateBrokerRecord(readEndingRecord(roomPath, roomSize));
  const checkpoint = discontinuity.checkpoint;
  if (prior.brokerSequence !== checkpoint.brokerSequence || prior.eventId !== checkpoint.eventId
      || prior.recordHash !== checkpoint.recordHash) {
    throw new Error('room EOF is not the declared predecessor checkpoint');
  }
  const cursor = { schemaVersion: 1, offset: roomSize, epochId: epoch.epochId,
    lastSequence: checkpoint.brokerSequence, lastEventId: checkpoint.eventId,
    lastRecordHash: checkpoint.recordHash };
  mkdirSync(dirname(statePath), { recursive: true });
  atomicJson(statePath, cursor);
  return cursor;
}

export function createWatcher({ roomPath = DEFAULT_ROOM, statePath, logPath, agent = 'deadpool',
  pollMs = 2000, verifyLedger = verifyCurrentEpoch, epoch = readCurrentEpoch(), onLog = null } = {}) {
  if (!epoch?.epochId) throw new Error('no current ledger epoch is configured');
  if (!existsSync(roomPath)) throw new Error(`Room not found: ${roomPath}`);
  const logsDir = dirname(statePath || join(__dir, 'logs', `${agent}-room-watch.offset`));
  mkdirSync(logsDir, { recursive: true });
  statePath ||= join(logsDir, `${agent}-room-watch.offset`);
  logPath ||= join(logsDir, `${agent}-room-watch.jsonl`);
  const emit = (entry) => {
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(logPath, line, 'utf8'); // one sink; launcher redirection cannot duplicate entries
    onLog?.(entry);
  };
  const audit = verifyLedger();
  if (!audit.ok) throw new Error(`current Room epoch verification failed (${audit.failureCount ?? 'unknown'} failures)`);
  let cursor = loadCursor(roomPath, statePath, epoch.epochId, () => ({ ok: true }), epoch.anchor?.brokerSequence ?? null);
  atomicJson(statePath, cursor); // migrate the legacy numeric cursor only after validation
  const sourceFd = openSync(roomPath, 'r');
  const sourceIdentity = fstatSync(sourceFd);
  closeSync(sourceFd);
  let carry = Buffer.alloc(0);
  let halted = false;
  emit({ kind: 'resume', agent, offset: cursor.offset, sequence: cursor.lastSequence, at: stamp() });

  const pump = () => {
    if (halted) return;
    const fd = openSync(roomPath, 'r');
    try {
      const size = fstatSync(fd).size;
      const currentIdentity = fstatSync(fd);
      if (currentIdentity.dev !== sourceIdentity.dev || currentIdentity.ino !== sourceIdentity.ino) {
        throw new Error('Room source identity changed; refusing to reset or replay the cursor');
      }
      if (size < cursor.offset + carry.length) throw new Error(`Room shrank below read position (${size})`);
      const readPosition = cursor.offset + carry.length;
      if (size <= readPosition) return;
      const amount = Math.min(size - readPosition, 1 << 16);
      const chunk = Buffer.alloc(amount);
      const n = readSync(fd, chunk, 0, amount, readPosition);
      carry = Buffer.concat([carry, chunk.subarray(0, n)]);
    } finally { closeSync(fd); }

    while (true) {
      const newline = carry.indexOf(0x0a);
      if (newline < 0) break;
      const raw = carry.subarray(0, newline);
      if (!raw.length) throw new Error('unexpected empty line in current Room stream');
      const record = JSON.parse(raw.toString('utf8'));
      validateBrokerRecord(record, cursor.lastRecordHash, cursor.lastSequence, epoch);
      cursor = { schemaVersion: 1, offset: cursor.offset + newline + 1, epochId: epoch.epochId,
        lastSequence: record.brokerSequence, lastEventId: record.eventId, lastRecordHash: record.recordHash };
      carry = carry.subarray(newline + 1);
      atomicJson(statePath, cursor); // commit only verified, newline-terminated records
      emit({ kind: 'event', seq: record.brokerSequence, eventId: record.eventId,
        delivery: record.evaluatedDeliveryType, authority: record.authorityDecision.reason,
        target: isActionRequiredFor(record, agent) ? agent : null, at: record.receivedAt });
      if (isActionRequiredFor(record, agent)) {
        emit({ kind: 'action_required_candidate', seq: record.brokerSequence, eventId: record.eventId,
          target: agent, authority: record.authorityDecision.reason, at: stamp() });
      }
    }
  };
  const timer = setInterval(() => {
    try { pump(); } catch (error) { halted = true; clearInterval(timer); emit({ kind: 'halt', error: String(error), at: stamp() }); }
  }, pollMs);
  pump();
  emit({ kind: 'start', agent, room: roomPath, offset: cursor.offset, pollMs, pid: process.pid, at: stamp() });
  const stop = () => { clearInterval(timer); if (!halted) emit({ kind: 'stop', offset: cursor.offset, at: stamp() }); };
  return { pump, stop, get cursor() { return { ...cursor }; }, get halted() { return halted; } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const getArg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const agent = getArg('--agent', 'deadpool');
  const roomPath = process.env.COMMS_ROOM_PATH
    ? (process.env.COMMS_ROOM_PATH.startsWith('/') ? process.env.COMMS_ROOM_PATH : join(COMMS_ROOT, process.env.COMMS_ROOM_PATH))
    : DEFAULT_ROOM;
  const logs = join(__dir, 'logs');
  const watcher = createWatcher({ roomPath, agent, pollMs: Number(getArg('--poll-ms', '2000')),
    statePath: join(logs, `${agent}-room-watch.offset`), logPath: join(logs, `${agent}-room-watch.jsonl`) });
  process.on('SIGINT', () => { watcher.stop(); process.exit(0); });
  process.on('SIGTERM', () => { watcher.stop(); process.exit(0); });
}
