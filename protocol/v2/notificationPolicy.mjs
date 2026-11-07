/** Pure Founder notification rules. Room remains authoritative; this is only delivery eligibility. */
const H = x => String(x||'').replace(/^@/,'').toLowerCase();
const FOUNDER = new Set(['mustarq','ali']);
const DECISION_EVENTS = new Set(['merge.authorized','decision.requested','founder.action_required']);
/**
 * Classify one normalized event into immediate notification, digest, or filtered.
 * Return a reason for every decision so missed seq ranges can be audited.
 * Never infer Founder-action merely from Room classification ACTION_REQUIRED.
 */
export function founderNotification(event) {
  const kind=event?.kind || '';
  const owners=(event?.action?.owners||[]).map(H);
  const directFounder = event?.action?.required === true && owners.some(x=>FOUNDER.has(x));
  if (directFounder) return {level:'immediate',reason:'FOUNDER_IS_ACTION_OWNER'};
  if(DECISION_EVENTS.has(kind) && event?.payload?.requiresFounder === true)
    return {level:'immediate',reason:'EXPLICIT_FOUNDER_GATE'};
  if(kind==='task.blocked' && event?.payload?.requiresFounder === true)
    return {level:'immediate',reason:'FOUNDER_BLOCKER_ESCALATION'};
  if(kind==='review.accepted' || kind==='review.rejected' || kind==='task.delivered' || kind==='task.closed')
    return {level:'digest',reason:'MATERIAL_PROJECT_MILESTONE'};
  if(kind==='delivery.failed' && event?.payload?.targetType==='founder-notification')
    return {level:'digest',reason:'RELAY_DELIVERY_EXCEPTION'};
  return {level:'filtered',reason:'NO_FOUNDER_DECISION_OR_MATERIAL_MILESTONE'};
}
/** Compare eligible Room records with notification receipts, without rewriting source events. */
export function auditNotificationCoverage(events,receipts){
  const recorded = new Set((receipts||[]).filter(r=>r.status==='provider_accepted').map(r=>`${r.eventId}:${r.destination}`));
  return (events||[]).map(event=>{
    const policy=founderNotification(event);
    const destination='founder:telegram';
    const sent=recorded.has(`${event.eventId}:${destination}`);
    return {eventId:event.eventId,brokerSequence:event.brokerSequence,level:policy.level,reason:policy.reason,
      delivery:policy.level==='filtered'?'not_eligible':sent?'provider_accepted':'missing_receipt',
      needsReplay:policy.level!=='filtered'&&!sent};
  });
}
