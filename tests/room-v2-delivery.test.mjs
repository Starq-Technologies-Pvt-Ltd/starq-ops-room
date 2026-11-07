import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryKey,createDelivery,canAttempt,recordAttempt,recordTransportAck,recordWorkAck,recordFailure} from '../protocol/v2/deliveryLedger.mjs';
test('dedup identity is event + seat',()=>{assert.equal(deliveryKey('e1','a1'),deliveryKey('e1','a1'));assert.notEqual(deliveryKey('e1','a1'),deliveryKey('e1','a2'));});
test('transport ACK does not imply work ACK',()=>{let d=createDelivery('e1','a1');d=recordAttempt(d,0);d=recordTransportAck(d,2);assert.equal(d.transportAckAt,2);assert.equal(d.workAckAt,null);d=recordWorkAck(d,3);assert.equal(d.workAckAt,3);});
test('retry schedules exponential backoff and is bounded',()=>{let d=createDelivery('e1','a1',0);for(let n=0;n<4;n++){d=recordAttempt(d,d.nextAttemptAt);d=recordFailure(d,d.lastAttemptAt,'offline',{maxAttempts:5,baseDelayMs:100});assert.equal(d.status,'pending');}d=recordAttempt(d,d.nextAttemptAt);d=recordFailure(d,d.lastAttemptAt,'offline',{maxAttempts:5});assert.equal(d.status,'dead_letter');});
test('not ready before retry time',()=>{let d=createDelivery('e1','a1');d=recordAttempt(d,0);d=recordFailure(d,0,'offline',{baseDelayMs:1000});assert.equal(canAttempt(d,999),false);assert.equal(canAttempt(d,1000),true);});
