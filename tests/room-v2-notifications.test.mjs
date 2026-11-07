import test from 'node:test';
import assert from 'node:assert/strict';
import {founderNotification,auditNotificationCoverage} from '../protocol/v2/notificationPolicy.mjs';
const e=(kind,owners=[],more={})=>({version:'starq.room/2',eventId:'e1',brokerSequence:18437,kind,action:{required:owners.length>0,owners},...more});
test('Agent action does not falsely notify Founder as action owner',()=>assert.deepEqual(founderNotification(e('task.dispatched',['antigravity'])),{level:'filtered',reason:'NO_FOUNDER_DECISION_OR_MATERIAL_MILESTONE'}));
test('Founder decision does notify promptly',()=>assert.equal(founderNotification(e('task.dispatched',['mustarq'])).level,'immediate'));
test('Founder merge gate is actionable only when explicitly requested',()=>assert.equal(founderNotification(e('decision.requested',[],{payload:{requiresFounder:true}})).level,'immediate'));
test('Task completion is digest not an interruption',()=>assert.equal(founderNotification(e('task.delivered',['vision'])).level,'digest'));
test('Missing eligible notice can be replayed without duplicate Room posting',()=>{
  const a=auditNotificationCoverage([e('task.dispatched',['antigravity']),e('task.delivered',['vision'])],[]);
  assert.deepEqual(a.map(x=>x.delivery),['not_eligible','missing_receipt']);
  assert.equal(a[1].needsReplay,true);
});
test('Provider receipt is not falsely elevated to user-read confirmation',()=>{
  const a=auditNotificationCoverage([e('task.delivered',[])],[{eventId:'e1',destination:'founder:telegram',status:'provider_accepted'}]);
  assert.equal(a[0].delivery,'provider_accepted');
});
