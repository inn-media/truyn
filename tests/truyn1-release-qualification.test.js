import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qualify,LANGUAGES} from '../sdk/conformance/release-qualification/evaluate.mjs';
const freeze=JSON.parse(readFileSync(new URL('../spec/compatibility/truyn1-five-sdk-freeze.json',import.meta.url)));
const context={sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:42,runAttempt:1,event:'pull_request'};
const digest='c'.repeat(64),modes=['legacy','candidate'];
function input(){return {
 context,freeze,
 matrix:{schema:'truyn.five-sdk-exact-interop-evidence/v1',status:'PASS',context,
 stableProtocolDeclared:false,productionCutoverAuthorized:false,publishedSdkSourceSha:freeze.frozenSourceSha,
 pinsSha256:digest,matrixLogSha256:digest,caseCount:20,
 outcomes:LANGUAGES.flatMap(language=>modes.flatMap(provider=>modes.map(requester=>({language,provider,requester,status:'PASS'})))),
 packages:freeze.coordinates.map(p=>({id:p.id,coordinate:p.coordinate,status:'PASS',archiveSha256:digest,pinsSha256:digest,context}))},
 source:{schema:'truyn.source-native-lifecycle/v1',context,status:'PASS',sourceOnly:true,scenarios:20,
 securityScenarios:30,languages:LANGUAGES,lifecycleSha256:digest,stableProtocolDeclared:false},
 coverage:{schema:'truyn.p14.lifecycle-coverage/v1',sourceSha:context.sourceSha,status:'BLOCKED',
 expectedCases:540,observedCases:540,passed:539,blockers:[{case:'missing'}],
 stableProtocolDeclared:false,productionCutoverAuthorized:false},
 suites:Object.fromEntries(['P11','P12','P13-FORMAT'].map(x=>[x,{passed:1,failed:0,logSha256:digest}])),
 receipts:Object.fromEntries(['report.json','lifecycle.json','source-lifecycle.json','p14-lifecycle-coverage.json'].map(x=>[x,digest]))
};}
test('verified prerelease 20/20 and bounded source/native suite cannot claim stable P13',()=>{
 const r=qualify(input());assert.equal(r.p11.status,'BOUNDED_SOURCE_PASS');assert.equal(r.p12.status,'BOUNDED_REFERENCE_PROFILE_PASS');
 assert.equal(r.p13Format.status,'PRE_STABLE');assert.equal(r.p13Format.realPublishedSourcePairs,20);assert.equal(r.stableProtocolDeclared,false);
});
test('cross-SHA, duplicate cells, package tamper, native gaps and false suites fail closed',()=>{
 for(const mutation of [
  v=>v.matrix.context={...v.matrix.context,sourceSha:'f'.repeat(40)},
  v=>v.matrix.outcomes[1]=v.matrix.outcomes[0],
  v=>v.matrix.outcomes[1].status='FAIL',
  v=>v.matrix.packages[0].archiveSha256='invalid',
  v=>v.matrix.packages[0].context={...context,runId:43},
  v=>v.source.scenarios=19,
  v=>v.coverage.expectedCases=539,
  v=>v.coverage.passed=540,
  v=>v.suites.P12.failed=1,
  v=>delete v.receipts['lifecycle.json'],
  v=>v.freeze.stableProtocolDeclared=true,
  v=>v.freeze.coordinates.pop()
 ]){const v=input();mutation(v);assert.throws(()=>qualify(v));}
});
