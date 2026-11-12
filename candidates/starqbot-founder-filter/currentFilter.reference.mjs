// REFERENCE ONLY — verbatim copy of `isFounderNotificationEligible` as it runs
// in the live gateway on 2026-11-11 (starq-bot-gateway.mjs lines 1079-1103).
// Kept so the tests can prove the candidate never removes a delivery.

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

  // ACTION_REQUIRED describes the broker route, not who must act. When the
  // metadata names an owner, only a Founder owner merits the urgent banner.
  const ownerPrefix = normalized.match(/^(@?[A-Z0-9_-]+(?:\s*[\/,]\s*@?[A-Z0-9_-]+)*)\s*(?::|[–—-])/);
  if (ownerPrefix) {
    const owners = ownerPrefix[1].split(/[\/,]/).map((owner) => owner.trim().replace(/^@/, ''));
    return owners.some((owner) => owner === 'MUSTARQ' || owner === 'ALI' || owner === 'FOUNDER');
  }

  return /\b(?:MUSTARQ|FOUNDER)\b/.test(normalized);
}
