/** Advice only. Never executes Git commands or removes files. */
export function canRetireTaskWorktree(x={}){
  const reasons=[];
  if(!x.taskId) reasons.push('TASK_ID_MISSING');
  if(x.taskStatus!=='done') reasons.push('COMMAND_TASK_NOT_CLOSED');
  if(x.prState!=='merged') reasons.push('PR_NOT_MERGED');
  if(!x.reviewAccepted) reasons.push('INDEPENDENT_ACCEPTANCE_MISSING');
  if(!x.mergeSha || !/^[a-f0-9]{40}$/i.test(x.mergeSha)) reasons.push('MERGE_SHA_MISSING');
  if(x.gitClean!==true) reasons.push('WORKTREE_NOT_CONFIRMED_CLEAN');
  if(x.branchMerged!==true) reasons.push('TASK_BRANCH_NOT_MERGED');
  if(x.evidenceRetained!==true) reasons.push('ROOM_AND_GITHUB_EVIDENCE_NOT_RETAINED');
  if(x.isCanonicalRoot===true) reasons.push('CANNOT_REMOVE_CANONICAL_ROOT');
  return {safe:reasons.length===0,reasons};
}
