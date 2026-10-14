import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sign, createHash } from 'node:crypto';
import { ATTEST_VERDICTS } from '../core/claims/index.js';
import { createIdentity } from '../core/identity/index.js';
import { canonicalize, createEnvelope, verifyEnvelope, unsignedEnvelope, ENVELOPE_EXT_SEMANTIC, envelopePriority } from '../core/protocol/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynQuicTransport } from '../network/transport/quic.js';
const semantics=[ENVELOPE_EXT_SEMANTIC];
const corpus=JSON.parse(readFileSync(new URL('../sdk/conformance/v1/envelope-ext-fixtures.json',import.meta.url)));
const resign=(node,env,ext)=>{const u={...unsignedEnvelope(env),ext};return {...u,signature:sign(null,Buffer.from(canonicalize(u)),node.identity.privateKeyPem).toString('base64')};};

test('G4 shared corpus preserves signed legacy metadata and verifies strict errors after crypto',()=>{
  assert.equal(corpus.cases.length,80);
  assert.equal(new Set(corpus.cases.map(c=>c.id)).size,80);
  for(const c of corpus.cases)assert.deepEqual(verifyEnvelope(c.envelope,c),c.expected,c.id);
  const critical={ext:{priority:'critical'}};
  assert.equal(envelopePriority(critical,{negotiatedSemantics:semantics}),'normal');
  assert.equal(envelopePriority(critical,{negotiatedSemantics:semantics,allowCritical:true}),'critical');
  assert.equal(envelopePriority(critical,{allowCritical:true}),'normal');
});

test('G4 emission requires explicit agreement, absence remains identical, and to can be omitted',()=>{
  const identity=createIdentity();const args={type:'NEED',from:identity.nodeId,privateKeyPem:identity.privateKeyPem,publicKeyPem:identity.publicKeyPem,payload:{input:{}}};
  assert.throws(()=>createEnvelope({...args,ext:{priority:'normal'}}),/version_mismatch/);
  for(const ext of [null,[],{crit:['missing']},{priority:'highest'}])assert.throws(()=>createEnvelope({...args,ext,negotiatedSemantics:semantics}),/invalid_argument/);
  const e=createEnvelope({...args,ext:{priority:'normal'},negotiatedSemantics:semantics});assert.deepEqual(verifyEnvelope(e,{negotiatedSemantics:semantics}),{ok:true});
  const u=unsignedEnvelope(createEnvelope(args));delete u.to;const without={...u,signature:sign(null,Buffer.from(canonicalize(u)),identity.privateKeyPem).toString('base64')};
  assert.deepEqual(verifyEnvelope(without,{negotiatedSemantics:semantics}),{ok:true});
});

test('G4 HTTP negotiation enforces ext before dispatch and forwards signed bytes unchanged',async t=>{
  const relay=createRelay({localDevelopmentMode:true,envelopeExtensions:true});const url=await relay.listen({port:0});t.after(()=>relay.close());
  const provider=new TruynNode({relayUrl:url}),requester=new TruynNode({relayUrl:url}),legacy=new TruynNode({relayUrl:url});
  await provider.register({semantics,requiredSemantics:semantics});await requester.register({semantics,requiredSemantics:semantics});await legacy.register();
  await provider.offer('ext.echo');await legacy.offer('ext.legacy');
  const post=async(n,envelope)=>{const r=await fetch(url+'/v1/needs',{method:'POST',headers:{...n.authHeaders(),'content-type':'application/json'},body:JSON.stringify({envelope})});return {status:r.status,body:await r.json()};};
  const base=requester.envelope('NEED',{capability:{name:'ext.echo'},input:{query:'Bakı 🚀'},policy:{}});
  for(const [ext,error] of [[null,'invalid_argument'],[{future:'x',crit:['future']},'version_mismatch'],[{contentType:'application/json;profile=future/1'},'unimplemented']]) {
    const rejected=await post(requester,resign(requester,base,ext));assert.equal(rejected.body.error,error);assert.equal((await provider.poll()).events.length,0);
  }
  const stale={...base,createdAt:new Date(Date.now()-120000).toISOString()};const expired=resign(requester,stale,{expiresAt:new Date(Date.now()-60000).toISOString()});
  assert.equal((await post(requester,expired)).body.error,'deadline_exceeded');assert.equal((await provider.poll()).events.length,0);
  const traceId='4bf92f3577b34da6a3ce929d0e0e4736';
  const envelope=requester.envelope('NEED',base.payload,{ext:{traceId,expiresAt:new Date(Date.now()+60000).toISOString(),priority:'critical'}});
  const response=await post(requester,envelope);assert.equal(response.status,200);
  const received=(await provider.poll()).events[0];assert.deepEqual(received.envelope,envelope);assert.deepEqual(received.verification,{ok:true});
  await provider.result(envelope.id,{ok:true},{},{ext:{traceId}});
  const reply=(await requester.poll()).events[0];assert.equal(reply.verification.ok,true);assert.equal(reply.envelope.ext.traceId,traceId);
  await assert.rejects(()=>requester.need('ext.legacy',{}, {}, {ext:{priority:'normal'}}),/version_mismatch/);
  assert.equal((await legacy.poll()).events.length,0);
  // A legacy sender's already-signed unknown metadata remains pass-through.
  const old=resign(legacy,legacy.envelope('NEED',base.payload),{future:'x',crit:['future']});assert.equal((await post(legacy,old)).status,200);
  const legacyReceived=(await provider.poll()).events[0];assert.deepEqual(legacyReceived.envelope,old);assert.deepEqual(legacyReceived.verification,{ok:true});
});

test('G4 unavailable relay semantic fails before send, legacy/new four-way baseline remains valid',async t=>{
  for(const enabled of [false,true]) {
    const relay=createRelay({localDevelopmentMode:true,envelopeExtensions:enabled});const url=await relay.listen({port:0});t.after(()=>relay.close());
    const old=new TruynNode({relayUrl:url}),fresh=new TruynNode({relayUrl:url});await old.register();await fresh.register({semantics});
    await old.offer('old');await fresh.offer('new');
    for(const [sender,cap,receiver] of [[old,'new',fresh],[fresh,'old',old]]) {await sender.need(cap,{text:'legacy'});const e=(await receiver.poll()).events[0];assert.deepEqual(e.verification,{ok:true});assert.equal(Object.hasOwn(e.envelope,'ext'),false)}
    if(!enabled)await assert.rejects(()=>new TruynNode({relayUrl:url}).register({semantics,requiredSemantics:semantics}),/version_mismatch/);
  }
});

test('G4 real authenticated QUIC preserves ext and rejects signed semantic negatives before handler', {timeout:20000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'truyn-ext-quic-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=127.0.0.1','-days','1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const tls={key:readFileSync(join(dir,'key.pem'),'utf8'),cert:readFileSync(join(dir,'cert.pem'),'utf8')};
  const clientIdentity=createIdentity();const server=new TruynQuicTransport({identity:createIdentity(),host:'127.0.0.1',tls,supportedSemantics:semantics});
  const client=new TruynQuicTransport({identity:clientIdentity,host:'127.0.0.1',tls,supportedSemantics:semantics,requiredSemantics:semantics});let calls=0;
  server.onEnvelope(async e=>{calls++;return e});
  try {const endpoint=await server.start();await client.start();const connection=await client.connect({host:'127.0.0.1',port:endpoint.port});
    const envelope=createEnvelope({type:'NEED',from:clientIdentity.nodeId,publicKeyPem:clientIdentity.publicKeyPem,privateKeyPem:clientIdentity.privateKeyPem,payload:{capability:'research',input:{text:'Bakı 🚀'}},ext:{priority:'normal'},negotiatedSemantics:semantics});
    assert.deepEqual(await client.sendEnvelope(connection,envelope),envelope);assert.equal(calls,1);
    const invalid=resign({identity:clientIdentity},envelope,{future:'x',crit:['future']});
    // Raw transport bypasses outbound SDK checks to exercise the receiver independently.
    const session=client.clientSessions.get(connection.connection);const stream=connection.connection.newStream();const writer=stream.writable.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify({kind:'envelope',sessionId:session.id,envelope:invalid})));await writer.close();
    const chunks=[];for await(const chunk of stream.readable)chunks.push(Buffer.from(chunk));const denied=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(denied.error,'version_mismatch');assert.equal(calls,1);
  }finally{await Promise.allSettled([client.close(),server.close()]);rmSync(dir,{recursive:true,force:true})}
});

test('Wire authority keeps implemented ATTEST spellings and protobuf projection tags',()=>{
  const spec=readFileSync(new URL('../spec/protocol/v1/attest.md',import.meta.url),'utf8');
  const proto=readFileSync(new URL('../proto/v1/attest.proto',import.meta.url),'utf8');
  const mapping=[['support','SUPPORTS',1],['contradict','DISPUTES',2],['uncertain','INCONCLUSIVE',3]];
  assert.deepEqual(ATTEST_VERDICTS,mapping.map(x=>x[0]));
  for(const [wire,label,number] of mapping){assert.ok(spec.includes('`'+wire+'`'));assert.ok(spec.includes(`ATTESTATION_${label} = ${number}`));assert.ok(proto.includes(`ATTESTATION_${label} = ${number};`))}
});
