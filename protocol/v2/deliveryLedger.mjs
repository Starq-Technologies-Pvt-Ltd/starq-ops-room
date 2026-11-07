/** Pure durable-delivery primitives. Persistence is the dispatcher's responsibility. */
export function deliveryKey(eventId, sessionId){
  if(!eventId || !sessionId) throw new TypeError('eventId and sessionId required');
  return `${eventId}::${sessionId}`;
}
export function createDelivery(eventId,sessionId,now=0){return {
  key:deliveryKey(eventId,sessionId),eventId,sessionId,status:'pending',attempts:0,nextAttemptAt:now,transportAckAt:null,workAckAt:null,lastError:null
};}
export function canAttempt(d,now){return d.status==='pending' && now>=d.nextAttemptAt;}
export function recordAttempt(d,now){if(!canAttempt(d,now)) throw new Error('not ready for attempt');return {...d,attempts:d.attempts+1,status:'inflight',lastAttemptAt:now};}
export function recordTransportAck(d,now){if(d.status!=='inflight') throw new Error('transport ack without attempt');return {...d,status:'transport_acknowledged',transportAckAt:now};}
export function recordWorkAck(d,now){if(d.transportAckAt===null) throw new Error('work ack requires transport delivery');return {...d,workAckAt:now};}
export function recordFailure(d,now,reason,options={}){
  if(d.status!=='inflight') throw new Error('failure requires attempt');
  const max=options.maxAttempts||5,base=options.baseDelayMs||1000,cap=options.maxDelayMs||300000;
  if(d.attempts>=max) return {...d,status:'dead_letter',lastError:String(reason)};
  return {...d,status:'pending',nextAttemptAt:now+Math.min(cap,base*2**(d.attempts-1)),lastError:String(reason)};
}
