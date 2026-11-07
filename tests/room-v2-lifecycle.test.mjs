import test from 'node:test';
import assert from 'node:assert/strict';
import {transition} from '../protocol/v2/taskLifecycle.mjs';
test('happy path is evidence gated',()=>{
 let s='planned';const path=[['task.dispatched',{}],['task.acknowledged',{}],['task.started',{}],['task.delivered',{pr:'#5',headSha:'a'.repeat(40)}],['review.requested',{}],['review.accepted',{reviewedHeadSha:'a'.repeat(40),reviewer:'vision',builder:'antigravity'}],['merge.authorized',{founderAuthorized:true,reviewedHeadSha:'a'.repeat(40),liveHeadSha:'a'.repeat(40)}],['merge.recorded',{mergeSha:'b'.repeat(40),pr:'#5'}],['task.closed',{cloudroomTaskId:'HOA-248',acceptanceRecord:'#18483'}]];
 for(const [k,e] of path){const r=transition(s,k,e);assert.equal(r.ok,true,k+': '+r.reason);s=r.state;}assert.equal(s,'closed');
});
test('reviewer and builder cannot be same',()=>assert.equal(transition('in_review','review.accepted',{reviewer:'ag',builder:'ag',reviewedHeadSha:'a'.repeat(40)}).reason,'REVIEWER_EQUALS_BUILDER'));
test('SHA drift blocks merge authorization',()=>assert.equal(transition('accepted','merge.authorized',{founderAuthorized:true,reviewedHeadSha:'a'.repeat(40),liveHeadSha:'b'.repeat(40)}).ok,false));
test('merge without Founder authorization is blocked',()=>assert.equal(transition('accepted','merge.authorized',{founderAuthorized:false,reviewedHeadSha:'a'.repeat(40),liveHeadSha:'a'.repeat(40)}).ok,false));
test('an action ACK cannot be mistaken for completion',()=>assert.equal(transition('acknowledged','task.closed',{}).ok,false));
test('defer and resume requires an explicit lifecycle transition',()=>{let r=transition('planned','task.deferred');assert.equal(r.state,'deferred');r=transition(r.state,'task.resumed');assert.equal(r.state,'planned');});
