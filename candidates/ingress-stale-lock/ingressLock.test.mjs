import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createWithLock, staleReason, pidAlive, DEFAULTS } from './ingressLock.mjs';

const ROOT = process.env.INGRESS_LOCK_TEST_DIR || path.join(process.env.TEMP || '.', 'ingress-lock-tests');
fs.mkdirSync(ROOT, { recursive: true });
let n = 0;
const fresh = () => { const d = path.join(ROOT, `t${process.pid}-${++n}`); fs.mkdirSync(d, { recursive: true }); return { dir: d, lock: path.join(d, 'ingress.lock') }; };
const deadPid = () => { const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']); return Number(r.stdout.toString()); };
const quiet = { onReclaim: () => {} };

test('a normal acquire and release leaves no lock file and returns the action result', () => {
  const { lock } = fresh();
  assert.equal(createWithLock(lock, quiet)(() => 42), 42);
  assert.equal(fs.existsSync(lock), false);
});

test('the 2026-11-12 incident: a dead holder with an old lock is reclaimed and the action runs', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, `${deadPid()}\n${Date.now() - 10_000}`);
  const seen = [];
  assert.equal(createWithLock(lock, { onReclaim: (i) => seen.push(i.reason) })(() => 'ok'), 'ok');
  assert.deepEqual(seen, ['DEAD_HOLDER']);
  assert.equal(fs.existsSync(lock), false);
});

test('a dead holder is NOT reclaimed while the lock is younger than staleAfterMs', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, `${deadPid()}\n${Date.now()}`);
  assert.throws(() => createWithLock(lock, { staleAfterMs: 5000, waitMs: 120, ...quiet })(() => 1), /Could not acquire ingress lock/);
  assert.equal(fs.existsSync(lock), true, 'young lock untouched');
});

test('a live holder with a normal-aged lock is never reclaimed; the error names the holder', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, `${process.pid}\n${Date.now() - 1000}`);
  assert.throws(() => createWithLock(lock, { staleAfterMs: 50, maxHoldMs: 60_000, waitMs: 150, ...quiet })(() => 1), new RegExp(`held by pid ${process.pid}`));
  assert.equal(fs.existsSync(lock), true);
});

test('a live pid older than the ceiling (pid reuse) is reclaimed', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, `${process.pid}\n${Date.now() - 120_000}`);
  const seen = [];
  createWithLock(lock, { onReclaim: (i) => seen.push(i.reason) })(() => 1);
  assert.deepEqual(seen, ['AGE_CEILING']);
});

test('an empty or garbled lock is reclaimed only once it is old enough', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, '');
  assert.throws(() => createWithLock(lock, { staleAfterMs: 5000, waitMs: 100, ...quiet })(() => 1));
  assert.equal(fs.existsSync(lock), true, 'fresh empty lock (a writer mid-write) is left alone');
  const old = new Date(Date.now() - 10_000); fs.utimesSync(lock, old, old);
  const seen = [];
  createWithLock(lock, { staleAfterMs: 5000, onReclaim: (i) => seen.push(i.reason) })(() => 1);
  assert.deepEqual(seen, ['UNREADABLE']);
});

test('release removes only our own lock', () => {
  const { lock } = fresh();
  createWithLock(lock, quiet)(() => { fs.unlinkSync(lock); fs.writeFileSync(lock, `${deadPid()}\n${Date.now()}`); });
  assert.equal(fs.existsSync(lock), true, "someone else's lock was not deleted by our release");
});

test('an action that throws releases the lock and the error propagates', () => {
  const { lock } = fresh();
  assert.throws(() => createWithLock(lock, quiet)(() => { throw new Error('boom'); }), /boom/);
  assert.equal(fs.existsSync(lock), false);
});

test('a fresh reap file blocks reclaiming (serialization); a stale reap file is cleared', () => {
  const { lock } = fresh();
  fs.writeFileSync(lock, `${deadPid()}\n${Date.now() - 10_000}`);
  fs.writeFileSync(`${lock}.reap`, 'other reaper');
  assert.throws(() => createWithLock(lock, { waitMs: 100, reapStaleMs: 60_000, ...quiet })(() => 1), /Could not acquire/);
  assert.equal(fs.existsSync(lock), true, 'not removed while another reaper is active');
  const old = new Date(Date.now() - 10_000); fs.utimesSync(`${lock}.reap`, old, old);
  assert.equal(createWithLock(lock, { waitMs: 400, reapStaleMs: 5000, ...quiet })(() => 'ok'), 'ok');
  assert.equal(fs.existsSync(`${lock}.reap`), false);
});

test('staleReason is a pure function of age, pid and liveness', () => {
  const o = DEFAULTS; const now = 1_000_000;
  assert.equal(staleReason({ pid: 1, ts: now - 100, mtime: 0, raw: '' }, now, o, () => false), null);
  assert.equal(staleReason({ pid: 1, ts: now - 5000, mtime: 0, raw: '' }, now, o, () => false), 'DEAD_HOLDER');
  assert.equal(staleReason({ pid: 1, ts: now - 5000, mtime: 0, raw: '' }, now, o, () => true), null);
  assert.equal(staleReason({ pid: 1, ts: now - 31_000, mtime: 0, raw: '' }, now, o, () => true), 'AGE_CEILING');
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(deadPid()), false);
});

test('stress: 4 processes x 60 increments under the lock, with a dead lock planted first, lose nothing', async () => {
  const { dir, lock } = fresh();
  const counter = path.join(dir, 'counter.txt'); fs.writeFileSync(counter, '0');
  fs.writeFileSync(lock, `${deadPid()}\n${Date.now() - 60_000}`);
  const child = `
    import fs from 'node:fs';
    import { createWithLock } from ${JSON.stringify(new URL('./ingressLock.mjs', import.meta.url).href)};
    const w = createWithLock(${JSON.stringify(lock)}, { onReclaim: () => {}, waitMs: 20000 });
    for (let i = 0; i < 60; i++) w(() => { fs.writeFileSync(${JSON.stringify(counter)}, String(Number(fs.readFileSync(${JSON.stringify(counter)}, 'utf8')) + 1)); });`;
  const run = () => new Promise((res) => { const p = spawn(process.execPath, ['--input-type=module', '-e', child], { stdio: 'inherit' }); p.on('exit', res); });
  const codes = await Promise.all([run(), run(), run(), run()]);
  assert.deepEqual(codes, [0, 0, 0, 0]);
  assert.equal(fs.readFileSync(counter, 'utf8'), '240', 'no lost update, no double entry');
  assert.equal(fs.existsSync(lock), false);
});
