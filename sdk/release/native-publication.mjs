#!/usr/bin/env node
// Pure, non-publishing validators for the explicit native-lifecycle release request.
// Only the protected registry workflows publish, after independent exact-main CI.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,validateBuildBundle,qualifyPackagedLifecycle} from '../conformance/lifecycle-peer/package-contract.mjs';
import {validateRegistration} from '../conformance/registration-peer/contract.mjs';
import {validateArtifactMatrix} from '../conformance/registration-peer/artifact-contract.mjs';

export const TARGET_VERSIONS=Object.freeze({release:'0.1.0-alpha.3',typescript:'0.1.0-alpha.6',python:'0.1.0a3',goTag:'sdk/go/v0.1.0-alpha.3',protocol:'TRUYN/1',stableSdkApiVersion:'1',channel:'public-pre-release'});
export const TARGET_PACKAGES=Object.freeze({npm:'0.1.0-alpha.6',pypi:'0.1.0a3',go:'v0.1.0-alpha.3',maven:'0.1.0-alpha.3',nuget:'0.1.0-alpha.3'});
export const RELEASE_TAGS=Object.freeze(['sdk/npm/v0.1.0-alpha.6','sdk/python/v0.1.0a3','sdk/go/v0.1.0-alpha.3','sdk/maven/v0.1.0-alpha.3','sdk/nuget/v0.1.0-alpha.3']);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function raw(path){const stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<2_000_000,'invalid_release_evidence_file');return readFileSync(path);}
const json=path=>JSON.parse(raw(path));

export function validateNativeRequest(request,{parentSha,attempt,versions,candidate}){
 assert.ok(sha(parentSha),'invalid_release_parent');
 assert.equal(attempt,1,'release_request_is_single_attempt');
 assert.equal(request?.schema,'truyn.native-lifecycle-release-request/v1');
 assert.equal(request.task,'truyn1-native-lifecycle-successor-publication-20261012');
 assert.equal(request.intent,'publish-five-qualified-native-lifecycle-prereleases');
 assert.equal(request.exactParentSha,parentSha,'stale_release_request');
 assert.deepEqual(request.packages,TARGET_PACKAGES,'wrong_release_versions');
 for(const key of ['cloudMutationAllowed','managedCanaryAllowed','mainnetAdmissionAllowed','stableProtocolDeclared'])assert.equal(request[key],false,key);
 for(const key of ['requireExactMainCI','requireHostedCodeQL','requireNewImmutableTags','requireNativePackageProof'])assert.equal(request[key],true,key);
 assert.deepEqual(versions,TARGET_VERSIONS,'wrong_source_versions');
 assert.equal(candidate?.schema,'truyn.sdk-successor-candidate/v1');
 assert.equal(candidate.intent,'build-unpublished-native-lifecycle-successor');
 assert.equal(candidate.publicationState,'unpublished');
 assert.equal(candidate.predecessorSourceSha,'57971b134a41c3e3ea4b42f68e86a7d117036006');
 assert.deepEqual(candidate.targetVersions,TARGET_VERSIONS);
 assert.equal(candidate.requiredSourceLifecycleCases,20);
 assert.equal(candidate.requiredSourceSecurityCases,30);
 for(const key of ['publicationAuthorizedByThisFile','stableProtocolDeclared','productionCutoverAuthorized'])assert.equal(candidate[key],false,key);
 return {schema:'truyn.native-release-request-validation/v1',status:'VALID_REQUEST_ONLY',tags:[...RELEASE_TAGS],packages:TARGET_PACKAGES,requiresVerifiedBundle:true,stableProtocolDeclared:false,productionCutoverAuthorized:false};
}

export function validateNativeBundle(root,context,versions=TARGET_VERSIONS){
 assert.ok(sha(context?.sourceSha)&&sha(context.sourceTree),'invalid_release_context');
 assert.ok(Number.isSafeInteger(context.runId)&&context.runId>0&&Number.isSafeInteger(context.runAttempt)&&context.runAttempt>0,'invalid_release_run');
 assert.equal(context.event,'push','release_requires_postmerge_push_proof');
 assert.deepEqual(versions,TARGET_VERSIONS,'wrong_release_versions');
 const manifestBytes=raw(resolve(root,'manifest.json'));
 const manifest=JSON.parse(manifestBytes);
 const packages=validateBuildBundle(manifest,context,versions,root);
 const buildBytes=raw(resolve(root,'native-package-build.json'));
 const build=JSON.parse(buildBytes);
 const lifecycleBytes=raw(resolve(root,'native-package-lifecycle.json'));
 const lifecycle=JSON.parse(lifecycleBytes);
 const recorded=json(resolve(root,'native-package-proof.json'));
 assert.deepEqual(build.context,context,'release_build_context_mismatch');
 assert.deepEqual(build.packages,packages,'release_package_receipts_mismatch');
 assert.deepEqual(build.versions,versions,'release_build_versions_mismatch');
 assert.equal(build.manifestSha256,digest(manifestBytes),'release_manifest_binding_mismatch');
 const expected=qualifyPackagedLifecycle(lifecycle,build,context);
 expected.lifecycleSha256=digest(lifecycleBytes);
 expected.buildProofSha256=digest(buildBytes);
 assert.deepEqual(recorded,expected,'release_native_proof_mismatch');
 assert.equal(recorded.cases,80);assert.equal(recorded.securityCases,30);assert.equal(recorded.negotiationCases,10);
 const registrationBytes=raw(resolve(root,'native-package-registration.json'));
 const artifactBytes=raw(resolve(root,'native-package-artifacts.json'));
 const registration=validateRegistration(JSON.parse(registrationBytes),context,buildBytes,{requireAll:true});
 const artifacts=validateArtifactMatrix(JSON.parse(artifactBytes),context,buildBytes);
 const format=json(resolve(root,'native-package-format-qualification.json'));
 assert.equal(format.schema,'truyn.p11-p12-p13.exact-qualification/v1');
 assert.deepEqual(format.context,context);assert.deepEqual(format.registration,registration);assert.deepEqual(format.artifacts,artifacts);
 assert.equal(format.packagesReportSha256,digest(buildBytes));
 assert.equal(format.registrationSha256,digest(registrationBytes));assert.equal(format.artifactsSha256,digest(artifactBytes));
 assert.equal(format.P11,'SOURCE_BASELINE_QUALIFIED');assert.equal(format.P12,'BOUNDED_REFERENCE_QUALIFIED');assert.equal(format.P13_FORMAT,'RELEASE_ADMISSION_PENDING');
 for(const flag of ['registryPublicationVerified','stableProtocolDeclared','productionCutoverAuthorized'])assert.equal(format[flag],false);
 for(const gate of ['P11','P12','P13_FORMAT']){
  const log=raw(resolve(root,'native-package-'+gate+'.tap'));
  assert.equal(format.tests[gate].logSha256,digest(log));assert.equal(format.tests[gate].status,'PASS');
  assert.equal(format.tests[gate].tests,Number(/^# tests (\d+)$/m.exec(log.toString())?.[1]));assert.ok(format.tests[gate].tests>0);
  for(const marker of ['fail','skipped','todo'])assert.match(log.toString(),new RegExp('^# '+marker+' 0$','m'));
 }
 return {schema:'truyn.native-release-bundle-validation/v1',status:'BUNDLE_VERIFIED_ONLY',context,packages,versions,manifestSha256:digest(manifestBytes),nativeProofSha256:digest(raw(resolve(root,'native-package-proof.json'))),cases:80,securityCases:30,negotiationCases:10,registrationCases:registration.totalCases,artifactCases:artifacts.cases,formatProofSha256:digest(raw(resolve(root,'native-package-format-qualification.json'))),registryPublicationVerified:false,stableProtocolDeclared:false,productionCutoverAuthorized:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2);let report;
 if(mode==='request'){
  assert.equal(args.length,3);
  report=validateNativeRequest(json(args[0]),{parentSha:args[1],attempt:Number(args[2]),versions:json('sdk/release/version.json'),candidate:json('sdk/release/native-successor-candidate.json')});
 }else if(mode==='bundle'){
  assert.equal(args.length,5);
  report=validateNativeBundle(args[0],{sourceSha:args[1],sourceTree:args[2],runId:Number(args[3]),runAttempt:Number(args[4]),event:'push'});
 }else throw Error('usage: native-publication.mjs request <request> <parent-sha> <attempt> | bundle <directory> <source-sha> <tree> <ci-run> <ci-attempt>');
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
