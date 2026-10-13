#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, validateRegistration } from './contract.mjs';
import { validateArtifactMatrix } from './artifact-contract.mjs';
const directory=resolve(process.env.RUNNER_TEMP,'five-sdk-evidence');
const packageBytes=readFileSync(resolve(directory,'report.json')),context=JSON.parse(packageBytes).context;
assert.equal(context.sourceSha,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
for(const script of ['run.mjs','artifacts.mjs']){
  const run=spawnSync(process.execPath,['sdk/conformance/registration-peer/'+script],{stdio:'inherit',env:process.env,timeout:300000});
  if(run.error||run.status!==0)throw run.error||Error('native format qualification failed: '+script);
}
const suites={
  P11:['protocol-v1-compatibility-matrix','protocol-v1-negotiation','protocol-v1-negotiation-fixtures','protocol-v1-registration-freshness','errors-versioning-interop','truyn1-p11-generation-security','p11-registration-confirmation'],
  P12:['truyn1-p12-reference-integrity'],
  P13_FORMAT:['p13-migration-rollback-interoperability','migration-deprecation-policy','p13-lane-isolation','p13-release-scope-regression']
};
const tests={};
for(const [gate,names] of Object.entries(suites)){
  const paths=names.map(n=>'tests/'+n+'.test.js');
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...paths],{encoding:'utf8',env:process.env,timeout:120000,maxBuffer:16*1024*1024});
  const log=(run.stdout??'')+(run.stderr??'');writeFileSync(resolve(directory,gate+'.tap'),log,{flag:'wx'});
  if(run.error||run.status!==0)throw run.error||Error(gate+' contract tests failed');
  const count=Number(/^# tests (\d+)$/m.exec(log)?.[1]);
  assert.ok(count>0);assert.match(log,/^# fail 0$/m);assert.match(log,/^# skipped 0$/m);assert.match(log,/^# todo 0$/m);
  tests[gate]={paths,tests:count,status:'PASS',logSha256:digest(log)};
}
const registrationBytes=readFileSync(resolve(directory,'registration.json')),artifactBytes=readFileSync(resolve(directory,'artifacts.json'));
const registration=validateRegistration(JSON.parse(registrationBytes),context,packageBytes,{requireAll:process.env.TRUYN_REGISTRATION_REQUIRE_ALL==='true'});
const artifacts=validateArtifactMatrix(JSON.parse(artifactBytes),context,packageBytes);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),context.sourceSha);
assert.equal(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim(),'');
const report={schema:'truyn.p11-p12-p13.exact-qualification/v1',context,packagesReportSha256:digest(packageBytes),
  registration,artifacts,tests,registrationSha256:digest(registrationBytes),artifactsSha256:digest(artifactBytes),
  P11:'SOURCE_BASELINE_QUALIFIED',P12:'BOUNDED_REFERENCE_QUALIFIED',P13_FORMAT:'RELEASE_ADMISSION_PENDING',
  registryPublicationVerified:false,stableProtocolDeclared:false,productionCutoverAuthorized:false};
writeFileSync(resolve(directory,'format-qualification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
