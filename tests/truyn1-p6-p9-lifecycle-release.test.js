import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

async function post(node,path,body){
 const r=await fetch(node.relayUrl+path,{method:'POST',
  headers:{'content-type':'application/json',...node.authHeaders()},body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
function signedNeed(node,id,capability){
 return node.envelope('NEED',{capability:{name:capability},input:{value:1},policy:{}},{id});
}
test('P6–P9 signed OFFER, correlated NEED, one RESULT and authorized withdrawal form one fail-closed lifecycle',async t=>{
 const relay=createRelay({localDevelopmentMode:true});
 const relayUrl=await relay.listen({port:0});t.after(()=>relay.close());
 const provider=new TruynNode({relayUrl}),requester=new TruynNode({relayUrl}),attacker=new TruynNode({relayUrl});
 await Promise.all([provider.register(),requester.register(),attacker.register()]);
 const tampered=provider.envelope('OFFER',{capability:{name:'p6.tamper'},metadata:{}},{id:'p6-forged-offer'});
 tampered.payload.capability.name='p6.changed';
 const denied=await post(provider,'/v1/offers',{envelope:tampered});
 assert.notEqual(denied.status,200,'changed signed OFFER must never become discoverable');
 assert.equal(relay.state.offers.has('p6-forged-offer'),false);
 const offer=await provider.offer('p6-p9.bounded.lifecycle');
 assert.equal((await requester.find('p6-p9.bounded.lifecycle')).offers.length,1);
 const id='p6-p9-one-logical-need';
 const accepted=await post(requester,'/v1/needs',{envelope:signedNeed(requester,id,'p6-p9.bounded.lifecycle')});
 assert.equal(accepted.status,200);
 assert.equal((await provider.poll()).events.filter(e=>e.kind==='NEED').length,1);
 await assert.rejects(()=>attacker.revoke(offer.offerId,'forge',{targetKind:'offer'}),e=>e.status===403&&e.body?.error==='not_target_owner');
 const replay=await post(requester,'/v1/fast/needs?waitMs=0',{frame:requester.compactFrame('NEED',
  {capability:{name:'p6-p9.bounded.lifecycle'},input:{value:1},policy:{}},{id}),payload:{capability:{name:'p6-p9.bounded.lifecycle'},input:{value:1},policy:{}}});
 assert.equal(replay.status,409);
 assert.equal(replay.body.error,'duplicate_request');
 assert.deepEqual((await provider.pollCompact({waitMs:0})).events,[]);
 await provider.revoke(offer.offerId,'retire',{targetKind:'offer'});
 assert.equal((await requester.find('p6-p9.bounded.lifecycle')).offers.length,0);
 await provider.result(id,{answer:42});
 const received=await requester.poll();
 assert.equal(received.events.filter(e=>e.kind==='RESULT').length,1);
 assert.equal(received.events.find(e=>e.kind==='RESULT').envelope.payload.requestId,id);
 await assert.rejects(()=>provider.result(id,{answer:43}),e=>e.status===409&&e.body?.error==='request_already_completed');
 await assert.rejects(()=>requester.revoke(id,'too late',{targetKind:'need'}),e=>e.status===409&&e.body?.error==='request_already_completed');
 const payload={sequence:0,delta:'late',metadata:{}};
 const partial=await post(provider,'/v1/fast/partials',{frame:provider.compactFrame('PARTIAL',payload,{id}),payload});
 assert.equal(partial.status,409);
 assert.equal((await requester.pollCompact({waitMs:0})).events.length,0);
 assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks,1);
});
test('P7/P9 cancellation prevents late output and preserves owner authority',async t=>{
 const relay=createRelay({localDevelopmentMode:true});
 const relayUrl=await relay.listen({port:0});t.after(()=>relay.close());
 const provider=new TruynNode({relayUrl}),requester=new TruynNode({relayUrl}),attacker=new TruynNode({relayUrl});
 await Promise.all([provider.register(),requester.register(),attacker.register()]);
 await provider.offer('p9.cancel.auth');
 const need=await requester.need('p9.cancel.auth',{value:9});
 await provider.poll();
 await assert.rejects(()=>attacker.revoke(need.needId,'forged',{targetKind:'need'}),e=>e.status===403&&e.body?.error==='not_request_owner');
 assert.equal(relay.state.requests.get(need.needId).status,'matched');
 const done=await requester.revoke(need.needId,'stop',{targetKind:'need'});
 assert.equal(done.cancelled,true);
 await assert.rejects(()=>provider.result(need.needId,{value:9}),e=>e.status===409&&e.body?.error==='request_cancelled');
 const payload={sequence:0,delta:'unauthorized-late',metadata:{}};
 const late=await post(provider,'/v1/fast/partials',{frame:provider.compactFrame('PARTIAL',payload,{id:need.needId}),payload});
 assert.equal(late.status,409);
 assert.equal(relay.state.requests.get(need.needId).status,'cancelled');
});
