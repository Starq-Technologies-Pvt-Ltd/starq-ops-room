import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readRoomSnapshot, ROOM_PATH, COMMS_ROOT } from './room.mjs';
import { getLeaseStatus } from '../protocol/v1/identityLease.mjs';
import { isNoneActionRequired } from '../protocol/v1/authorityPolicy.mjs';

const agent = 'codex';
const ALIASES = ['codex', '@codex'];
const HERDR_BIN = process.env.HERDR_BIN_PATH
  || 'C:\\Users\\Ali Musthaq\\.herdr\\packages\\standalone\\releases\\0.9.5-x86_64-pc-windows-msvc\\herdr.exe';
const STARQ_ROOT = path.resolve(COMMS_ROOT, '..');
const pollMs = 2000;
const lockPath = path.join(COMMS_ROOT, 'locks', 'room-watch-codex.lock');
const logPath = path.join(COMMS_ROOT, 'logs', 'room-watch-codex.log');
const offsetPath = path.join(COMMS_ROOT, 'watch', 'logs', 'codex-room-watch.offset');

export function parseSeedSeq(argv = process.argv) {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seed-seq' && argv[i + 1]) {
      const val = Number(argv[i + 1]);
      if (Number.isSafeInteger(val) && val >= 0) return val;
    }
    if (argv[i].startsWith('--seed-seq=')) {
      const val = Number(argv[i].split('=')[1]);
      if (Number.isSafeInteger(val) && val >= 0) return val;
    }
  }
  return null;
}

export function commitOffset(file, seq, hash, eventId, recentEntries = [], pendingDelivery = null, backlogReconciliation = null) {
  const tmp = file + '.tmp';
  const data = {
    schemaVersion: 3,
    lastSequence: seq,
    lastEventId: eventId,
    lastRecordHash: hash,
    recentEntries: recentEntries.slice(-100),
    pendingDelivery,
    backlogReconciliation,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function fetchSnapshotRecords({ roomPath = ROOM_PATH, readSnapshotFn = readRoomSnapshot, logPath } = {}) {
  const snap = readSnapshotFn({ roomPath });
  if (!snap || typeof snap !== 'object') {
    const err = `Room snapshot returned non-object`;
    if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} WATCH_ERROR ${err}\n`);
    throw new Error(`WATCH_ERROR snapshot unavailable: ${err}`);
  }
  if (!snap.stable || snap.state !== 'OK') {
    const reason = snap.reason || `state=${snap.state}`;
    const err = `Room snapshot unavailable or unstable: ${reason} (state=${snap.state}, parseStatus=${snap.parseStatus})`;
    if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} WATCH_ERROR ${err}\n`);
    throw new Error(`WATCH_ERROR snapshot ${snap.state || 'UNAVAILABLE'}: ${reason}`);
  }
  const records = (snap.records || []).map(r => {
    if (r.event && r.brokerSequence !== undefined) {
      return {
        brokerSequence: r.brokerSequence,
        id: r.eventId || r.event.eventId,
        eventId: r.eventId || r.event.eventId,
        previousRecordHash: r.previousRecordHash,
        recordHash: r.recordHash,
        sender: r.event.senderHandle || r.event.sender,
        targetAudience: r.evaluatedAudience || r.event.targetAudience,
        mentions: r.event.mentions || [],
        replyTo: r.event.replyTo || r.event.metadata?.replyTo || null,
        references: r.event.references || r.event.metadata?.references || [],
        taskId: r.event.taskId || r.event.metadata?.taskId || null,
        deliveryType: r.evaluatedDeliveryType || r.event.deliveryType || 'MSG',
        body: r.event.body,
        timestamp: r.event.createdAt || r.receivedAt,
        metadata: r.event.metadata || {}
      };
    }
    return r;
  });
  return { records, snapshot: snap };
}

export function initializeWatcherState({ offsetPath, rows, seedSeq, logPath }) {
  let lastSeq = null;
  let lastHash = null;
  let lastEventId = null;
  let durableRecent = [];
  let pendingDelivery = null;
  let backlogReconciliation = null;

  if (fs.existsSync(offsetPath)) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(offsetPath, 'utf8'));
    } catch (err) {
      const errText = `WATCH_REFUSED corrupt offset file at ${offsetPath}: ${err.message}`;
      if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
      throw new Error(errText);
    }

    if (!Number.isSafeInteger(raw.lastSequence) || raw.lastSequence < 0) {
      const errText = `WATCH_REFUSED invalid lastSequence in ${offsetPath}: ${raw.lastSequence}`;
      if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
      throw new Error(errText);
    }

    if (raw.lastSequence === 0) {
      lastSeq = 0;
      lastHash = 'genesis';
      lastEventId = 'genesis';
    } else {
      if (!raw.lastRecordHash || typeof raw.lastRecordHash !== 'string' || raw.lastRecordHash.trim() === '') {
        const errText = `WATCH_REFUSED offset file at ${offsetPath} missing non-empty lastRecordHash`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      if (!raw.lastEventId || typeof raw.lastEventId !== 'string' || raw.lastEventId.trim() === '') {
        const errText = `WATCH_REFUSED offset file at ${offsetPath} missing non-empty lastEventId`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      const match = rows.find(r => r.brokerSequence === raw.lastSequence);
      if (!match) {
        const errText = `WATCH_REFUSED offset sequence ${raw.lastSequence} not found in Room snapshot (out-of-range)`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      const snapHash = match.recordHash;
      const snapEventId = match.id || match.eventId;
      if (!snapHash || typeof snapHash !== 'string' || snapHash.trim() === '') {
        const errText = `WATCH_REFUSED Room snapshot record ${raw.lastSequence} missing canonical recordHash`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      if (!snapEventId || typeof snapEventId !== 'string' || snapEventId.trim() === '') {
        const errText = `WATCH_REFUSED Room snapshot record ${raw.lastSequence} missing canonical eventId`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      if (raw.lastRecordHash !== snapHash) {
        const errText = `WATCH_REFUSED offset hash mismatch for seq ${raw.lastSequence}: offset=${raw.lastRecordHash} room=${snapHash} (tampered)`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      if (raw.lastEventId !== snapEventId) {
        const errText = `WATCH_REFUSED offset eventId mismatch for seq ${raw.lastSequence}: offset=${raw.lastEventId} room=${snapEventId} (tampered)`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
      lastSeq = match.brokerSequence;
      lastHash = snapHash;
      lastEventId = snapEventId;
    }

    if (Array.isArray(raw.recentEntries)) {
      durableRecent = raw.recentEntries;
    }
    if (raw.pendingDelivery && typeof raw.pendingDelivery === 'object') {
      pendingDelivery = raw.pendingDelivery;
    }
    if (raw.backlogReconciliation && typeof raw.backlogReconciliation === 'object') {
      backlogReconciliation = raw.backlogReconciliation;
    }
    if (pendingDelivery) {
      const pendingRow = rows.find(r => r.brokerSequence === pendingDelivery.seq);
      const pendingId = pendingRow?.id || pendingRow?.eventId;
      if (!pendingRow || pendingDelivery.seq <= lastSeq
        || pendingId !== pendingDelivery.eventId
        || pendingRow.recordHash !== pendingDelivery.recordHash) {
        const errText = `WATCH_REFUSED pending delivery does not match the canonical Room record at seq ${pendingDelivery.seq}`;
        if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
        throw new Error(errText);
      }
    }
  }

  if (lastSeq === null) {
    if (Number.isSafeInteger(seedSeq) && seedSeq >= 0) {
      if (seedSeq === 0) {
        lastSeq = 0;
        lastHash = 'genesis';
        lastEventId = 'genesis';
      } else {
        const match = rows.find(r => r.brokerSequence === seedSeq);
        if (!match) {
          const errText = `WATCH_REFUSED seed-seq ${seedSeq} not found in Room snapshot (out-of-range)`;
          if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
          throw new Error(errText);
        }
        const snapHash = match.recordHash;
        const snapEventId = match.id || match.eventId;
        if (!snapHash || typeof snapHash !== 'string' || snapHash.trim() === '') {
          const errText = `WATCH_REFUSED seed record ${seedSeq} in Room snapshot missing canonical recordHash`;
          if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
          throw new Error(errText);
        }
        if (!snapEventId || typeof snapEventId !== 'string' || snapEventId.trim() === '') {
          const errText = `WATCH_REFUSED seed record ${seedSeq} in Room snapshot missing canonical eventId`;
          if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
          throw new Error(errText);
        }
        lastSeq = match.brokerSequence;
        lastHash = snapHash;
        lastEventId = snapEventId;
      }
      const seedMsg = `${new Date().toISOString()} WATCH_INIT_SEED seed-seq=${lastSeq} hash=${lastHash} event=${lastEventId}\n`;
      if (logPath) fs.appendFileSync(logPath, seedMsg);
    } else {
      const errText = `WATCH_REFUSED missing or invalid offset at ${offsetPath} and no valid --seed-seq provided (fail-closed per #10704/#10714/#10725/#10733)`;
      if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${errText}\n`);
      throw new Error(errText);
    }
  }

  return { lastSeq, lastHash, lastEventId, durableRecent, pendingDelivery, backlogReconciliation };
}

export function isForCodex(record) {
  return isTargeted(record, agent, ALIASES);
}

export function isDirectlyForCodex(record) {
  const sender = String(record.sender || '').replace(/^@/, '').toLowerCase();
  if (sender === agent) return false;
  const audienceValues = Array.isArray(record.targetAudience)
    ? record.targetAudience
    : [record.targetAudience ?? record.evaluatedAudience];
  const audience = audienceValues.map(v => String(v || '').replace(/^@/, '').toLowerCase());
  const mentions = Array.isArray(record.mentions)
    ? record.mentions.map(v => String(v || '').replace(/^@/, '').toLowerCase())
    : [];
  const directMetadata = ALIASES.some(alias => {
    const clean = alias.replace(/^@/, '').toLowerCase();
    return audience.includes(clean) || mentions.includes(clean);
  });
  const bodyMention = /(^|[^a-z0-9_])@codex\b/i.test(String(record.body || ''));
  return directMetadata || bodyMention;
}

export function isTargeted(record, agentHandle, aliases) {
  const sender = String(record.sender || '').replace(/^@/, '');
  if (sender === agentHandle) return false;

  const audience = Array.isArray(record.targetAudience)
    ? record.targetAudience.map(a => String(a).replace(/^@/, ''))
    : [String(record.targetAudience || '').replace(/^@/, '')];
  const mentions = Array.isArray(record.mentions)
    ? record.mentions.map(m => String(m).replace(/^@/, ''))
    : [];

  const isAll = record.targetAudience === 'ALL'
    || record.evaluatedAudience === 'ALL'
    || mentions.includes('all');

  return isAll || aliases.some(a => {
    const clean = a.replace(/^@/, '');
    return audience.includes(clean) || mentions.includes(clean);
  });
}

export function isExplicitNoAction(record) {
  const actionRequired = record.metadata?.actionRequired ?? null;
  if (isNoneActionRequired(actionRequired)) return true;
  const body = String(record.body || '');
  return /Action\s+Required\s*:\s*NONE/i.test(body)
    || /no agent should reply,?\s*ACK,?\s*reason,?\s*or execute/i.test(body);
}

export function requiresOperatorNotification(record) {
  if (record.deliveryType !== 'ACTION_REQUIRED' || isExplicitNoAction(record)) return false;
  const actionRequired = record.metadata?.actionRequired ?? null;
  if (isNoneActionRequired(actionRequired)) return false;
  const hasTask = Boolean(record.taskId || record.metadata?.taskId || record.metadata?.task);
  return (actionRequired != null && !isNoneActionRequired(actionRequired)) || (hasTask && actionRequired == null);
}

export function shouldNotifyCodex(record) {
  if (!isDirectlyForCodex(record) || isExplicitNoAction(record)) return false;
  const deliveryType = String(record.deliveryType || '').toUpperCase();
  if (deliveryType === 'CC_CONTEXT') return false;
  const sender = String(record.sender || '').replace(/^@/, '').toLowerCase();
  const actionRequired = String(record.metadata?.actionRequired || '').trim().toUpperCase();
  if (actionRequired === 'NONE') return false;
  if (sender === 'mustarq') return true;
  return deliveryType === 'ACTION_REQUIRED' && requiresOperatorNotification(record);
}

// Resolve the current pane from Herdr's live Codex session. Pane IDs are temporary;
// the canonical agent/session binding and workspace are the durable selectors.
export function resolveCodexPane({ spawnSyncFn = spawnSync, getLeaseStatusFn = getLeaseStatus } = {}) {
  const listedSessions = spawnSyncFn(HERDR_BIN, ['session', 'list', '--json'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
  if (listedSessions?.error) return { ok: false, error: listedSessions.error.message || String(listedSessions.error) };
  if (listedSessions?.status !== 0) return { ok: false, error: `session list exit ${listedSessions?.status}: ${listedSessions?.stderr?.trim() || listedSessions?.stdout?.trim() || 'failed'}` };
  let sessions;
  try { sessions = JSON.parse(listedSessions.stdout || '{}')?.sessions; }
  catch (err) { return { ok: false, error: `session list returned invalid JSON: ${err.message}` }; }
  if (!Array.isArray(sessions)) return { ok: false, error: 'session list omitted the sessions array' };
  const running = sessions.filter(s => s?.running === true && typeof s.name === 'string');
  const codex = [];
  const sessionErrors = [];
  for (const session of running) {
    const listed = spawnSyncFn(HERDR_BIN, ['--session', session.name, 'agent', 'list'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
    if (listed?.error || listed?.status !== 0) {
      sessionErrors.push(`${session.name}: ${listed?.error?.message || listed?.stderr?.trim() || `exit ${listed?.status}`}`);
      continue;
    }
    let agents;
    try { agents = JSON.parse(listed.stdout || '{}')?.result?.agents; }
    catch (err) { sessionErrors.push(`${session.name}: invalid agent list JSON (${err.message})`); continue; }
    if (!Array.isArray(agents)) { sessionErrors.push(`${session.name}: agent list omitted the agents array`); continue; }
    for (const agent of agents) {
      if (agent?.agent === 'codex' && agent?.agent_session?.source === 'herdr:codex' && agent?.pane_id) {
        codex.push({ ...agent, sessionName: session.name });
      }
    }
  }
  let leaseStatus;
  try { leaseStatus = getLeaseStatusFn('codex'); }
  catch (err) { return { ok: false, error: `Codex identity lease unavailable: ${err.message || String(err)}` }; }
  // A stale Room-write lease can still identify a live Herdr session. Use the
  // recorded instance only when Herdr exposes exactly one matching pane; this
  // binds notifications without treating a stale lease as write authority.
  if (typeof leaseStatus?.lease?.instanceId === 'string') {
    const leaseInstanceId = leaseStatus.lease.instanceId;
    const expectedSessionId = leaseInstanceId.startsWith('herdr-codex-')
      ? leaseInstanceId.slice('herdr-codex-'.length)
      : null;
    const leased = codex.filter(a => a.agent_session?.value === leaseInstanceId
      || (expectedSessionId && a.agent_session?.value === expectedSessionId));
    if (leased.length !== 1) {
      return { ok: false, error: `active Codex lease ${leaseInstanceId} matched ${leased.length} live Herdr Codex sessions; expected exactly one` };
    }
    return { ok: true, paneId: leased[0].pane_id, sessionName: leased[0].sessionName, agentStatus: leased[0].agent_status || 'unknown', agentSessionId: leased[0].agent_session?.value || null };
  }

  const rooted = codex.filter(a => {
    try { return path.resolve(a.cwd || '').toLowerCase() === STARQ_ROOT.toLowerCase(); } catch { return false; }
  });
  const candidates = rooted.length === 1 ? rooted : codex.length === 1 ? codex : [];
  if (candidates.length !== 1) {
    const suffix = sessionErrors.length ? `; session errors: ${sessionErrors.join(' | ')}` : '';
    return { ok: false, error: `expected one live canonical Codex session across ${running.length} running Herdr sessions, found ${codex.length} (${rooted.length} in ${STARQ_ROOT})${suffix}` };
  }
  return { ok: true, paneId: candidates[0].pane_id, sessionName: candidates[0].sessionName, agentStatus: candidates[0].agent_status || 'unknown', agentSessionId: candidates[0].agent_session?.value || null };
}

// A targeted Room post gets only a one-line pointer to the current Codex pane;
// it never forwards Room content.
export function notifyHerdr(record, { spawnSyncFn = spawnSync, getLeaseStatusFn = getLeaseStatus, paneId = null } = {}) {
  try {
    const resolved = resolveCodexPane({ spawnSyncFn, getLeaseStatusFn });
    if (!resolved.ok) return resolved;
    if (!['idle', 'done'].includes(String(resolved.agentStatus || '').toLowerCase())) {
      return { ok: false, deferred: true, status: `deferred-${resolved.agentStatus || 'unknown'}`, error: `Codex Herdr seat is ${resolved.agentStatus || 'unknown'}; notification remains queued at its Room sequence` };
    }
    paneId ??= resolved.paneId;
    const sessionArgs = ['--session', resolved.sessionName];
    const pointer = spawnSyncFn(HERDR_BIN, [
      ...sessionArgs, 'agent', 'prompt', paneId,
      `Please check Room #${record.brokerSequence} and reply there.`,
      '--wait', '--timeout', '120000'
    ], { timeout: 125000, encoding: 'utf8', windowsHide: true });
    if (pointer?.error) return { ok: false, error: pointer.error.message || String(pointer.error) };
    if (pointer?.status !== 0) return { ok: false, error: `pane pointer exit ${pointer?.status}: ${pointer?.stderr?.trim() || pointer?.stdout?.trim() || 'failed'}` };

    if (!requiresOperatorNotification(record)) return { ok: true, status: 'pane-pointer-delivered' };
    const summary = `STARQ Room #${record.brokerSequence}: action required`;
    const bodyText = `@${record.sender} · ${String(record.metadata?.subject || record.taskId || 'Room action required')}`;
    const notification = spawnSyncFn(HERDR_BIN, [
      ...sessionArgs, 'notification', 'show', summary,
      '--body', bodyText,
      '--position', 'top-right',
      '--sound', 'request'
    ], { timeout: 3000, encoding: 'utf8', windowsHide: true });
    if (notification?.error) return { ok: false, error: notification.error.message || String(notification.error) };
    if (notification?.status !== 0) return { ok: false, error: `notification exit ${notification?.status}: ${notification?.stderr?.trim() || notification?.stdout?.trim() || 'failed'}` };
    return { ok: true, status: 'pane-pointer-and-operator-notification-delivered' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export function processRecords(records, state, options) {
  const {
    agent,
    paneId,
    aliases,
    offsetPath,
    logPath,
    spawnSyncFn = spawnSync
  } = options;

  for (const record of records) {
    if (!Number.isSafeInteger(record.brokerSequence) || record.brokerSequence <= state.lastSeq) {
      continue;
    }

    // 1. Strict continuity validation for every non-genesis continuation (Finding 1)
    if (state.lastHash && state.lastHash !== 'genesis') {
      if (!record.previousRecordHash || typeof record.previousRecordHash !== 'string' || record.previousRecordHash.trim() === '') {
        const err = `CONTINUITY_BREAK seq=${record.brokerSequence} missing previousRecordHash (expected ${state.lastHash})`;
        const errMsg = `${new Date().toISOString()} WATCH_ERROR ${err}\n`;
        if (logPath) fs.appendFileSync(logPath, errMsg);
        console.error(errMsg.trim());
        process.exitCode = 5;
        return { ok: false, failedSeq: record.brokerSequence, error: err, isContinuityBreak: true };
      }
      if (record.previousRecordHash !== state.lastHash) {
        const err = `CONTINUITY_BREAK seq=${record.brokerSequence} expectedPrev=${state.lastHash} actualPrev=${record.previousRecordHash}`;
        const errMsg = `${new Date().toISOString()} WATCH_ERROR ${err}\n`;
        if (logPath) fs.appendFileSync(logPath, errMsg);
        console.error(errMsg.trim());
        process.exitCode = 5;
        return { ok: false, failedSeq: record.brokerSequence, error: err, isContinuityBreak: true };
      }
    }

    // 2. Deduplication check (eventId and recordHash)
    if ((record.id && state.seenEventIds.has(record.id)) || (record.recordHash && state.seenRecordHashes.has(record.recordHash))) {
      const dedupMsg = `${new Date().toISOString()} DEDUP_SKIP seq=${record.brokerSequence} event=${record.id} hash=${record.recordHash}\n`;
      if (logPath) fs.appendFileSync(logPath, dedupMsg);
      commitOffset(offsetPath, record.brokerSequence, record.recordHash ?? state.lastHash, record.id, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
      state.lastSeq = record.brokerSequence;
      state.lastHash = record.recordHash ?? state.lastHash;
      state.lastEventId = record.id;
      continue;
    }

    // 3. Exact Room replies update delivery ACK state only when the event ID is
    // explicit. Text-only sequence mentions are not treated as acknowledgements.
    const replyId = record.replyTo || (Array.isArray(record.references)
      ? record.references.map(ref => typeof ref === 'string' ? ref : ref?.eventId).find(Boolean)
      : null);
    if (replyId) {
      const acknowledged = state.recentEntries.find(entry => entry.eventId === replyId);
      if (acknowledged && acknowledged.notificationStatus === 'delivered') {
        acknowledged.acknowledgementStatus = 'room_reply_observed';
        acknowledged.ackEventId = record.id;
        acknowledged.ackSequence = record.brokerSequence;
      }
    }

    // 4. Targeting & gated Herdr dispatch. Persist the target event before
    // contacting Herdr so a crash cannot silently discard the notification.
    let notificationStatus = 'not_actionable_for_codex';
    const shouldNotify = agent === 'codex' ? shouldNotifyCodex(record) : isTargeted(record, agent, aliases);
    if (shouldNotify && state.pendingDelivery?.eventId === record.id && state.pendingDelivery.status === 'delivery-uncertain') {
      return { ok: false, deferred: true, failedSeq: record.brokerSequence, error: `delivery for Room #${record.brokerSequence} is uncertain after a prior process exit; manual Herdr/Room reconciliation required` };
    }
    if (shouldNotify) {
      state.pendingDelivery = state.pendingDelivery?.eventId === record.id
        ? state.pendingDelivery
        : { seq: record.brokerSequence, eventId: record.id, recordHash: record.recordHash, sender: record.sender, status: 'pending', attempts: 0, acknowledgementStatus: 'awaiting_delivery' };
      state.pendingDelivery.status = 'dispatching';
      state.pendingDelivery.attempts = Number(state.pendingDelivery.attempts || 0) + 1;
      state.pendingDelivery.lastAttemptAt = new Date().toISOString();
      commitOffset(offsetPath, state.lastSeq, state.lastHash, state.lastEventId, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
      const res = notifyHerdr(record, { spawnSyncFn, paneId });
      if (res.deferred) {
        state.pendingDelivery.status = res.status;
        state.pendingDelivery.lastError = res.error;
        commitOffset(offsetPath, state.lastSeq, state.lastHash, state.lastEventId, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
        const now = Date.now();
        const shouldLog = state.lastDeferredSeq !== record.brokerSequence || now - (state.lastDeferredAt || 0) >= 60000;
        if (shouldLog) {
          const deferredMsg = `${new Date().toISOString()} NOTIFICATION_DEFERRED seq=${record.brokerSequence} event=${record.id} target=${agent} status=${res.status} reason=${res.error}\n`;
          if (logPath) fs.appendFileSync(logPath, deferredMsg);
          console.log(deferredMsg.trim());
          state.lastDeferredSeq = record.brokerSequence;
          state.lastDeferredAt = now;
        }
        return { ok: false, deferred: true, failedSeq: record.brokerSequence, error: res.error };
      }
      if (res.ok) {
        notificationStatus = 'delivered';
        state.pendingDelivery = null;
      }
      const actionMsg = `${new Date().toISOString()} OBSERVED [${record.deliveryType ?? 'MSG'}] seq=${record.brokerSequence} event=${record.id} from=@${record.sender} target=${agent} notification=${res.status || (res.ok ? 'delivered' : `failed:${res.error}`)} agentInvocation=${res.ok ? 'observed' : 'not-confirmed'} hash=${record.recordHash ?? 'unknown'}\n`;
      if (logPath) fs.appendFileSync(logPath, actionMsg);
      console.log(actionMsg.trim());
      if (!res.ok) {
        const now = Date.now();
        const shouldLog = state.lastFailedSeq !== record.brokerSequence || now - (state.lastFailedAt || 0) >= 60000;
        const failMsg = `${new Date().toISOString()} NOTIFICATION_FAILED seq=${record.brokerSequence} target=${agent} err=${res.error}; retry scheduled\n`;
        state.pendingDelivery.status = 'retry';
        state.pendingDelivery.lastError = res.error;
        commitOffset(offsetPath, state.lastSeq, state.lastHash, state.lastEventId, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
        if (shouldLog) {
          if (logPath) fs.appendFileSync(logPath, failMsg);
          console.error(failMsg.trim());
          state.lastFailedSeq = record.brokerSequence;
          state.lastFailedAt = now;
        }
        return { ok: false, failedSeq: record.brokerSequence, error: res.error };
      }
      state.pendingDelivery = null;
    } else {
      const observedMsg = `${new Date().toISOString()} OBSERVED [${record.deliveryType ?? 'MSG'}] seq=${record.brokerSequence} event=${record.id} from=@${record.sender} target=none operatorNotification=silent aiWake=none hash=${record.recordHash ?? 'unknown'}\n`;
      if (logPath) fs.appendFileSync(logPath, observedMsg);
    }

    // 4. Update seen caches, commit offset, advance cursor
    if (record.id) state.seenEventIds.add(record.id);
    if (record.recordHash) state.seenRecordHashes.add(record.recordHash);
    state.recentEntries.push({
      seq: record.brokerSequence,
      eventId: record.id,
      recordHash: record.recordHash,
      notificationStatus,
      acknowledgementStatus: notificationStatus === 'delivered' ? 'awaiting_explicit_room_reply' : 'not_applicable'
    });
    if (state.recentEntries.length > 200) state.recentEntries.shift();

    commitOffset(offsetPath, record.brokerSequence, record.recordHash ?? state.lastHash, record.id, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
    state.lastSeq = record.brokerSequence;
    state.lastHash = record.recordHash ?? state.lastHash;
    state.lastEventId = record.id;

    // Avoid sending a burst when a Room snapshot contains multiple actionable
    // records. The next poll re-resolves the live pane and its lifecycle state.
    if (agent === 'codex' && notificationStatus === 'delivered') {
      return { ok: true, dispatchedSeq: record.brokerSequence };
    }
  }

  return { ok: true };
}

export function createWatcher(config = {}) {
  const {
    agent = 'codex',
    paneId = null,
    aliases = ALIASES,
    lockPath = path.join(COMMS_ROOT, 'locks', 'room-watch-codex.lock'),
    logPath = path.join(COMMS_ROOT, 'logs', 'room-watch-codex.log'),
    offsetPath = path.join(COMMS_ROOT, 'watch', 'logs', 'codex-room-watch.offset'),
    roomPath = ROOM_PATH,
    pollMs = 2000,
    seedSeq = null,
    spawnSyncFn = spawnSync,
    readRoomSnapshotFn = readRoomSnapshot
  } = config;

  if (lockPath) fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (logPath) fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (offsetPath) fs.mkdirSync(path.dirname(offsetPath), { recursive: true });

  let timer = null;
  let observedSize = 0;
  let hasPendingRetry = false;
  let retryNotBefore = 0;
  let state = {
    lastSeq: 0,
    lastHash: null,
    lastEventId: null,
    seenEventIds: new Set(),
    seenRecordHashes: new Set(),
    recentEntries: [],
    pendingDelivery: null,
    backlogReconciliation: null
  };

  function acquireLock() {
    if (!lockPath) return;
    try {
      const held = Number(fs.readFileSync(lockPath, 'utf8'));
      if (Number.isSafeInteger(held) && held > 0) {
        try {
          process.kill(held, 0);
          console.error(`WATCH_REFUSED already running pid=${held}`);
          process.exit(3);
        } catch {}
      }
    } catch {}
    fs.writeFileSync(lockPath, String(process.pid));
  }

  function releaseLock() {
    if (!lockPath) return;
    try { fs.unlinkSync(lockPath); } catch {}
  }

  function init() {
    acquireLock();
    process.on('exit', releaseLock);

    const { records: rows } = fetchSnapshotRecords({ roomPath, readSnapshotFn: readRoomSnapshotFn, logPath });
    const initRes = initializeWatcherState({ offsetPath, rows, seedSeq, logPath });
    state.lastSeq = initRes.lastSeq;
    state.lastHash = initRes.lastHash;
    state.lastEventId = initRes.lastEventId;
    state.pendingDelivery = initRes.pendingDelivery;
    state.backlogReconciliation = initRes.backlogReconciliation;
    for (const entry of initRes.durableRecent) {
      if (entry.eventId) state.seenEventIds.add(entry.eventId);
      if (entry.recordHash) state.seenRecordHashes.add(entry.recordHash);
      state.recentEntries.push(entry);
    }
    if (state.pendingDelivery?.status === 'dispatching') {
      state.pendingDelivery.status = 'delivery-uncertain';
      state.pendingDelivery.lastError = 'watcher exited while Herdr delivery was in flight; automatic duplicate suppressed';
      commitOffset(offsetPath, state.lastSeq, state.lastHash, state.lastEventId, state.recentEntries, state.pendingDelivery, state.backlogReconciliation);
      const uncertainMsg = `${new Date().toISOString()} DELIVERY_UNCERTAIN seq=${state.pendingDelivery.seq} event=${state.pendingDelivery.eventId}; automatic duplicate suppressed\n`;
      if (logPath) fs.appendFileSync(logPath, uncertainMsg);
      console.error(uncertainMsg.trim());
    }
    for (const row of rows.filter(r => r.brokerSequence <= state.lastSeq).slice(-200)) {
      if (row.id) state.seenEventIds.add(row.id);
      if (row.recordHash) state.seenRecordHashes.add(row.recordHash);
    }

    observedSize = fs.existsSync(roomPath) ? fs.statSync(roomPath).size : 0;

    const readyMsg = `${new Date().toISOString()} ${agent.toUpperCase()}_ROOM_WATCH_READY pid=${process.pid} head=${state.lastSeq} hash=${state.lastHash} bytes=${observedSize} poll=${pollMs}ms\n`;
    if (logPath) fs.appendFileSync(logPath, readyMsg);
    console.log(readyMsg.trim());

    // Startup catch-up
    const startupPending = rows
      .filter(r => Number.isSafeInteger(r.brokerSequence) && r.brokerSequence > state.lastSeq)
      .sort((a, b) => a.brokerSequence - b.brokerSequence);

    if (startupPending.length > 0) {
      const catchupMsg = `${new Date().toISOString()} CATCHUP_START pending=${startupPending.length} from=${state.lastSeq + 1} to=${startupPending[startupPending.length - 1].brokerSequence}\n`;
      if (logPath) fs.appendFileSync(logPath, catchupMsg);
      console.log(catchupMsg.trim());
      const res = processRecords(startupPending, state, { agent, paneId, aliases, offsetPath, logPath, spawnSyncFn });
      if (!res.ok) {
        if (res.isContinuityBreak) {
          process.exitCode = 5;
          return false;
        }
        hasPendingRetry = true;
      }
    }
    return true;
  }

  function pollOnce() {
    try {
      const size = fs.statSync(roomPath).size;
      if (hasPendingRetry && Date.now() < retryNotBefore) return;
      if (size < observedSize) {
        const stopMsg = `${new Date().toISOString()} WATCH_STOP room-size-decreased\n`;
        if (logPath) fs.appendFileSync(logPath, stopMsg);
        console.error(stopMsg.trim());
        if (timer) clearInterval(timer);
        process.exitCode = 2;
        return;
      }

      if (size === observedSize && !hasPendingRetry) {
        return;
      }

      // Fetch snapshot using integrity-aware API (Finding 3)
      const { records: nextRows } = fetchSnapshotRecords({ roomPath, readSnapshotFn: readRoomSnapshotFn, logPath });
      const pending = nextRows
        .filter(r => Number.isSafeInteger(r.brokerSequence) && r.brokerSequence > state.lastSeq)
        .sort((a, b) => a.brokerSequence - b.brokerSequence);

      const res = processRecords(pending, state, { agent, paneId, aliases, offsetPath, logPath, spawnSyncFn });
      if (res.ok) {
        observedSize = size;
        const recordsRemain = nextRows.some(r => Number.isSafeInteger(r.brokerSequence) && r.brokerSequence > state.lastSeq);
        hasPendingRetry = recordsRemain;
        retryNotBefore = recordsRemain ? Date.now() + 30000 : 0;
      } else {
        hasPendingRetry = true;
        retryNotBefore = Date.now() + (res.deferred ? 30000 : 10000);
        if (res.isContinuityBreak) {
          process.exitCode = 5;
          if (timer) clearInterval(timer);
          return;
        }
      }
    } catch (error) {
      const errMsg = `${new Date().toISOString()} WATCH_ERROR ${String(error?.message ?? error)}\n`;
      if (logPath) fs.appendFileSync(logPath, errMsg);
      console.error(errMsg.trim());
      hasPendingRetry = true;
      return;
    }
  }

  function start() {
    if (init() !== false) {
      timer = setInterval(pollOnce, pollMs);
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    releaseLock();
  }

  return {
    init,
    start,
    stop,
    pollOnce,
    getState: () => ({ ...state, observedSize, hasPendingRetry }),
    getCommittedOffset: () => fs.existsSync(offsetPath) ? JSON.parse(fs.readFileSync(offsetPath, 'utf8')) : null
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seed = parseSeedSeq(process.argv);
  const watcher = createWatcher({
    agent,
    paneId: null,
    aliases: ALIASES,
    lockPath,
    logPath,
    offsetPath,
    roomPath: ROOM_PATH,
    pollMs,
    seedSeq: seed
  });
  watcher.start();
}
