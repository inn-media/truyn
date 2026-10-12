import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { maintenanceStore } from './fixtures/g5-maintenance-cosmos.mjs';

async function relay(t,store,options={}) {
  const instance=createRelay({localDevelopmentMode:true,lifecycleLedger:store.ledger(),lifecycleMaintenance:true,...options});
  t.after(()=>instance.close());
  return {instance,url:await instance.listen({port:0})};
}
async function post(node,path,body={}) {
  const response=await fetch(node.relayUrl+path,{method:'POST',headers:{'content-type':'application/json',...node.authHeaders()},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}

test('G5 actual HTTP relays: provider identity restores signed OFFER on peer, serves NEED and compacts terminal without ID reuse',async t=>{
  const store=maintenanceStore(),a=await relay(t,store),b=await relay(t,store);
  const providerA=new TruynNode({relayUrl:a.url});await providerA.register();
  const advertised=await providerA.offer('g5.restore');
  const providerB=new TruynNode({relayUrl:b.url,identity:providerA.identity});
  const requester=new TruynNode({relayUrl:b.url});await requester.register();await providerB.register();
  await a.instance.close();
  const found=await requester.find('g5.restore');assert.equal(found.offers.length,1);
  assert.equal(found.offers[0].id,advertised.offerId);assert.equal(found.offers[0].from,providerA.identity.nodeId);
  const id='g5-restored-need',envelope=requester.envelope('NEED',{capability:{name:'g5.restore'},input:'work',policy:{}},{id});
  const admitted=await post(requester,'/v1/needs',{envelope});assert.equal(admitted.status,200);
  assert.equal((await providerB.poll()).events.length,1);
  await providerB.result(id,'stored-result');
  await providerB.acknowledgeDurable('need:'+id);
  const recovered=await requester.recoverDurable();
  const event=recovered.deliveries.find(x=>x.kind==='RESULT'&&x.requestId===id);assert.ok(event);
  await requester.acknowledgeDurable(event.eventId);
  const compacted=await post(requester,'/v1/lifecycle/needs/'+id+'/compact');
  assert.equal(compacted.body.compacted,false,'terminal RESULT is retained; no ACKed PARTIAL exists to compact');
  assert.equal(compacted.body.tombstoneRetained,true);
  assert.equal((await post(requester,'/v1/needs',{envelope})).status,409);
  const durable=await store.ledger().getNeed(id);
  assert.equal(durable.status,'completed');
  assert.equal(durable.deliveries.filter(x=>x.kind==='RESULT').length,1);
  assert.notEqual(durable.deliveries.find(x=>x.kind==='RESULT').event,null);
});

test('G5 actual HTTP: owner-only restore and compaction authorization never widen discovery',async t=>{
  const store=maintenanceStore(),a=await relay(t,store,{localDevelopmentMode:false,allowPublicRegistration:true});
  const owner=new TruynNode({relayUrl:a.url}),foreign=new TruynNode({relayUrl:a.url});
  await owner.register();const offer=await owner.offer('g5.private');await foreign.register();
  assert.equal((await owner.find('g5.private')).offers.length,1);
  assert.equal((await foreign.find('g5.private')).offers.length,0);
  const path='/v1/lifecycle/offers/'+encodeURIComponent(offer.offerId)+'/compact';
  assert.equal((await fetch(a.url+path,{method:'POST'})).status,401);
  assert.equal((await post(foreign,path)).status,404);
  assert.equal((await post(owner,path)).status,409,'active OFFER cannot be compacted');
  await owner.revoke(offer.offerId,'withdraw',{targetKind:'offer'});
  assert.equal((await post(owner,path)).body.tombstoneRetained,true);
  const b=await relay(t,store,{localDevelopmentMode:false,allowPublicRegistration:true});
  const peer=new TruynNode({relayUrl:b.url,identity:owner.identity});await peer.register();
  assert.deepEqual((await peer.find('g5.private')).offers,[]);
  assert.equal((await store.ledger().getOffer(offer.offerId)).revoked,1);
});

test('G5 actual HTTP: incomplete recovery at capacity grants no session and drops no shared offers',async t=>{
  const store=maintenanceStore(),a=await relay(t,store),b=await relay(t,store,{maxOffers:1});
  const provider=new TruynNode({relayUrl:a.url});await provider.register();
  await provider.offer('g5.cap.one');await provider.offer('g5.cap.two');
  const peer=new TruynNode({relayUrl:b.url,identity:provider.identity});
  await assert.rejects(()=>peer.register(),e=>e.status===503);
  assert.equal(peer.sessionToken,null);
  assert.equal((await store.ledger().restoreOffers({owner:provider.identity.nodeId})).length,2);
});

test('G5 maintenance default off and bad backend cannot silently enable partial recovery',async t=>{
  const store=maintenanceStore();
  const r=await relay(t,store,{lifecycleMaintenance:false});
  const provider=new TruynNode({relayUrl:r.url});await provider.register();const offer=await provider.offer('g5.legacy');
  assert.equal((await store.ledger().getOffer(offer.offerId)).offerJson,undefined);
  assert.equal((await post(provider,'/v1/lifecycle/offers/'+offer.offerId+'/compact')).status,404);
  assert.throws(()=>createRelay({localDevelopmentMode:true,lifecycleMaintenance:true}),/requires the shared Cosmos directory/);
  assert.throws(()=>createRelay({localDevelopmentMode:true,lifecycleMaintenance:'true'}),/must be boolean/);
});
