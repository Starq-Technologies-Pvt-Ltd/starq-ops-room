#!/usr/bin/env node
/**
 * room-dispatcher.mjs — ONE universal Room→agent dispatcher.
 *
 * Founder directive 2026-11-07: "One Room protocol, one universal dispatcher,
 * independently addressable sessions across supported floors." Replaces the
 * per-agent watcher fleet (room-watch-<agent>.mjs) with a single discovery-driven
 * daemon. A new Herdr session is reached automatically through discovery — no
 * bespoke watcher per agent.
 *
 * What it does each poll:
 *   1. DISCOVER live Herdr agent sessions across configured sources (Windows
 *      default session + any WSL/remote sources) via `herdr agent list` (JSON).
 *      Each session carries its canonical handle, durable session UUID, workspace,
 *      host, pane and lifecycle status.
 *   2. READ new Room broker records via readRoomSnapshot() (never room.jsonl direct),
 *      from a durable checkpoint — no history replay on first start.
 *   3. ROUTE each new record with the canonical core (protocol/v1/sessionRouting.mjs):
 *      ROOM-PROTO-1 action gate, then precedence — explicit target → unambiguous
 *      project/workspace affinity → HOLD+report on ambiguity. Never wakes every
 *      session of a shared handle; FYI/CC_CONTEXT never wakes.
 *   4. WAKE each resolved session's pane with a SHORT pointer to the Room event
 *      (sequence + eventId). The full instruction stays in Room; ACK/progress/
 *      completion return to Room (a completion addressed to the coordinator is
 *      just another routed event, so it wakes the coordinator automatically).
 *
 * Herdr agent_status=done is runtime evidence only; it is NOT treated as a
 * verified completion receipt (Founder 2026-11-07). Completion is a Room event.
 *
 * Durable: session UUID, host, workspace, delivery checkpoint and eventId are
 * preserved; dedup is per (sequence, sessionId); failed wakes are queued and
 * retried; unreachable sources, unroutable agents and held ambiguities are
 * reported, never silently dropped.
 *
 * Usage: node room-dispatcher.mjs [--once] [--print] [--dry-run]
 *   --once     one poll then exit (tests / recovery)
 *   --print    echo activity to stdout
 *   --dry-run  discover + route + report, but do NOT wake any pane
 *
 * Config (env, all optional — sensible single-source default):
 *   COMMS_DISPATCH_SOURCES  JSON array of { host, bin, args?, session? } discovery/wake sources
 *   COMMS_HERDR_AGENT_MAP   JSON override for herdr-kind -> canonical-handle
 *   COMMS_SESSION_ROLES     JSON map { <sessionId|workspaceId>: "role" }
 *   HERDR_BIN_PATH          herdr binary (default: newest standalone release)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, execFile } from 'node:child_process';
import { selectWakeTargets, DEFAULT_HERDR_AGENT_MAP } from '../protocol/v1/sessionRouting.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
// State dir: per-machine runtime state under the deploy root (agent-comms/state).
// COMMS_DISPATCH_STATE_DIR overrides it for test isolation (same seam pattern as
// COMMS_ROOM_PATH / setLeasesDir / COMMS_IDENTITIES_PATH).
const STATE_DIR = process.env.COMMS_DISPATCH_STATE_DIR
  ? resolve(process.cwd(), process.env.COMMS_DISPATCH_STATE_DIR)
  : resolve(__dir, '..', 'state');
const STATE_FILE = join(STATE_DIR, 'room-dispatch.json');
const LOG_FILE = join(STATE_DIR, 'room-dispatch.log');
const LOCK_FILE = join(STATE_DIR, 'room-dispatch.lock');

const ONCE = process.argv.includes('--once');
const PRINT = process.argv.includes('--print');
const DRY_RUN = process.argv.includes('--dry-run');
const POLL_MS = Number(process.env.COMMS_DISPATCH_POLL_MS || 2000);
const DELIVERED_KEEP = 2000;

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  try { appendFileSync(LOG_FILE, msg + '\n'); } catch {}
  if (PRINT) console.log(msg);
}

function resolveHerdrBin() {
  if (process.env.HERDR_BIN_PATH) return process.env.HERDR_BIN_PATH;
  const base = join(process.env.USERPROFILE || process.env.HOME || '', '.herdr', 'packages', 'standalone', 'releases');
  try {
    const rels = readdirSync(base).filter((d) => /x86_64-pc-windows-msvc$/.test(d) || /herdr/i.test(d)).sort().reverse();
    for (const r of rels) { const p = join(base, r, 'herdr.exe'); if (existsSync(p)) return p; }
  } catch {}
  return 'herdr';
}

function normalizeSourceSpec(s) {
  return {
    host: s.host || 'windows',
    bin: s.bin || resolveHerdrBin(),
    args: Array.isArray(s.args) ? s.args : [],
    session: s.session || null,
  };
}

function loadSources() {
  const raw = process.env.COMMS_DISPATCH_SOURCES;
  if (raw) {
    try { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr.map(normalizeSourceSpec); }
    catch (e) { log(`BAD COMMS_DISPATCH_SOURCES (${e.message}); using default`); }
  }
  return [{ host: 'windows', bin: resolveHerdrBin(), args: [], session: process.env.HERDR_SESSION || null }];
}

function loadJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { log(`BAD ${name} (${e.message}); ignoring`); return null; }
}

function herdrArgs(source, rest) {
  return [...source.args, ...(source.session ? ['--session', source.session] : []), ...rest];
}

/** Discover live agents from one source. Returns { ok, agents, reason }. */
export function discoverFromSource(source, { run = execFileSync } = {}) {
  try {
    const out = run(source.bin, herdrArgs(source, ['agent', 'list']), { timeout: 15000, encoding: 'utf8', windowsHide: true });
    const parsed = JSON.parse(out);
    const agents = parsed?.result?.agents || [];
    return { ok: true, agents, reason: null };
  } catch (e) {
    return { ok: false, agents: [], reason: e.stderr || e.message || String(e) };
  }
}

/** Discover across all sources, tagging each session with its source host. */
export function discoverAll(sources, deps = {}) {
  const sessions = [];
  const sourceReport = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const { ok, agents, reason } = discoverFromSource(src, deps);
    sourceReport.push({ host: src.host, ok, reason, count: agents.length });
    if (!ok) { log(`SOURCE UNREACHABLE host=${src.host} reason=${reason}`); continue; }
    for (const a of agents) { Object.defineProperty(a, '_srcIndex', { value: i, enumerable: false }); a._host = src.host; sessions.push(a); }
  }
  return { sessions, sourceReport };
}

function roleMapper() {
  const roles = loadJsonEnv('COMMS_SESSION_ROLES') || {};
  return (raw) => ({
    host: raw._host || null,
    role: roles[raw.agent_session?.value] || roles[raw.workspace_id] || null,
  });
}

export function buildPointer(record) {
  const e = record.event || {};
  const md = e.metadata || {};
  const seq = record.brokerSequence;
  const eid = String(record.eventId || e.eventId || '').slice(0, 8);
  const sender = e.senderHandle || 'unknown';
  const subject = String(md.subject || e.taskId || '(no subject)').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `🔔 Room #${seq} (${eid}) @${sender} — ${subject}\nRead the authoritative record via readRoomSnapshot() and reply in Room (ACK / progress / completion). Full instruction is in Room, not here.`;
}

function wake(source, pane, text) {
  return new Promise((done) => {
    execFile(source.bin, herdrArgs(source, ['agent', 'prompt', pane, text]), { windowsHide: true, timeout: 20000 }, (err) => {
      if (err) { log(`WAKE FAILED pane=${pane} host=${source.host}: ${err.message}`); done(false); }
      else { log(`DELIVERED pane=${pane} host=${source.host}`); done(true); }
    });
  });
}

function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    s.delivered = Array.isArray(s.delivered) ? s.delivered : [];
    s.pending = Array.isArray(s.pending) ? s.pending : [];
    if (typeof s.lastSeq !== 'number') s.lastSeq = null;
    return s;
  } catch { return { lastSeq: null, delivered: [], pending: [], createdAt: new Date().toISOString() }; }
}
function saveState(s) {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(s, null, 1));
    renameSync(tmp, STATE_FILE);
  } catch (err) { log(`STATE SAVE FAILED: ${err.message}`); }
}

const AGENT_MAP = loadJsonEnv('COMMS_HERDR_AGENT_MAP') || DEFAULT_HERDR_AGENT_MAP;
const SOURCES = loadSources();
const sessionExtra = roleMapper();
const sourceByIndex = (i) => SOURCES[i] || SOURCES[0];

let running = false;
export async function pollOnce({ readSnapshot, discover = () => discoverAll(SOURCES), doWake = wake, dry = DRY_RUN } = {}) {
  const mod = readSnapshot ? { readRoomSnapshot: readSnapshot } : await import(pathToFileURL(resolve(__dir, 'room.mjs')).href);
  const snap = mod.readRoomSnapshot();
  if (snap.state !== 'OK' || !snap.stable) { log(`snapshot not usable (state=${snap.state} stable=${snap.stable}); holding checkpoint`); return { skipped: true }; }

  const { sessions, sourceReport } = discover();
  const state = loadState();
  const records = (snap.records || []).slice().sort((a, b) => a.brokerSequence - b.brokerSequence);

  if (state.lastSeq == null) {
    state.lastSeq = snap.tailSequence;
    saveState(state);
    log(`INIT checkpoint at tailSeq=${snap.tailSequence} (no replay). sources=${sourceReport.map((s) => s.host + ':' + (s.ok ? s.count : 'DOWN')).join(',')}`);
    return { seeded: true };
  }

  // Retry queued failed wakes first (never silently dropped).
  const stillPending = [];
  for (const p of state.pending) {
    const ok = dry ? true : await doWake(sourceByIndex(p.srcIndex), p.pane, p.text);
    if (ok) state.delivered.push(p.key); else stillPending.push(p);
  }
  state.pending = stillPending;

  let maxSeq = state.lastSeq;
  const summary = { woke: 0, held: 0, unreachable: 0, unroutable: 0 };
  for (const rec of records) {
    const seq = rec.brokerSequence;
    if (!Number.isInteger(seq)) continue;      // skip legacy/non-broker records
    if (seq <= state.lastSeq) continue;
    const routing = selectWakeTargets(rec, sessions, { map: AGENT_MAP, sessionExtra });
    for (const target of routing.wake) {
      const key = `${seq}:${target.sessionId || target.pane}`;
      if (state.delivered.includes(key) || state.pending.some((p) => p.key === key)) continue;
      const text = buildPointer(rec);
      const src = sourceByIndex(target._srcIndex ?? 0);
      const ok = dry ? true : await doWake(src, target.pane, text);
      if (ok) { state.delivered.push(key); summary.woke++; }
      else { state.pending.push({ key, pane: target.pane, text, srcIndex: target._srcIndex ?? 0 }); }
      if (dry) log(`DRY wake seq=${seq} -> ${target.handle}@${target.pane} (${target.host || 'windows'})`);
    }
    for (const a of routing.ambiguous) { summary.held++; log(`HELD seq=${seq} handle=${a.handle} project=${a.project || '-'} candidates=${a.candidates.map((c) => c.pane).join('|')} (ambiguous — reported, not delivered)`); }
    for (const u of routing.unreachable) { summary.unreachable++; log(`UNREACHABLE seq=${seq} handle=${u.handle} target=${u.token} (explicit target not live)`); }
    if (routing.unroutable.length) { summary.unroutable += routing.unroutable.length; }
    if (seq > maxSeq) maxSeq = seq;
  }
  state.lastSeq = maxSeq;
  if (state.delivered.length > DELIVERED_KEEP) state.delivered = state.delivered.slice(-DELIVERED_KEEP);
  saveState(state);
  return { summary, sourceReport, sessions: sessions.length };
}

// --- singleton + loop (guarded so the module is importable by tests) ---
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function acquireLock() {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    if (existsSync(LOCK_FILE)) {
      const prev = parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (prev && prev !== process.pid && pidAlive(prev)) { log(`another dispatcher alive (pid=${prev}); exiting`); return false; }
    }
    writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (e) { log(`lock error: ${e.message}`); return true; }
}
function releaseLock() { try { if (existsSync(LOCK_FILE) && readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) unlinkSync(LOCK_FILE); } catch {} }

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!ONCE && !acquireLock()) process.exit(0);
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(0); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
  log(`room-dispatcher starting — sources=${SOURCES.map((s) => s.host).join(',')} once=${ONCE} dryRun=${DRY_RUN} pid=${process.pid}`);
  const tick = async () => { if (running) return; running = true; try { await pollOnce(); } catch (e) { log(`POLL ERROR: ${e.message}`); } finally { running = false; } };
  await tick();
  if (ONCE) { log('single poll complete (--once); exiting'); process.exit(0); }
  else setInterval(tick, POLL_MS);
}
