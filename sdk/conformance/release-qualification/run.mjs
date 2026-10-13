#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {qualify} from './evaluate.mjs';
const root=resolve(import.meta.dirname,'../../..');
const evidence=process.env.TRUYN_LIFECYCLE_EVIDENCE_DIR||resolve(process.env.RUNNER_TEMP||'','five-sdk-evidence');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sourceSha,process.env.TRUYN_EXPECTED_SOURCE_SHA,'source_SHA_drift');
const context={sourceSha,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),
 runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
const inputNames=['report.json','lifecycle.json','source-lifecycle.json','p14-lifecycle-coverage.json'];
const receipts=Object.fromEntries(inputNames.map(n=>[n,hash(readFileSync(resolve(evidence,n)))]));
const fromEvidence=n=>JSON.parse(readFileSync(resolve(evidence,n),'utf8'));
const freeze=JSON.parse(readFileSync(resolve(root,'spec/compatibility/truyn1-five-sdk-freeze.json'),'utf8'));
const groups={
 'P11':['tests/protocol-v1-compatibility-matrix.test.js','tests/truyn1-p11-generation-security.test.js','tests/protocol-v1-negotiation.test.js','tests/errors-versioning-interop.test.js'],
 'P12':['tests/truyn1-p12-reference-integrity.test.js'],
 'P13-FORMAT':['tests/p13-migration-rollback-interoperability.test.js','tests/p13-lane-isolation.test.js','tests/p13-release-scope-regression.test.js']
};
const suites={};
for(const [name,paths] of Object.entries(groups)){
 const run=spawnSync(process.execPath,['--test',...paths],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
 if(run.error)throw run.error;
 const passed=Number(/^# pass (\d+)$/m.exec(run.stdout||'')?.[1]);
 const failed=Number(/^# fail (\d+)$/m.exec(run.stdout||'')?.[1]);
 if(run.status!==0||!Number.isInteger(passed)||passed<1||failed!==0)throw Error('red_suite:'+name+'\n'+run.stderr+'\n'+(run.stdout||'').slice(-6000));
 suites[name]={passed,failed,logSha256:hash(run.stdout),paths};
}
const report=qualify({context,freeze,matrix:fromEvidence('report.json'),source:fromEvidence('source-lifecycle.json'),
 coverage:fromEvidence('p14-lifecycle-coverage.json'),suites,receipts});
writeFileSync(resolve(evidence,'p11-p12-p13format-exact-qualification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({exact:context,p11:report.p11.status,p12:report.p12.status,
 p13Format:report.p13Format.status,positivePairs:report.p13Format.realPublishedSourcePairs,
 lifecycleBlocked:report.p13Format.publishedLifecycleMissingOrUnsupported,stable:false}));
