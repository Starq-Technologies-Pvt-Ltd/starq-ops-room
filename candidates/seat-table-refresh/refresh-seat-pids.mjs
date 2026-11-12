// CANDIDATE - not deployed. Room #19112 (Cursor) and #19114: read each seat's pid from live Herdr
// pane process-info at activation time instead of trusting a stored value.
//
// Why: the PR #3 seat table pins a pid per seat and the dispatcher checks it against the pane's
// foreground processes before every wake. A pid goes stale at every restart (all six Windows pids in
// the shipped table were stale on 2026-11-12), and a merely LIVE pid is not proof: two stale ones were
// alive as crashpad_handler and MSPCManagerService. So the refresh takes the pid only from the pane's
// own foreground processes AND only when the process is the seat's expected harness.
//
// It never edits a table in place, never guesses (no match or several matches = REFUSED, pid
// unchanged), never wakes or starts anything, and runs only `herdr pane process-info`.
//
//   node refresh-seat-pids.mjs --table <seat-table.json> --out <refreshed.json> [--herdr <bin>]
//
// Exit codes: 0 all windows seats refreshed or already correct; 2 at least one seat REFUSED.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const nameOf = (p) => String(p?.name ?? '').toLowerCase();
const cmdOf = (p) => String(p?.cmdline ?? '').toLowerCase();

/** Expected foreground process per Herdr agent kind. Unknown kinds are refused, not guessed. */
export const HARNESS_MATCHERS = {
  codex: (p) => nameOf(p) === 'codex.exe',
  claude: (p) => nameOf(p) === 'claude.exe',
  agy: (p) => nameOf(p) === 'agy.exe',
  // Cursor's agent runs as a PowerShell script (cursor-agent.ps1).
  cursor: (p) => nameOf(p) === 'powershell.exe' && cmdOf(p).includes('cursor-agent'),
};

export function pickPid(seat, processInfo) {
  const match = HARNESS_MATCHERS[String(seat.herdrAgent ?? '').toLowerCase()];
  if (!match) return { ok: false, reason: `no matcher for harness "${seat.herdrAgent}"` };
  const fg = processInfo?.foreground_processes;
  if (!Array.isArray(fg) || fg.length === 0) return { ok: false, reason: 'pane reports no foreground process' };
  const hits = fg.filter(match);
  if (hits.length === 0) return { ok: false, reason: `no foreground process is a ${seat.herdrAgent} (saw ${fg.map((p) => `${p.pid}:${p.name}`).join(',')})` };
  if (hits.length > 1) return { ok: false, reason: `several candidate processes (${hits.map((p) => p.pid).join(',')})` };
  return { ok: true, pid: hits[0].pid, process: hits[0].name };
}

export function refreshTable(table, { probe, backendKey = 'windows/default' } = {}) {
  const next = structuredClone(table);
  const report = [];
  for (const seat of next.seats) {
    if (seat.backend !== backendKey) { report.push({ seatId: seat.seatId, status: 'SKIPPED', detail: `backend ${seat.backend}` }); continue; }
    let info;
    try { info = probe(seat); } catch (e) { report.push({ seatId: seat.seatId, status: 'REFUSED', detail: `process-info failed: ${String(e.message).slice(0, 80)}` }); continue; }
    const pick = pickPid(seat, info);
    if (!pick.ok) { report.push({ seatId: seat.seatId, status: 'REFUSED', before: seat.pid, detail: pick.reason }); continue; }
    report.push({ seatId: seat.seatId, status: pick.pid === seat.pid ? 'UNCHANGED' : 'UPDATED', before: seat.pid, after: pick.pid, detail: pick.process });
    seat.pid = pick.pid;
  }
  return { table: next, report, refused: report.filter((r) => r.status === 'REFUSED').length };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const tablePath = arg('--table'); const out = arg('--out'); const herdr = arg('--herdr') || process.env.HERDR_BIN_PATH;
  if (!tablePath || !out || !herdr) { console.error('usage: --table <file> --out <file> [--herdr <bin>]'); process.exit(1); }
  if (out === tablePath) { console.error('refusing to overwrite the input table; choose a different --out'); process.exit(1); }
  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  const probe = (seat) => JSON.parse(execFileSync(herdr, ['pane', 'process-info', '--pane', seat.pane], { encoding: 'utf8', timeout: 15000 })).result.process_info;
  const { table: next, report, refused } = refreshTable(table, { probe });
  for (const r of report) console.log(`${r.status.padEnd(9)} ${r.seatId.padEnd(22)} ${r.before ?? '-'} -> ${r.after ?? '-'}  ${r.detail ?? ''}`);
  writeFileSync(out, JSON.stringify(next, null, 2) + '\n');
  process.exit(refused ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
