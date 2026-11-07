import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAdmission} from '../protocol/v2/admission.mjs';
const now=1000000;const req={taskId:'HOA-248',capability:'typescript',priority:5};const seat={instanceId:'agy-h',quotaPool:'ag-shared',capabilities:['typescript'],quota:{remainingPercent:40,observedAt:now}};
test('fresh quota and capability admits',()=>assert.equal(assessAdmission(req,seat,[],now).decision,'ADMIT'));
test('stale quota holds',()=>assert.equal(assessAdmission(req,{...seat,quota:{...seat.quota,observedAt:now-1000000}},[],now).reason,'QUOTA_STALE_OR_UNKNOWN'));
test('critical ERP reservation protects shared AG quota',()=>assert.equal(assessAdmission(req,seat,[{taskId:'ERP-541',quotaPool:'ag-shared',state:'active',priority:10}],now).reason,'HIGHER_PRIORITY_SHARED_QUOTA'));
test('idle labels never imply quota',()=>assert.equal(assessAdmission(req,{...seat,quota:null},[],now).decision,'HOLD'));
