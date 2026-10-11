import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope, verifyEnvelope, createCompactFrame, verifyCompactFrame } from '../core/protocol/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('wire-freeze: signed JSON and compact reject mutation and wrong key', () => {
  const a=createIdentity(), b=createIdentity();
  const payload={capability:{name:'wire.freeze.e2e'},input:{query:'Bakı 🚀',quantity:1},policy:{}};
  const envelope=createEnvelope({type:'NEED',from:a.nodeId,privateKeyPem:a.privateKeyPem,publicKeyPem:a.publicKeyPem,payload});
  assert.deepEqual(verifyEnvelope(envelope),{ok:true});
  for (const modified of [
    {...envelope,id:envelope.id+'x'},
    {...envelope,createdAt:'2020-01-01T00:00:00Z'},
    {...envelope,ext:{crit:['expiresAt'],expiresAt:'2020-01-01T00:00:00Z'}},
    {...envelope,payload:{...payload,input:{query:'changed'}}}
  ]) assert.deepEqual(verifyEnvelope(modified),{ok:false,reason:'invalid_signature'});
  assert.deepEqual(verifyEnvelope({...envelope,from:b.nodeId}),{ok:false,reason:'node_id_key_mismatch'});
  const frame=createCompactFrame({type:'NEED',payload,privateKeyPem:a.privateKeyPem,id:'wire-freeze-1'});
  assert.equal(verifyCompactFrame(frame,payload,a.publicKeyPem).ok,true);
  assert.deepEqual(verifyCompactFrame(frame,{...payload,input:{query:'forged'}},a.publicKeyPem),{ok:false,reason:'invalid_signature'});
  assert.deepEqual(verifyCompactFrame(frame,payload,b.publicKeyPem),{ok:false,reason:'invalid_signature'});
});

test('wire-freeze: Node -> HTTP Relay -> provider -> requester verifies signed RESULT and auth boundary', {timeout:20000}, async t => {
  const relay=createRelay({localDevelopmentMode:true});
  const url=await relay.listen({port:0});
  t.after(()=>relay.close());
  const provider=new TruynNode({relayUrl:url});
  const requester=new TruynNode({relayUrl:url});
  await provider.register();
  await requester.register();
  const capability='wire.freeze.integration';
  await provider.offer(capability);
  const unauthorized=await fetch(url+'/v1/poll');
  assert.ok([401,403,404,405].includes(unauthorized.status),'unauthenticated poll unexpectedly returned '+unauthorized.status);
  const offer=await requester.find(capability);
  assert.equal(offer.offers.length,1);
  const accepted=await requester.need(capability,{query:'Bakı 🚀'});
  assert.equal(accepted.provider,provider.identity.nodeId);
  const pending=await provider.poll();
  assert.equal(pending.events.length,1);
  const event=pending.events[0];
  assert.equal(event.kind,'NEED');
  assert.equal(event.verification.ok,true);
  await provider.result(event.envelope.id,{answer:'signed e2e'});
  const reply=await requester.poll();
  assert.equal(reply.events.length,1);
  assert.equal(reply.events[0].kind,'RESULT');
  assert.equal(reply.events[0].verification.ok,true);
  assert.equal(reply.events[0].envelope.payload.requestId,event.envelope.id);
  assert.equal(reply.events[0].envelope.payload.output.answer,'signed e2e');
});

test('wire-freeze: compact NEED/RESULT over local Relay preserves signature and correlation', {timeout:20000}, async t=>{
  const relay=createRelay({localDevelopmentMode:true});
  const url=await relay.listen({port:0});
  t.after(()=>relay.close());
  const provider=new TruynNode({relayUrl:url}),requester=new TruynNode({relayUrl:url});
  await provider.register();await requester.register();
  await provider.offer('wire.freeze.compact',{fastPath:true});
  const work=(async()=>{
    const pending=await provider.pollCompact({waitMs:2000});
    assert.equal(pending.events.length,1);
    const event=pending.events[0];
    assert.equal(event.verification.ok,true);
    await provider.compactResult(event.frame.i,{answer:'one'},{providerLatencyMs:1});
  })();
  const result=await requester.compactNeed('wire.freeze.compact',{query:'hello'}, {}, {waitMs:2000});
  await work;
  assert.equal(result.output.answer,'one');
  assert.equal(result.verification.ok,true);
});
