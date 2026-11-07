import test from 'node:test';
import assert from 'node:assert/strict';
import {canRetireTaskWorktree} from '../protocol/v2/worktreeGate.mjs';
const valid={taskId:'HOA-248',taskStatus:'done',prState:'merged',reviewAccepted:true,mergeSha:'9c431a98ef97b2b71d4466ab9ca7e09f153084b1',gitClean:true,branchMerged:true,evidenceRetained:true,isCanonicalRoot:false};
test('closed, accepted, merged, clean task worktree may retire',()=>assert.equal(canRetireTaskWorktree(valid).safe,true));
test('never retire canonical main checkout',()=>assert.deepEqual(canRetireTaskWorktree({...valid,isCanonicalRoot:true}).reasons,['CANNOT_REMOVE_CANONICAL_ROOT']));
test('open PR and uncommitted edits block retirement',()=>{
  const x=canRetireTaskWorktree({...valid,prState:'open',gitClean:false});
  assert.equal(x.safe,false); assert.ok(x.reasons.includes('PR_NOT_MERGED'));assert.ok(x.reasons.includes('WORKTREE_NOT_CONFIRMED_CLEAN'));
});
test('accepted but Cloudroom not closed blocks task worktree deletion',()=>assert.ok(canRetireTaskWorktree({...valid,taskStatus:'in_review'}).reasons.includes('COMMAND_TASK_NOT_CLOSED')));
