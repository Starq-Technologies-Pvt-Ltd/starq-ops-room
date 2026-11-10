// Seat table + exact backend-qualified binding (COMMS-ROUTING-20261110 phase 1).
//
// A SEAT is one concrete agent session that Room actions can be delivered to.
// It is described by DATA (a versioned seat table), never inferred from a pane
// label, a cwd substring or Herdr's `agent_session` value:
//
//   {
//     schema: 'starq.seats/1',
//     backends: [ { key: 'windows/default', bin, args?, session?, delivery: 'verified'|'unverified' } ],
//     seats: [ {
//       seatId,            unique, human-readable ('ops-room-deputy')
//       handle,            canonical Room handle
//       instance,          the EXACT Room --instance id the seat posts with (unique)
//       roles: [..],       exact role names routable to this seat
//       default: bool,     the ONE seat that receives unqualified @handle actions
//       backend,           'host/herdr-session', must exist in `backends`
//       pane,              full pane id on that backend ('w3:p1')
//       herdrAgent,        Herdr's agent-kind label for the pane ('claude', 'agy')
//       pid,               foreground harness process id on that backend
//       cwd,               exact working directory
//       herdrAgentSession, optional; checked only when present. Herdr's value is
//                          NOT a Room identity and can be stale (Room #18734).
//       neverWake: bool,   seat is listed for collision awareness but must not be woken
//       evidence,          Room record that verified this binding ('#18733')
//     } ]
//   }
//
// Before EVERY delivery and retry the seat is re-verified against live
// discovery of its own backend. Anything that does not match exactly is a HOLD.
//
// Pure module: callers supply discovery results.

export const SEAT_SCHEMA = 'starq.seats/1';

const lc = (v) => String(v ?? '').trim().toLowerCase();

/** Compare working directories exactly, tolerating only separator/case/trailing-slash form. */
export function normalizeCwd(p) {
  let s = String(p ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[a-z]:\//i.test(s)) s = s.toLowerCase(); // Windows paths are case-insensitive
  return s;
}

export function validateSeatTable(table) {
  const errors = [];
  if (!table || typeof table !== 'object') return { ok: false, errors: ['seat table must be an object'] };
  if (table.schema !== SEAT_SCHEMA) errors.push(`schema must be "${SEAT_SCHEMA}"`);
  const backends = Array.isArray(table.backends) ? table.backends : [];
  const seats = Array.isArray(table.seats) ? table.seats : [];
  if (!backends.length) errors.push('at least one backend is required');
  const backendKeys = new Set();
  for (const b of backends) {
    if (!b || typeof b.key !== 'string' || !/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9_-]*$/.test(b.key)) { errors.push(`backend key invalid: ${JSON.stringify(b?.key)}`); continue; }
    if (backendKeys.has(b.key)) errors.push(`duplicate backend ${b.key}`);
    backendKeys.add(b.key);
    if (typeof b.bin !== 'string' || !b.bin) errors.push(`backend ${b.key}: bin required (absolute path; no PATH lookup)`);
    if (b.args !== undefined && !Array.isArray(b.args)) errors.push(`backend ${b.key}: args must be an array`);
    if (b.delivery !== 'verified' && b.delivery !== 'unverified') errors.push(`backend ${b.key}: delivery must be "verified" or "unverified"`);
  }
  const seatIds = new Set(); const instances = new Set(); const defaults = new Map(); const panes = new Set();
  for (const s of seats) {
    const id = s?.seatId;
    if (typeof id !== 'string' || !id) { errors.push('seat without seatId'); continue; }
    if (seatIds.has(id)) errors.push(`duplicate seatId ${id}`);
    seatIds.add(id);
    for (const f of ['handle', 'instance', 'backend', 'pane', 'herdrAgent', 'cwd']) {
      if (typeof s[f] !== 'string' || !s[f].trim()) errors.push(`seat ${id}: ${f} required`);
    }
    if (!Number.isInteger(s.pid) || s.pid <= 0) errors.push(`seat ${id}: pid must be a positive integer`);
    if (!Array.isArray(s.roles) || s.roles.some((r) => typeof r !== 'string' || !r)) errors.push(`seat ${id}: roles must be an array of strings`);
    if (typeof s.pane === 'string' && !/^w[0-9a-z]+:p[0-9a-z]+$/i.test(s.pane)) errors.push(`seat ${id}: pane must be a full pane id like w3:p1`);
    if (s.backend && !backendKeys.has(s.backend)) errors.push(`seat ${id}: backend ${s.backend} is not declared`);
    if (s.instance) { if (instances.has(s.instance)) errors.push(`duplicate instance ${s.instance}`); instances.add(s.instance); }
    if (s.enrollmentSeq !== undefined && (!Number.isInteger(s.enrollmentSeq) || s.enrollmentSeq <= 0)) errors.push(`seat ${id}: enrollmentSeq must be a positive Room sequence`);
    const paneKey = `${s.backend}::${lc(s.pane)}`;
    if (panes.has(paneKey)) errors.push(`two seats claim ${paneKey}`);
    panes.add(paneKey);
    if (s.default === true) {
      const h = lc(s.handle);
      if (defaults.has(h)) errors.push(`handle ${h} has more than one default seat (${defaults.get(h)}, ${id})`);
      defaults.set(h, id);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Resolve one validated target to seat(s) using exact matches only.
 * @returns {{ seats: object[], hold: null|{reason, candidates: string[]}, self: string[] }}
 */
export function resolveTarget(target, table, senderInstance = null) {
  const seats = (table?.seats || []).filter((s) => lc(s.handle) === lc(target.handle));

  // CONJUNCTION: every selector the target supplies must match the SAME seat.
  // No selector is privileged over another. Each selector is evaluated on its
  // own first so the hold reason says which one failed; if each matches some
  // seat but no single seat satisfies all of them, the target contradicts
  // itself and HOLDs (e.g. role ops-room-deputy + the ERP seat's instance must
  // reach neither seat).
  const selectors = [];
  if (target.instance) selectors.push({ reason: 'INSTANCE_NOT_IN_SEAT_TABLE', test: (s) => s.instance === target.instance });
  if (target.role) selectors.push({ reason: 'NO_SEAT_FOR_ROLE', test: (s) => (s.roles || []).includes(target.role) });
  if (!target.instance && !target.role) selectors.push({ reason: 'NO_DEFAULT_SEAT', test: (s) => s.default === true });
  if (target.backend) selectors.push({ reason: 'NO_SEAT_ON_BACKEND', test: (s) => s.backend === target.backend });

  let matched = seats;
  let emptyReason = null;
  for (const sel of selectors) {
    const own = seats.filter(sel.test);
    if (own.length === 0) { matched = []; emptyReason = sel.reason; break; }
  }
  if (!emptyReason) {
    matched = seats.filter((s) => selectors.every((sel) => sel.test(s)));
    if (matched.length === 0) {
      const partial = seats.filter((s) => selectors.some((sel) => sel.test(s))).map((s) => s.seatId);
      return { seats: [], hold: { reason: 'CONTRADICTORY_TARGET', candidates: partial }, self: [] };
    }
  }

  // Never deliver a seat its own post.
  const self = senderInstance ? matched.filter((s) => s.instance === senderInstance).map((s) => s.seatId) : [];
  matched = senderInstance ? matched.filter((s) => s.instance !== senderInstance) : matched;

  if (matched.length === 0) {
    if (self.length) return { seats: [], hold: null, self };
    return { seats: [], hold: { reason: emptyReason, candidates: seats.map((s) => s.seatId) }, self };
  }
  if (matched.length > 1) {
    // One target names exactly one seat. Several recipients = several targets.
    return { seats: [], hold: { reason: target.role ? 'AMBIGUOUS_ROLE' : 'AMBIGUOUS_TARGET', candidates: matched.map((s) => s.seatId) }, self };
  }
  return { seats: matched, hold: null, self };
}

/**
 * Verify a seat against live discovery of ITS backend, immediately before delivery.
 *
 * @param seat    seat table entry
 * @param backend backend table entry (or undefined)
 * @param source  discovery result for that backend: { ok, agents, reason } (or undefined)
 * @param processInfo  `herdr pane process-info` result for seat.pane on that backend, or null
 * @returns {{ ok: boolean, reason: string|null, detail: string|null }}
 */
export function verifySeatBinding(seat, backend, source, processInfo) {
  const hold = (reason, detail = null) => ({ ok: false, reason, detail });
  if (seat.neverWake === true) return hold('SEAT_NEVER_WAKE');
  if (!backend) return hold('BACKEND_NOT_CONFIGURED', seat.backend);
  if (!source) return hold('SOURCE_NOT_DISCOVERED', seat.backend);
  if (!source.ok) return hold('SOURCE_UNAVAILABLE', String(source.reason || '').slice(0, 200));
  if (backend.delivery !== 'verified') return hold('BACKEND_DELIVERY_UNVERIFIED', seat.backend);

  const agent = (source.agents || []).find((a) => lc(a.pane_id) === lc(seat.pane));
  if (!agent) return hold('PANE_NOT_FOUND', `${seat.backend} ${seat.pane}`);
  if (lc(agent.agent) !== lc(seat.herdrAgent)) return hold('AGENT_MISMATCH', `pane runs "${agent.agent}", seat expects "${seat.herdrAgent}"`);
  if (normalizeCwd(agent.cwd) !== normalizeCwd(seat.cwd)) return hold('CWD_MISMATCH', `pane cwd "${agent.cwd}"`);
  if (seat.herdrAgentSession) {
    const live = agent.agent_session?.value ?? null;
    if (live !== seat.herdrAgentSession) return hold('SESSION_MISMATCH', `herdr agent_session "${live}"`);
  }
  if (lc(agent.agent_status) === 'blocked') return hold('AGENT_BLOCKED');

  if (!processInfo) return hold('PID_UNVERIFIED', 'no process-info for pane');
  if (lc(processInfo.pane_id) !== lc(seat.pane)) return hold('PID_UNVERIFIED', 'process-info is for a different pane');
  const pids = (processInfo.foreground_processes || []).map((p) => p.pid);
  if (!pids.includes(seat.pid)) return hold('PID_MISMATCH', `foreground pids [${pids.join(',')}], seat expects ${seat.pid}`);
  return { ok: true, reason: null, detail: null };
}

/**
 * Enrollment evidence: a seat is deliverable only if the Room itself holds the
 * record the seat table cites (`enrollmentSeq`) and that record was posted by
 * this seat's canonical handle with this seat's EXACT instance id. The seat
 * table alone is an operator's claim; this ties it to a post only that session
 * could have attributed to itself. Fail closed: no citation, a missing record
 * or any mismatch is a HOLD. This complements, and never replaces, the live
 * pane/pid binding check below.
 *
 * @param seat        seat table entry
 * @param recordBySeq Map<brokerSequence, brokerRecord> from the current Room snapshot
 * @param canonical   handle -> canonical handle resolver (identity registry)
 */
export function verifySeatEnrollment(seat, recordBySeq, canonical = (h) => lc(h)) {
  const hold = (reason, detail = null) => ({ ok: false, reason, detail });
  if (!Number.isInteger(seat.enrollmentSeq) || seat.enrollmentSeq <= 0) return hold('INSTANCE_NOT_ENROLLED', 'seat cites no enrollment record');
  const rec = recordBySeq?.get(seat.enrollmentSeq);
  if (!rec) return hold('ENROLLMENT_RECORD_NOT_FOUND', `Room #${seat.enrollmentSeq}`);
  const sender = canonical(rec.event?.senderHandle);
  const instance = rec.event?.metadata?.senderInstanceId ?? null;
  if (!sender || sender !== lc(seat.handle)) return hold('ENROLLMENT_EVIDENCE_MISMATCH', `Room #${seat.enrollmentSeq} was posted by "${rec.event?.senderHandle}"`);
  if (instance !== seat.instance) return hold('ENROLLMENT_EVIDENCE_MISMATCH', `Room #${seat.enrollmentSeq} carries instance "${instance}"`);
  return { ok: true, reason: null, detail: null };
}

/** Hold reasons that a later poll can clear without a new Room event. */
export const RECOVERABLE_HOLDS = new Set([
  'SOURCE_UNAVAILABLE', 'SOURCE_NOT_DISCOVERED', 'PANE_NOT_FOUND', 'AGENT_MISMATCH', 'CWD_MISMATCH',
  'SESSION_MISMATCH', 'AGENT_BLOCKED', 'PID_UNVERIFIED', 'PID_MISMATCH',
  'BACKEND_NOT_CONFIGURED', 'BACKEND_DELIVERY_UNVERIFIED', 'SEAT_NEVER_WAKE',
  'INSTANCE_NOT_ENROLLED', 'ENROLLMENT_RECORD_NOT_FOUND', 'ENROLLMENT_EVIDENCE_MISMATCH',
  'INSTANCE_NOT_IN_SEAT_TABLE', 'NO_SEAT_FOR_ROLE', 'NO_DEFAULT_SEAT', 'NO_SEAT_ON_BACKEND', 'AMBIGUOUS_ROLE', 'AMBIGUOUS_TARGET',
  // CONTRADICTORY_TARGET is deliberately absent: the event itself is wrong and
  // only a corrected Room event can fix it.
]);
