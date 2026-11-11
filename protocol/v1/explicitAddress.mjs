// Strict, opt-in Room address header for ingress adapters.
//
// Only the first line has routing meaning. The message body is never scanned
// for mentions, so quoted/forwarded text cannot wake a seat. An ingress adapter
// must reject !ok results and pass routing to send.mjs as validated metadata.

import { validateRoutingDocument } from './routingInput.mjs';
import { ROUTING_SCHEMA } from './routingTargets.mjs';

const HEADER = /^\/to(?:\s+(.+))?$/i;
const CLAUSE = /^@?([a-z][a-z0-9_-]{0,31})(?:\s+(.+))?$/i;
const SELECTORS = new Set(['role', 'instance', 'backend']);

/**
 * Parse an explicit first-line `/to` header.
 *
 * Syntax: `/to @handle [role=value] [instance=value] [backend=value]; @handle ...`
 * `@mustarq` is a Founder notice, never a Herdr routing target.
 *
 * A non-addressed message is intentionally returned with actionRequired NONE;
 * ingress adapters must not recover recipients by scanning its body.
 */
export function parseExplicitAddress(text) {
  const original = String(text ?? '');
  const newline = original.search(/\r?\n/);
  const firstLine = newline < 0 ? original : original.slice(0, newline);
  const match = HEADER.exec(firstLine);
  if (!match) {
    return {
      ok: true,
      addressed: false,
      routing: null,
      actionRequired: 'NONE',
      founderNotice: false,
      body: original,
      errors: [],
    };
  }

  const errors = [];
  const rawTargets = [];
  let founderNotice = false;
  const recipientList = match[1];
  if (!recipientList) errors.push('address header must name at least one recipient');

  for (const [index, rawClause] of (recipientList || '').split(';').entries()) {
    const clause = rawClause.trim();
    const clauseMatch = CLAUSE.exec(clause);
    if (!clauseMatch) {
      errors.push(`recipient ${index + 1} must be @handle followed by optional role=, instance=, or backend= selectors`);
      continue;
    }

    const handle = clauseMatch[1].toLowerCase();
    const selectors = {};
    const selectorText = clauseMatch[2];
    if (selectorText) {
      for (const token of selectorText.trim().split(/\s+/)) {
        const selector = /^([a-z]+)=(\S+)$/.exec(token);
        if (!selector) {
          errors.push(`recipient ${index + 1} has malformed selector "${token}"`);
          continue;
        }
        const [, key, value] = selector;
        if (!SELECTORS.has(key)) {
          errors.push(`recipient ${index + 1} has unknown selector "${key}"`);
          continue;
        }
        if (Object.hasOwn(selectors, key)) {
          errors.push(`recipient ${index + 1} repeats selector "${key}"`);
          continue;
        }
        selectors[key] = value;
      }
    }

    if (handle === 'mustarq') {
      if (Object.keys(selectors).length) errors.push('Founder notice @mustarq cannot have Herdr seat selectors');
      else founderNotice = true;
      continue;
    }

    rawTargets.push({ handle, ...selectors });
  }

  let routing = null;
  if (rawTargets.length) {
    const validated = validateRoutingDocument({ schema: ROUTING_SCHEMA, targets: rawTargets });
    if (!validated.ok) errors.push(...validated.errors);
    else routing = validated.routing;
  }
  if (!rawTargets.length && !founderNotice && !errors.length) {
    errors.push('address header has no Herdr recipients');
  }

  const body = newline < 0 ? '' : original.slice(newline).replace(/^\r?\n/, '');
  if (errors.length) {
    return { ok: false, addressed: true, routing: null, actionRequired: 'NONE', founderNotice, body, errors };
  }
  return {
    ok: true,
    addressed: true,
    routing,
    actionRequired: routing ? 'Respond to this explicitly addressed Room message' : 'NONE',
    founderNotice,
    body,
    errors: [],
  };
}
