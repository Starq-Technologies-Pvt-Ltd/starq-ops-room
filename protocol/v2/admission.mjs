/** Pure quota/capacity advice. Does not invoke a model, infer quotas or consume seats. */
export function assessAdmission(request, seat, activeReservations=[],now=Date.now()){
  if(!request?.taskId || !seat?.instanceId) return {decision:'HOLD',reason:'INVALID_REQUEST'};
  if(!seat.capabilities?.includes(request.capability)) return {decision:'HOLD',reason:'CAPABILITY_UNCONFIRMED'};
  if(!seat.quota || !Number.isFinite(seat.quota.remainingPercent) || !Number.isFinite(seat.quota.observedAt) || now-seat.quota.observedAt>15*60*1000) return {decision:'HOLD',reason:'QUOTA_STALE_OR_UNKNOWN'};
  if(seat.quota.remainingPercent <= (request.minimumQuotaPercent??5)) return {decision:'HOLD',reason:'QUOTA_HEADROOM_LOW'};
  const contention=(activeReservations||[]).filter(r=>r.quotaPool===seat.quotaPool && r.state==='active');
  if(contention.some(r=>r.taskId!==request.taskId && r.priority>(request.priority||0))) return {decision:'HOLD',reason:'HIGHER_PRIORITY_SHARED_QUOTA'};
  if(contention.some(r=>r.taskId!==request.taskId && r.exclusive!==false)) return {decision:'HOLD',reason:'QUOTA_POOL_RESERVED'};
  return {decision:'ADMIT',reason:'CURRENT_CAPACITY_VERIFIED'};
}
