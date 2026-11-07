// Seat-aware delivery routing (shared-identity fix, Founder directive 2026-11-07)
//
// THE PROBLEM
// -----------
// One canonical handle (e.g. @claude) can be held by several concurrent SEATS at
// once — Cloudroom primary, Windows Herdr Elder, WSL Claude — via the --shared
// lease model (see identityLease.mjs). A Room event addressed to @claude would
// otherwise wake EVERY seat's watcher, even when the work belongs to one specific
// session/role. The Founder requirement: "A Room event must not wake every Claude
// session merely because they share @claude. Delivery must respect the intended
// recipient, session, role and action ownership."
//
// THE MODEL (additive, reversible, verb-free)
// -------------------------------------------
// Classification authority stays with ROOM-PROTO-1 (authorityPolicy.mjs):
//   isOutstandingAction(record, handle)  — is there an action for this handle?
//   isActionAddressedTo(record, handle)  — is the handle a named owner (not a cc)?
// Seat routing adds ONE more question on top: of the live seats sharing the
// handle, which one(s) should this particular event wake?
//
// A SEAT is a concrete session bound to a handle, described to this module as:
//   { handle, seatId, role, isDefault }
//     handle    canonical handle the seat runs as (e.g. 'claude')
//     seatId    stable id for the session/seat (e.g. 'herdr-elder', 'wsl', a lease instanceId)
//     role      optional role label (e.g. 'floor', 'coordinator', 'builder-wsl')
//     isDefault true for the ONE seat that receives UNQUALIFIED @handle actions
//               (so N shared seats do not all wake). Every other seat opts in by
//               being explicitly targeted.
//
// SEAT TARGETING SYNTAX (backward compatible with the broker's mention parser,
// which matches /@[a-zA-Z0-9_-]+/ and therefore stops at the first non-word char):
//   @claude            -> addresses the handle, UNQUALIFIED -> only the default seat
//   @claude#herdr      -> targets seatId 'herdr' (or role 'herdr')
//   @claude:floor      -> targets role 'floor' (or seatId 'floor')
//   @claude#wsl @claude#elder -> targets several seats
// The '#'/':' qualifier is extra text to the broker (still routes to @claude), so
// nothing about existing delivery or audience evaluation changes. Seat routing is
// a pure read-layer refinement used by watchers.

import { isOutstandingAction, isActionAddressedTo } from './authorityPolicy.mjs';

/**
 * Extract seat qualifiers for a given handle from a record's actionRequired text
 * (and, as a fallback, its body). Returns a lowercased, de-duped list of the
 * qualifier tokens that follow `@handle#` or `@handle:`.
 *
 *   "@claude#herdr review" with handle 'claude' -> ['herdr']
 *   "@claude:floor and @claude#wsl"             -> ['floor', 'wsl']
 *   "@claude review"                            -> []   (unqualified)
 */
export function seatTargetsFor(record, handle) {
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  if (!h) return [];
  const metadata = record?.event?.metadata || record?.metadata || {};
  const ar = metadata?.actionRequired ?? record?.actionRequired ?? '';
  const body = record?.event?.body ?? record?.body ?? '';
  const text = `${ar}\n${body}`;
  // Match @handle immediately followed by a # or : qualifier of word chars.
  const re = new RegExp(`@${h.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[#:]([a-z0-9_-]+)`, 'ig');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const token = m[1].toLowerCase();
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * Whether the given SEAT should be woken for this record.
 *
 * Precedence:
 *   1. Must be a genuine, addressed action for the handle (ROOM-PROTO-1). If not,
 *      no seat wakes. This folds in NONE/ACK/cc suppression.
 *   2. If the event names specific seat qualifiers for the handle, wake only the
 *      seat(s) whose seatId or role matches one of them.
 *   3. If the event is UNQUALIFIED (@handle with no #/: target), wake only the
 *      seat marked isDefault. Non-default seats suppress — this is the "don't
 *      wake every @claude" guarantee.
 *
 * Backward compatibility: a deployment with exactly one seat marked isDefault and
 * no seat qualifiers in traffic behaves identically to pre-seat-routing (that one
 * seat wakes on every addressed @handle action).
 */
export function shouldWakeSeat(record, seat) {
  if (!seat || !seat.handle) return false;
  const handle = String(seat.handle).replace(/^@/, '').toLowerCase();

  // 1. ROOM-PROTO-1 gate: a real action addressed to this handle.
  if (!isOutstandingAction(record, handle) || !isActionAddressedTo(record, handle)) {
    return false;
  }

  // 2. Seat-qualified targeting.
  const targets = seatTargetsFor(record, handle);
  if (targets.length > 0) {
    const seatId = String(seat.seatId || '').toLowerCase();
    const role = String(seat.role || '').toLowerCase();
    return targets.some((t) => t === seatId || t === role);
  }

  // 3. Unqualified @handle -> only the default seat.
  return Boolean(seat.isDefault);
}

/**
 * Build a seat descriptor from environment, for a watcher to describe itself.
 * Env (all optional; sensible defaults keep single-seat behavior):
 *   COMMS_SEAT_HANDLE  (falls back to the handle argument)
 *   COMMS_SEAT_ID
 *   COMMS_SEAT_ROLE
 *   COMMS_SEAT_DEFAULT ('1'/'true' => this seat receives unqualified @handle actions)
 */
export function seatFromEnv(handle, env = process.env) {
  const flag = String(env.COMMS_SEAT_DEFAULT ?? '').toLowerCase();
  return {
    handle: (env.COMMS_SEAT_HANDLE || handle || '').replace(/^@/, '').toLowerCase(),
    seatId: env.COMMS_SEAT_ID || null,
    role: env.COMMS_SEAT_ROLE || null,
    isDefault: flag === '1' || flag === 'true' || flag === 'yes',
  };
}
