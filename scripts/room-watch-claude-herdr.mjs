#!/usr/bin/env node
/**
 * room-watch-claude-herdr.mjs — durable Room watcher for the Herdr @claude session.
 *
 * Purpose (Founder directive 2026-11-06): monitor NEW Room broker records from a
 * persisted checkpoint onward and notify THIS Herdr Claude session via the supported
 * Herdr pane-wake mechanism. Separate from engineering work; does not post to Room,
 * does not claim/renew any identity, does not touch StarqBot / Deadpool's Telegram relay.
 *
 * ACTION_REQUIRED classification authority (ROOM-PROTO-1, 2026-11-07):
 *   Relevance is decided by the CANONICAL classifier `isOutstandingAction()` exported
 *   from `protocol/v1/authorityPolicy.mjs` — the single source of truth also consumed
 *   by `room-watch-codex.mjs` and the broker. This watcher does NOT carry its own
 *   action-required verb list; the earlier bespoke `selfActionLevel` regex was removed
 *   so the herdr seat cannot drift from the protocol. A bare @claude addressee mention
 *   is NOT action: the authoritative signal is the structured `actionRequired` field,
 *   which `isOutstandingAction(record, 'claude')` evaluates against the raw broker record.
 *
 * Guarantees:
 *  - No history replay: first ever start seeds checkpoint = current tailSequence.
 *  - Durable checkpoint across restarts: state file holds lastSeq + delivered + pending.
 *  - Dedup by brokerSequence (+ eventId recorded).
 *  - Never silently discards: a failed pane-wake goes to a persisted pending queue and
 *    is retried every poll; lastSeq only advances for records that are delivered,
 *    queued, or irrelevant — so nothing relevant is skipped unseen.
 *  - Notifies with sender, subject, sequence and a concise summary.
 *
 * Read path: readRoomSnapshot() (never reads room.jsonl directly).
 * Usage: node room-watch-claude-herdr.mjs [--once] [--print]
 *   --once : run a single poll then exit (used for tests / recovery checks)
 *   --print: also echo activity to stdout
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { isOutstandingAction, isActionAddressedTo } from '../protocol/v1/authorityPolicy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(__dir, '..', 'state');
const STATE_FILE = join(STATE_DIR, 'claude-herdr-watch.json');
const LOG_FILE = join(STATE_DIR, 'claude-herdr-watch.log');
const LOCK_FILE = join(STATE_DIR, 'claude-herdr-watch.lock');

const ONCE = process.argv.includes('--once');
const PRINT = process.argv.includes('--print');

const HERDR_BIN = process.env.HERDR_BIN_PATH
  || 'C:\\Users\\Ali Musthaq\\.herdr\\packages\\standalone\\releases\\0.9.4-preview.2026-10-14-fbd2ae23927f-x86_64-pc-windows-msvc\\herdr.exe';
const PANE = process.env.HERDR_PANE_ID || 'w1:p5';
const SELF_HANDLE = 'claude';
const POLL_MS = 2000;
const DELIVERED_KEEP = 500; // cap on remembered delivered seqs

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}`;
  try { appendFileSync(LOG_FILE, msg + '\n'); } catch {}
  if (PRINT) console.log(msg);
}

function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    s.delivered = Array.isArray(s.delivered) ? s.delivered : [];
    s.pending = Array.isArray(s.pending) ? s.pending : [];
    if (typeof s.lastSeq !== 'number') s.lastSeq = null;
    return s;
  } catch {
    return { lastSeq: null, delivered: [], pending: [], createdAt: new Date().toISOString() };
  }
}

function saveState(s) {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(s, null, 1));
    renameSync(tmp, STATE_FILE);
  } catch (err) {
    log(`STATE SAVE FAILED: ${err.message}`);
  }
}

export function summarize(rec) {
  const e = rec.event || {};
  const md = e.metadata || {};
  const subject = (md.subject || '(no subject)').toString().replace(/\s+/g, ' ').trim();
  const sender = e.senderHandle || 'unknown';
  const body = (e.body || '').replace(/\s+/g, ' ').trim();
  return { seq: rec.brokerSequence, eventId: rec.eventId, sender, subject, snippet: body.slice(0, 220) };
}

// Deadpool posts a stream of routine automated digests (Wade Wire / Floor Drop /
// morning brief / identity-lease notices). These are suppressed unless they carry a
// genuine escalation signal. (Founder-directed noise reduction 2026-11-06.) This is a
// SENDER-channel policy, orthogonal to ROOM-PROTO-1 action classification.
export function isSuppressedDeadpoolDigest(rec) {
  const e = rec.event || {};
  if ((e.senderHandle || '') !== 'deadpool') return false;
  const md = e.metadata || {};
  const hay = `${md.subject || ''} ${e.body || ''}`;
  const subj = (md.subject || '');
  const routine = /wade |wire|floor drop|morning brief|^\[identity lease\]/i.test(subj + ' ' + hay.slice(0, 60));
  const escalation = /blocker|blocked|action required|review request|urgent|failure|escalat/i.test(hay);
  return routine && !escalation;
}

/**
 * Decide whether a Room broker record should wake this Herdr @claude seat.
 *
 * Order of precedence (sender/channel guards first, then canonical classification):
 *   1. [WATCHER-TEST] hook  -> always relevant (explicit test marker, any sender).
 *   2. Own posts           -> never relevant.
 *   3. Deadpool routine digests without escalation -> suppressed.
 *   4. Founder posts (mustarq / ali) -> always relevant.
 *   5. Everything else     -> CANONICAL ROOM-PROTO-1 classifiers:
 *                             isOutstandingAction(rec,'claude')  (is there an action?)
 *                           && isActionAddressedTo(rec,'claude') (is it mine, not a cc?)
 *
 * Rule 5 is the whole point of the refactor: a bare @claude addressee mention is not
 * action. `isOutstandingAction` reads the structured `actionRequired` field (and the
 * broker's `evaluatedDeliveryType` / `evaluatedAudience`) so routine ACKs, FYIs and
 * NONE posts do not wake this seat; `isActionAddressedTo` suppresses cross-agent
 * assignments that name another owner while only CC'ing claude. Genuine directives and
 * legacy (pre-ROOM-PROTO-1, unstructured) ACTION_REQUIRED records addressed to claude
 * still surface. Both helpers live in the canonical authorityPolicy module — there is
 * no bespoke verb list in this watcher anymore.
 */
export function isRelevant(rec) {
  const e = rec.event || {};
  const sender = e.senderHandle || '';
  const md = e.metadata || {};
  const hay = `${md.subject || ''} ${e.body || ''}`;
  if (hay.includes('[WATCHER-TEST]')) return true;      // explicit test hook, any sender
  if (sender === SELF_HANDLE) return false;              // never notify on our own posts
  if (isSuppressedDeadpoolDigest(rec)) return false;     // routine automated digest
  if (sender === 'mustarq' || sender === 'ali') return true; // all Founder posts are relevant

  // Canonical ROOM-PROTO-1 classification — the single source of truth shared with
  // room-watch-codex.mjs and the broker. No bespoke verb list here.
  return isOutstandingAction(rec, SELF_HANDLE) && isActionAddressedTo(rec, SELF_HANDLE);
}

function wake(n) {
  return new Promise((done) => {
    const text = `🔔 Room #${n.seq} from @${n.sender} — ${n.subject}\n${n.snippet}\n(Elder Room watcher; open Room #${n.seq} via readRoomSnapshot() and reply there if action is needed.)`;
    execFile(HERDR_BIN, ['agent', 'prompt', PANE, text], { windowsHide: true, timeout: 20000 }, (err) => {
      if (err) { log(`WAKE FAILED seq=${n.seq}: ${err.message}`); done(false); }
      else { log(`DELIVERED seq=${n.seq} from=@${n.sender} subj="${n.subject}"`); done(true); }
    });
  });
}

let running = false;
async function poll() {
  if (running) return;
  running = true;
  try {
    const mod = await import(pathToFileURL(resolve(__dir, 'room.mjs')).href);
    const snap = mod.readRoomSnapshot();
    if (snap.state !== 'OK' || !snap.stable) { log(`snapshot not usable (state=${snap.state} stable=${snap.stable}); holding checkpoint`); return; }
    const state = loadState();
    const records = (snap.records || []).slice().sort((a, b) => a.brokerSequence - b.brokerSequence);

    // First-ever start: seed checkpoint at the current tail — no history replay.
    if (state.lastSeq == null) {
      state.lastSeq = snap.tailSequence;
      saveState(state);
      log(`INIT checkpoint at tailSeq=${snap.tailSequence} (no replay). pane=${PANE}`);
      return;
    }

    // 1) Retry anything still pending (never silently discarded).
    const stillPending = [];
    for (const n of state.pending) {
      const ok = await wake(n);
      if (ok) state.delivered.push(n.seq); else stillPending.push(n);
    }
    state.pending = stillPending;

    // 2) New records beyond checkpoint, in order.
    let maxSeq = state.lastSeq;
    for (const rec of records) {
      const seq = rec.brokerSequence;
      if (seq <= state.lastSeq) continue;
      if (state.delivered.includes(seq) || state.pending.some(p => p.seq === seq)) { if (seq > maxSeq) maxSeq = seq; continue; }
      if (isRelevant(rec)) {
        const n = summarize(rec);
        const ok = await wake(n);
        if (ok) state.delivered.push(seq); else state.pending.push(n); // queued, not lost
      }
      if (seq > maxSeq) maxSeq = seq; // advance past delivered/queued/irrelevant
    }
    state.lastSeq = maxSeq;
    if (state.delivered.length > DELIVERED_KEEP) state.delivered = state.delivered.slice(-DELIVERED_KEEP);
    saveState(state);
  } catch (err) {
    log(`POLL ERROR: ${err.message}`);
  } finally {
    running = false;
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function acquireSingletonLock() {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    if (existsSync(LOCK_FILE)) {
      const prev = parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (prev && prev !== process.pid && pidAlive(prev)) {
        log(`another watcher is alive (pid=${prev}); this instance exits to stay singleton`);
        return false;
      }
    }
    writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (e) { log(`lock acquire error: ${e.message}`); return true; }
}
function releaseLock() {
  try { if (existsSync(LOCK_FILE) && readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) unlinkSync(LOCK_FILE); } catch {}
}

// Entrypoint guard: only run the watcher (lock + poll loop) when this file is executed
// directly, so it can be imported by tests without acquiring the singleton lock or
// starting the polling interval. Mirrors the pattern in room-watch-codex.mjs.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // Singleton guard for the persistent loop (the one-shot --once mode is harmless and skips it).
  if (!ONCE && !acquireSingletonLock()) { process.exit(0); }
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(0); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

  log(`room-watch-claude-herdr starting — pane=${PANE} state=${STATE_FILE} once=${ONCE} pid=${process.pid}`);
  if (ONCE) {
    await poll();
    log('single poll complete (--once); exiting');
    process.exit(0);
  } else {
    await poll();
    setInterval(poll, POLL_MS);
  }
}
