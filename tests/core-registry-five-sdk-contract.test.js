import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=JSON.parse(read('spec/registry/truyn-core-v1.json'));
const matrix=JSON.parse(read('sdk/conformance/v1/core-registry-five-sdk-matrix.json'));
test('CORE has exact eight-digit 80-row matrix and five explicit native SDK APIs',()=>{
 assert.equal(registry.entries.length,80);assert.equal(matrix.entries.length,80);
 assert.equal(matrix.stableSdkReleaseAuthorized,false);
 const seen=new Set();
 for(let i=0;i<80;i++){
  const entry=registry.entries[i],row=matrix.entries[i];
  assert.match(entry.code,/^[0-9]{8}$/);
  assert.ok(!seen.has(entry.code));seen.add(entry.code);
  assert.equal(row.code,entry.code);
  assert.equal(row.semanticObject,entry.name);
  assert.equal(row.semanticForm,entry.form);
  assert.deepEqual(Object.keys(row.sdkApi).sort(),['dotnet','go','java','python','typescript']);
  for(const item of Object.values(row.sdkApi)){
   assert.equal(item.recognition,'REQUIRED_NATIVE_80_ROW_PROOF');
   assert.equal(item.eligibleForExecution,entry.form==='signed_envelope_v1'&&entry.admission==='baseline');
   assert.ok(item.api&&item.transmission&&item.verification&&item.execution);
  }
 }
 assert.equal(seen.size,80);
});
test('native five-SDK gate and stable fail-closed admission are wired into mandatory CI',()=>{
 const runner=read('sdk/conformance/run-five-language-e2e.mjs');
 const build=read('sdk/release/build-release.sh');
 const gate=read('sdk/conformance/core-registry/run.mjs');
 assert.ok(runner.includes("['sdk/conformance/core-registry/run.mjs']"));
 assert.ok(build.includes('run.mjs" --stable'));
 assert.match(gate,/stable_core_sdk_admission_blocked/);
 assert.match(gate,/nativeRecognitionCells:400/);
 const p=spawnSync(process.execPath,['--check','sdk/conformance/core-registry/run.mjs'],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});
