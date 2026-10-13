#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const registry=read('spec/registry/truyn-core-v1.json');
const matrix=read('sdk/conformance/v1/core-registry-five-sdk-matrix.json');
const langs=['typescript','python','go','java','dotnet'];
const wire=e=>{
 if(e.form==='signed_envelope_v1')return 'signed_json_envelope:'+e.name;
 if(e.form==='compact_runtime')return 'signed_compact:'+(e.compact_alias||'UNSPECIFIED');
 if(e.form==='quic_control_method')return 'quic_rpc:'+e.wire_method;
 if(e.form==='embedded_object_or_descriptor')return 'embedded_object_or_descriptor';
 if(e.form==='outcome_semantics')return 'outcome_semantics';
 if(e.form==='composed_behavior')return 'composed_behavior';
 if(e.form==='reserved_unadmitted_semantic')return 'not_admitted';
 if(e.form==='semantic_family_or_surface')return 'semantic_family_not_new_wire_type';
 return 'none';
};
assert.equal(registry.schema,'truyn.registry.core/1');
assert.equal(registry.entries.length,80);
assert.equal(matrix.schema,'truyn.core-registry.five-sdk-coverage/v1');
assert.equal(matrix.source,'spec/registry/truyn-core-v1.json');
assert.deepEqual(matrix.languages,langs);
assert.equal(matrix.stableSdkReleaseAuthorized,false);
assert.equal(matrix.entries.length,80);
const seen=new Set();
let baseline=0;
for(let i=0;i<registry.entries.length;i++){
 const e=registry.entries[i],m=matrix.entries[i];
 assert.match(e.code,/^[0-9]{8}$/);
 assert.ok(!seen.has(e.code),'duplicate_core_code:'+e.code);seen.add(e.code);
 assert.deepEqual([m.code,m.short,m.name,m.class,m.semanticObject,m.semanticForm,m.admission,m.wireRepresentation],
   [e.code,e.short,e.name,e.class,e.name,e.form,e.admission,wire(e)]);
 assert.deepEqual(Object.keys(m.sdkApi).sort(),[...langs].sort());
 const can=e.form==='signed_envelope_v1'&&e.admission==='baseline';
 if(can)baseline++;
 for(const l of langs){
   const x=m.sdkApi[l];
   assert.equal(x.recognition,'REQUIRED_NATIVE_80_ROW_PROOF');
   assert.equal(x.eligibleForExecution,can);
   assert.ok(x.api&&x.transmission&&x.verification&&x.execution);
 }
 assert.equal(m.tests.recognition,'sdk/conformance/core-registry/run.mjs');
}
assert.equal(baseline,5);
assert.deepEqual(registry.baseline_signed_envelope_types,
 registry.entries.filter(e=>e.form==='signed_envelope_v1').map(e=>e.name));
assert.equal(registry.entries[0].code,'00000000');
function run(cmd,args,cwd=root){
 const p=spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:1048576,timeout:120000,env:process.env});
 if(p.error||p.status!==0)throw Error('native_sdk_probe_failed:'+cmd+':'+(p.error?.message||p.stderr||'')+'\n'+(p.stdout||'').slice(-800));
 return p.stdout.trim().split(/\r?\n/).filter(Boolean);
}
const codes=[...registry.entries.map(e=>e.code),'99999999','1234567','TRUYN/1'];
const temp=mkdtempSync(join(tmpdir(),'truyn-core-registry-'));
const reports={};
try{
 for(const lang of langs){
   let output;
   if(lang==='typescript')output=run(process.execPath,['--experimental-strip-types','sdk/conformance/core-registry/probe.ts',...codes]);
   if(lang==='python')output=run('python',['sdk/conformance/core-registry/probe.py',...codes]);
   if(lang==='go')output=run('go',['run','./cmd/core-registry-probe',...codes],resolve(root,'sdk/go'));
   if(lang==='java'){
     run('javac',['-cp','sdk/java/target/classes','-d',temp,'sdk/conformance/core-registry/CoreRegistryProbe.java']);
     output=run('java',['-cp',temp+':'+resolve(root,'sdk/java/target/classes'),'CoreRegistryProbe',...codes]);
   }
   if(lang==='dotnet')output=run('dotnet',['run','--configuration','Release','--project',
     'sdk/conformance/core-registry/dotnet/CoreRegistryProbe.csproj','--',...codes]);
   assert.equal(output.length,codes.length,lang+': incomplete native probe');
   const observed=new Set();
   for(let i=0;i<codes.length;i++){
     const parts=output[i].split('|');
     assert.equal(parts[0],codes[i],lang+': code order');
     if(i>=80){assert.deepEqual(parts,[codes[i],'UNKNOWN']);continue;}
     const e=registry.entries[i];
     const can=e.form==='signed_envelope_v1'&&e.admission==='baseline';
     assert.deepEqual(parts,[e.code,e.short||'',e.name,e.class,e.form,e.admission,wire(e),String(can)],
       lang+': mismatched metadata or unauthorized admission '+e.code);
     assert.ok(!observed.has(e.code));observed.add(e.code);
   }
   assert.equal(observed.size,80);
   reports[lang]={recognized:80,baselineExecutable:5,unadmittedRejected:75,unknownRejected:3,status:'PASS'};
   console.log('CORE '+lang+': 80/80 native recognized; 75 unadmitted + 3 unknown denied');
 }
}finally{rmSync(temp,{recursive:true,force:true});}
const pending=registry.entries.filter(e=>e.admission==='existing_distinct_wire')
 .map(e=>({code:e.code,name:e.name,reason:'native SDK transmission/verification/execution qualification pending'}));
const report={schema:'truyn.core-registry.native-five-sdk-conformance/v1',
 registryRows:80,nativeRecognitionCells:400,languages:reports,
 existingDistinctWirePending:pending,status:'REGISTRY_RECOGNITION_PASS',
 stableSdkReleaseStatus:'BLOCKED',stableProtocolDeclared:false,
 productionCutoverAuthorized:false};
console.log(JSON.stringify(report));
if(process.argv.includes('--stable'))
 throw Error('stable_core_sdk_admission_blocked: full semantic surface and P13-FORMAT qualifications missing');
