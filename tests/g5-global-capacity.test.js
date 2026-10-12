import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCosmosLifecycleLedger, createLifecycleCapacityDocument, lifecycleRecordCapacityFromEnv } from '../network/relay/cosmos-lifecycle-ledger.js';
import { createRuntimeG5ProviderEffectLedger } from '../runtime/g5-provider-effect-ledger.js';
import { createRuntimeG5RelayLifecycleLedger } from '../runtime/g5-relay-lifecycle-ledger.js';

const config = {endpoint:'https://capacity-fixture.documents.azure.com',database:'isolated',container:'ledger'};
const need = id => ({id,requester:'alice',provider:'bob',fingerprint:'signed-'+id,capability:'test',mode:'legacy',scope:'alice',policyDigest:'frozen'});
const sha = x => createHash('sha256').update(x).digest('hex');
const fails = (fn,code) => assert.rejects(fn,e => e.publicCode === code);

// Real adapter HTTP requests against an explicit local ETag model. NOT Azure evidence.
function fixture(limit = 8, seeded = true) {
  const docs = new Map(), calls = [];
  const seed = createLifecycleCapacityDocument({...config,recordCapacity:limit});
  if (seeded) docs.set(seed.id,{...seed,_etag:'v1'});
  let rev = 1, loseBudgetReply = false, loseEntityReply = false, rejectEntity = false, down = false;
  const json = (status,doc) => new Response(doc == null ? null : JSON.stringify(doc),{status,headers:doc?{etag:doc._etag}: {}});
  const fetchImpl = async (url,options) => {
    calls.push({method:options.method,url});
    assert.equal(options.redirect,'error');
    if (down) throw Error('model-partition');
    const key=JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if (options.method==='GET') return docs.has(key)?json(200,docs.get(key)):json(404,null);
    const body=JSON.parse(options.body);
    assert.equal(body.id,key); assert.equal(body.partitionKey,key); assert.equal(body.ttl,-1);
    if (options.method==='PUT') {
      const current=docs.get(key);
      if (!current) return json(404,null);
      if (current._etag!==options.headers['if-match']) return json(412,{error:'precondition'});
      const updated={...body,_etag:'v'+(++rev)}; docs.set(key,updated);
      if (key===seed.id && loseBudgetReply) {loseBudgetReply=false;throw Error('lost-budget-reply');}
      return json(200,updated);
    }
    assert.equal(options.method,'POST');
    if (rejectEntity) throw Error('entity-create-unavailable');
    if (docs.has(key)) return json(409,{error:'conflict'});
    const created={...body,_etag:'v'+(++rev)};docs.set(key,created);
    if (loseEntityReply) {loseEntityReply=false;throw Error('lost-entity-reply');}
    return json(201,created);
  };
  const client = (overrides={}) => createCosmosLifecycleLedger({...config,getAccessToken:async()=> 'fixture-entra',fetchImpl,recordCapacity:limit,...overrides});
  return {docs,calls,seed,fetchImpl,client,
    get root(){return docs.get(seed.id);},
    get entityPosts(){return calls.filter(c=>c.method==='POST').length;},
    set down(v){down=v;},set loseBudgetReply(v){loseBudgetReply=v;},
    set loseEntityReply(v){loseEntityReply=v;},set rejectEntity(v){rejectEntity=v;}};
}

test('G5 capacity: explicit configuration; old profile untouched, invalid limits rejected',async()=>{
  assert.equal(lifecycleRecordCapacityFromEnv({}),null);
  for(const raw of ['', '0','01','+1','1e2','4.1','4097',1,null]) assert.throws(()=>lifecycleRecordCapacityFromEnv({TRUYN_G5_LIFECYCLE_RECORD_CAPACITY:raw}));
  assert.equal(lifecycleRecordCapacityFromEnv({TRUYN_G5_LIFECYCLE_RECORD_CAPACITY:'4096'}),4096);
  const f=fixture();
  for(const value of [0,-1,1.5,4097,NaN,Infinity,'10']) assert.throws(()=>f.client({recordCapacity:value}));
  assert.deepEqual(await f.client({recordCapacity:null}).verifyCapacityContract(),{enabled:false});
  assert.equal(f.calls.length,0);
});

test('G5 capacity: missing seed fails closed and is never silently initialized',async()=>{
  const f=fixture(4,false),a=f.client();
  await fails(()=>a.verifyCapacityContract(),'lifecycle_capacity_not_initialized');
  await fails(()=>a.reserveNeed(need('unseeded')),'lifecycle_capacity_not_initialized');
  assert.equal(f.entityPosts,0);assert.equal(f.docs.size,0);
});

test('G5 capacity: one bound shared across NEED, OFFER and provider effect records',async()=>{
  const f=fixture(3),a=f.client();
  await a.reserveOffer({id:'offer',owner:'bob',fingerprint:'signed'});
  await a.reserveNeed(need('need'));
  assert.equal((await a.beginEffect({id:'need',provider:'bob',requester:'alice',fingerprint:'signed'})).acquired,true);
  await fails(()=>a.reserveNeed(need('over-capacity')),'lifecycle_global_capacity_reached');
  assert.equal(f.entityPosts,3);assert.equal(f.docs.size,4);
  assert.deepEqual(await a.verifyCapacityContract(),{enabled:true,recordCapacity:3,reserved:3,tombstonesRecyclable:false});
});

test('G5 capacity: two replicas and concurrent unique IDs cannot oversubscribe',async()=>{
  const f=fixture(4),a=f.client(),b=f.client();
  const result=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?a:b).reserveNeed(need('race'+i))));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,4);
  assert.equal(f.root.reserved,4);assert.equal(f.entityPosts,4);assert.equal(f.docs.size,5);
  assert.ok(result.filter(x=>x.status==='rejected').every(x=>x.reason.publicCode==='lifecycle_global_capacity_reached'));
});

test('G5 capacity: same ID rivals consume one ticket and create one entity',async()=>{
  const f=fixture(1),a=f.client(),b=f.client();
  const result=await Promise.allSettled(Array.from({length:16},(_,i)=>(i%2?a:b).reserveNeed(need('one'))));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(f.root.reserved,1);assert.equal(f.docs.size,2);
  assert.ok(result.filter(x=>x.status==='rejected').every(x=>x.reason.publicCode==='duplicate_request'));
});

test('G5 capacity: full capacity retains ordinary duplicate/effect conflict semantics',async()=>{
  const f=fixture(1),a=f.client();
  const effect={id:'effect',provider:'bob',requester:'alice',fingerprint:'original'};
  await a.beginEffect(effect);
  assert.equal((await f.client().beginEffect(effect)).acquired,false);
  await fails(()=>a.beginEffect({...effect,requester:'mallory'}),'effect_identity_conflict');
  assert.equal(f.root.reserved,1);assert.equal(f.docs.size,2);
});

test('G5 capacity: a committed allocation with lost reply never emits entity POST',async()=>{
  const f=fixture(1),a=f.client();f.loseBudgetReply=true;
  await fails(()=>a.reserveNeed(need('lost-budget')),'lifecycle_ledger_unavailable');
  assert.equal(f.entityPosts,0);assert.equal(f.root.reserved,1);
  await fails(()=>f.client().reserveNeed(need('different')),'lifecycle_global_capacity_reached');
  await f.client().reserveNeed(need('lost-budget'));
  assert.equal(f.entityPosts,1);assert.equal(f.root.reserved,1);
});

test('G5 capacity: failed entity create burns a slot, same-ID retry can finish without extra slot',async()=>{
  const f=fixture(1);f.rejectEntity=true;
  await fails(()=>f.client().reserveNeed(need('failed-create')),'lifecycle_ledger_unavailable');
  assert.equal(f.root.reserved,1);assert.equal(f.docs.size,1);
  f.rejectEntity=false;
  await fails(()=>f.client().reserveNeed(need('another')),'lifecycle_global_capacity_reached');
  await f.client().reserveNeed(need('failed-create'));
  assert.equal(f.root.reserved,1);assert.equal(f.docs.size,2);
});

test('G5 capacity: entity-created response loss is duplicate after restart, not a second entity',async()=>{
  const f=fixture(1);f.loseEntityReply=true;
  await fails(()=>f.client().reserveNeed(need('lost-entity')),'lifecycle_ledger_unavailable');
  await fails(()=>f.client().reserveNeed(need('lost-entity')),'duplicate_request');
  assert.equal(f.root.reserved,1);assert.equal(f.docs.size,2);
});

test('G5 capacity: terminal cancellation and revocation never recycle entity allocation',async()=>{
  const f=fixture(2),a=f.client();
  await a.reserveNeed(need('cancel'));
  await a.transitionNeed({id:'cancel',requester:'alice',to:'cancelled'});
  await a.reserveOffer({id:'revoke',owner:'bob',fingerprint:'signed'});
  await a.revokeOffer({id:'revoke',owner:'bob'});
  await fails(()=>f.client().reserveNeed(need('new-id')),'lifecycle_global_capacity_reached');
  await fails(()=>a.reserveNeed(need('cancel')),'duplicate_request');
  assert.equal(f.root.reserved,2);assert.equal(f.root.ttl,-1);
});

for(const [name,mutate] of [
  ['limit',r=>{r.recordCapacity++;}], ['scope',r=>{r.scopeDigest=sha('another-container');}],
  ['count',r=>{r.reserved=1;}], ['duplicate-ticket',r=>{r.tickets=['need-'+sha('x'),'need-'+sha('x')];r.reserved=2;}],
  ['wrong-ticket-kind',r=>{r.tickets=['capacity-'+sha('x')];r.reserved=1;}], ['version',r=>{r.version=Number.MAX_SAFE_INTEGER;}],
  ['TTL',r=>{r.ttl=10;}], ['key',r=>{r.partitionKey='elsewhere';}]
]) test('G5 capacity: corrupt or divergent authority '+name+' never permits creation',async()=>{
  const f=fixture(4);mutate(f.root);
  await assert.rejects(()=>f.client().reserveNeed(need('blocked')),e=>e.httpStatus===503);
  assert.equal(f.entityPosts,0);assert.equal(f.calls.filter(x=>x.method==='PUT').length,0);
});

test('G5 capacity: mismatched configured limits across replicas cannot expand the bound',async()=>{
  const f=fixture(2);await fails(()=>f.client({recordCapacity:3}).reserveNeed(need('mismatch')),'lifecycle_capacity_contract_invalid');
  assert.equal(f.entityPosts,0);
});

test('G5 capacity: unavailable authority fails before entity POST',async()=>{
  const f=fixture(2);f.down=true;
  await fails(()=>f.client().reserveNeed(need('partition')),'lifecycle_ledger_unavailable');
  assert.equal(f.entityPosts,0);assert.equal(f.root.reserved,0);
});

test('G5 capacity: both production factories honor the same explicit bound; off cannot ignore it',async()=>{
  const f=fixture(1);
  const env={TRUYN_G5_LIFECYCLE_RECORD_CAPACITY:'1',TRUYN_G5_COSMOS_ENDPOINT:config.endpoint,
    TRUYN_G5_COSMOS_DATABASE:config.database,TRUYN_G5_COSMOS_CONTAINER:config.container};
  const deps={tokenProvider:async()=> 'fixture-entra',fetchImpl:f.fetchImpl};
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({...deps,env}),/record capacity requires/);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({...deps,env}),/record capacity requires/);
  const relay=createRuntimeG5RelayLifecycleLedger({...deps,env:{...env,TRUYN_G5_RELAY_LIFECYCLE_LEDGER:'cosmos'}});
  const provider=createRuntimeG5ProviderEffectLedger({...deps,env:{...env,TRUYN_G5_PROVIDER_EFFECT_LEDGER:'cosmos'}});
  await relay.reserveNeed(need('full'));
  await fails(()=>provider.beginEffect({id:'effect',provider:'bob',requester:'alice',fingerprint:'f'}),'lifecycle_global_capacity_reached');
  assert.equal(f.entityPosts,1);
});
