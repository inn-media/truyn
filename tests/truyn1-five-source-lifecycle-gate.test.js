import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,MODES,SCENARIOS} from '../sdk/conformance/lifecycle-peer/matrix-contract.mjs';
import {qualifySourceLifecycle,SECURITY_SCENARIOS} from '../sdk/conformance/lifecycle-peer/source-contract.mjs';
const context={sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:1,runAttempt:1,event:'test-fixture'};
function fixture(){return {schema:'truyn.five-sdk-lifecycle/v1',context,status:'PASS',outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.flatMap(requester=>SCENARIOS.map(scenario=>({language,provider,requester,scenario,status:'PASS',assertions:12}))))),capabilities:LANGUAGES.map(language=>({language,mode:'candidate',cancel:true,withdraw:true,partial:true})),negotiation:LANGUAGES.flatMap(language=>MODES.map(mode=>({language,mode,status:'PASS'}))),sourceSecurity:LANGUAGES.flatMap(language=>SECURITY_SCENARIOS.map(scenario=>({language,scenario,status:'PASS',assertions:10}))),stableProtocolDeclared:false,productionCutoverAuthorized:false};}
test('source successor requires all five native clients, twenty lifecycle and thirty security cells',()=>{
 const r=qualifySourceLifecycle(fixture(),context);assert.equal(r.status,'PASS');assert.equal(r.scenarios,20);assert.equal(r.securityScenarios,30);assert.equal(r.sourceOnly,true);assert.equal(r.stableProtocolDeclared,false);
});
test('old package API absence never excuses a missing successor implementation',()=>{
 const r=fixture();r.status='BLOCKED';r.outcomes[0]={...r.outcomes[0],status:'BLOCKED',missing:['historical-api']};
 assert.equal(qualifySourceLifecycle(r,context).publishedBlockedCells,1);
 const index=r.outcomes.findIndex(x=>x.provider==='candidate'&&x.requester==='candidate');r.outcomes[index]={...r.outcomes[index],status:'BLOCKED',missing:['new-api']};
 assert.throws(()=>qualifySourceLifecycle(r,context),/source_lifecycle_not_qualified/);
});
test('cross-SHA, missing native method and duplicate source rows fail closed',()=>{
 assert.throws(()=>qualifySourceLifecycle(fixture(),{...context,sourceSha:'c'.repeat(40)}),/context_mismatch/);
 const r=fixture();r.capabilities[1].partial=false;assert.throws(()=>qualifySourceLifecycle(r,context),/source_native_api_missing/);
 const duplicate=fixture();duplicate.outcomes[1]=duplicate.outcomes[0];assert.throws(()=>qualifySourceLifecycle(duplicate,context),/duplicate_or_unknown/);
});
test('hostile-response and owner checks cannot be skipped, forged green or counted twice',()=>{
 for(const alter of [r=>r.sourceSecurity.pop(),r=>r.sourceSecurity[0].status='BLOCKED',r=>r.sourceSecurity[0].assertions=0,r=>r.sourceSecurity[1]=r.sourceSecurity[0]]){
  const r=fixture();alter(r);assert.throws(()=>qualifySourceLifecycle(r,context),/source_security_not_qualified/);
 }
 const fake=fixture();fake.capabilities[1].partial='true';assert.throws(()=>qualifySourceLifecycle(fake,context),/source_native_api_missing/);
});
