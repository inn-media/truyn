import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { createDurableOfferDirectory } from '../network/relay/g5-offer-directory.js';
import { createCosmosDirectoryStore } from '../network/relay/g5-cosmos-directory-store.js';

// Storage/crypto boundary tests. Existing five-SDK wire qualification remains
// separate; production factory callers must pass canonical TRUYN verification.
const canonicalize = value => JSON.stringify(value);
const keys = generateKeyPairSync('ed25519');
const verifyEnvelope = (e, { allowedTypes }) => ({ ok: allowedTypes.includes(e?.type) &&
  verify(null, Buffer.from(canonicalize({ ...e, signature: undefined })), keys.publicKey, Buffer.from(e.signature || '', 'base64')) });
function envelope(type='OFFER', id='offer1', owner='provider', payload={capability:{name:'work'}}) {
  const e={ type, id, from:owner, payload };
  e.signature=sign(null, Buffer.from(canonicalize(e)), keys.privateKey).toString('base64'); return e;
}
function memory() {
  let row=null, etag=0, writes=0, lose=false;
  return { async read() { return row ? {document:structuredClone(row),etag:String(etag)} : null; },
    async cas(id, expected, next) {
      assert.equal(next.id,id);
      if ((row===null ? null : String(etag)) !== expected) return false;
      row=structuredClone(next); etag++; writes++;
      if (lose) { lose=false; throw Error('reply lost after durable commit'); }
      return true;
    }, get row(){return row;}, set loseReply(v){lose=v;}, get writes(){return writes;} };
}
const make=(storage,overrides={})=>createDurableOfferDirectory({storage,verifyEnvelope,canonicalize,authorityId:'isolated-test',...overrides});
const bad=(fn,code)=>assert.rejects(fn,e=>e.publicCode===code);
const publish=(d,e=envelope())=>d.publish({envelope:e,authenticatedOwner:e.from});
const revoke=(d,id='offer1',owner='provider')=>d.withdraw({authenticatedOwner:owner,envelope:envelope('REVOKE','withdraw',owner,{targetId:id,targetKind:'offer'})});
const list=d=>d.discover({requester:'requester',authorize:async()=>true});

test('G5 directory: missing shared state is never silently initialized by publish/read',async()=>{
 const m=memory(),d=make(m); await bad(()=>publish(d),'offer_directory_not_initialized');
 await bad(()=>list(d),'offer_directory_not_initialized'); assert.equal(m.writes,0);
});
test('G5 directory: competing replicas admit one immutable signed OFFER and reconnect idempotently',async()=>{
 const m=memory(),a=make(m),b=make(m);await a.initialize(); const e=envelope();
 const results=await Promise.all(Array.from({length:24},(_,i)=>publish(i%2?a:b,e)));
 assert.equal(results.filter(r=>r.changed).length,1); assert.equal(m.writes,2);
 assert.deepEqual(await list(make(m)),[e]);
});
test('G5 directory: owner, changed same-ID payload and forged signature fail closed',async()=>{
 const m=memory(),d=make(m);await d.initialize();const e=envelope();await publish(d,e);
 await bad(()=>d.publish({envelope:e,authenticatedOwner:'foreign'}),'offer_directory_owner_required');
 await bad(()=>publish(d,envelope('OFFER','offer1','provider',{capability:'other'})),'offer_directory_identity_conflict');
 await bad(()=>publish(d,{...e,signature:Buffer.alloc(64).toString('base64')}),'offer_directory_signature_invalid');
 await bad(()=>revoke(d,'offer1','foreign'),'not_target_owner');assert.equal((await list(d)).length,1);
});
test('G5 directory: withdrawn compaction retains permanent ID owner digest and occupied capacity across restart',async()=>{
 const m=memory(),d=make(m,{maxRecords:1});await d.initialize();const e=envelope();await publish(d,e);await revoke(d);
 assert.deepEqual(await list(make(m,{maxRecords:1})),[]);const old=structuredClone(m.row.entries[0]);
 assert.equal((await d.compactWithdrawn()).compacted,1);
 const next=m.row.entries[0];assert.equal(next.envelope,null);
 for(const key of ['id','owner','fingerprint','revoked','revokedAt'])assert.deepEqual(next[key],old[key]);
 await bad(()=>publish(make(m,{maxRecords:1}),e),'offer_directory_withdrawn');
 await bad(()=>publish(d,envelope('OFFER','new')),'offer_directory_capacity_reached');
 assert.equal((await revoke(d)).idempotent,true);assert.equal((await d.compactWithdrawn()).compacted,0);
 assert.equal((await d.inspectCapacity()).records,1);
});
test('G5 directory: current authorization is required on every discovery and cannot mutate saved policy',async()=>{
 const m=memory(),d=make(m);await d.initialize();await publish(d);
 await bad(()=>d.discover({requester:'x'}),'offer_directory_authorization_required');
 assert.deepEqual(await d.discover({requester:'x',authorize:()=>false}),[]);
 assert.deepEqual(await d.discover({requester:'x',authorize:()=>({ok:true})}),[]);
 await d.discover({requester:'x',authorize:({envelope})=>{envelope.payload.capability='corrupt';return true;}});
 assert.equal((await list(d))[0].payload.capability.name,'work');
});
test('G5 directory: changed capacity config and corrupted active data do not bypass authority',async()=>{
 const m=memory(),d=make(m);await d.initialize();await publish(d);
 await bad(()=>list(make(m,{maxRecords:300})),'offer_directory_integrity_error');
 m.row.entries[0].owner='corrupt';await bad(()=>list(d),'offer_directory_integrity_error');
});
test('G5 directory: lost successful write is reconciled by read, never auto-retried',async()=>{
 const m=memory(),d=make(m);await d.initialize();const e=envelope();m.loseReply=true;
 await assert.rejects(()=>publish(d,e),/reply lost/);assert.equal(m.writes,2);
 assert.equal((await publish(make(m),e)).idempotent,true);assert.equal(m.writes,2);
});
test('G5 directory: capacity races stay globally bounded and fail deterministically',async()=>{
 const m=memory(),d=make(m,{maxRecords:3,maxCasAttempts:32});await d.initialize();
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>publish(make(m,{maxRecords:3,maxCasAttempts:32}),envelope('OFFER','id'+i))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.publicCode,'offer_directory_capacity_reached');
 assert.equal((await list(d)).length,3);
});
test('G5 directory: active OFFER is never compacted and explicit offer namespace is mandatory',async()=>{
 const m=memory(),d=make(m);await d.initialize();await publish(d);
 assert.equal((await d.compactWithdrawn()).compacted,0);
 await bad(()=>d.withdraw({authenticatedOwner:'provider',envelope:envelope('REVOKE','r','provider',{targetId:'offer1',targetKind:'auto'})}),'offer_directory_revoke_invalid');
});
const id='g5-offer-directory-'+createHash('sha256').update('x').digest('hex');
const config={endpoint:'https://test.documents.azure.com',database:'g5',container:'directory',getAccessToken:async()=> 'test-token'};
test('G5 Cosmos directory: exact Strong and Entra request; create/ETag CAS and no DELETE',async()=>{
 let doc=null,etag='1';const calls=[];
 const storage=createCosmosDirectoryStore({...config,fetchImpl:async(url,o)=>{
  calls.push(o.method);assert.equal(o.headers['x-ms-consistency-level'],'Strong');assert.equal(o.redirect,'error');
  assert.match(o.headers.authorization,/type%3Daad/);assert.deepEqual(JSON.parse(o.headers['x-ms-documentdb-partitionkey']),[id]);
  if(o.method==='GET')return new Response(doc?JSON.stringify(doc):null,{status:doc?200:404,headers:{etag}});
  if(doc && o.method==='POST')return new Response(null,{status:409});
  if(doc && o.headers['if-match']!==etag)return new Response(null,{status:412});
  doc=JSON.parse(o.body);etag=String(Number(etag)+1);return new Response(JSON.stringify(doc),{status:200,headers:{etag}});
 }});
 const initial={id,partitionKey:id,version:1};assert.equal(await storage.read(id),null);
 assert.equal(await storage.cas(id,null,initial),true);assert.equal(await storage.cas(id,null,initial),false);
 const row=await storage.read(id);assert.equal(await storage.cas(id,'wrong',initial),false);
 assert.equal(await storage.cas(id,row.etag,{...initial,version:2}),true);assert.ok(!calls.includes('DELETE'));
});
test('G5 Cosmos directory: only explicit 409/412 permit CAS retry; outages and missing session are not absence',async()=>{
 for(const status of [400,401,403,408,429,500,503]){
  const s=createCosmosDirectoryStore({...config,fetchImpl:async()=>new Response(null,{status})});
  await bad(()=>s.read(id),'offer_directory_store_unavailable');
 }
 const s=createCosmosDirectoryStore({...config,fetchImpl:async()=>new Response(null,{status:404,headers:{'x-ms-substatus':'1002'}})});
 await bad(()=>s.read(id),'offer_directory_store_unavailable');
});
test('G5 Cosmos directory: token and response stalls are bounded',async()=>{
 for(const phase of ['token','headers','body']){
  const never=()=>new Promise(()=>{});
  const s=createCosmosDirectoryStore({...config,timeoutMs:10,getAccessToken:phase==='token'?never:config.getAccessToken,
   fetchImpl:phase==='headers'?never:async()=>new Response(new ReadableStream({start(){}}),{status:200})});
  await bad(()=>s.read(id),'offer_directory_store_timeout');
 }
});
