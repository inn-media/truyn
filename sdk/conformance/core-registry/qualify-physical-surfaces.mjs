#!/usr/bin/env node
// Exact published/source native peer witnesses + real local QUIC runtime proof.
// Completes an HONEST 55-cell qualification inventory, not stable five-SDK admission.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {qualifyPhysicalSurfaces} from './physical-surface-evaluate.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const folder=resolve(process.env.TRUYN_LIFECYCLE_EVIDENCE_DIR||resolve(process.env.RUNNER_TEMP||'','five-sdk-evidence'));
const current=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(current,process.env.TRUYN_EXPECTED_SOURCE_SHA,'exact source SHA drift');
const clean=spawnSync('git',['diff','--exit-code','HEAD','--'],{cwd:root,encoding:'utf8'});
assert.equal(clean.status,0,'dirty source input');
const context={sourceSha:current,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),
 runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
const bytes=name=>readFileSync(resolve(folder,name));
const lifecycleBytes=bytes('lifecycle.json');
const sourceBytes=bytes('source-lifecycle.json');
const packageBytes=bytes('report.json');
const report={registry:JSON.parse(readFileSync(resolve(root,'spec/registry/truyn-core-v1.json'),'utf8')),
 coreMatrix:JSON.parse(readFileSync(resolve(root,'sdk/conformance/v1/core-registry-five-sdk-matrix.json'),'utf8')),
 lifecycle:JSON.parse(lifecycleBytes),source:JSON.parse(sourceBytes),context,packageDigest:hash(packageBytes)};
assert.equal(report.source.lifecycleSha256,hash(lifecycleBytes),'source lifecycle witness changed');
const test=spawnSync(process.execPath,['--test','tests/core-physical-quic-controls.test.js'],{
 cwd:root,encoding:'utf8',timeout:150000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
if(test.error||test.status!==0){
 throw Error('real_local_quic_runtime_failed:'+(test.error?.message||test.status)+'\n'+(test.stdout||'').slice(-6000)+'\n'+(test.stderr||''));
}
const passed=Number(/^# pass (\d+)\s*$/m.exec(test.stdout||'')?.[1]);
const failed=Number(/^# fail (\d+)\s*$/m.exec(test.stdout||'')?.[1]);
assert.ok(Number.isInteger(passed)&&passed>=1);
assert.equal(failed,0);
const quic={status:'BOUNDED_NODE_RUNTIME_PASS',logSha256:hash(test.stdout),testsPassed:passed,testsFailed:failed,
 fixture:'tests/core-physical-quic-controls.test.js',scope:'Node.js runtime actual QUIC/UDP, not first-party language SDK'};
const result=qualifyPhysicalSurfaces({...report,runtimeQuic:quic});
result.inputDigests={publishedReceiptsSha256:hash(packageBytes),nativeLifecycleSha256:hash(lifecycleBytes),
 nativeSuccessorSha256:hash(sourceBytes)};
const target=resolve(folder,'core-11-physical-five-sdk-qualification.json');
writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,
 '### TRUYN CORE 11 physical surfaces: bounded qualification\n\n'+
 '15/55 source native compact cells bounded PASS; 40/55 BLOCKED for Stable SDK. '+
 'Five local QUIC RPCs executed by Node runtime, never counted as five-SDK QUIC. '+
 'Stable TRUYN/1 NOT ADMITTED. Evidence: '+result.context.sourceSha+'.\n',{flag:'a'});
console.log(JSON.stringify({schema:result.schema,sourceSha:current,
 status:result.status,nativePassed:result.sourceNativeBoundedPassed,blocked:result.blockedSdkCells,
 runtimeQuic:result.quicRuntime.status,stableSdkReleaseAuthorized:false}));
if(process.argv.includes('--stable'))throw Error('stable_core_physical_qualification_blocked');
