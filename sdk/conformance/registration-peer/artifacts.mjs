#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRelay } from '../../../network/relay/server.js';
import { resolveVerifiedObjectReference, verifyImmutableObjectBytes } from '../../../core/object/integrity.js';
import { launchNativePeer } from '../lifecycle-peer/native-peer.mjs';
import { LANGUAGES, MODES, digest } from './contract.mjs';
import { validateArtifactMatrix } from './artifact-contract.mjs';
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sourceSha,process.env.TRUYN_EXPECTED_SOURCE_SHA);
assert.equal(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim(),'');
const context={sourceSha,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),
  runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
const directory=resolve(process.env.RUNNER_TEMP,'five-sdk-evidence'),packageBytes=readFileSync(resolve(directory,'report.json'));
assert.deepEqual(JSON.parse(packageBytes).context,context);assert.equal(JSON.parse(packageBytes).status,'PASS');
const bytes=Buffer.from('TRUYN P12: ə, 日本語, 🧠\n','utf8');
let implicitFetches=0;
const trap=http.createServer((_req,res)=>{implicitFetches++;res.writeHead(500).end();});
await new Promise(ok=>trap.listen(0,'127.0.0.1',ok));
const reference={ref:`http://127.0.0.1:${trap.address().port}/opaque-artifact`,sha256:digest(bytes),bytes:bytes.length,mediaType:'application/octet-stream'};
const relay=createRelay({localDevelopmentMode:true}),url=await relay.listen({port:0}),outcomes=[];
try {
  for(const language of LANGUAGES)for(const provider of MODES)for(const requester of MODES){
    const P=launchNativePeer(language,provider,url),R=launchNativePeer(language,requester,url);
    const call=async(peer,action,args)=>{const r=await peer.call(action,args);assert.equal(r.ok,true,r.error);return r.value;};
    const capability=`p12.artifact.${language}.${provider}.${requester}`;
    try {
      await call(P,'connect',{actor:'provider'});await call(R,'connect',{actor:'requester'});
      await call(P,'offer',{actor:'provider',capability});
      const need=await call(R,'need',{actor:'requester',capability});
      const received=await call(P,'nextNeed',{actor:'provider'});assert.equal(received.verified,true);assert.equal(received.needId,need.needId);
      await call(P,'result',{actor:'provider',needId:need.needId,output:reference});
      const result=await call(R,'waitResult',{actor:'requester',needId:need.needId,includeOutput:true});
      assert.equal(result.verified,true);assert.deepEqual(result.output,reference);
      const code=expected=>error=>error?.code===expected;
      await assert.rejects(resolveVerifiedObjectReference(result.output),code('OBJECT_RESOLVER_REQUIRED'));
      assert.throws(()=>verifyImmutableObjectBytes({...result.output,sha256:'0'.repeat(64)},bytes),code('OBJECT_INTEGRITY_MISMATCH'));
      assert.throws(()=>verifyImmutableObjectBytes({...result.output,bytes:bytes.length+1},bytes),code('OBJECT_INTEGRITY_MISMATCH'));
      let resolverCalls=0;
      const verified=await resolveVerifiedObjectReference(result.output,{maxBytes:bytes.length,resolve:async()=>{resolverCalls++;return bytes;}});
      assert.equal(verified.verified,true);assert.equal(resolverCalls,1);assert.equal(implicitFetches,0);
      outcomes.push({language,provider,requester,status:'PASS',signatureVerified:true,referencePreserved:true,
        explicitResolverVerified:true,wrongDigestRejected:true,wrongSizeRejected:true,noResolverRejected:true,resolverCalls});
    }finally{for(const peer of [P,R]){peer.child.stdin.end();if(peer.child.exitCode===null)peer.child.kill('SIGTERM');}}
  }
  const report={schema:'truyn.p12.native-artifact-reference/v1',context,packagesReportSha256:digest(packageBytes),
    status:'PASS',outcomes,implicitFetches,stableProtocolDeclared:false,productionCutoverAuthorized:false,
    scope:'Native five-SDK signed opaque-reference roundtrips; explicit byte verification uses the reference runtime. No distributed OBJECT transport claim.'};
  validateArtifactMatrix(report,context,packageBytes);
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha);
  assert.equal(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim(),'');
  writeFileSync(resolve(directory,'artifacts.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({schema:report.schema,context,cases:outcomes.length,implicitFetches,status:'PASS'}));
}finally{await relay.close();trap.closeAllConnections();await new Promise(ok=>trap.close(ok));}
