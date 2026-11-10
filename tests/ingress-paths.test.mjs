import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { resolveIngressPaths } from '../protocol/v1/ingressPaths.mjs';

test('default ingress paths remain byte-for-byte rooted at the canonical Room directory', () => {
  const rootDir = path.resolve('canonical-agent-comms');
  assert.deepEqual(resolveIngressPaths({ rootDir, env: {} }), {
    roomFile: path.join(rootDir, 'room.jsonl'),
    lockFile: path.join(rootDir, 'locks', 'ingress.lock'),
    inboxDir: path.join(rootDir, 'inbox'),
  });
});

test('COMMS_ROOM_PATH confines Room, lock and inbox paths beneath its isolated test directory', () => {
  const tempRoot = path.join(os.tmpdir(), 'starq-comms-isolated');
  const roomFile = path.join(tempRoot, 'room.jsonl');
  const paths = resolveIngressPaths({ rootDir: path.join(tempRoot, 'canonical'), env: { COMMS_ROOM_PATH: roomFile } });
  assert.deepEqual(paths, {
    roomFile,
    lockFile: path.join(tempRoot, 'locks', 'ingress.lock'),
    inboxDir: path.join(tempRoot, 'inbox'),
  });
  for (const value of Object.values(paths)) {
    assert.equal(path.relative(tempRoot, value).startsWith('..'), false);
  }
});

test('COMMS_ROOM_PATH refuses relative paths and paths beside the canonical Room', () => {
  const rootDir = path.resolve('canonical-agent-comms');
  assert.throws(() => resolveIngressPaths({ rootDir, env: { COMMS_ROOM_PATH: 'room.jsonl' } }), /absolute path/);
  assert.throws(() => resolveIngressPaths({ rootDir, env: { COMMS_ROOM_PATH: path.join(rootDir, 'other.jsonl') } }), /separate isolated directory/);
});
