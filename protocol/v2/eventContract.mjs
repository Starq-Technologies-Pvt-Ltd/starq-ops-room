/** STARQ Room v2 proposal: additive reference contract. No live broker changes. */
export const VERSION = 'starq.room/2';
export const KINDS = Object.freeze([
  'task.dispatched', 'task.acknowledged', 'task.started', 'task.progress',
  'task.blocked', 'task.resumed', 'task.delivered', 'review.requested',
  'review.accepted', 'review.rejected', 'merge.authorized', 'merge.recorded',
  'task.closed', 'task.deferred', 'handoff.recorded', 'delivery.failed',
  'delivery.recovered', 'runtime.heartbeat'
]);
export const SHA_RE = /^[a-f0-9]{40}$/;
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const kindRequiresTask = kind => /^(task\.|review\.|merge\.)/.test(kind);
/** Return diagnostics rather than throwing at the transport boundary. */
export function validateRoomEvent(event) {
  const errors=[];
  if (!isRecord(event)) return {ok:false,errors:['event must be an object']};
  if(event.version !== VERSION) errors.push('unsupported version');
  if(!nonempty(event.eventId)) errors.push('eventId required');
  if(!KINDS.includes(event.kind)) errors.push('unsupported kind');
  if(!nonempty(event.occurredAt) || Number.isNaN(Date.parse(event.occurredAt))) errors.push('valid occurredAt required');
  if(!isRecord(event.actor) || !nonempty(event.actor.handle) || !nonempty(event.actor.instanceId)) errors.push('actor.handle and actor.instanceId required');
  if(kindRequiresTask(event.kind) && (!isRecord(event.task) || !nonempty(event.task.id) || !nonempty(event.task.project))) errors.push('task.id and task.project required');
  if(!isRecord(event.payload)) errors.push('payload must be an object');
  if(!isRecord(event.action) || typeof event.action.required!=='boolean' || !Array.isArray(event.action.owners)) errors.push('action.required and action.owners required');
  else {
    if(event.action.owners.some(o=>!nonempty(o))) errors.push('invalid action owner');
    if(event.action.required && event.action.owners.length===0) errors.push('action owner required when action is required');
    if(!event.action.required && event.action.owners.length>0) errors.push('FYI may not have action owners');
  }
  if(event.brokerSequence !== undefined && (!Number.isSafeInteger(event.brokerSequence) || event.brokerSequence<1)) errors.push('invalid brokerSequence');
  if(event.replyTo !== undefined && !nonempty(event.replyTo)) errors.push('replyTo must be nonempty');
  if(event.correlationId !== undefined && !nonempty(event.correlationId)) errors.push('correlationId must be nonempty');
  if(event.target !== undefined && !isRecord(event.target)) errors.push('target must be an object');
  if(event.kind==='review.accepted' || event.kind==='review.rejected') {
    if(!isRecord(event.payload) || !SHA_RE.test(event.payload.reviewedHead||'')) errors.push('review verdict requires full 40-char reviewedHead');
  }
  if(event.kind==='merge.authorized') {
    if(!isRecord(event.payload) || !SHA_RE.test(event.payload.reviewedHead||'')) errors.push('merge authorization requires exact reviewedHead');
    if(!isRecord(event.payload) || !nonempty(event.payload.pr)) errors.push('merge authorization requires PR identity');
  }
  return {ok:errors.length===0, errors};
}
/** Compatibility view only. Never use it to write Room directly. */
export function legacyRoutingMetadata(event) {
  const result=validateRoomEvent(event);
  if(!result.ok) throw new TypeError(result.errors.join('; '));
  return {subject:event.subject||event.kind,actionRequired:event.action.required
    ? event.action.owners.map(h=>'@'+h.replace(/^@/,'')).join(' ') + ': ' + (event.action.summary||event.kind)
    : 'NONE', project:event.task?.project||null, taskId:event.task?.id||null,
    senderInstanceId:event.actor.instanceId, targetSession:event.target?.sessionId||null,
    targetRole:event.target?.role||null, correlationId:event.correlationId||event.eventId};
}
