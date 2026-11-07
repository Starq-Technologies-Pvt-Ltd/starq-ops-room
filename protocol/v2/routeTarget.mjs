/** Pure, conservative, multi-seat routing. Reference layer: no pane wakes here. */
const normalize=h=>String(h||'').replace(/^@/,'').trim().toLowerCase();
const unique=xs=>[...new Set(xs)];
/** Session shape: {handle,instanceId,sessionId,host,role,workspace,projects:[],capabilities:[]} */
export function routeRoomEvent(event, sessions) {
  const outcome={wake:[],held:[],ignored:[]};
  if(event?.action?.required!==true) return outcome;
  const ownerHandles=unique((event.action.owners||[]).map(normalize));
  for(const owner of ownerHandles){
    const relevant=(sessions||[]).filter(s=>normalize(s.handle)===owner &&
      s.instanceId!==event.actor?.instanceId);
    if(!relevant.length){outcome.held.push({owner,reason:'NO_LIVE_SESSION'});continue;}
    const target=event.target||{};
    const exactKeys=['instanceId','sessionId','workspace','role','host'];
    const constraints=exactKeys.filter(k=>target[k]!==undefined && target[k]!==null && target[k]!=='');
    if(constraints.length){
      const matches=relevant.filter(s=>constraints.every(k=>String(s[k]||'').toLowerCase()===String(target[k]).toLowerCase()));
      if(matches.length===1) outcome.wake.push({owner,session:matches[0],reason:'EXPLICIT'});
      else outcome.held.push({owner,reason:matches.length?'AMBIGUOUS_EXPLICIT':'TARGET_NOT_LIVE',candidates:matches.length});
      continue;
    }
    const affinity=relevant.filter(s=>Array.isArray(s.projects) && s.projects.includes(event.task?.project));
    if(affinity.length===1){outcome.wake.push({owner,session:affinity[0],reason:'PROJECT_AFFINITY'});continue;}
    if(relevant.length===1 && affinity.length===0){outcome.wake.push({owner,session:relevant[0],reason:'SOLE_SESSION'});continue;}
    outcome.held.push({owner,reason:'AMBIGUOUS_SESSION',candidates:(affinity.length?affinity:relevant).map(s=>s.instanceId)});
  }
  return outcome;
}
