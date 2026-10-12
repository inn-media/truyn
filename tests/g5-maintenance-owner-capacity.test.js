import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { maintenanceStore } from './fixtures/g5-maintenance-cosmos.mjs';
const identity=createIdentity();
function offerFor(subject,id) {
  const envelope=createEnvelope({type:'OFFER',id,from:subject.nodeId,publicKeyPem:subject.publicKeyPem,
    privateKeyPem:subject.privateKeyPem,payload:{capability:{name:'owner.capacity'}}});
  return {id,owner:subject.nodeId,envelope,fingerprint:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')};
}
function offer(id) { return offerFor(identity,id); }
const index=f=>[...f.docs.values()].find(row=>row.kind==='offer-owner');
const fails=(fn,code)=>assert.rejects(fn,e=>e.publicCode===code);
async function fill(f,count) {const a=f.ledger();for(let i=0;i<count;i++)await a.reserveOffer(offer('slot-'+i));return a;}

test('G5 owner quota: concurrent replicas cannot create an unrecoverable 129th signed OFFER',async()=>{
  const f=maintenanceStore(),a=await fill(f,127),b=f.ledger();
  const outcomes=await Promise.allSettled([a.reserveOffer(offer('last-a')),b.reserveOffer(offer('last-b'))]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.publicCode,'lifecycle_offer_owner_capacity_reached');
  assert.equal(index(f).offerSlots.length,128);
  assert.equal((await b.restoreOffers({owner:identity.nodeId})).length,128);
  await fails(()=>a.reserveOffer(offer('overflow')),'lifecycle_offer_owner_capacity_reached');
});

test('G5 owner quota: only irrevocable withdrawal releases capacity, never the original OFFER ID',async()=>{
  const f=maintenanceStore(),a=await fill(f,128);
  await a.revokeOffer({id:'slot-0',owner:identity.nodeId});
  assert.equal(index(f).offerSlots.length,127);
  await a.compactOffer({id:'slot-0',owner:identity.nodeId});
  await a.reserveOffer(offer('replacement'));
  assert.equal(index(f).offerSlots.length,128);
  assert.equal((await a.getOffer('slot-0')).revoked,1);
  await fails(()=>a.reserveOffer(offer('slot-0')),'duplicate_offer');
  assert.equal((await f.ledger().restoreOffers({owner:identity.nodeId})).length,128);
});

test('G5 owner quota: lost revocation reply withholds capacity until idempotent withdrawal is reconciled',async()=>{
  const f=maintenanceStore(),a=await fill(f,128);
  f.loseReply=true;
  await fails(()=>a.revokeOffer({id:'slot-0',owner:identity.nodeId}),'lifecycle_ledger_unavailable');
  assert.equal((await a.getOffer('slot-0')).revoked,1);
  await fails(()=>a.reserveOffer(offer('replacement')),'lifecycle_offer_owner_capacity_reached');
  await a.revokeOffer({id:'slot-0',owner:identity.nodeId});
  await a.reserveOffer(offer('replacement'));
  assert.equal(index(f).offerSlots.length,128);
});

test('G5 owner quota: an ambiguous slot claim does not create an extra OFFER and exact retry uses one slot',async()=>{
  const f=maintenanceStore(),a=f.ledger(),value=offer('ambiguous');
  f.loseReply=true;
  await fails(()=>a.reserveOffer(value),'lifecycle_ledger_unavailable');
  assert.equal(await a.getOffer(value.id),null);
  assert.equal(index(f).offerSlots.length,1);
  await f.ledger().reserveOffer(value);
  assert.equal(index(f).offerSlots.length,1);
  assert.equal((await a.restoreOffers({owner:identity.nodeId})).length,1);
});

test('G5 owner quota: corrupt owner/limit/duplicate slots cannot widen capacity',async()=>{
  for(const corrupt of [row=>row.owner='foreign',row=>row.slotLimit=999,row=>row.offerSlots.push({...row.offerSlots[0]})]) {
    const f=maintenanceStore(),a=await fill(f,1);corrupt(index(f));const writes=f.writes;
    await fails(()=>a.reserveOffer(offer('new')),'lifecycle_offer_owner_index_invalid');
    assert.equal(f.writes,writes);assert.equal(await a.getOffer('new'),null);
  }
});

test('G5 owner quota: oversized OFFER is rejected before owner slot allocation',async()=>{
  const f=maintenanceStore(),a=f.ledger({maxDocumentBytes:4096});
  const envelope=createEnvelope({
    type:'OFFER',id:'too-large',from:identity.nodeId,publicKeyPem:identity.publicKeyPem,
    privateKeyPem:identity.privateKeyPem,
    payload:{capability:{name:'owner.capacity'},metadata:{padding:'x'.repeat(6000)}}
  });
  const huge={id:'too-large',owner:identity.nodeId,envelope,
    fingerprint:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')};
  await fails(()=>a.reserveOffer(huge),'lifecycle_document_capacity_reached');
  assert.equal(index(f),undefined);
  assert.equal(await a.getOffer('too-large'),null);
  assert.equal(f.writes,0);
});

test('G5 owner quota: same OFFER ID race does not strand the losing owner slot',async()=>{
  const f=maintenanceStore(),a=f.ledger(),b=f.ledger(),other=createIdentity();
  const [left,right]=await Promise.allSettled([
    a.reserveOffer(offerFor(identity,'shared-race-id')),
    b.reserveOffer(offerFor(other,'shared-race-id'))
  ]);
  assert.equal([left,right].filter(x=>x.status==='fulfilled').length,1);
  const rejected=[left,right].find(x=>x.status==='rejected');
  assert.equal(rejected.reason.publicCode,'duplicate_offer');
  const winner=await a.getOffer('shared-race-id');
  const loser=winner.owner===identity.nodeId?other:identity;
  const ownerIndex=[...f.docs.values()].find(row=>row.kind==='offer-owner'&&row.owner===loser.nodeId);
  assert.ok(ownerIndex,'losing owner index remains an auditable bounded tombstone');
  assert.equal(ownerIndex.offerSlots.length,0,'proven foreign CREATE conflict releases the unused slot');
});
