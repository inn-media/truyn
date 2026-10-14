import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES,MODES,fixture,digest,validateRegistration } from '../sdk/conformance/registration-peer/contract.mjs';
import { validateArtifactMatrix } from '../sdk/conformance/registration-peer/artifact-contract.mjs';
const context={sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:1,runAttempt:1,event:'unit-test'};
const packageBytes=Buffer.from('unit-fixture-not-release-evidence');
function registration(){const f=fixture();return{schema:'truyn.p11.native-registration/v1',context,fixtureSha256:f.sha256,
  packagesReportSha256:digest(packageBytes),status:'PASS',stableProtocolDeclared:false,productionCutoverAuthorized:false,
  reRegistration:LANGUAGES.map(language=>({language,mode:'candidate',registrationRequests:1,signatureVerified:true,protectedRequests:0,rejected:true,status:'PASS'})),
  outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(mode=>f.cases.map(c=>({language,mode,id:c.id,accepted:c.expected.ok,code:c.expected.code??null,requests:1,signatureVerified:true,status:'PASS'}))))};}
test('native P11 evidence refuses missing, duplicate, cross-source, unexecuted and false-PASS results',()=>{
  assert.equal(validateRegistration(registration(),context,packageBytes,{requireAll:true}).totalCases,280);
  for(const mutate of [r=>r.outcomes.pop(),r=>r.outcomes[0]=r.outcomes[1],r=>r.context={...context,sourceSha:'c'.repeat(40)},
    r=>r.outcomes[0].requests=0,r=>r.outcomes[0].signatureVerified=false,r=>r.outcomes[4].accepted=true,
    r=>r.reRegistration.pop(),r=>r.reRegistration[0].protectedRequests=1,r=>r.fixtureSha256='0'.repeat(64),r=>r.packagesReportSha256='0'.repeat(64),r=>r.stableProtocolDeclared=true]){
    const report=registration();mutate(report);assert.throws(()=>validateRegistration(report,context,packageBytes,{requireAll:true}));
  }
  const historical=registration();historical.outcomes[4].accepted=true;historical.outcomes[4].status='FAIL';historical.status='HISTORICAL_FAILURES';
  assert.equal(validateRegistration(historical,context,packageBytes).historicalFailures,1);
  assert.throws(()=>validateRegistration(historical,context,packageBytes,{requireAll:true}));
});
function artifacts(){return{schema:'truyn.p12.native-artifact-reference/v1',context,packagesReportSha256:digest(packageBytes),status:'PASS',
  implicitFetches:0,stableProtocolDeclared:false,productionCutoverAuthorized:false,
  outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.map(requester=>({language,provider,requester,status:'PASS',
    signatureVerified:true,referencePreserved:true,explicitResolverVerified:true,wrongDigestRejected:true,wrongSizeRejected:true,noResolverRejected:true,resolverCalls:1}))))};}
test('P12 native evidence requires all 20 version directions and zero implicit IO',()=>{
  assert.equal(validateArtifactMatrix(artifacts(),context,packageBytes).cases,20);
  for(const mutate of [r=>r.outcomes.pop(),r=>r.outcomes[0]=r.outcomes[1],r=>r.implicitFetches=1,r=>r.outcomes[0].referencePreserved=false,
    r=>r.outcomes[0].wrongDigestRejected=false,r=>r.outcomes[0].resolverCalls=2,r=>r.context={...context,runAttempt:2}]){
    const report=artifacts();mutate(report);assert.throws(()=>validateArtifactMatrix(report,context,packageBytes));
  }
});
