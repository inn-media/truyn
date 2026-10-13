#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {digest,validateBuildBundle,qualifyPackagedLifecycle} from './package-contract.mjs';
const dist=resolve('sdk/release/dist');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sourceSha,process.env.TRUYN_RELEASE_SOURCE_SHA,'package producer must check out its declared exact SHA');
const context={sourceSha,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
assert.ok(context.runId>0&&context.runAttempt>0&&context.event);
const versions=JSON.parse(readFileSync('sdk/release/version.json','utf8'));
const rawManifest=readFileSync(join(dist,'manifest.json'));const manifest=JSON.parse(rawManifest);
const packages=validateBuildBundle(manifest,context,versions,dist);
const stage=mkdtempSync(join(process.env.RUNNER_TEMP,'truyn-native-packages-'));
const evidence=join(stage,'five-sdk-evidence');mkdirSync(evidence);
const build={schema:'truyn.unpublished-native-sdk-build/v1',context,status:'PASS',publicationState:'unpublished',publishedSdkSourceSha:null,versions,packages,manifestSha256:digest(rawManifest)};
writeFileSync(join(evidence,'report.json'),JSON.stringify(build,null,2)+'\n',{flag:'wx'});
const env={...process.env,TRUYN_PACKAGED_STAGE:stage,TRUYN_PACKAGE_DIST:dist,TRUYN_EXPECTED_SOURCE_SHA:sourceSha,RUNNER_TEMP:stage,PYTHONDONTWRITEBYTECODE:'1',NUGET_PACKAGES:join(stage,'nuget-cache'),TRUYN_LEGACY_NPM_ROOT:join(stage,'npm'),TRUYN_LEGACY_PYTHON:join(stage,'python-package/bin/python'),TRUYN_CANDIDATE_PYTHON:join(stage,'python-source/bin/python'),TRUYN_LEGACY_JAVA_CP:join(dist,'java/truyn-sdk-'+versions.release+'.jar'),TRUYN_CANDIDATE_JAVA_CP:resolve('sdk/java/target/classes')};
const execute=(command,args)=>{const r=spawnSync(command,args,{env,stdio:'inherit',timeout:600000});if(r.error||r.status!==0)throw r.error||Error('packaged_successor_command_failed:'+command+':'+r.status);};
try{
 execute('bash',['sdk/conformance/lifecycle-peer/prepare-packaged.sh']);
 execute(process.execPath,['sdk/conformance/lifecycle-peer/run.mjs']);
 env.TRUYN_REGISTRATION_REQUIRE_ALL='true';
 execute(process.execPath,['sdk/conformance/registration-peer/qualify.mjs']);
 const raw=readFileSync(join(evidence,'lifecycle.json'));const lifecycle=JSON.parse(raw);
 const report=qualifyPackagedLifecycle(lifecycle,build,context);
 report.lifecycleSha256=digest(raw);report.buildProofSha256=digest(readFileSync(join(evidence,'report.json')));
 // Revalidate that the tested archives are exactly those subsequently uploaded.
 validateBuildBundle(manifest,context,versions,dist);assert.equal(digest(readFileSync(join(dist,'manifest.json'))),build.manifestSha256);
 const outputs={'native-package-proof.json':JSON.stringify(report,null,2)+'\n','native-package-lifecycle.json':raw,'native-package-build.json':JSON.stringify(build,null,2)+'\n'};
 for(const [name,value] of Object.entries(outputs))writeFileSync(join(dist,name),value,{flag:'wx'});
 for(const name of ['registration.json','artifacts.json','format-qualification.json','P11.tap','P12.tap','P13_FORMAT.tap'])
  writeFileSync(join(dist,'native-package-'+name),readFileSync(join(evidence,name)),{flag:'wx'});
 console.log(JSON.stringify(report));
}finally{rmSync(stage,{recursive:true,force:true});}
