// Structured routing targets (COMMS-ROUTING-20261110 phase 1, Room #18737).
//
// WHO a Room action is for is decided here from STRUCTURED metadata only:
//
//   1. metadata.routing = { schema: 'starq.routing/1', targets: [ { handle, role?, instance?, backend? } ] }
//      Exact, validated recipients. `handle` may be an alias (resolved to the
//      canonical handle through the identity registry); `role`, `instance` and
//      `backend` are exact strings, never prefixes or substrings.
//   2. Otherwise, the @handles named in the structured `actionRequired` field
//      (ROOM-PROTO-1 owner attribution). These are UNQUALIFIED handle targets:
//      they resolve to the handle's documented default seat or HOLD.
//
// The message BODY is never read for routing. Quoted or forwarded mentions, a
// "[FLOOR·pane]" subject tag, partial UUIDs, pane suffixes and cwd substrings
// have no routing meaning. A record with an outstanding action but no named
// owner is a no-op for delivery (reason UNADDRESSED), not a broadcast.
//
// Pure module: no I/O beyond the identity registry lookup.

import { isOutstandingAction, actionRequiredOwners } from './authorityPolicy.mjs';
import { resolveIdentity } from './identityProvider.mjs';

export const ROUTING_SCHEMA = 'starq.routing/1';

const ROLE_RE = /^[a-z][a-z0-9-]{1,47}$/;
const BACKEND_RE = /^[a-z][a-z0-9-]{0,23}\/[a-z0-9][a-z0-9_-]{0,47}$/;
const INSTANCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{3,127}$/;
const TARGET_KEYS = new Set(['handle', 'role', 'instance', 'backend']);
// `@thread:<id>` is a Room reference qualifier used in actionRequired text,
// not an agent recipient. Other unknown owner handles must fail closed.
const NON_RECIPIENT_OWNER_TOKENS = new Set(['thread']);

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Alias or handle -> canonical handle of an ACTIVE identity, else null. */
export function canonicalHandle(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const ident = resolveIdentity(input.trim().replace(/^@/, '').toLowerCase());
  if (!ident || ident.status !== 'active') return null;
  return String(ident.canonicalHandle).toLowerCase();
}

/** The real sender instance recorded on the event (exact string), or null. */
export function senderInstanceOf(record) {
  const v = record?.event?.metadata?.senderInstanceId ?? record?.metadata?.senderInstanceId ?? null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Validate one structured target. Returns { ok, target, errors }. */
export function validateTarget(raw) {
  const errors = [];
  if (!isRecord(raw)) return { ok: false, target: null, errors: ['target must be an object'] };
  for (const k of Object.keys(raw)) if (!TARGET_KEYS.has(k)) errors.push(`unknown target field "${k}"`);
  const handle = canonicalHandle(raw.handle);
  if (!handle) errors.push(`handle "${raw.handle}" is not an active registered identity or alias`);
  const out = { handle, role: null, instance: null, backend: null };
  if (raw.role !== undefined && raw.role !== null) {
    if (typeof raw.role !== 'string' || !ROLE_RE.test(raw.role)) errors.push('role must match ' + ROLE_RE);
    else out.role = raw.role;
  }
  if (raw.instance !== undefined && raw.instance !== null) {
    if (typeof raw.instance !== 'string' || !INSTANCE_RE.test(raw.instance)) errors.push('instance must be an exact instance id');
    else out.instance = raw.instance;
  }
  if (raw.backend !== undefined && raw.backend !== null) {
    if (typeof raw.backend !== 'string' || !BACKEND_RE.test(raw.backend)) errors.push('backend must be "<host>/<herdr-session>"');
    else out.backend = raw.backend;
  }
  return { ok: errors.length === 0, target: errors.length ? null : out, errors };
}

/** Stable identity of a target within one event (used in hold keys). */
export function targetKey(t) {
  return [t.handle, t.role ? `role=${t.role}` : '', t.instance ? `instance=${t.instance}` : '', t.backend ? `backend=${t.backend}` : '']
    .filter(Boolean).join('|');
}

/**
 * Decide the recipients of a Room record.
 *
 * @returns {{
 *   actionable: boolean,      // false => nothing to deliver, see `reason`
 *   reason: string,           // NOT_OUTSTANDING | UNADDRESSED | STRUCTURED | ACTION_REQUIRED_OWNERS | INVALID_ROUTING | BROADCAST_NOT_ROUTED
 *   source: 'structured'|'action-required-owners'|null,
 *   targets: Array<{handle, role, instance, backend}>,
 *   invalid: Array<{raw, errors}>,   // any entry here => the whole record HOLDs
 *   ignoredOwners: string[],         // recognized non-recipient tokens in actionRequired
 * }}
 */
export function recipientsFor(record) {
  const base = { actionable: false, reason: 'NOT_OUTSTANDING', source: null, targets: [], invalid: [], ignoredOwners: [] };
  if (!isOutstandingAction(record, null)) return base;

  const md = record?.event?.metadata || record?.metadata || {};

  if (md.routing !== undefined && md.routing !== null) {
    const r = md.routing;
    if (!isRecord(r) || r.schema !== ROUTING_SCHEMA || !Array.isArray(r.targets) || r.targets.length === 0) {
      return { ...base, actionable: true, reason: 'INVALID_ROUTING', source: 'structured',
        invalid: [{ raw: r, errors: [`metadata.routing must be { schema: "${ROUTING_SCHEMA}", targets: [..] } with at least one target`] }] };
    }
    const targets = []; const invalid = []; const seen = new Set();
    for (const raw of r.targets) {
      const v = validateTarget(raw);
      if (!v.ok) { invalid.push({ raw, errors: v.errors }); continue; }
      const k = targetKey(v.target);
      if (!seen.has(k)) { seen.add(k); targets.push(v.target); }
    }
    return { ...base, actionable: true, reason: invalid.length ? 'INVALID_ROUTING' : 'STRUCTURED', source: 'structured', targets, invalid };
  }

  const owners = actionRequiredOwners(record);
  if (owners.includes('all')) return { ...base, actionable: true, reason: 'BROADCAST_NOT_ROUTED', source: 'action-required-owners' };
  const targets = []; const ignoredOwners = []; const unresolvedOwners = []; const seen = new Set();
  for (const o of owners) {
    const handle = canonicalHandle(o);
    if (!handle) {
      if (NON_RECIPIENT_OWNER_TOKENS.has(o)) ignoredOwners.push(o);
      else unresolvedOwners.push(o);
      continue;
    }
    if (!seen.has(handle)) { seen.add(handle); targets.push({ handle, role: null, instance: null, backend: null }); }
  }
  if (unresolvedOwners.length) {
    return { ...base, actionable: true, reason: 'INVALID_ROUTING', source: 'action-required-owners',
      invalid: unresolvedOwners.map((owner) => ({ raw: owner, errors: [`actionRequired owner "@${owner}" is not an active registered identity`] })),
      ignoredOwners };
  }
  if (targets.length === 0) return { ...base, reason: 'UNADDRESSED', ignoredOwners };
  return { ...base, actionable: true, reason: 'ACTION_REQUIRED_OWNERS', source: 'action-required-owners', targets, ignoredOwners };
}
