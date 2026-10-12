import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { maintenanceStore } from './fixtures/g5-maintenance-cosmos.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const owner=createIdentity();
function offer(id='shared-offer') {
  const envelope=createEnvelope({type:'OFFER',id,from:owner.nodeId,publicKeyPem:owner.publicKeyPem,
    privateKeyPem:owner.privateKeyPem,payload:{capability:{name:'maintenance.test'},metadata:{}}});
  return {id,owner:owner.nodeId,fingerprint:hash(JSON.stringify(envelope)),envelope};
}
const need={id:'need-compact',requester:'requester',provider:'provider',fingerprint:'signed-request',
  capability:'maintenance.test',mode:'fast',scope:'test-scope',policyDigest:'test-policy'};
const partial=(sequence=0)=>({kind:'PARTIAL',recipient:'requester',event:{kind:'PARTIAL',sequence,requestId:need.id,payload:{delta:'x'.repeat(2000)}}});
const result=()=>({kind:'RESULT',recipient:'requester',event:{kind:'RESULT',payload:{output:'y'.repeat(2000)}}});
const fails=(fn,code)=>assert.rejects(fn,e=>e.publicCode===code);

test('G5 directory: signed OFFER survives a new ledger instance, byte identity and authority retained',async()=>{
  const f=maintenanceStore(),a=f.ledger(),row=offer();await a.reserveOffer(row);
  const restored=await f.ledger().restoreOffers({owner:owner.nodeId});
  assert.deepEqual(restored,[row.envelope]);
  assert.equal(hash(JSON.stringify(restored[0])),row.fingerprint);
  assert.equal((await a.getOffer(row.id)).ttl,-1);
  await fails(()=>a.reserveOffer(row),'duplicate_offer');
  assert.deepEqual(await a.restoreOffers({owner:'foreign-owner'}),[]);
});

test('G5 directory: malformed signature, owner, ID, fingerprint and capability cannot enter shared snapshot',async()=>{
  const f=maintenanceStore(),a=f.ledger(),row=offer();
  for(const patch of [{owner:'other'}, {id:'different'}, {fingerprint:'forged'},
    {envelope:{...row.envelope,payload:{capability:{name:'tampered'}}}}])
    await fails(()=>a.reserveOffer({...row,...patch}),'lifecycle_offer_integrity_mismatch');
  assert.equal(f.writes,0);
});

test('G5 directory: old fingerprint-only records remain tombstoned but are not fabricated into signed offers',async()=>{
  const f=maintenanceStore(),a=f.ledger(),row=offer();delete row.envelope;await a.reserveOffer(row);
  assert.deepEqual(await a.restoreOffers({owner:owner.nodeId}),[]);
  await fails(()=>a.reserveOffer(offer()),'duplicate_offer');
});

test('G5 directory: concurrent REVOKE wins over stale active query/ETag',async()=>{
  const f=maintenanceStore(),a=f.ledger(),row=offer();await a.reserveOffer(row);
  f.beforePut=(docs,key)=>docs.set(key,{...docs.get(key),revoked:1,_etag:'revoked-newer',version:99});
  assert.deepEqual(await a.restoreOffers({owner:owner.nodeId}),[]);
  assert.equal((await a.getOffer(row.id)).revoked,1);
});

test('G5 directory: query contamination, owner substitution and changed commitment fail closed',async()=>{
  for(const fault of ['query-owner','stored-owner','fingerprint','signature']) {
    const f=maintenanceStore(),a=f.ledger(),row=offer();await a.reserveOffer(row);
    const doc=[...f.docs.values()].find(row=>row.kind==='offer');
    f.queryPages=[{Documents:[structuredClone(doc)]}];
    if(fault==='query-owner')f.queryPages=[{Documents:[{...doc,owner:'attacker'}]}];
    if(fault==='stored-owner')doc.owner='attacker';
    if(fault==='fingerprint')doc.fingerprint='tampered';
    if(fault==='signature')doc.offerJson=JSON.stringify({...row.envelope,payload:{}});
    await assert.rejects(()=>a.restoreOffers({owner:owner.nodeId}));
  }
});

test('G5 directory: empty pages, duplicate projections and continuation do not lose records',async()=>{
  const f=maintenanceStore(),a=f.ledger(),r=offer();await a.reserveOffer(r);const doc=[...f.docs.values()].find(row=>row.kind==='offer');
  f.queryPages=[{Documents:[],next:'1'},{Documents:[doc],next:'2'},{Documents:[doc]}];
  assert.deepEqual(await a.restoreOffers({owner:owner.nodeId}),[r.envelope]);
});

test('G5 directory: owner capacity, cyclic/oversized cursors and outage never return partial success',async()=>{
  const f=maintenanceStore(),a=f.ledger();await a.reserveOffer(offer('one'));await a.reserveOffer(offer('two'));
  await fails(()=>a.restoreOffers({owner:owner.nodeId,limit:1}),'lifecycle_offer_scan_capacity_reached');
  f.queryPages=[{Documents:[],next:'1'},{Documents:[],next:'1'}];
  await fails(()=>a.restoreOffers({owner:owner.nodeId}),'lifecycle_offer_directory_cursor_invalid');
  f.queryPages=[{Documents:[],next:'x'.repeat(8193)}];
  await fails(()=>a.restoreOffers({owner:owner.nodeId}),'lifecycle_offer_directory_cursor_invalid');
  f.queryPages=null;f.online=false;
  await fails(()=>a.restoreOffers({owner:owner.nodeId}),'lifecycle_ledger_unavailable');
});

async function finished(f) {
  const a=f.ledger();await a.reserveNeed(need);
  await a.acceptPartial({id:need.id,provider:need.provider,sequence:0,digest:'part0',delivery:partial()});
  await a.transitionNeed({id:need.id,provider:need.provider,to:'completed',delivery:result()});
  return a;
}

test('G5 compaction: only ACKed payload bytes removed; pending signed RESULT remains recoverable',async()=>{
  const f=maintenanceStore(),a=await finished(f);const before=await a.getNeed(need.id);
  await a.acknowledgeDelivery({eventId:'partial:'+need.id+':0',recipient:'requester'});
  const event=before.deliveries[0].event;
  const answer=await a.compactNeed({id:need.id,requester:'requester'});
  assert.equal(answer.compacted,true);assert.equal(answer.tombstoneRetained,true);
  const after=await f.ledger().getNeed(need.id);
  assert.equal(after.deliveries[0].event,null);assert.equal(after.deliveries[0].eventDigest,hash(JSON.stringify(event)));
  assert.deepEqual(after.deliveries[1].event,before.deliveries[1].event);
  for(const k of ['logicalId','requester','provider','fingerprint','status','scope','policyDigest','partialSequence','ttl'])assert.deepEqual(after[k],before[k]);
  assert.ok(JSON.stringify(after).length<JSON.stringify(before).length);
  assert.deepEqual((await a.pendingDeliveries({recipient:'requester'})).map(d=>d.kind),['RESULT']);
  assert.equal((await a.acknowledgeDelivery({eventId:'partial:'+need.id+':0',recipient:'requester'})).idempotent,true);
  assert.equal((await a.compactNeed({id:need.id,requester:'requester'})).compacted,false);
  await fails(()=>a.reserveNeed(need),'duplicate_request');
  await fails(()=>a.acceptPartial({id:need.id,provider:'provider',sequence:1,digest:'late',delivery:partial(1)}),'request_already_completed');
});

test('G5 compaction: active work and foreign requester never lose bytes',async()=>{
  const f=maintenanceStore(),a=f.ledger();await a.reserveNeed(need);const writes=f.writes;
  await fails(()=>a.compactNeed({id:need.id,requester:'requester'}),'lifecycle_compaction_requires_terminal');
  await fails(()=>a.compactNeed({id:need.id,requester:'foreign'}),'not_request_owner');
  assert.equal(f.writes,writes);
});

test('G5 compaction: lost committed reply and repeat operation preserve terminal and ACK',async()=>{
  const f=maintenanceStore(),a=await finished(f);
  await a.acknowledgeDelivery({eventId:'partial:'+need.id+':0',recipient:'requester'});
  f.loseReply=true;await fails(()=>a.compactNeed({id:need.id,requester:'requester'}),'lifecycle_ledger_unavailable');
  assert.equal((await f.ledger().compactNeed({id:need.id,requester:'requester'})).compacted,false);
  assert.equal((await a.getNeed(need.id)).status,'completed');
  assert.equal((await a.pendingDeliveries({recipient:'requester'})).length,1);
});

test('G5 compaction: revoked OFFER tombstone survives body removal and restart; cannot republish',async()=>{
  const f=maintenanceStore(),a=f.ledger(),row=offer();await a.reserveOffer(row);
  await fails(()=>a.compactOffer({id:row.id,owner:owner.nodeId}),'lifecycle_compaction_requires_revocation');
  await a.revokeOffer({id:row.id,owner:owner.nodeId});
  await fails(()=>a.compactOffer({id:row.id,owner:'foreign'}),'not_target_owner');
  assert.equal((await a.compactOffer({id:row.id,owner:owner.nodeId})).compacted,true);
  const saved=await f.ledger().getOffer(row.id);
  assert.equal(saved.offerJson,undefined);assert.equal(saved.fingerprint,row.fingerprint);assert.equal(saved.revoked,1);assert.equal(saved.ttl,-1);
  assert.deepEqual(await a.restoreOffers({owner:owner.nodeId}),[]);
  await fails(()=>a.reserveOffer(row),'duplicate_offer');
  assert.equal((await a.compactOffer({id:row.id,owner:owner.nodeId})).compacted,false);
});

test('G5 compaction: terminal/ACK CAS rival is retried from fresh state, never overwrites pending bytes',async()=>{
  const f=maintenanceStore(),a=await finished(f);
  await a.acknowledgeDelivery({eventId:'partial:'+need.id+':0',recipient:'requester'});
  f.beforePut=(docs,key)=>{const row=docs.get(key);row.deliveries[1].acknowledgedAt=new Date().toISOString();row._etag='peer-ack';row.version++;};
  await a.compactNeed({id:need.id,requester:'requester'});
  const compacted=await a.getNeed(need.id);
  assert.equal(compacted.deliveries.find(e=>e.kind==='PARTIAL').event,null);
  assert.notEqual(compacted.deliveries.find(e=>e.kind==='RESULT').event,null,'terminal RESULT is retained for reconciliation');
  assert.deepEqual(await a.pendingDeliveries({recipient:'requester'}),[]);
});

test('G5 directory and compaction: malformed bounds/IDs/owner inputs reject before storage',async()=>{
  const f=maintenanceStore(),a=f.ledger();
  for(const args of [{owner:''},{owner:owner.nodeId,limit:0},{owner:owner.nodeId,limit:129}])
    await fails(()=>a.restoreOffers(args),'invalid_offer_directory_query');
  await fails(()=>a.compactNeed({id:need.id,requester:''}),'invalid_lifecycle_compaction');
  await fails(()=>a.compactOffer({id:'',owner:owner.nodeId}),'invalid_lifecycle_compaction');
  assert.equal(f.writes,0);
});
