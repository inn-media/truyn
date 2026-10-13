#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {qualifySourceLifecycle} from './source-contract.mjs';
const run=spawnSync(process.execPath,['sdk/conformance/lifecycle-peer/run.mjs'],{stdio:'inherit',timeout:300000,env:process.env});
if(run.error||run.status!==0)throw run.error||Error('native_lifecycle_execution_failed:'+run.status);
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sha,process.env.TRUYN_EXPECTED_SOURCE_SHA);
const context={sourceSha:sha,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
const directory=resolve(process.env.RUNNER_TEMP,'five-sdk-evidence');
const raw=readFileSync(resolve(directory,'lifecycle.json'));
const report=qualifySourceLifecycle(JSON.parse(raw),context);
report.lifecycleSha256=createHash('sha256').update(raw).digest('hex');
report.remaining=['Immutable published predecessor APIs are not changed by source qualification.','A new published SDK release and exact-package lifecycle qualification are still required.','Durable P6-P9, full P11/P13-FORMAT and P14 admission require their independent evidence.'];
writeFileSync(resolve(directory,'source-lifecycle.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
