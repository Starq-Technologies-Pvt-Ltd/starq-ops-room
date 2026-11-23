import { createHash } from 'node:crypto';

export const SEATS = {
  OPS_VISION: {
    tag: 'OPS_VISION',
    name: 'Ops Room Vision',
    machine: 'local',
    paneId: 'w3:p3',
    address: 'w3:p3',
    role: 'Operations Deputy (Nitro, Hermes Vision; left pane)',
  },
  OPS_AG: {
    tag: 'OPS_AG',
    name: 'Ops Room AG',
    machine: 'local',
    paneId: 'w3:p2',
    address: 'w3:p2',
    role: 'Ops Room Technical Executor (Nitro)',
  },
  ERP_VISION: {
    tag: 'ERP_VISION',
    name: 'ERP Vision',
    machine: 'local',
    paneId: 'w4:p1',
    address: 'w4:p1',
    role: 'StarqERP PM / Orchestrator (Nitro)',
  },
  PICARD: {
    tag: 'PICARD',
    name: 'PICARD',
    machine: 'local',
    paneId: 'w4:p2',
    address: 'w4:p2',
    role: 'StarqERP Principal Engineering Studio (Nitro)',
  },
  HOADHAA_VISION: {
    tag: 'HOADHAA_VISION',
    name: 'Hoadhaa Vision',
    machine: 'local',
    paneId: 'w2:p8',
    address: 'w2:p8',
    role: 'Hoadhaa PM (Nitro)',
  },
  DEADPOOL: {
    tag: 'DEADPOOL',
    name: 'DEADPOOL',
    machine: 'XPS',
    paneId: 'w2:p1',
    address: 'XPS:w2:p1',
    role: 'XPS Commander (XPS)',
  },
  JARVIS: {
    tag: 'JARVIS',
    name: 'JARVIS',
    machine: 'XPS',
    paneId: 'w2:p2',
    address: 'XPS:w2:p2',
    role: 'Hoadhaa XPS Engineering Seat (XPS)',
  },
  XPS_AG: {
    tag: 'XPS_AG',
    name: 'XPS AG',
    machine: 'XPS',
    paneId: 'w2:p3',
    address: 'XPS:w2:p3',
    role: 'Hoadhaa XPS AG Seat (XPS)',
  },
};

export const STEP_ORDER = ['S1', 'S2', 'S3', 'S4'];

export const RUN_STATUS_BY_STEP = {
  S1: 'STEP_1_OPS_INIT',
  S2: 'STEP_2_ERP_LOOP',
  S3: 'STEP_3_HOADHAA_LOOP',
  S4: 'STEP_4_OPS_FINALIZE',
};

export const TIMEOUTS_MS = {
  local: 60_000,
  localChain: 120_000,
  xpsChain: 180_000,
  finalize: 90_000,
};

export const POLL_INTERVALS_MS = {
  local: 3_000,
  xps: 5_000,
};

export const RETRY_POLICY = {
  maxRetries: 1,
  backoffMs: {
    local: 10_000,
    XPS: 20_000,
  },
};

/**
 * Build deterministic handoff_id: <run_id>:<step>:<from>-><to>:<direction>
 */
export function makeHandoffId(runId, step, fromPane, toPane, direction = 'request') {
  return `${runId}:${step}:${fromPane}->${toPane}:${direction}`;
}

/**
 * Deterministic 4-hex nonce from handoff_id so retries expect the exact same token.
 */
export function makeNonce(handoffId) {
  return createHash('sha256').update(handoffId).digest('hex').slice(0, 4);
}

/**
 * Build deterministic ACK token: ACK::<run_id>::<step>::<seat_tag>::<nonce>
 */
export function makeAckToken(runId, step, seatTag, handoffId) {
  return `ACK::${runId}::${step}::${seatTag}::${makeNonce(handoffId)}`;
}

/**
 * Sanitize handoff_id for safe filenames on Windows/POSIX.
 */
export function safeHandoffFilename(handoffId) {
  return handoffId.replace(/[^A-Za-z0-9_.-]/g, '_');
}
