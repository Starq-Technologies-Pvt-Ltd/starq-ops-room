// CANDIDATE — not deployed. Founder decision 4b (Room #18981, #18983, #18993).
//
// Proposed replacement for `isFounderNotificationEligible` in the live
// `agent-comms/scripts/starq-bot-gateway.mjs` (line 1079 at the time of
// writing). The live file is outside version control and is not copied here.
//
// Defect being fixed: when the action-required text starts with an owner
// prefix ("codex: ...; mustarq: ..."), the live function reads only that
// first owner, so a record that also names the Founder as a later owner is
// suppressed (Room #18958).
//
// Rule: the candidate only ever ADDS deliveries. Every record the current
// function accepts is still accepted; the identity, authorization, audience
// and sender checks are unchanged.

const FOUNDER_OWNERS = new Set(['MUSTARQ', 'ALI', 'FOUNDER']);

const OWNER_LIST = '@?[A-Z0-9_-]+(?:\\s*[\\/,]\\s*@?[A-Z0-9_-]+)*';
// First owner prefix: identical to the live expression.
const FIRST_OWNER_PREFIX = new RegExp(`^(${OWNER_LIST})\\s*(?::|[–—-])`);
// Later owner prefixes: only after a clause boundary, and only with a colon,
// so ordinary hyphenated words and dashes inside a sentence are not owners.
const LATER_OWNER_PREFIX = new RegExp(`(?:[.;\\n]\\s*)(${OWNER_LIST})\\s*:`, 'g');

function ownersOf(list) {
  return list.split(/[\/,]/).map((owner) => owner.trim().replace(/^@/, ''));
}

function namesFounder(owners) {
  return owners.some((owner) => FOUNDER_OWNERS.has(owner));
}

export function isFounderNotificationEligible(rec) {
  const deliveryType = String(rec?.evaluatedDeliveryType ?? rec?.deliveryType ?? 'UNKNOWN');
  if (deliveryType !== 'ACTION_REQUIRED') return false;
  const sender = String(rec?.event?.senderHandle || rec?.from || '').replace(/^@/, '').toLowerCase();
  if (sender === 'mustarq' || sender === 'ali') return false;
  const rawAudience = rec?.evaluatedAudience ?? rec?.targetAudience;
  const audience = Array.isArray(rawAudience) ? rawAudience : (typeof rawAudience === 'string' ? [rawAudience] : []);
  const founderIsRecipient = audience.some((handle) => String(handle).replace(/^@/, '').toLowerCase() === 'mustarq');
  if (!founderIsRecipient) return false;
  const metadata = rec?.event?.metadata && typeof rec.event.metadata === 'object' ? rec.event.metadata : {};
  const actionRequired = metadata.actionRequired;
  if (actionRequired == null) return false;
  const normalized = String(actionRequired).trim().toUpperCase();
  if (normalized === '' || normalized === 'UNKNOWN' || /^NONE(?:$|[\s:–—-])/.test(normalized)) return false;

  const first = normalized.match(FIRST_OWNER_PREFIX);
  if (first) {
    if (namesFounder(ownersOf(first[1]))) return true;
    // Changed behaviour: a later clause may name the Founder as an owner.
    for (const later of normalized.matchAll(LATER_OWNER_PREFIX)) {
      if (namesFounder(ownersOf(later[1]))) return true;
    }
    return false;
  }

  return /\b(?:MUSTARQ|FOUNDER)\b/.test(normalized);
}
