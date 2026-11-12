import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPid, refreshTable } from './refresh-seat-pids.mjs';

const fg = (...ps) => ({ foreground_processes: ps.map(([pid, name, cmdline]) => ({ pid, name, cmdline: cmdline ?? name })) });
const seat = (id, agent, pid, backend = 'windows/default') => ({ seatId: id, herdrAgent: agent, pid, backend, pane: 'w1:p1', handle: agent });
const table = () => ({ seats: [seat('s-codex', 'codex', 23024), seat('s-claude', 'claude', 356), seat('s-cursor', 'cursor', 26060), seat('s-wsl', 'claude', 1, 'wsl/default')] });

test('takes the pid of the seat\'s own harness process, shapes from the live 2026-11-12 panes', () => {
  assert.deepEqual(pickPid(seat('a', 'codex', 1), fg([2708, 'codex.exe'])), { ok: true, pid: 2708, process: 'codex.exe' });
  assert.equal(pickPid(seat('a', 'claude', 1), fg([32132, 'claude.exe'])).pid, 32132);
  assert.equal(pickPid(seat('a', 'agy', 1), fg([15284, 'agy.EXE'])).pid, 15284);
  assert.equal(pickPid(seat('a', 'cursor', 1), fg([35388, 'powershell.exe', 'powershell.exe -File cursor-agent.ps1'])).pid, 35388);
});

test('a live but unrelated process is refused, never adopted (the two stale pids of the shipped table)', () => {
  const r = pickPid(seat('a', 'codex', 23024), fg([23024, 'crashpad_handler.exe']));
  assert.equal(r.ok, false); assert.match(r.reason, /no foreground process is a codex/);
  assert.equal(pickPid(seat('a', 'cursor', 26060), fg([26060, 'MSPCManagerService.exe'])).ok, false);
  assert.equal(pickPid(seat('a', 'cursor', 1), fg([5, 'powershell.exe', 'powershell.exe -NoProfile'])).ok, false, 'a plain PowerShell is not Cursor');
});

test('unknown harness, empty pane, and ambiguity are refused', () => {
  assert.equal(pickPid(seat('a', 'devin', 1), fg([1, 'devin.exe'])).ok, false);
  assert.equal(pickPid(seat('a', 'codex', 1), { foreground_processes: [] }).ok, false);
  assert.equal(pickPid(seat('a', 'codex', 1), null).ok, false);
  assert.match(pickPid(seat('a', 'claude', 1), fg([1, 'claude.exe'], [2, 'claude.exe'])).reason, /several/);
});

test('refreshTable updates matching seats, leaves refused and other-backend seats alone, never mutates the input', () => {
  const input = table(); const frozen = JSON.stringify(input);
  const probes = { 's-codex': fg([2708, 'codex.exe']), 's-claude': fg([18580, 'claude.exe']), 's-cursor': fg([26060, 'MSPCManagerService.exe']) };
  const { table: out, report, refused } = refreshTable(input, { probe: (s) => probes[s.seatId] });
  assert.equal(JSON.stringify(input), frozen);
  const pid = (id) => out.seats.find((s) => s.seatId === id).pid;
  assert.equal(pid('s-codex'), 2708); assert.equal(pid('s-claude'), 18580);
  assert.equal(pid('s-cursor'), 26060, 'refused seat keeps its old pid');
  assert.equal(pid('s-wsl'), 1, 'WSL seat is skipped');
  assert.equal(refused, 1);
  assert.deepEqual(report.map((r) => r.status), ['UPDATED', 'UPDATED', 'REFUSED', 'SKIPPED']);
});

test('a probe failure refuses that seat only and an unchanged pid is reported as such', () => {
  const t = { seats: [seat('x', 'codex', 2708), seat('y', 'claude', 5)] };
  const { report, refused } = refreshTable(t, { probe: (s) => { if (s.seatId === 'y') throw new Error('pane not found'); return fg([2708, 'codex.exe']); } });
  assert.deepEqual(report.map((r) => r.status), ['UNCHANGED', 'REFUSED']);
  assert.equal(refused, 1);
});
