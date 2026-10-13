#!/usr/bin/env node
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyEnvelope } from '../../core/protocol/index.js';
import { fileURLToPath } from 'node:url';
import { conformanceEnvironment } from './descriptor-qualification-policy.mjs';
conformanceEnvironment();
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceSha=sha();
const dirty=()=>execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim();
const before=dirty();
const fixture=name=>JSON.parse(readFileSync(new URL(`./v1/${name}`,import.meta.url)));
const pinnedFixtures = {
  'protocol-envelope-golden-fixtures.json': '9a363a6766a6c4113514333246ee0ea84e5ed4774642e5806e9f9063c1afe4cd',
  'envelope-ext-fixtures.json': '767db1b4d2d07857d327c2253d175d81406849dad2beb5bb5e5dce63d809f2f8',
  'envelope-ge-source.json': '4bcbef17568388e94465c7293c9c7941215766ce8ff0f09a31522f787c500f52'
};
for (const [name, expectedHash] of Object.entries(pinnedFixtures)) assert.equal(createHash('sha256').update(readFileSync(new URL(`./v1/${name}`,import.meta.url))).digest('hex'),expectedHash,`reviewed corpus drift: ${name}`);
const golden=fixture('protocol-envelope-golden-fixtures.json');
const ext=fixture('envelope-ext-fixtures.json');
assert.equal(golden.cases.length,5); assert.equal(ext.cases.length,80);
assert.deepEqual(golden.cases.map(c=>c.id),['envelope.offer-valid','envelope.need-valid','GE1','GE2','GE3']);
const expected=Object.fromEntries([...golden.cases.map(c=>[c.id,{...c.expected,canonicalUnsignedSha256:c.canonicalUnsignedSha256}]),...ext.cases.map(c=>[c.id,c.expected])]);
assert.equal(Object.keys(expected).length,85,'duplicate fixture ID');
const results={};
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,encoding:'utf8',env:conformanceEnvironment({...process.env,GOENV:'off',GOWORK:'off',GOFLAGS:''}),maxBuffer:10*1024*1024});if(r.error||r.status!==0)throw new Error(`${command}: ${r.error??r.stderr}\n${r.stdout}`);return r.stdout;}
function check(stdout,language){const lines=stdout.split('\n').filter(l=>l.startsWith('WIRE_FREEZE_RESULT '));assert.equal(lines.length,1,language);const report=JSON.parse(lines[0].slice(19));assert.equal(report.language,language);assert.deepEqual(report.results,expected,language);assert.equal(report.emissionBlocked,true,language+' ungated emission');assert.deepEqual(report.emitted.ext,{priority:'normal'});assert.deepEqual(report.emitted.payload.input,{query:'Bakı 🚀',topK:42,threshold:0.5});assert.deepEqual(verifyEnvelope(report.emitted,{negotiatedSemantics:['truyn.envelope.ext/1']}),{ok:true},language+' native signer');results[language]={cases:Object.keys(report.results).length,passed:true};}
check(run(process.execPath,['--experimental-strip-types','sdk/typescript/test/wire-freeze-conformance.ts']),'typescript');
check(run('python',['sdk/python/tests/wire_freeze_conformance.py']),'python');
check(run('go',['test','-v','-count=1','-run','^TestWireFreezeExtConformance$','.'],root+'/sdk/go'),'go');
run('mvn',['-q','-f','sdk/java/pom.xml','clean','test-compile']);
check(run('java',['-cp','sdk/java/target/classes:sdk/java/target/test-classes','org.truyn.sdk.WireFreezeConformance']),'java');
run('dotnet',['clean','sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj','--configuration','Release']);
check(run('dotnet',['run','--configuration','Release','--project','sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj','--','--wire-freeze']),'dotnet');
const after=dirty();assert.equal(sha(),sourceSha);assert.equal(before,'','qualification requires clean committed source');assert.equal(after,'','source changed during qualification');
const digest=name=>createHash('sha256').update(readFileSync(new URL(`./v1/${name}`,import.meta.url))).digest('hex');
console.log('WIRE_FREEZE_REPORT '+JSON.stringify({sourceSha,sourceShaAfter:sha(),exactSourceQualified:true,fixtures:{golden:digest('protocol-envelope-golden-fixtures.json'),ext:digest('envelope-ext-fixtures.json')},results,total:425,paidProviderCalls:0,stableAdmission:false,passed:true}));
