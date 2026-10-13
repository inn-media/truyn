import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture as registrationFixture,validateRegistration} from '../sdk/conformance/registration-peer/contract.mjs';
import {validateArtifactMatrix} from '../sdk/conformance/registration-peer/artifact-contract.mjs';
import {TARGET_VERSIONS,TARGET_PACKAGES,RELEASE_TAGS,validateNativeRequest,validateNativeBundle} from '../sdk/release/native-publication.mjs';
import {LANGUAGES,MODES,SCENARIOS} from '../sdk/conformance/lifecycle-peer/matrix-contract.mjs';
import {SECURITY_SCENARIOS} from '../sdk/conformance/lifecycle-peer/source-contract.mjs';
import {digest,validateBuildBundle,qualifyPackagedLifecycle} from '../sdk/conformance/lifecycle-peer/package-contract.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const parentSha='a'.repeat(40);
const context={sourceSha:'b'.repeat(40),sourceTree:'c'.repeat(40),runId:1,runAttempt:1,event:'push'};
const candidate=JSON.parse(read('sdk/release/native-successor-candidate.json'));
const request=()=>({schema:'truyn.native-lifecycle-release-request/v1',task:'truyn1-native-lifecycle-successor-publication-20261012',intent:'publish-five-qualified-native-lifecycle-prereleases',exactParentSha:parentSha,packages:{...TARGET_PACKAGES},cloudMutationAllowed:false,managedCanaryAllowed:false,mainnetAdmissionAllowed:false,stableProtocolDeclared:false,requireExactMainCI:true,requireHostedCodeQL:true,requireNewImmutableTags:true,requireNativePackageProof:true});
const options={parentSha,attempt:1,versions:TARGET_VERSIONS,candidate};
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function fixture(root){
 const names=['typescript/truyn-sdk-0.1.0-alpha.6.tgz','python/truyn_sdk-0.1.0a3-py3-none-any.whl','go/truyn-sdk-go-0.1.0-alpha.3.tar.gz','java/truyn-sdk-0.1.0-alpha.3.jar','dotnet/Truyn.Sdk.0.1.0-alpha.3.nupkg'];
 for(const name of names){mkdirSync(join(root,name.split('/')[0]),{recursive:true});writeFileSync(join(root,name),'fixture-bytes');}
 const manifest={schema:'truyn.sdk-release/v1',sourceSha:context.sourceSha,...TARGET_VERSIONS,artifacts:names.map(path=>({path,bytes:13,sha256:digest(Buffer.from('fixture-bytes'))}))};
 const build={schema:'truyn.unpublished-native-sdk-build/v1',context,status:'PASS',publicationState:'unpublished',publishedSdkSourceSha:null,versions:TARGET_VERSIONS,packages:validateBuildBundle(manifest,context,TARGET_VERSIONS,root),manifestSha256:digest(bytes(manifest))};
 const lifecycle={schema:'truyn.five-sdk-lifecycle/v1',context,status:'PASS',publishedSdkSourceSha:null,packagesReportSha256:digest(bytes(build)),outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.flatMap(requester=>SCENARIOS.map(scenario=>({language,provider,requester,scenario,status:'PASS',assertions:12}))))),capabilities:LANGUAGES.map(language=>({language,mode:'candidate',cancel:true,withdraw:true,partial:true})),negotiation:LANGUAGES.flatMap(language=>MODES.map(mode=>({language,mode,status:'PASS'}))),sourceSecurity:LANGUAGES.flatMap(language=>SECURITY_SCENARIOS.map(scenario=>({language,scenario,status:'PASS',assertions:10}))),stableProtocolDeclared:false,productionCutoverAuthorized:false};
 const proof={...qualifyPackagedLifecycle(lifecycle,build,context),lifecycleSha256:digest(bytes(lifecycle)),buildProofSha256:digest(bytes(build))};
 for(const [name,value] of Object.entries({'manifest.json':manifest,'native-package-build.json':build,'native-package-lifecycle.json':lifecycle,'native-package-proof.json':proof}))writeFileSync(join(root,name),bytes(value));
 const cases=registrationFixture();
 const registration={schema:'truyn.p11.native-registration/v1',context,fixtureSha256:cases.sha256,packagesReportSha256:digest(bytes(build)),status:'PASS',stableProtocolDeclared:false,productionCutoverAuthorized:false,outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(mode=>cases.cases.map(c=>({language,mode,id:c.id,accepted:c.expected.ok,code:c.expected.code??null,requests:1,signatureVerified:true,status:'PASS'}))))};
 const artifacts={schema:'truyn.p12.native-artifact-reference/v1',context,packagesReportSha256:digest(bytes(build)),status:'PASS',implicitFetches:0,stableProtocolDeclared:false,productionCutoverAuthorized:false,outcomes:LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.map(requester=>({language,provider,requester,status:'PASS',signatureVerified:true,referencePreserved:true,explicitResolverVerified:true,wrongDigestRejected:true,wrongSizeRejected:true,noResolverRejected:true,resolverCalls:1}))))};
 const log='# tests 1\n# fail 0\n# skipped 0\n# todo 0\n';
 const format={schema:'truyn.p11-p12-p13.exact-qualification/v1',context,packagesReportSha256:digest(bytes(build)),registration:validateRegistration(registration,context,bytes(build),{requireAll:true}),artifacts:validateArtifactMatrix(artifacts,context,bytes(build)),registrationSha256:digest(bytes(registration)),artifactsSha256:digest(bytes(artifacts)),P11:'SOURCE_BASELINE_QUALIFIED',P12:'BOUNDED_REFERENCE_QUALIFIED',P13_FORMAT:'RELEASE_ADMISSION_PENDING',registryPublicationVerified:false,stableProtocolDeclared:false,productionCutoverAuthorized:false,tests:Object.fromEntries(['P11','P12','P13_FORMAT'].map(g=>[g,{logSha256:digest(log),status:'PASS',tests:1}]))};
 for(const [name,value] of Object.entries({'registration.json':registration,'artifacts.json':artifacts,'format-qualification.json':format}))writeFileSync(join(root,'native-package-'+name),bytes(value));
 for(const gate of ['P11','P12','P13_FORMAT'])writeFileSync(join(root,'native-package-'+gate+'.tap'),log);
 return {manifest,build,lifecycle,proof,names,registration,artifacts,format};
}
test('native publication requires an explicit one-shot exact-parent request with no stable or cloud authority',()=>{
 const report=validateNativeRequest(request(),options);assert.equal(report.status,'VALID_REQUEST_ONLY');assert.deepEqual(report.tags,RELEASE_TAGS);assert.equal(report.productionCutoverAuthorized,false);
 for(const change of [x=>x.exactParentSha='f'.repeat(40),x=>x.packages.npm='0.1.0-alpha.5',x=>x.requireHostedCodeQL=false,x=>x.requireNativePackageProof=false,x=>x.requireNewImmutableTags=false,x=>x.cloudMutationAllowed=true,x=>x.stableProtocolDeclared=true]){const value=request();change(value);assert.throws(()=>validateNativeRequest(value,options));}
 assert.throws(()=>validateNativeRequest(request(),{...options,attempt:2}),/single_attempt/);
 assert.throws(()=>validateNativeRequest(request(),{...options,candidate:{...candidate,publicationState:'accepted'}}));
});
test('independent native bundle validation requires post-merge SHA, exact bytes and all 80+30+10 cases',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-publication-test-'));
 try{
  const f=fixture(root);const report=validateNativeBundle(root,context);assert.equal(report.status,'BUNDLE_VERIFIED_ONLY');assert.equal(report.cases,80);assert.equal(report.securityCases,30);assert.equal(report.negotiationCases,10);assert.equal(report.registryPublicationVerified,false);
  assert.throws(()=>validateNativeBundle(root,{...context,event:'pull_request'}),/postmerge_push/);
  assert.throws(()=>validateNativeBundle(root,{...context,sourceSha:'f'.repeat(40)}));
  for(const change of [x=>x.outcomes.pop(),x=>x.outcomes[0].status='BLOCKED',x=>x.sourceSecurity.pop(),x=>x.negotiation.pop()]){const l=structuredClone(f.lifecycle);change(l);writeFileSync(join(root,'native-package-lifecycle.json'),bytes(l));assert.throws(()=>validateNativeBundle(root,context));}
  writeFileSync(join(root,'native-package-lifecycle.json'),bytes(f.lifecycle));
  const badRegistration=structuredClone(f.registration);badRegistration.outcomes.pop();writeFileSync(join(root,'native-package-registration.json'),bytes(badRegistration));assert.throws(()=>validateNativeBundle(root,context));
  writeFileSync(join(root,'native-package-registration.json'),bytes(f.registration));
  writeFileSync(join(root,f.names[0]),'tampered-data');assert.throws(()=>validateNativeBundle(root,context),/package_bytes_mismatch/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('native release wiring verifies a bundle before creating tags and never admits Stable or production',()=>{
 const workflow=read('.github/workflows/wire-freeze-release-request.yml');
 assert.ok(workflow.includes('.github/wire-freeze/native-lifecycle-release-request.json'));
 assert.ok(workflow.includes('node sdk/release/native-publication.mjs request'));
 const verified=workflow.indexOf('node sdk/release/native-publication.mjs bundle');
 const tags=workflow.indexOf('gh api --method POST');assert.ok(verified>0&&tags>verified);
 for(const marker of ['RELEASE_ABORT_DUPLICATE_TAG','RELEASE_ABORT_MOVING_MAIN','full-qualification','requireNewImmutableTags','NATIVE_LIFECYCLE_RELEASE'])assert.ok(workflow.includes(marker));
 for(const tag of RELEASE_TAGS)assert.ok(workflow.includes(tag));
 assert.doesNotMatch(workflow,/--force|skip-duplicate|azure\/login/);
 const npm=read('.github/workflows/publish-npm.yml');
 const bootstrap=npm.slice(npm.indexOf('  bootstrap-tag:'),npm.indexOf('  publish:'));
 assert.ok(bootstrap.includes("github.ref == 'refs/heads/main'"));
});
