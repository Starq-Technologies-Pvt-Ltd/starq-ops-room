import path from 'node:path';

/**
 * Resolve ingress files without changing the production layout. A test may set
 * COMMS_ROOM_PATH to an absolute Room file beneath its isolated temp root; its
 * lock and inbox are then siblings beneath that same root. Requiring an
 * explicit absolute path and a separate directory prevents a relative cwd
 * surprise or an override that still writes lock/inbox files beside the
 * canonical Room.
 */
export function resolveIngressPaths({ rootDir, env = process.env } = {}) {
  if (!rootDir) throw new Error('rootDir is required');
  const canonicalRoot = path.resolve(rootDir);
  const canonicalRoomFile = path.join(canonicalRoot, 'room.jsonl');
  const override = env.COMMS_ROOM_PATH;

  if (override == null || override === '') {
    return {
      roomFile: canonicalRoomFile,
      lockFile: path.join(canonicalRoot, 'locks', 'ingress.lock'),
      inboxDir: path.join(canonicalRoot, 'inbox'),
    };
  }

  if (!path.isAbsolute(override)) {
    throw new Error('COMMS_ROOM_PATH must be an absolute path to an isolated test Room file');
  }

  const roomFile = path.resolve(override);
  const testRoot = path.dirname(roomFile);
  const sameDirectory = process.platform === 'win32'
    ? testRoot.toLowerCase() === canonicalRoot.toLowerCase()
    : testRoot === canonicalRoot;
  if (sameDirectory || roomFile === canonicalRoomFile) {
    throw new Error('COMMS_ROOM_PATH must be in a separate isolated directory from the canonical Room');
  }

  return {
    roomFile,
    lockFile: path.join(testRoot, 'locks', 'ingress.lock'),
    inboxDir: path.join(testRoot, 'inbox'),
  };
}
