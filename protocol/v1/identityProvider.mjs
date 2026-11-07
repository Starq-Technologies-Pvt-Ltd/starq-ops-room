import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Identity registry path. Production default is the sibling identities.json
// (the live registry under agent-comms/protocol/v1, which is gitignored and
// never committed). COMMS_IDENTITIES_PATH overrides it for test isolation and
// CI — the same seam pattern as COMMS_ROOM_PATH (room.mjs) and setLeasesDir
// (identityLease.mjs). CI points this at tests/fixtures/identities.json (a
// sanitized, non-secret subset) so classification/routing tests run without the
// live registry present. Never used to point production at anything but the
// real registry.
const IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH
  ? (path.isAbsolute(process.env.COMMS_IDENTITIES_PATH)
      ? process.env.COMMS_IDENTITIES_PATH
      : path.resolve(process.cwd(), process.env.COMMS_IDENTITIES_PATH))
  : path.join(__dirname, 'identities.json');

export function loadIdentities() {
  const raw = fs.readFileSync(IDENTITIES_PATH, 'utf8');
  return JSON.parse(raw);
}

export function resolveIdentity(inputHandleOrAlias) {
  if (!inputHandleOrAlias) return null;
  const clean = String(inputHandleOrAlias).trim().toLowerCase().replace(/^@/, '');
  const data = loadIdentities();
  
  for (const identity of data.identities) {
    if (identity.canonicalHandle.toLowerCase() === clean) {
      return identity;
    }
    for (const alias of identity.aliases) {
      if (alias.toLowerCase().replace(/^@/, '') === clean) {
        return identity;
      }
    }
  }
  return null;
}

export function getCanonicalHandle(input) {
  const ident = resolveIdentity(input);
  return ident ? ident.canonicalHandle : null;
}

export function isValidIdentity(input) {
  const ident = resolveIdentity(input);
  return ident !== null && ident.status === 'active';
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL AUTHORITY IDENTITY  (Founder identity closure, 2026-09-29)
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Before this, the Founder existed in identities.json as TWO independent records:
// `ali` and `mustarq`, both ROOT_GENESIS, both active, sharing a displayName.
// resolveIdentity() therefore returned DIFFERENT objects for the two handles,
// and every authority comparison in the system was a raw string compare. That
// made self-review bypassable by typing the other handle: a task built as `ali`
// and reviewed as `mustarq` compared unequal and was treated as INDEPENDENT
// review. The same defect reached pin authority, Founder override evaluation,
// Telegram impersonation checks, and any Command-facing authority projection.
//
// THE DOCTRINE
// ------------
//   canonical operational identity : mustarq
//   display / address              : Founder / Mustarq
//   ali                            : LEGACY / HISTORICAL COMPATIBILITY ONLY
//
// This module is the single place where a handle is collapsed to the identity
// that AUTHORITY comparisons must use. It resolves the registry record, then
// follows `legacyAliasOf` to the one canonical identity in the founder group.
//
// HISTORICAL RECORDS ARE NOT REWRITTEN. This changes only how a handle is
// INTERPRETED at comparison time. A Room event authored by `ali` in 2026-08
// keeps its stored senderHandle forever; it is simply read as the same
// authority identity as `mustarq` when compared. There is no migration, no
// rewrite, and no deletion of historical identity compatibility — the `ali`
// registry entry and all of its aliases remain present and resolvable, so old
// evidence, old leases and old routing still work exactly as before.
//
// Fail-closed by design: an unresolvable handle, or one whose registry record
// is not active, yields no authority identity rather than a permissive guess.
// A failed resolution must never be treated as "not the Founder" (which would
// silently skip Founder gates) NOR as "the Founder" (which would grant them).
// Callers must handle `null` explicitly; see isSameAuthorityIdentity() for the
// comparison that treats null as "cannot prove sameness".
// ─────────────────────────────────────────────────────────────────────────────

export const FOUNDER_AUTHORITY_ID = 'founder';

/**
 * Collapse any handle/alias to the canonical authority identity it belongs to.
 *
 * Returns null when the handle is unknown, or when it resolves to a record that
 * is not active (a retired seat has no authority identity to compare).
 */
export function resolveAuthorityIdentity(input) {
  const ident = resolveIdentity(input);
  if (!ident) return null;
  if (String(ident.status || 'active').toLowerCase() !== 'active') return null;

  // Follow the legacy -> canonical pointer to a FIXED POINT, so a chain such as
  // ali -> mustarq -> mustarq terminates even if a future edit adds a cycle-like
  // link. A cycle is a data error; it resolves to null rather than looping.
  const seen = new Set();
  let cur = ident;
  while (cur && cur.legacyAliasOf) {
    const nextHandle = cur.legacyAliasOf;
    const key = String(nextHandle).toLowerCase();
    if (seen.has(key)) return null;          // data error: alias cycle
    seen.add(key);
    const next = resolveIdentity(nextHandle);
    if (!next) return null;                  // dangling pointer: fail closed
    if (String(next.status || 'active').toLowerCase() !== 'active') return null;
    cur = next;
  }

  return {
    // The stable key every authority comparison must use.
    authorityIdentityId: cur.authorityIdentityId || cur.canonicalHandle,
    canonicalHandle: cur.canonicalHandle,
    displayName: cur.displayName,
    role: cur.role,
    authorityLevel: cur.authorityLevel,
    identityId: cur.identityId,
    // True when the caller used a handle that is NOT the canonical handle.
    // Retained for audit only — it must never weaken a comparison.
    viaLegacyAlias: cur.canonicalHandle !== (ident.canonicalHandle || ''),
    presentedHandle: ident.canonicalHandle,
    record: cur,
  };
}

/**
 * The single authority comparison. True ONLY when both handles provably resolve
 * to the same authority identity. Unknown/unresolvable input returns false,
 * because "cannot prove these are the same" must never read as permission.
 */
export function isSameAuthorityIdentity(a, b) {
  const ra = resolveAuthorityIdentity(a);
  const rb = resolveAuthorityIdentity(b);
  if (!ra || !rb) return false;
  return ra.authorityIdentityId === rb.authorityIdentityId;
}

/** True when this handle carries Founder authority (any founder-group alias). */
export function isFounderAuthority(input) {
  const r = resolveAuthorityIdentity(input);
  return !!r && r.authorityIdentityId === FOUNDER_AUTHORITY_ID;
}

/** True when this handle carries ROOT_GENESIS authority, founder group or not. */
export function isRootGenesis(input) {
  const r = resolveAuthorityIdentity(input);
  return !!r && String(r.authorityLevel || '').toUpperCase() === 'ROOT_GENESIS';
}

/**
 * Founder-facing rendering. New Founder-directed output must use
 * "Mustarq" / "@mustarq" ONLY — never the legacy `ali` handle — while the
 * ledger's historical records are left exactly as they are.
 */
export function founderDisplayHandle() {
  return '@mustarq';
}

export function founderDisplayName() {
  return 'Mustarq';
}
