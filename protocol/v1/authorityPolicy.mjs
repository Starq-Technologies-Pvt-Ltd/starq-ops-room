import { resolveIdentity, resolveAuthorityIdentity, isFounderAuthority, isRootGenesis, FOUNDER_AUTHORITY_ID } from './identityProvider.mjs';

// The WSL relay-operator seat that may carry a delegated Founder event.
// `deadpool` is canonical; `hermes` is its legacy runtime handle. Both live on
// the same registry record, so they are matched by canonical handle rather
// than by the two raw strings this list would otherwise have to enumerate.
const RELAY_SEAT_AUTHORITY_IDS = ['deadpool', 'hermes'];

/**
 * Evaluates delivery type and authority based on sender and mentions.
 * Invariant: Visibility != Authority.
 *
 * Two grants produce ACTION_REQUIRED, and nothing else does:
 *
 *   1. Founder authority (ROOT_GENESIS, or Hermes delegating for the Founder)
 *      — directed mentions AND @all broadcasts.
 *   2. Lane dispatch (active CORE_AGENT seats) — DIRECTED mentions only.
 *      A non-Founder @all broadcast stays CC_CONTEXT: the loudest channel on
 *      the bus remains reserved to the Founder.
 *
 * Grant 2 added 2026-09-13 under Founder ruling on the Elder escalation that
 * followed Room seq 3822. Before it, only ROOT_GENESIS could ever produce
 * ACTION_REQUIRED, and herdr-dispatcher.mjs refuses to wake any seat on a
 * CC_CONTEXT record — so no agent could wake another agent, and the
 * Founder → Elder → Codex → Cursor → crew chain of Room seq 3709 could not
 * dispatch at all. Every routine assignment needed the Founder to post it
 * personally, which is the dependency seq 3709 set out to remove.
 *
 * Scope limit, stated so it is not mistaken for something stronger: this
 * layer authorises DELIVERY, not lane membership. "Acting inside their lane"
 * is an SOP obligation on the sender and is NOT enforced here — there is no
 * lane model in the protocol to enforce it against. Dispatch remains a
 * delivery mechanism only (seq 3709): it creates no authority, expands no
 * scope, and overrides no Founder gate, role boundary, or no-self-review rule.
 */
/** Return structured canonical recipients; null means legacy routing applies. */
export function structuredRoutingHandles(eventMetadata = {}) {
  const routing = eventMetadata?.routing;
  if (routing === undefined || routing === null) return null;
  if (routing.schema !== 'starq.routing/1' || !Array.isArray(routing.targets)) return [];
  const handles = [];
  for (const target of routing.targets) {
    if (!target || typeof target.handle !== 'string') continue;
    const ident = resolveIdentity(target.handle);
    if (ident?.status === 'active' && !handles.includes(ident.canonicalHandle)) handles.push(ident.canonicalHandle);
  }
  return handles;
}

export function evaluateEventRouting(senderInput, bodyText, explicitMentions = [], eventMetadata = {}) {
  const sender = resolveIdentity(senderInput);
  if (!sender) {
    throw new Error(`Unknown sender identity: ${senderInput}`);
  }

  // Structured targets are authoritative. Body/quoted text and extra caller
  // mentions cannot widen their recipient set. Malformed structured metadata
  // returns an empty set here and is held by the dispatcher.
  const structuredMentions = structuredRoutingHandles(eventMetadata);
  const hasStructuredRouting = structuredMentions !== null;

  // Parse body mentions only for legacy, unstructured Room posts.
  const bodyMentions = [];
  if (!hasStructuredRouting) {
    const mentionMatches = bodyText.match(/@[a-zA-Z0-9_-]+/g) || [];
    for (const m of mentionMatches) {
      const ident = resolveIdentity(m);
      if (ident && !bodyMentions.includes(ident.canonicalHandle)) {
        bodyMentions.push(ident.canonicalHandle);
      }
    }
  }

  // Combine with explicit mentions
  const allMentions = hasStructuredRouting ? structuredMentions : [...new Set([...bodyMentions, ...explicitMentions])];
  const isBroadcast = !hasStructuredRouting && (bodyText.includes('@all') || allMentions.length === 0);

  let deliveryType = 'CC_CONTEXT';
  let authorityReason = 'Standard Transmission';
  let targetAudience = hasStructuredRouting ? allMentions : isBroadcast ? 'ALL' : allMentions;

  // --- Delegation-aware authority ---
  // When the WSL relay operator (canonical seat `deadpool`, legacy runtime
  // handle `hermes`) posts on behalf of the Founder, the event carries
  // Founder-level authority for delivery-type evaluation.
  //
  // Founder identity closure 2026-09-29: `onBehalfOf` is resolved to an
  // AUTHORITY IDENTITY before the ROOT_GENESIS test, so a delegation written
  // with the legacy `ali` handle and one written with the canonical `mustarq`
  // are the same delegation. The relay seat is likewise matched by identity,
  // not by one hardcoded string, so the canonical `deadpool` seat and the
  // legacy `hermes` handle are both recognised.
  const onBehalfOf = eventMetadata.onBehalfOf || null;
  const isDelegated = eventMetadata.delegated === true || (eventMetadata.delegated !== false && onBehalfOf);
  const isHermesDelegating = !!onBehalfOf && isDelegated
    && RELAY_SEAT_AUTHORITY_IDS.includes(sender.canonicalHandle)
    && isFounderAuthority(onBehalfOf);

  if (isRootGenesis(senderInput)) {
    // A Founder broadcast to everyone is not lower urgency than a Founder
    // mention of one agent — it is the loudest thing on the bus. Fixed
    // 2026-09-03: the prior `&& !bodyText.includes('@all')` guard excluded
    // every @all message from ever reaching ACTION_REQUIRED, even from
    // ROOT_GENESIS. Founder ruling (bus seq #507): once corrected, resume.
    if (allMentions.length > 0 || (!hasStructuredRouting && bodyText.includes('@all'))) {
      deliveryType = 'ACTION_REQUIRED';
      authorityReason = 'Founder Directive';
    }
  } else if (isHermesDelegating) {
    // Hermes acting under Founder authority = founder-level routing
    if (allMentions.length > 0 || (!hasStructuredRouting && bodyText.includes('@all'))) {
      deliveryType = 'ACTION_REQUIRED';
      authorityReason = 'Founder Directive (delegated)';
    }
  } else if (sender.authorityLevel === 'CORE_AGENT' && sender.status === 'active') {
    // Lane dispatch. DIRECTED mentions only — `isBroadcast` is deliberately
    // required to be false, so a non-Founder @all cannot wake the whole room.
    // The `status === 'active'` guard means a retired seat (e.g. `nexus`)
    // cannot dispatch even if something calls this policy directly, bypassing
    // the active-identity check in createAuthorEvent().
    if (!isBroadcast && allMentions.length > 0) {
      // ROOM-PROTO-1: Check structured actionRequired and lifecycle state.
      // An ACK or status post with actionRequired: 'NONE' (or 'NONE — ...')
      // routes as CC_CONTEXT so it does not wake recipients or surface as an
      // outstanding action. Mentions are addressing/attribution only.
      const actionReq = eventMetadata?.actionRequired
        ?? eventMetadata?.metadata?.actionRequired
        ?? null;

      if (isNoneActionRequired(actionReq)) {
        deliveryType = 'CC_CONTEXT';
        authorityReason = 'Standard Transmission';
      } else {
        // Genuine directive, or legacy call without structured field (safe default).
        deliveryType = 'ACTION_REQUIRED';
        authorityReason = 'Lane Dispatch';
      }
    }
  }

  return {
    sender,
    mentions: allMentions,
    targetAudience,
    deliveryType,
    // Audit fields: the broker records WHY a wake was granted and at which
    // authority level, so an actuation can always be traced back to the rule
    // that allowed it rather than inferred from the sender handle.
    authorityReason,
    senderAuthorityLevel: sender.authorityLevel || 'UNKNOWN',
    // Expose delegation info for downstream consumers (relay, inbox dispatch).
    //
    // Command-facing authority projection (Founder identity closure): the
    // PRINCIPAL is projected onto its canonical Founder identity, so a relay
    // written as `--on-behalf-of ali` is displayed and compared as the Founder
    // (`founder` / mustarq) rather than carrying the legacy handle downstream.
    // The ledger's stored record still preserves whatever was actually written.
    delegation: isHermesDelegating ? {
      onBehalfOf: onBehalfOf,
      principalAuthorityIdentity: FOUNDER_AUTHORITY_ID,
      principalCanonicalHandle: resolveAuthorityIdentity(onBehalfOf)?.canonicalHandle ?? null,
      delegated: true,
      source: eventMetadata.source || 'nexus-relay',
    } : null,
    // Always present so any Command surface can render one canonical Founder.
    founderAuthorityIdentity: isFounderAuthority(senderInput) ? FOUNDER_AUTHORITY_ID : null,
  };
}

/**
 * Normalizes and checks if an actionRequired field represents 'NONE'.
 * Handles 'NONE', 'none', 'NONE — ...', 'NONE: ...', 'NONE - ...', empty string.
 */
export function isNoneActionRequired(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === '' || normalized === 'NONE' || /^NONE(?:$|[\s:–—-].*)/i.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * View-layer / read-layer derivation of whether a record represents an outstanding action.
 * Used by Room watchers, Telegram gateway, and dashboards.
 *
 * Forward-looking AND retroactive: evaluates historical records without mutating room.jsonl.
 *
 * Rules:
 * 1. If targetAgent is specified, the target cannot be the sender, and must be in the audience (or audience === 'ALL').
 * 2. If actionRequired is explicitly 'NONE' (or empty / 'NONE — ...'), it is NOT an outstanding action.
 * 3. If action is completed/accepted/started lifecycle and actionRequired is NONE, NOT outstanding.
 * 4. If deliveryType === 'ACTION_REQUIRED' and actionRequired is a genuine ask (or legacy record where actionRequired is null), it IS outstanding.
 * 5. Otherwise, NOT outstanding.
 */
export function isOutstandingAction(record, targetAgent = null) {
  if (!record) return false;

  const sender = String(record?.event?.senderHandle || record?.sender || '').replace(/^@/, '').toLowerCase();
  const deliveryType = String(record?.evaluatedDeliveryType || record?.deliveryType || '').toUpperCase();
  const metadata = record?.event?.metadata || record?.metadata || {};
  const actionRequired = metadata?.actionRequired ?? record?.actionRequired ?? null;
  const action = record?.event?.action || record?.action || metadata?.action || null;
  const audience = record?.evaluatedAudience || record?.targetAudience || [];

  // Check target agent filter if supplied
  if (targetAgent) {
    const target = String(targetAgent).replace(/^@/, '').toLowerCase();
    if (sender === target) return false; // Self-mentions cannot be actions on oneself

    const audienceList = Array.isArray(audience)
      ? audience.map(a => String(a).replace(/^@/, '').toLowerCase())
      : [String(audience).replace(/^@/, '').toLowerCase()];

    const isAudience = audienceList.includes('all') || audienceList.includes(target);
    if (!isAudience) return false;
  }

  // 1. Explicit NONE -> never outstanding, regardless of historical deliveryType
  if (isNoneActionRequired(actionRequired)) {
    return false;
  }

  // 2. Completed lifecycle transitions without an active ask are not outstanding
  if (['done', 'accepted'].includes(action) && (actionRequired == null || isNoneActionRequired(actionRequired))) {
    return false;
  }

  // 3. Must be ACTION_REQUIRED route
  if (deliveryType !== 'ACTION_REQUIRED') {
    return false;
  }

  // 4. If actionRequired is present and not NONE -> genuine directive -> outstanding
  if (actionRequired != null && !isNoneActionRequired(actionRequired)) {
    return true;
  }

  // 5. Legacy records without structured actionRequired:
  // If deliveryType === 'ACTION_REQUIRED', preserve backward compatibility as outstanding
  // unless body explicitly contains "Action Required: NONE"
  const body = String(record?.event?.body || record?.body || '');
  if (/Action\s+Required\s*:\s*NONE/i.test(body)) {
    return false;
  }

  return true;
}

/**
 * Canonical owner attribution for a record's structured `actionRequired` text.
 *
 * ROOM-PROTO-1 made structured `actionRequired` the authoritative signal for WHETHER
 * an action is outstanding; this is the companion for WHO it is addressed to, so that
 * a single record can CC one seat while assigning the work to another and each
 * seat's watcher agrees on the owner. Verb-free by design: the earlier per-watcher
 * approaches relied on hand-maintained action-verb allowlists (`selfActionLevel` in
 * the claude-herdr watcher; inline owner logic in room-watch-codex) that were fragile
 * and drifted between seats. Attribution is purely by the `@handle`s named in the
 * `actionRequired` directive.
 *
 * Returns an array of canonical-ish lowercase handles named as owners:
 *   - `[]`            -> no explicit owner named (NONE, empty, or a free-text ask).
 *   - `['all']`       -> addressed to everyone (@all / @everyone / @team).
 *   - `['codex', …]`  -> the specific seats named in the actionRequired text.
 */
export function actionRequiredOwners(record) {
  const metadata = record?.event?.metadata || record?.metadata || {};
  const ar = metadata?.actionRequired ?? record?.actionRequired ?? null;
  if (ar == null || isNoneActionRequired(ar)) return [];
  const text = String(ar);
  if (/@all\b|@everyone\b|@team\b/i.test(text)) return ['all'];
  const owners = (text.match(/@[a-z0-9_-]+/gi) || []).map(h => h.replace(/^@/, '').toLowerCase());
  return [...new Set(owners)];
}

/**
 * Whether a record's action is addressed to `targetAgent`.
 *
 * This is NOT a standalone relevance test — it answers only "is the target among the
 * named owners?". Combine it with `isOutstandingAction(record, targetAgent)` to decide
 * whether to wake a seat: the pair gives "there is an outstanding action AND it is
 * (at least partly) mine".
 *
 * Rules:
 *   - No explicit owner named (free-text ask, or absent structured directive) -> true
 *     (do not suppress; `isOutstandingAction` already gated on delivery + audience).
 *   - `@all` / `@everyone` / `@team` -> true for any target.
 *   - Otherwise -> true only if the target is one of the named owners. A record that
 *     names only other seats (target merely CC'd) -> false.
 */
export function isActionAddressedTo(record, targetAgent = null) {
  if (!targetAgent) return true;
  const target = String(targetAgent).replace(/^@/, '').toLowerCase();
  const owners = actionRequiredOwners(record);
  if (owners.length === 0) return true;
  if (owners.includes('all')) return true;
  return owners.includes(target);
}
