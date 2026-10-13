import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIVE_CODES,LANGUAGES,qualifyPhysicalSurfaces} from '../sdk/conformance/core-registry/physical-surface-evaluate.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const registry=read('spec/registry/truyn-core-v1.json');
const coreMatrix=read('sdk/conformance/v1/core-registry-five-sdk-matrix.json');
const context={sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:5,runAttempt:1,event:'pull_request'};
const digest='c'.repeat(64);
const modes=['legacy','candidate'];
const security=['foreign-partial','cancelled-partial-result','tampered-payload','tampered-signature','wrong-event-kind','corrupt-signer'];
function fixture(){
 const lifecycle={
  schema:'truyn.five-sdk-lifecycle/v1',context:{...context},stableProtocolDeclared:false,
  productionCutoverAuthorized:false,packagesReportSha256:digest,
  capabilities:LANGUAGES.flatMap(language=>modes.map(mode=>({language,mode,partial:mode==='candidate'}))),
  negotiation:LANGUAGES.flatMap(language=>modes.map(mode=>({language,mode,status:'PASS'}))),
  outcomes:LANGUAGES.flatMap(language=>modes.flatMap(provider=>modes.map(requester=>
   ({language,provider,requester,scenario:'partial-order-backpressure',status:provider==='candidate'&&requester==='candidate'?'PASS':'BLOCKED',
      ...(provider==='candidate'&&requester==='candidate'?{assertions:30}:{missing:['old-api']})})))),
  sourceSecurity:LANGUAGES.flatMap(language=>security.map(scenario=>({language,scenario,status:'PASS',assertions:8})))
 };
 const source={schema:'truyn.source-native-lifecycle/v1',context:{...context},status:'PASS',sourceOnly:true,
  scenarios:20,securityScenarios:30,languages:LANGUAGES,lifecycleSha256:digest,stableProtocolDeclared:false};
 const runtimeQuic={status:'BOUNDED_NODE_RUNTIME_PASS',logSha256:digest,testsPassed:1,testsFailed:0};
 return {registry,coreMatrix,lifecycle,source,context,packageDigest:digest,runtimeQuic};
}
test('55 exact cells and 11 physical surfaces; bounded native 15 PASS / 40 BLOCKED never stable',()=>{
 const r=qualifyPhysicalSurfaces(fixture());
 assert.deepEqual(ACTIVE_CODES,['21000000','22000000','23000000','24000000','25000000',
  '41000000','42000000','43000000','44000000','45000000','46000000']);
 assert.equal(r.nativeSdkCells,55);
 assert.equal(r.sourceNativeBoundedPassed,15);
 assert.equal(r.blockedSdkCells,40);
 assert.equal(r.stableSdkReleaseAuthorized,false);
 assert.equal(r.cells.filter(x=>x.wire==='QUIC_CONTROL'&&x.status==='BLOCKED_SDK_API_OR_EXECUTION').length,25);
 assert.equal(r.cells.filter(x=>x.wire==='COMPACT_SIGNED'&&x.status==='BLOCKED_SDK_API_OR_EXECUTION').length,15);
});
test('forged source evidence, omitted negative or wrong package/source context never counts as PASS',()=>{
 for(const mutate of [
  f=>f.lifecycle.context.sourceSha='d'.repeat(40),
  f=>f.lifecycle.sourceSecurity.pop(),
  f=>f.lifecycle.sourceSecurity[0].status='FAIL',
  f=>f.lifecycle.outcomes[3].status='FAIL',
  f=>f.lifecycle.capabilities[1].partial=false,
  f=>f.lifecycle.packagesReportSha256='0'.repeat(64),
  f=>f.runtimeQuic.status='NOT_RUN',
  f=>f.coreMatrix={...f.coreMatrix,entries:f.coreMatrix.entries.slice(1)},
  f=>f.source.scenarios=19,
  f=>f.lifecycle.negotiation[1].status='FAIL'
 ]){
  const f=fixture();mutate(f);
  assert.throws(()=>qualifyPhysicalSurfaces(f));
 }
});
