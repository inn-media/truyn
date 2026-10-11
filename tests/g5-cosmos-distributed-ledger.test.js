import assert from 'node:assert/strict';
import test from 'node:test';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';

// Deterministic Cosmos REST model exercises real adapter HTTP requests,
// create-if-absent uniqueness, one-document ETag CAS and multi-client races.
// It is NOT a live Azure partition/failover qualification.
function mockCosmos() {
  const docs = new Map();
  let online = true;
  let revision = 0;
  let writes = 0;
  const requests = [];
  const json = (status, value, etag) => new Response(
    value == null ? null : JSON.stringify(value),
    {status, headers: {'content-type':'application/json', ...(etag?{etag,'x-ms-session-token':`session-${etag}`}:{})}}
  );
  const fetchImpl = async (url,options) => {
    if (!online) throw new Error('simulated_network_partition');
    const u=new URL(url);
    assert.equal(u.hostname,'g5-fixture.documents.azure.com');
    assert.match(options.headers.authorization,/^type%3Daad%26ver%3D1.0%26sig%3D/);
    assert.equal(options.headers['x-ms-consistency-level'],'Session');
    assert.equal(options.headers['x-ms-version'],'2018-12-31');
    requests.push({method:options.method,session:options.headers['x-ms-session-token'] || null});
    if(options.method==='POST' && options.headers['x-ms-documentdb-isquery']==='True'){
      assert.equal(options.headers['x-ms-documentdb-query-enablecrosspartition'],'True');
      const query=JSON.parse(options.body);
      assert.match(query.query,/EXISTS/);
      assert.doesNotMatch(query.query,/ORDER BY/);
      assert.match(query.query,/e.kind != "NEED" OR c.status = "matched"/);
      const recipient=query.parameters.find(p=>p.name==='@recipient')?.value;
      const documents=[...docs.values()].filter(d=>d.kind==='need' && d.deliveries.some(e=>e.recipient===recipient && e.acknowledgedAt===null && (e.kind!=='NEED'||d.status==='matched')));
      documents.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      return json(200,{Documents:documents});
    }
    const key=JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if(options.method==='POST'){
      const doc=JSON.parse(options.body);
      assert.equal(key,doc.partitionKey);
      assert.equal(doc.id,key);
      if(docs.has(doc.id)) return json(409,{code:'Conflict'});
      const etag=`etag-${++revision}`;
      const stored={...doc,_etag:etag};
      docs.set(doc.id,stored);writes++;
      return json(201,stored,etag);
    }
    const id=decodeURIComponent(u.pathname.split('/').at(-1));
    assert.equal(id,key);
    const doc=docs.get(id);
    if(!doc) return json(404,null);
    if(options.method==='GET') return json(200,doc,doc._etag);
    assert.equal(options.method,'PUT');
    if(options.headers['if-match']!==doc._etag) return json(412,{code:'PreconditionFailed'});
    const next=JSON.parse(options.body);
    assert.equal(next.partitionKey,doc.partitionKey);
    const etag=`etag-${++revision}`;
    const stored={...next,_etag:etag};
    docs.set(id,stored);writes++;
    return json(200,stored,etag);
  };
  function client(options={}) {
    return createCosmosLifecycleLedger({
      endpoint:'https://g5-fixture.documents.azure.com',database:'g5',container:'lifecycle',
      getAccessToken:async()=> 'fake-test-token',fetchImpl,...options
    });
  }
  return {client,docs,requests,getWrites:()=>writes,setOnline:v=>online=v};
}

const NEED = { id:'g5:need:42', requester:'alice',provider:'bob',fingerprint:'sha256:canonical',
  capability:'test.transform',mode:'fast',scope:'tenant:test',policyDigest:'frozen:v1'};
const makeNeedEvent=()=>({kind:'NEED',frame:{signed:'opaque-unchanged'},payload:{id:NEED.id}});
const needDelivery=()=>({recipient:'bob',kind:'NEED',event:makeNeedEvent()});
const resultDelivery=()=>({recipient:'alice',kind:'RESULT',event:{kind:'RESULT',frame:{signed:'result'}}});
const cancelDelivery=()=>({recipient:'bob',kind:'REVOKE',event:{kind:'REVOKE',frame:{signed:'revoke'}}});
const fails=(fn,code)=>assert.rejects(fn,(e)=>e.publicCode===code);

test('G5 Cosmos: two replica concurrent reservations atomically admit exactly one signed direct NEED',async()=>{
  const m=mockCosmos(),a=m.client(),b=m.client();
  const outcomes=await Promise.allSettled(Array.from({length:32},(_,i)=>
    (i%2?a:b).reserveNeed({...NEED,delivery:needDelivery()})));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected' && x.reason.publicCode==='duplicate_request').length,31);
  const recovered=await b.getNeed(NEED.id);
  assert.equal(recovered.status,'matched');
  assert.equal(recovered.requester,'alice');
  assert.equal(recovered.provider,'bob');
  assert.equal(recovered.fingerprint,'sha256:canonical');
  assert.equal(recovered.scope,'tenant:test');
  assert.equal(recovered.policyDigest,'frozen:v1');
  assert.equal(recovered.ttl,-1,'no container-level TTL may expire a G5 tombstone');
  assert.deepEqual(recovered.deliveries.map(x=>x.eventId),['need:g5:need:42']);
  assert.equal(m.getWrites(),1);
});

test('G5 Cosmos: missing authoritative scope or policy fingerprint never writes a shared ID',async()=>{
  const m=mockCosmos(), ledger=m.client();
  await fails(()=>ledger.reserveNeed({...NEED,scope:undefined,delivery:needDelivery()}),'invalid_lifecycle_reservation');
  await fails(()=>ledger.reserveNeed({...NEED,policyDigest:undefined,delivery:needDelivery()}),'invalid_lifecycle_reservation');
  assert.equal(m.getWrites(),0);
});

test('G5 Cosmos: terminal cancellation vs completion CAS picks exactly one winner; terminal never resurrects',async()=>{
  const m=mockCosmos(),a=m.client(),b=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  const results=await Promise.allSettled([
    a.transitionNeed({id:NEED.id,provider:'bob',to:'completed',delivery:resultDelivery()}),
    b.transitionNeed({id:NEED.id,requester:'alice',to:'cancelled',delivery:cancelDelivery()})
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected' && x.reason.httpStatus===409).length,1);
  const doc=await a.getNeed(NEED.id);
  assert.ok(['completed','cancelled'].includes(doc.status));
  assert.equal(doc.deliveries.filter(d=>d.kind==='RESULT'||d.kind==='REVOKE').length,1);
  await fails(()=>b.transitionNeed({id:NEED.id,provider:'bob',to:'failed'}),'request_already_completed'.replace('request_already_completed',doc.status==='cancelled'?'request_cancelled':'request_already_completed'));
  await fails(()=>b.acceptPartial({id:NEED.id,provider:'bob',sequence:0,digest:'p0'}),doc.status==='cancelled'?'request_cancelled':'request_already_completed');
  await fails(()=>a.reserveNeed({...NEED,delivery:needDelivery()}),'duplicate_request');
});

test('G5 Cosmos: signed PARTIAL sequence, outbox ACK and cap persist across client restart',async()=>{
  const m=mockCosmos(),a=m.client({maxDeliveriesPerNeed:4});
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  const part=(sequence,tag)=>({recipient:'alice',kind:'PARTIAL',event:{kind:'PARTIAL',requestId:NEED.id,sequence,frame:{signed:tag}}});
  const one=await a.acceptPartial({id:NEED.id,provider:'bob',sequence:0,digest:'hash-0',delivery:part(0,'frame-0')});
  assert.equal(one.idempotent,false);
  const replay=await a.acceptPartial({id:NEED.id,provider:'bob',sequence:0,digest:'hash-0',delivery:part(0,'frame-0')});
  assert.equal(replay.idempotent,true);
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'bob',sequence:0,digest:'forged',delivery:part(0,'forged')}),'partial_sequence_mismatch');
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'bob',sequence:2,digest:'skip',delivery:part(2,'skip')}),'partial_sequence_mismatch');
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'bob',sequence:1,digest:'wrong',delivery:part(2,'forged')}),'invalid_partial_delivery');
  assert.equal((await a.getNeed(NEED.id)).partial_sequence,1);
  const restarted=m.client({maxDeliveriesPerNeed:4});
  assert.equal((await restarted.getNeed(NEED.id)).partial_sequence,1);
  await restarted.acceptPartial({id:NEED.id,provider:'bob',sequence:1,digest:'hash-1',delivery:part(1,'frame-1')});
  const ack=await restarted.acknowledgeDelivery({eventId:'partial:g5:need:42:0',recipient:'alice'});
  assert.equal(ack.idempotent,false);
  assert.equal((await a.acknowledgeDelivery({eventId:'partial:g5:need:42:0',recipient:'alice'})).idempotent,true);
  await fails(()=>a.acknowledgeDelivery({eventId:'partial:g5:need:42:1',recipient:'eve'}),'delivery_not_found');
  await a.transitionNeed({id:NEED.id,to:'completed',provider:'bob',delivery:resultDelivery()});
  const doc=await restarted.getNeed(NEED.id);
  assert.equal(doc.status,'completed');
  assert.deepEqual(doc.deliveries.map(x=>x.kind),['NEED','PARTIAL','PARTIAL','RESULT']);
  assert.equal(doc.deliveries[1].acknowledgedAt!==null,true);
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'bob',sequence:2,digest:'late',delivery:part(2,'late')}),'request_already_completed');
});

test('G5 Cosmos: provider effect intent fences rivals across replicas including unknown outcomes',async()=>{
  const m=mockCosmos(),a=m.client(),b=m.client(),effect={id:NEED.id,provider:'bob',requester:'alice',fingerprint:'same-signed-need'};
  const races=await Promise.all([a.beginEffect(effect),b.beginEffect(effect)]);
  assert.equal(races.filter(x=>x.acquired).length,1);
  assert.equal(races.filter(x=>!x.acquired).length,1);
  await fails(()=>b.beginEffect({...effect,requester:'mallory'}),'effect_identity_conflict');
  const finish=await b.finishEffect({id:NEED.id,provider:'bob',outcome:'unknown'});
  assert.equal(finish.changed,true);
  assert.equal((await a.beginEffect(effect)).acquired,false);
  assert.equal((await a.getEffect(NEED.id)).status,'unknown');
  assert.equal((await b.finishEffect({id:NEED.id,provider:'bob',outcome:'completed'})).changed,false);
  await fails(()=>a.finishEffect({id:NEED.id,provider:'eve',outcome:'completed'}),'provider_mismatch');
});

test('G5 Cosmos: partition/failover uncertainty denies new work and never silently drops tombstones',async()=>{
  const m=mockCosmos(),a=m.client(),b=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  m.setOnline(false);
  await fails(()=>b.reserveNeed({...NEED,id:'different-id',delivery:needDelivery()}),'lifecycle_ledger_unavailable');
  await fails(()=>b.transitionNeed({id:NEED.id,provider:'bob',to:'completed',delivery:resultDelivery()}),'lifecycle_ledger_unavailable');
  await fails(()=>b.beginEffect({id:NEED.id,requester:'alice',provider:'bob',fingerprint:'payload'}),'lifecycle_ledger_unavailable');
  m.setOnline(true);
  assert.equal((await b.getNeed(NEED.id)).status,'matched');
  await b.transitionNeed({id:NEED.id,provider:'bob',to:'cancelled',delivery:cancelDelivery()});
  assert.equal((await a.getNeed(NEED.id)).status,'cancelled');
  await fails(()=>a.reserveNeed({...NEED,delivery:needDelivery()}),'duplicate_request');
});

test('G5 Cosmos: session token from CREATE is replayed for read-your-writes GET and CAS',async()=>{
  const m=mockCosmos(),a=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  await a.getNeed(NEED.id);
  assert.equal(m.requests.find(x=>x.method==='GET')?.session,'session-etag-1');
  await a.transitionNeed({id:NEED.id,to:'cancelled',requester:'alice',delivery:cancelDelivery()});
  assert.ok(m.requests.some(x=>x.method==='PUT'&&x.session==='session-etag-1'));
  await a.getNeed(NEED.id);
  assert.ok(m.requests.some(x=>x.method==='GET'&&x.session==='session-etag-2'));
});
test('G5 Cosmos: expired tombstones are impossible even when container default TTL is positive',async()=>{
  const m=mockCosmos(),a=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  const before=await a.getNeed(NEED.id);
  assert.equal(before.ttl,-1);
  await a.transitionNeed({id:NEED.id,provider:'bob',to:'completed',delivery:resultDelivery()});
  assert.equal((await a.getNeed(NEED.id)).ttl,-1);
  await fails(()=>a.reserveNeed({...NEED,delivery:needDelivery()}),'duplicate_request');
});
test('G5 Cosmos: reject NEED IDs whose generated PARTIAL ACK identifiers exceed header limits',async()=>{
  const m=mockCosmos(),a=m.client();
  await fails(()=>a.reserveNeed({...NEED,id:'a'.repeat(4071)}),'invalid_lifecycle_reservation');
  await a.reserveNeed({...NEED,id:'a'.repeat(4070)});
  assert.equal((await a.getNeed('a'.repeat(4070))).ttl,-1);
});
test('G5 Cosmos: terminal unacknowledged NEED never hides newer signed RESULT recovery',async()=>{
  const m=mockCosmos(),a=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  await a.transitionNeed({id:NEED.id,provider:'bob',to:'completed',delivery:resultDelivery()});
  assert.deepEqual(await a.pendingDeliveries({recipient:'bob'}),[],'terminal NEED must not occupy recovery scan');
  const rows=await a.pendingDeliveries({recipient:'alice'});
  assert.equal(rows.length,1);
  assert.equal(rows[0].kind,'RESULT');
});
test('G5 Cosmos: session tokens are bounded by physical range, not each accepted logical ID',async()=>{
  const m=mockCosmos(),a=m.client();
  for(let i=0;i<240;i++) await a.reserveNeed({...NEED,id:'physical-range-test-'+i,delivery:needDelivery()});
  const rows=await a.pendingDeliveries({recipient:'bob',limit:1});
  assert.equal(rows.length,1);
  const finalQuery=m.requests.findLast(x=>x.method==='POST'&&x.session);
  assert.ok(finalQuery.session.length<1024,'logical ID count must not enlarge session header');
  assert.ok(finalQuery.session.includes('session-etag-240'),'latest physical range watermark is retained');
});

test('G5 Cosmos: 404/1002 never represents a missing durable NEED and long Entra JWT is allowed',async()=>{
  let calls=0;
  const a=createCosmosLifecycleLedger({
    endpoint:'https://g5-fixture.documents.azure.com',database:'g5',container:'lifecycle',
    getAccessToken:async()=>'x'.repeat(6000),
    fetchImpl:async()=>{calls++;return new Response(null,{status:404,headers:{'x-ms-substatus':'1002'}});}
  });
  await fails(()=>a.getNeed(NEED.id),'lifecycle_session_unavailable');
  assert.equal(calls,1);
});

test('G5 Cosmos: new PARTIAL must be provider-owned and atomically recoverable',async()=>{
  const m=mockCosmos(),a=m.client();
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'',sequence:0,digest:'hash'}),'invalid_partial_provider');
  await fails(()=>a.acceptPartial({id:NEED.id,provider:'bob',sequence:0,digest:'hash'}),'partial_delivery_required');
  assert.equal((await a.getNeed(NEED.id)).partial_sequence,0);
  assert.deepEqual((await a.getNeed(NEED.id)).deliveries.map(x=>x.kind),['NEED']);
});

test('G5 Cosmos: accepted outbox events reserve enough space for ACK metadata',async()=>{
  const m=mockCosmos(),a=m.client({maxDocumentBytes:2048});
  let accepted=false;
  for(let size=1700;size>=100;size-=25) {
    const delivery=needDelivery();
    delivery.event.padding='z'.repeat(size);
    try {
      await a.reserveNeed({...NEED,delivery});
      accepted=true;
      break;
    } catch(error) {
      assert.equal(error.publicCode,'lifecycle_document_capacity_reached');
      assert.equal(m.getWrites(),0,'capacity rejection must happen before CREATE');
    }
  }
  assert.ok(accepted,'at least one bounded record should fit');
  const row=(await a.getNeed(NEED.id)).deliveries[0];
  assert.equal((await a.acknowledgeDelivery({eventId:row.eventId,recipient:'bob'})).acknowledged,true);
  assert.equal((await a.getNeed(NEED.id)).deliveries[0].acknowledgedAt!==null,true);
});

test('G5 Cosmos: independent OFFER revoke fencing and outbox capacity fail-closed',async()=>{
  const m=mockCosmos(),a=m.client({maxDeliveriesPerNeed:1});
  await a.reserveOffer({id:'offer/g5:42',owner:'bob',fingerprint:'immutable'});
  await fails(()=>a.reserveOffer({id:'offer/g5:42',owner:'eve',fingerprint:'forge'}),'duplicate_offer');
  await fails(()=>a.revokeOffer({id:'offer/g5:42',owner:'eve'}),'not_target_owner');
  assert.equal((await a.revokeOffer({id:'offer/g5:42',owner:'bob'})).changed,true);
  assert.equal((await m.client().revokeOffer({id:'offer/g5:42',owner:'bob'})).changed,false);
  await a.reserveNeed({...NEED,delivery:needDelivery()});
  await fails(()=>a.transitionNeed({id:NEED.id,provider:'bob',to:'completed',delivery:resultDelivery()}),'lifecycle_outbox_capacity_reached');
  assert.equal((await a.getNeed(NEED.id)).status,'matched');
  const unacked=await a.pendingDeliveries({recipient:'bob'});
  assert.equal(unacked.length,1);
  assert.equal(unacked[0].kind,'NEED');
  await a.acknowledgeDelivery({eventId:unacked[0].eventId,recipient:'bob'});
  assert.deepEqual(await a.pendingDeliveries({recipient:'bob'}),[]);
});
