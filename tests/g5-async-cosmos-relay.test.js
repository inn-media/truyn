import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';

function sharedCosmos() {
  const docs=new Map();
  let revision=0,available=true;
  const body=(status,value,etag)=>new Response(value===null?null:JSON.stringify(value),{
    status,headers:{'content-type':'application/json',...(etag?{etag}:{})}
  });
  async function fetchImpl(uri,options) {
    if(!available) throw new Error('simulated-Cosmos-network-split');
    const url=new URL(uri);
    assert.equal(url.hostname,'g5-fixture.documents.azure.com');
    const isQuery=options.headers['x-ms-documentdb-isquery']==='True';
    if(isQuery) {
      const query=JSON.parse(options.body);
      const recipient=query.parameters.find(x=>x.name==='@recipient').value;
      const Documents=[...docs.values()].filter(x=>x.kind==='need'&&x.deliveries.some(e=>e.recipient===recipient&&e.acknowledgedAt===null&&(e.kind!=='NEED'||x.status==='matched')));
      return body(200,{Documents});
    }
    const key=JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if(options.method==='POST') {
      const row=JSON.parse(options.body);
      assert.equal(row.id,key);
      if(docs.has(key))return body(409,{code:'Conflict'});
      const etag=`etag-${++revision}`;
      const next={...row,_etag:etag};docs.set(key,next);
      return body(201,next,etag);
    }
    const doc=docs.get(key);
    if(!doc)return body(404,null);
    if(options.method==='GET')return body(200,doc,doc._etag);
    assert.equal(options.method,'PUT');
    if(options.headers['if-match']!==doc._etag) return body(412,{code:'PreconditionFailed'});
    const next={...JSON.parse(options.body),_etag:`etag-${++revision}`};
    docs.set(key,next);return body(200,next,next._etag);
  }
  return {
    ledger:()=>createCosmosLifecycleLedger({endpoint:'https://g5-fixture.documents.azure.com',database:'g5',container:'ledger',getAccessToken:async()=> 'mock-entra',fetchImpl}),
    setAvailable:value=>{available=value;},
    docs
  };
}
async function post(node,path,value) {
  const response=await fetch(node.relayUrl+path,{method:'POST',headers:{'content-type':'application/json',...node.authHeaders()},body:JSON.stringify(value)});
  return {status:response.status,body:await response.json()};
}
const makeLegacy=(node,id,capability)=>node.envelope('NEED',{capability:{name:capability},input:{id},policy:{}},{id});
const makeFast=(node,id,capability)=>{
  const payload={capability:{name:capability},input:{id},policy:{}};
  return {frame:node.compactFrame('NEED',payload,{id}),payload};
};
async function pair(t) {
  const store=sharedCosmos();
  const ledgers=[store.ledger(),store.ledger()];
  const relays=ledgers.map(lifecycleLedger=>createRelay({localDevelopmentMode:true,lifecycleLedger}));
  for(const relay of relays)t.after(()=>relay.close());
  const urls=await Promise.all(relays.map(r=>r.listen({port:0})));
  const providerA=new TruynNode({relayUrl:urls[0]}),requesterA=new TruynNode({relayUrl:urls[0]});
  const providerB=new TruynNode({relayUrl:urls[1],identity:providerA.identity});
  const requesterB=new TruynNode({relayUrl:urls[1],identity:requesterA.identity});
  await Promise.all([providerA.register(),requesterA.register(),providerB.register(),requesterB.register()]);
  await providerA.offer('g5.cosmos.public');await providerB.offer('g5.cosmos.public');
  return {store,ledgers,relays,providerA,providerB,requesterA,requesterB,urls};
}

test('G5 async Cosmos relay: one cross-host signed HTTP/compact NEED admits and schedules exactly once',async t=>{
  const {ledgers,providerA,providerB,requesterA,requesterB}=await pair(t);
  const id='g5-async-cross-host-need-1';
  const [legacy,fast]=await Promise.all([
    post(requesterA,'/v1/needs',{envelope:makeLegacy(requesterA,id,'g5.cosmos.public')}),
    post(requesterB,'/v1/fast/needs?waitMs=0',makeFast(requesterB,id,'g5.cosmos.public'))
  ]);
  assert.deepEqual([legacy.status,fast.status].sort(),[200,409]);
  const [pollA,pollB]=await Promise.all([providerA.poll(),providerB.pollCompact({waitMs:0})]);
  assert.equal(pollA.events.length+pollB.events.length,1,'exactly one provider delivery');
  if(legacy.status===200) await providerA.result(id,{done:true});
  else await providerB.compactResult(id,{done:true});
  assert.equal((await ledgers[0].getNeed(id)).status,'completed');
  await assert.rejects(ledgers[1].reserveNeed({
    id,requester:requesterA.identity.nodeId,provider:providerA.identity.nodeId,
    fingerprint:'attempt-forged',capability:'g5.cosmos.public',mode:'fast',
    scope:requesterA.identity.nodeId,policyDigest:'changed'
  }),e=>e.publicCode==='duplicate_request');
  const retry=await post(requesterB,'/v1/needs',{envelope:makeLegacy(requesterA,id,'g5.cosmos.public')});
  assert.equal(retry.status,409);
});

test('G5 async Cosmos relay: signed streaming PARTIAL recovery is ACKed and peer cancellation terminal-fences retries',async t=>{
  const {ledgers,providerA,requesterA,requesterB,store}=await pair(t);
  const id='g5-async-cross-host-partial-2';
  assert.equal((await post(requesterA,'/v1/fast/needs?waitMs=0',makeFast(requesterA,id,'g5.cosmos.public'))).status,200);
  const payload={sequence:0,delta:'chunk',metadata:{}};
  const frame=providerA.compactFrame('PARTIAL',payload,{id});
  assert.equal((await post(providerA,'/v1/fast/partials',{frame,payload})).status,200);
  assert.equal((await ledgers[1].getNeed(id)).partial_sequence,1);
  const recovery=await fetch(requesterA.relayUrl+'/v1/lifecycle/deliveries?limit=16',{headers:requesterA.authHeaders()});
  assert.equal(recovery.status,200);
  const delivered=(await recovery.json()).deliveries.find(x=>x.kind==='PARTIAL'&&x.requestId===id);
  assert.ok(delivered,'PARTIAL must survive a separate relay read');
  const ack=await post(requesterA,'/v1/lifecycle/deliveries/ack',{eventId:delivered.eventId});
  assert.equal(ack.status,200);assert.equal(ack.body.acknowledged,true);
  const cancelled=await requesterB.revoke(id,'peer-cancel',{targetKind:'need'});
  assert.equal(cancelled.cancelled,true);
  assert.equal((await ledgers[0].getNeed(id)).status,'cancelled');
  const stale=await post(providerA,'/v1/fast/partials',{frame,payload});
  assert.equal(stale.status,409);assert.equal(stale.body.error,'request_cancelled');
  assert.equal((await ledgers[1].getNeed(id)).partial_sequence,1);
});

test('G5 async Cosmos relay: implicit REVOKE refuses unproven cross-namespace ownership',async t=>{
  const {requesterA}=await pair(t);
  const signed=requesterA.envelope('REVOKE',{targetId:'mixed-namespace-id',targetKind:'auto',reason:'ambiguous'});
  const result=await post(requesterA,'/v1/revoke',{envelope:signed});
  assert.equal(result.status,409);
  assert.equal(result.body.error,'explicit_revoke_target_kind_required');
});

test('G5 async Cosmos relay: shared store outage cannot authorize direct dispatch or provider effect',async t=>{
  const {store,providerA,requesterA}=await pair(t);
  store.setAvailable(false);
  const response=await post(requesterA,'/v1/needs',{envelope:makeLegacy(requesterA,'unavailable', 'g5.cosmos.public')});
  assert.equal(response.status,503);
  assert.equal((await providerA.poll()).events.length,0);
});

test('G5 cross-host PARTIAL+RESULT handoff: peer relay accepts verified signed work without redispatch',async t=>{
  const {providerA,providerB,requesterA,requesterB,ledgers}=await pair(t);
  const id='g5-crosshost-missing-memory-fast-990';
  const admitted=await post(requesterA,'/v1/fast/needs?waitMs=0',makeFast(requesterA,id,'g5.cosmos.public'));
  assert.equal(admitted.status,200);
  // Provider identity and requester identity are the same across two distinct
  // registered relays. Only relay A has volatile request state.
  const partPayload={sequence:0,delta:'signed chunk from remote provider',metadata:{}};
  const partFrame=providerB.compactFrame('PARTIAL',partPayload,{id});
  const partial=await post(providerB,'/v1/fast/partials',{frame:partFrame,payload:partPayload});
  assert.equal(partial.status,200);
  assert.equal(partial.body.recovered,true);
  assert.equal(partial.body.transport,'durable-outbox');
  assert.equal((await ledgers[0].getNeed(id)).partial_sequence,1);
  const duplicate=await post(providerB,'/v1/fast/partials',{frame:partFrame,payload:partPayload});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.body.idempotent,true);
  const forgedPayload={sequence:0,delta:'modified replay',metadata:{}};
  const forgedFrame=providerB.compactFrame('PARTIAL',forgedPayload,{id});
  assert.equal((await post(providerB,'/v1/fast/partials',{frame:forgedFrame,payload:forgedPayload})).status,409);
  const completed=await providerB.compactResult(id,{ok:true,origin:'relayB'});
  assert.equal(completed.ok,true);
  assert.equal(completed.recovered,true);
  assert.equal((await ledgers[0].getNeed(id)).status,'completed');
  const resultRetry=await post(providerB,'/v1/fast/results',{frame:completed.frame,payload:completed.payload});
  assert.equal(resultRetry.status,409);
  assert.equal(resultRetry.body.error,'request_already_completed');
  const response=await fetch(requesterB.relayUrl+'/v1/lifecycle/deliveries?limit=32',{headers:requesterB.authHeaders()});
  assert.equal(response.status,200);
  const deliveries=(await response.json()).deliveries.filter(x=>x.requestId===id);
  assert.equal(deliveries.filter(x=>x.kind==='PARTIAL').length,1);
  assert.equal(deliveries.filter(x=>x.kind==='RESULT').length,1);
  for(const entry of deliveries) {
    const ack=await post(requesterB,'/v1/lifecycle/deliveries/ack',{eventId:entry.eventId});
    assert.equal(ack.status,200);
  }
  const recovered=await fetch(requesterA.relayUrl+'/v1/lifecycle/deliveries?limit=32',{headers:requesterA.authHeaders()});
  assert.equal((await recovered.json()).deliveries.filter(x=>x.requestId===id&&['PARTIAL','RESULT'].includes(x.kind)).length,0);
});

test('G5 cross-host legacy RESULT handoff: CAS writes signed result to durable requester outbox once',async t=>{
  const {providerB,requesterA,requesterB,ledgers}=await pair(t);
  const id='g5-crosshost-missing-memory-legacy-990';
  assert.equal((await post(requesterA,'/v1/needs',{envelope:makeLegacy(requesterA,id,'g5.cosmos.public')})).status,200);
  const accepted=await providerB.result(id,{ok:true,origin:'relayB'});
  assert.equal(accepted.recovered,true);
  assert.equal(accepted.transport,'durable-outbox');
  assert.equal((await ledgers[0].getNeed(id)).status,'completed');
  const other=await post(requesterB,'/v1/needs',{envelope:makeLegacy(requesterB,id,'g5.cosmos.public')});
  assert.equal(other.status,409,'completed id tombstone remains globally reserved');
  const response=await fetch(requesterB.relayUrl+'/v1/lifecycle/deliveries?limit=32',{headers:requesterB.authHeaders()});
  const results=(await response.json()).deliveries.filter(x=>x.requestId===id&&x.kind==='RESULT');
  assert.equal(results.length,1);
  await assert.rejects(()=>providerB.result(id,{ok:true}),error=>error.status===409||/request_already_completed/.test(error.message));
});
