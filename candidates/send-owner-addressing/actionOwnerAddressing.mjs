// CANDIDATE - not deployed. Room #19053 (owner-only handbacks silently downgraded).
//
// Defect: the broker classifies a record ACTION_REQUIRED only when the BODY contains an
// @handle (authorityPolicy.evaluateEventRouting). A sender that names the owner only in
// --action-required ("codex: review ...") and writes no @handle in the body produces a
// broadcast CC_CONTEXT record: nobody is woken, and send.mjs reports success.
// Seen in Room #19050 and #19051.
//
// Fix, at the sender: owners named in the action-required text are addressed in the body
// too. If the body does not already @mention a registered owner, a one-line
// "To: @owner ..." header is prepended and the sender is told. Content is otherwise
// untouched. Nothing is ever dropped or refused, and a record with no named owner, or with
// action NONE, is unchanged.
//
// Pure and dependency-injected so it can be tested without the live runtime.

const OWNER_LIST = /@?[A-Za-z0-9_-]+(?:#[\w:.-]+)?(?:\s*[\/,]\s*@?[A-Za-z0-9_-]+(?:#[\w:.-]+)?)*/.source;
const FIRST_OWNER = new RegExp('^\\s*(' + OWNER_LIST + ')\\s*:(?!\\/\\/)');
const LATER_OWNER = new RegExp('(?:[.;]\\s+|\\n\\s*)(' + OWNER_LIST + ')\\s*:(?!\\/\\/)', 'g');
const NONE = /^\s*(none|unknown)?\s*(?:$|[\s:\u2013\u2014-])/i;

function splitOwners(list) {
  return String(list).split(/[\/,]/).map((raw) => raw.trim().replace(/^@/, '')).filter(Boolean);
}

/** Owners named by the action-required text: [{ handle, qualifier|null }] in order, unique. */
export function namedOwners(actionRequired, resolveIdentity, senderCanonical = null) {
  const text = String(actionRequired ?? '').trim();
  if (!text || /^none\b/i.test(text) || /^unknown\b/i.test(text)) return [];
  const lists = [];
  const first = text.match(FIRST_OWNER);
  if (first) lists.push(first[1]);
  for (const m of text.matchAll(LATER_OWNER)) lists.push(m[1]);
  const out = [];
  for (const list of lists) {
    for (const token of splitOwners(list)) {
      const [name, qualifier] = token.split('#');
      const lowered = name.toLowerCase();
      const probe = lowered === 'founder' ? 'mustarq' : lowered;
      const ident = resolveIdentity(probe);
      if (!ident || ident.status === 'retired') continue;
      const handle = ident.canonicalHandle;
      if (senderCanonical && handle === senderCanonical) continue;
      if (!out.some((o) => o.handle === handle)) out.push({ handle, qualifier: qualifier || null });
    }
  }
  return out;
}

/**
 * @returns {{ body: string, changed: boolean, added: string[] }}
 *   added = the @recipient tokens that were put in the To: header
 */
export function ensureOwnersAddressed({ body, actionRequired, sender, resolveIdentity }) {
  const text = String(body ?? '');
  const senderIdent = resolveIdentity(String(sender ?? '').replace(/^@/, ''));
  const owners = namedOwners(actionRequired, resolveIdentity, senderIdent?.canonicalHandle ?? null);
  if (owners.length === 0) return { body: text, changed: false, added: [] };

  const mentioned = new Set();
  for (const m of text.match(/@[A-Za-z0-9_-]+/g) || []) {
    const ident = resolveIdentity(m.slice(1));
    if (ident) mentioned.add(ident.canonicalHandle);
  }
  const missing = owners.filter((o) => !mentioned.has(o.handle));
  if (missing.length === 0) return { body: text, changed: false, added: [] };

  const added = missing.map((o) => '@' + o.handle + (o.qualifier ? '#' + o.qualifier : ''));
  return { body: `To: ${added.join(' ')}\n\n${text}`, changed: true, added };
}
