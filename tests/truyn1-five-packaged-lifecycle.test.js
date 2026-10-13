import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LANGUAGES,MODES,SCENARIOS} from '../sdk/conformance/lifecycle-peer/matrix-contract.mjs';
import {SECURITY_SCENARIOS} from '../sdk/conformance/lifecycle-peer/source-contract.mjs';
import {digest,validateBuildBundle,qualifyPackagedLifecycle} from '../sdk/conformance/lifecycle-peer/package-contract.mjs';
const context={sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:1,runAttempt:1,event:'unit-fixture'};
const versions={release:'0.1.0-alpha.3',typescript:'0.1.0-alpha.6',python:'0.1.0a3',goTag:'sdk/go/v0.1.0-alpha.3',protocol:'TRUYN/1',stableSdkApiVersion:'1',channel:'public-pre-release'};
function build(){return {schema:'truyn.unpublished-native-sdk-build/v1',context,status:'PASS',publicationState:'unpublished',publishedSdkSourceSha:null,versions,packages:LANGUAGES.map(language=>({language})),manifestSha256:'c'.repeat(64)};}
function lifecycle(proof){return {schema:'truyn.five-sdk-lifecycle/v1',context,status:'PASS',publishedSdkSourceSha:null,packagesReportSha256:digest(Buffer.from(JSON.stringify(proof,null,2)+'\n')),outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.flatMap(requester=>SCENARIOS.map(scenario=>({language,provider,requester,scenario,status:'PASS',assertions:12}))))),capabilities:LANGUAGES.map(language=>({language,mode:'candidate',cancel:true,withdraw:true,partial:true})),negotiation:LANGUAGES.flatMap(language=>MODES.map(mode=>({language,mode,status:'PASS'}))),sourceSecurity:LANGUAGES.flatMap(language=>SECURITY_SCENARIOS.map(scenario=>({language,scenario,status:'PASS',assertions:10}))),stableProtocolDeclared:false,productionCutoverAuthorized:false};}
test('exact CI package bytes require 80 passing native lifecycle cases, 30 security and separate unpublished status',()=>{
 const b=build(),l=lifecycle(b),r=qualifyPackagedLifecycle(l,b,context);assert.equal(r.cases,80);assert.equal(r.securityCases,30);assert.equal(r.publicationState,'unpublished');assert.equal(r.stableProtocolDeclared,false);
 for(const mutate of [x=>x.packagesReportSha256='f'.repeat(64),x=>x.publishedSdkSourceSha=context.sourceSha,x=>{x.status='BLOCKED';x.outcomes[0]={...x.outcomes[0],status:'BLOCKED',missing:['native-api']};}]){const bad=lifecycle(b);mutate(bad);assert.throws(()=>qualifyPackagedLifecycle(bad,b,context));}
 assert.throws(()=>qualifyPackagedLifecycle(l,{...b,publicationState:'accepted'},context),/package_build_proof_mismatch/);
});
test('package source, archive digests, duplicates and missing ecosystems fail closed',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-package-unit-'));
 try{
  const names=['typescript/truyn-sdk-0.1.0-alpha.6.tgz','python/truyn_sdk-0.1.0a3-py3-none-any.whl','go/truyn-sdk-go-0.1.0-alpha.3.tar.gz','java/truyn-sdk-0.1.0-alpha.3.jar','dotnet/Truyn.Sdk.0.1.0-alpha.3.nupkg'];
  for(const p of names){mkdirSync(join(root,p.split('/')[0]),{recursive:true});writeFileSync(join(root,p),'fixture-bytes');}
  const m={schema:'truyn.sdk-release/v1',sourceSha:context.sourceSha,...versions,artifacts:names.map(path=>({path,bytes:13,sha256:digest(Buffer.from('fixture-bytes'))}))};
  assert.equal(validateBuildBundle(m,context,versions,root).length,5);
  assert.throws(()=>validateBuildBundle({...m,sourceSha:'f'.repeat(40)},context,versions,root),/package_source_mismatch/);
  assert.throws(()=>validateBuildBundle({...m,artifacts:[...m.artifacts,m.artifacts[0]]},context,versions,root),/invalid_package_entry/);
  writeFileSync(join(root,names[0]),'tampered-data');assert.throws(()=>validateBuildBundle(m,context,versions,root),/package_bytes_mismatch/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
