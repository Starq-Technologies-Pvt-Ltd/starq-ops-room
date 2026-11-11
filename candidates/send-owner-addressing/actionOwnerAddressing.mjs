// CANDIDATE - not deployed. Room #19053 (owner-only handbacks silently downgraded).
// Revision 2 after independent review #19061 (seat-qualified recipients).
//
// Defect: the broker classifies a record ACTION_REQUIRED only when the BODY contains an
// @handle (authorityPolicy.evaluateEventRouting). A sender that names the owner only in
// --action-required ("codex: review ...") and writes no @handle in the body produces a
// broadcast CC_CONTEXT record: nobody is woken, and send.mjs reports success.
// Seen in Room #19050 and #19051.
//
// Fix, at the sender: owners named in the action-required text are addressed in the body
// too. If the body does not already address a registered owner, a one-line
// "To: @owner ..." header is prepended and the sender is told. Content is otherwise
// untouched. Nothing is ever dropped or refused, and a record with no named owner, or with
// action NONE, is unchanged.
//
// Seats: an owner is the pair (canonical handle, optional seat qualifier). Two seats of one
// handle ("claude#w3:p1" and "claude#w1:p5") are two owners. A body mention satisfies an
// owner only if it is the same handle and, when the owner names a seat, carries that same
// seat after "#" (case-insensitive). A bare "@claude" or a different seat never satisfies a
// seat-qualified owner; any mention of the handle satisfies an owner with no seat.
//
// Pure and dependency-injected so it can be tested without the live runtime.

const OWNER_LIST = /@?[A-Za-z0-9_-]+(?:#[\w:.-]+)?(?:\s*[\/,]\s*@?[A-Za-z0-9_-]+(?:#[\w:.-]+)?)*/.source;
const FIRST_OWNER = new RegExp('^\\s*(' + OWNER_LIST + ')\\s*:(?!\\/\\/)');
const LATER_OWNER = new RegExp('(?:[.;]\\s+|\\n\\s*)(' + OWNER_LIST + ')\\s*:(?!\\/\\/)', 'g');

function splitOwners(list) {
  return String(list).split(/[\/,]/).map((raw) => raw.trim().replace(/^@/, '')).filter(Boolean);
}

const seatKey = (handle, qualifier) => `${handle}#${String(qualifier || '').toLowerCase()}`;

/** Owners named by the action-required text: [{ handle, qualifier|null }] in order, unique per seat. */
export function namedOwners(actionRequired, resolveIdentity, senderCanonical = null) {
  const text = String(actionRequired ?? '').trim();
  if (!text || /^none\b/i.test(text) || /^unknown\b/i.test(text)) return [];
  const lists = [];
  const first = text.match(FIRST_OWNER);
  if (first) lists.push(first[1]);
  for (const m of text.matchAll(LATER_OWNER)) lists.push(m[1]);
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const token of splitOwners(list)) {
      const hash = token.indexOf('#');
      const name = hash < 0 ? token : token.slice(0, hash);
      const qualifier = hash < 0 ? null : (token.slice(hash + 1).replace(/[.:-]+$/, '') || null);
      const lowered = name.toLowerCase();
      const probe = lowered === 'founder' ? 'mustarq' : lowered;
      const ident = resolveIdentity(probe);
      if (!ident || ident.status === 'retired') continue;
      const handle = ident.canonicalHandle;
      if (senderCanonical && handle === senderCanonical) continue;
      const key = seatKey(handle, qualifier);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ handle, qualifier });
    }
  }
  return out;
}

/** @mentions in a body as [{ handle, qualifier|null }]; only the "#seat" form counts as a seat. */
export function bodyMentions(text, resolveIdentity) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/@([A-Za-z0-9_-]+)(?:#([\w:.-]+))?/g)) {
    const ident = resolveIdentity(m[1]);
    if (!ident) continue;
    const qualifier = m[2] ? (m[2].replace(/[.:-]+$/, '') || null) : null;
    out.push({ handle: ident.canonicalHandle, qualifier });
  }
  return out;
}

const satisfies = (mention, owner) => mention.handle === owner.handle
  && (!owner.qualifier || (mention.qualifier !== null && mention.qualifier.toLowerCase() === owner.qualifier.toLowerCase()));

/**
 * @returns {{ body: string, changed: boolean, added: string[] }}
 *   added = the @recipient tokens that were put in the To: header
 */
export function ensureOwnersAddressed({ body, actionRequired, sender, resolveIdentity }) {
  const text = String(body ?? '');
  const senderIdent = resolveIdentity(String(sender ?? '').replace(/^@/, ''));
  const owners = namedOwners(actionRequired, resolveIdentity, senderIdent?.canonicalHandle ?? null);
  if (owners.length === 0) return { body: text, changed: false, added: [] };

  const mentions = bodyMentions(text, resolveIdentity);
  const missing = owners.filter((o) => !mentions.some((m) => satisfies(m, o)));
  if (missing.length === 0) return { body: text, changed: false, added: [] };

  const added = missing.map((o) => '@' + o.handle + (o.qualifier ? '#' + o.qualifier : ''));
  return { body: `To: ${added.join(' ')}\n\n${text}`, changed: true, added };
}
