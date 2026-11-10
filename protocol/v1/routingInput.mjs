// Structured routing INPUT for the Room sender (COMMS-ROUTING-20261110 phase 2, Room #18744).
//
// `send.mjs --routing-file <json>` reads one document:
//
//   { "schema": "starq.routing/1",
//     "targets": [ { "handle": "claude", "role": "ops-room-deputy" },
//                  { "handle": "codex" } ] }
//
// The document is validated STRICTLY before anything is published, using the
// same target validator the dispatcher uses (routingTargets.validateTarget).
// What passes is written verbatim-in-meaning to metadata.routing: the handle is
// normalised to its canonical form (an alias such as "elder" becomes "claude")
// and only the selectors the author supplied are kept. Nothing is inferred from
// the message body, the subject or quoted text, and there is no broadcast form.
//
// Pure apart from reading the named file.

import nodeFs from 'node:fs';
import { ROUTING_SCHEMA, validateTarget, targetKey } from './routingTargets.mjs';

export const MAX_ROUTING_TARGETS = 16;

/**
 * Validate a routing document (already parsed).
 * @returns {{ ok: boolean, routing: {schema, targets}|null, errors: string[] }}
 */
export function validateRoutingDocument(doc) {
  const errors = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, routing: null, errors: ['routing document must be a JSON object'] };
  for (const k of Object.keys(doc)) if (k !== 'schema' && k !== 'targets') errors.push(`unknown top-level field "${k}"`);
  if (doc.schema !== ROUTING_SCHEMA) errors.push(`schema must be exactly "${ROUTING_SCHEMA}"`);
  if (!Array.isArray(doc.targets) || doc.targets.length === 0) errors.push('targets must be a non-empty array');
  else if (doc.targets.length > MAX_ROUTING_TARGETS) errors.push(`at most ${MAX_ROUTING_TARGETS} targets`);
  const targets = []; const seen = new Set();
  if (Array.isArray(doc.targets)) {
    doc.targets.forEach((raw, i) => {
      const v = validateTarget(raw);
      if (!v.ok) { for (const e of v.errors) errors.push(`targets[${i}]: ${e}`); return; }
      const key = targetKey(v.target);
      if (seen.has(key)) { errors.push(`targets[${i}]: duplicate of an earlier target (${key})`); return; }
      seen.add(key);
      // Keep only what the author supplied; never add a selector.
      const out = { handle: v.target.handle };
      if (v.target.role) out.role = v.target.role;
      if (v.target.instance) out.instance = v.target.instance;
      if (v.target.backend) out.backend = v.target.backend;
      targets.push(out);
    });
  }
  if (errors.length) return { ok: false, routing: null, errors };
  return { ok: true, routing: { schema: ROUTING_SCHEMA, targets }, errors: [] };
}

/** Read and validate a routing file. Never throws: unreadable or malformed input is an error list. */
export function loadRoutingFile(filePath, fs = nodeFs) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return { ok: false, routing: null, errors: [`cannot read routing file: ${e.message}`] }; }
  let doc;
  try { doc = JSON.parse(text.replace(/^﻿/, '')); }
  catch (e) { return { ok: false, routing: null, errors: [`routing file is not valid JSON: ${e.message}`] }; }
  return validateRoutingDocument(doc);
}

/** Canonical handles named by a validated routing document, in order, de-duplicated. */
export function routingHandles(routing) {
  return [...new Set((routing?.targets || []).map((t) => t.handle))];
}
