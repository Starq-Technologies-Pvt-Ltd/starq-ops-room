/** Proposed lifecycle state model; Cloudroom remains authoritative for Kanban status. */
const RULES={
  planned:{'task.dispatched':'dispatched','task.deferred':'deferred'},
  dispatched:{'task.acknowledged':'acknowledged','task.blocked':'blocked','task.deferred':'deferred'},
  acknowledged:{'task.started':'executing','task.blocked':'blocked'},
  executing:{'task.progress':'executing','task.blocked':'blocked','task.delivered':'delivered'},
  blocked:{'task.resumed':'executing'},
  delivered:{'review.requested':'in_review'},
  in_review:{'review.accepted':'accepted','review.rejected':'corrections_required'},
  corrections_required:{'task.resumed':'executing'},
  accepted:{'merge.authorized':'merge_authorized'},
  merge_authorized:{'merge.recorded':'merged'},
  merged:{'task.closed':'closed'},
  deferred:{'task.resumed':'planned'},
  closed:{}
};
export function transition(state, eventKind, evidence={}) {
  const next=RULES[state]?.[eventKind];
  if(!next) return {ok:false,state,reason:'ILLEGAL_TRANSITION'};
  if(eventKind==='task.delivered' && (!evidence.pr || !evidence.headSha)) return {ok:false,state,reason:'MISSING_DELIVERY_EVIDENCE'};
  if(eventKind==='review.accepted') {
    if(!evidence.reviewedHeadSha || !evidence.reviewer || !evidence.builder) return {ok:false,state,reason:'MISSING_REVIEW_EVIDENCE'};
    if(evidence.reviewer===evidence.builder) return {ok:false,state,reason:'REVIEWER_EQUALS_BUILDER'};
  }
  if(eventKind==='merge.authorized' && (!evidence.founderAuthorized || !evidence.reviewedHeadSha || evidence.reviewedHeadSha!==evidence.liveHeadSha)) return {ok:false,state,reason:'MERGE_AUTHORITY_OR_SHA_MISMATCH'};
  if(eventKind==='merge.recorded' && (!evidence.mergeSha || !evidence.pr)) return {ok:false,state,reason:'MISSING_MERGE_RECEIPT'};
  if(eventKind==='task.closed' && (!evidence.cloudroomTaskId || !evidence.acceptanceRecord)) return {ok:false,state,reason:'MISSING_COMMAND_CLOSURE'};
  return {ok:true,state:next};
}
export const lifecycleStates=Object.freeze(Object.keys(RULES));
