import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createIdentity } from '../core/identity/index.js';
import { agentDescriptorSigningPayload, verifyAgentDescriptorSignature } from '../sdk/conformance/reference/agent-descriptor.js';
import { loadCases, signedCase, validateResults, languages } from '../sdk/conformance/run-descriptor-interface-parity.mjs';
const cases = loadCases();
test('shared interface matrix preserves optional endpoint and signs every malformed case correctly', () => {
  assert.equal(cases.length,18);
  assert.equal(new Set(cases.map(c=>c.id)).size,18);
  const required={'endpoint-omitted':true,'endpoint-present':true,'endpoint-empty':false,'type-omitted':false,'type-empty':false};
  for (const [id,ok] of Object.entries(required)) assert.equal(cases.find(c=>c.id===id)?.ok,ok,id);
  const identity=createIdentity(), now=Date.now();
  for (const item of cases) {
    const descriptor=signedCase(item,identity,now);
    assert.equal(verify(null,Buffer.from(agentDescriptorSigningPayload(descriptor)),identity.publicKeyPem,Buffer.from(descriptor.signature,'base64')),!item.tamperSignature,item.id+' signature precondition');
    const result=verifyAgentDescriptorSignature(descriptor,{publicKeyPem:identity.publicKeyPem,now});
    assert.equal(result.ok,item.ok,item.id);
    if (!item.ok) assert.equal(result.reason,item.tamperSignature?'invalid_descriptor_signature':'invalid_descriptor_interfaces',item.id);
  }
});
test('parity evidence requires exact five SDKs, every observed fetch and every expected outcome', () => {
  const reports={}, requests={};
  for(const language of languages) reports[language]=cases.map(item=>{
    requests[`${language}/${item.id}`]=1;
    return item.ok?{id:item.id,ok:true,identity:'test',protocol:'TRUYN/1',keyBinding:'identity',interface:structuredClone(item.interfaces[0])}:{id:item.id,ok:false,message:item.tamperSignature?'invalid signature':'invalid interfaces'};
  });
  assert.doesNotThrow(()=>validateResults(cases,reports,requests,'test'));
  for(const language of languages){
    const missing=structuredClone(reports);delete missing[language];assert.throws(()=>validateResults(cases,missing,requests,'test'));
    for(let i=0;i<cases.length;i++){
      const omitted=structuredClone(reports);omitted[language].splice(i,1);assert.throws(()=>validateResults(cases,omitted,requests,'test'));
      const flipped=structuredClone(reports);flipped[language][i].ok=!flipped[language][i].ok;assert.throws(()=>validateResults(cases,flipped,requests,'test'));
      const absent={...requests,[`${language}/${cases[i].id}`]:0};assert.throws(()=>validateResults(cases,reports,absent,'test'));
    }
  }
});
test('required five-language release gate invokes actual interface-parity runner', () => {
  const driver=readFileSync(new URL('../sdk/conformance/run-five-language-e2e.mjs',import.meta.url),'utf8');
  assert.ok(driver.includes("await run(process.execPath, ['sdk/conformance/run-descriptor-interface-parity.mjs'])"));
});
