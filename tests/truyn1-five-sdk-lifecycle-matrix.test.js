import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,MODES,SCENARIOS,validateLifecycle} from '../sdk/conformance/lifecycle-peer/matrix-contract.mjs';
const context={sourceSha:'a'.repeat(40),runId:1};
const fixture=()=>({schema:'truyn.five-sdk-lifecycle/v1',context,status:'PASS',stableProtocolDeclared:false,productionCutoverAuthorized:false,
 outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.flatMap(requester=>SCENARIOS.map(scenario=>({language,provider,requester,scenario,status:'PASS',assertions:1}))))),
 negotiation:LANGUAGES.flatMap(language=>MODES.map(mode=>({language,mode,status:'PASS'})))});
test('lifecycle requires all eighty cases and ten independent native negotiation probes',()=>{
 assert.deepEqual(validateLifecycle(fixture(),context),{status:'PASS',pass:80,blocked:0,fail:0});
 for(const key of ['outcomes','negotiation']){const r=fixture();r[key].pop();assert.throws(()=>validateLifecycle(r,context),/missing_cases/);}
 const r=fixture();r.outcomes[1]={...r.outcomes[0]};assert.throws(()=>validateLifecycle(r,context),/duplicate/);
});
test('a native API absence is BLOCKED, never skipped or inherited PASS',()=>{
 const r=fixture();r.outcomes[0]={...r.outcomes[0],status:'BLOCKED',missing:['requester.cancel']};
 assert.throws(()=>validateLifecycle(r,context),/false_admission/);r.status='BLOCKED';assert.equal(validateLifecycle(r,context).blocked,1);
 r.outcomes[0].missing=[];assert.throws(()=>validateLifecycle(r,context),/unexplained_blocker/);
});
test('cross-SHA, empty proof, false stability and failed native scenarios fail closed',()=>{
 assert.throws(()=>validateLifecycle(fixture(),{sourceSha:'b'.repeat(40),runId:1}),/context/);
 const empty=fixture();empty.outcomes[0].assertions=0;assert.throws(()=>validateLifecycle(empty,context),/empty_or_false_pass/);
 const stable=fixture();stable.stableProtocolDeclared=true;assert.throws(()=>validateLifecycle(stable,context),/false_admission/);
 const failed=fixture();failed.outcomes[0].status='FAIL';assert.throws(()=>validateLifecycle(failed,context),/false_admission/);failed.status='FAIL';assert.equal(validateLifecycle(failed,context).fail,1);
});
