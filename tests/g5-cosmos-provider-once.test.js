import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeG5ProviderEffectLedger } from '../runtime/g5-provider-effect-ledger.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';

// This test uses an isolated in-memory Cosmos REST/ETag simulation, NOT a
// provider receipt or live Azure failure-mode qualification.
function fixture() {
  const rows=new Map(); let version=0,online=true, ambiguousCreate=false;
  const json=(status,body,etag)=>new Response(body==null?null:JSON.stringify(body),
    {status,headers:{'content-type':'application/json',...(etag?{etag}:{})}});
  const fetchImpl=async (url,{method,headers,body})=>{
    if(!online) throw Error('simulated_network_partition');
    const u=new URL(url);
    assert.equal(u.hostname,'g5-fixture.documents.azure.com');
    assert.match(headers.authorization,/^type%3Daad%26ver%3D1.0%26sig%3D/);
    assert.equal(headers['x-ms-consistency-level'],'Session');
    const key=JSON.parse(headers['x-ms-documentdb-partitionkey'])[0];
    if(method==='POST') {
      const obj=JSON.parse(body);
      assert.equal(key,obj.id);
      if(rows.has(key)) return json(409,{code:'Conflict'});
      const etag=`etag-${++version}`;
      rows.set(key,{...obj,_etag:etag});
      if(ambiguousCreate) throw Error('commit_then_drop_response');
      return json(201,rows.get(key),etag);
    }
    if(method==='GET') {
      const row=rows.get(key);
      return row?json(200,row,row._etag):json(404,null);
    }
    assert.equal(method,'PUT');
    const row=rows.get(key);
    if(!row) return json(404,null);
    if(row._etag!==headers['if-match']) return json(412,{code:'Conflict'});
    const next={...JSON.parse(body),_etag:`etag-${++version}`};
    rows.set(key,next);return json(200,next,next._etag);
  };
  const env={
    TRUYN_G5_PROVIDER_EFFECT_LEDGER:'cosmos',
    TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE:'1',
    TRUYN_G5_COSMOS_ENDPOINT:'https://g5-fixture.documents.azure.com',
    TRUYN_G5_COSMOS_DATABASE:'g5',
    TRUYN_G5_COSMOS_CONTAINER:'effects'
  };
  const ledger=()=>createRuntimeG5ProviderEffectLedger({
    env,tokenProvider:async()=> 'mock-managed-identity-token',fetchImpl
  });
  return {ledger,rows,setOnline:x=>online=x,setAmbiguousCreate:x=>ambiguousCreate=x};
}
function provider(ledger,need,adapter,billing,stats) {
  const node={
    identity:{nodeId:'provider-A'},sessionToken:'t',
    register:async()=>({ok:true}),offer:async()=>({offerId:'g5-offer'}),
    poll:async()=>({events:[{kind:'NEED',verification:{ok:true},envelope:need}]}),
    result:async()=>{stats.terminals++;return {ok:true};}
  };
  return new TruynAdapterHost({
    node,adapter,effectLedger:ledger,
    accessPolicy:{mode:'test',authorize:()=>({ok:true})},
    billingPolicy:billing
  });
}
const need={
  id:'g5-cosmos-one-logical-paid-need',from:'requester-A',
  payload:{capability:{name:'g5.paid'},input:{title:'test'},policy:{}}
};

test('G5 shared Cosmos intent admits at most one runOnce external adapter call across competing hosts',async()=>{
  const store=fixture(), stats={executions:0,bills:0,terminals:0,settled:0};
  const adapter=createFunctionAdapter({capabilities:['g5.paid'],execute:async()=>{
    stats.executions++;
    return {output:{ok:true},metadata:{usage:{total_tokens:8}}};
  }});
  const billing={mode:'test',authorize:async()=>{
    stats.bills++;return {ok:true,finalize:async()=>{stats.settled++;return {ok:true};}};
  }};
  const a=provider(store.ledger(),need,adapter,billing,stats);
  const b=provider(store.ledger(),need,adapter,billing,stats);
  const results=await Promise.all([a.runOnce(),b.runOnce()]);
  assert.deepEqual(results.map(x=>x.handled),[1,1]);
  assert.equal(stats.executions,1,'one external invocation on common Cosmos intent');
  assert.equal(stats.bills,1,'one billing reservation attempt');
  assert.equal(stats.settled,1,'one billing finalizer');
  assert.equal(stats.terminals,1,'one signed result issued');
  const restart=provider(store.ledger(),need,adapter,billing,stats);
  await restart.runOnce();
  assert.equal(stats.executions,1);
  assert.equal((await store.ledger().getEffect(need.id)).status,'completed');
});

test('G5 post-CREATE response loss keeps remote intent, prevents all provider/billing side effects',async()=>{
  const store=fixture(),stats={executions:0,bills:0,terminals:0};
  const adapter=createFunctionAdapter({capabilities:['g5.paid'],execute:async()=>{stats.executions++;return true;}});
  const billing={mode:'test',authorize:async()=>{stats.bills++;return {ok:true};}};
  store.setAmbiguousCreate(true);
  const a=provider(store.ledger(),need,adapter,billing,stats);
  await assert.rejects(()=>a.runOnce(),error=>error.publicCode==='lifecycle_ledger_unavailable');
  assert.equal(stats.executions,0);
  assert.equal(stats.bills,0);
  assert.equal(stats.terminals,0);
  store.setAmbiguousCreate(false);
  const otherHost=provider(store.ledger(),need,adapter,billing,stats);
  await otherHost.runOnce();
  assert.equal(stats.executions,0,'read after ambiguous CREATE must fence work');
  assert.equal(stats.bills,0);
  assert.equal(stats.terminals,0);
  assert.equal((await store.ledger().getEffect(need.id)).status,'started');
});

test('G5 partition denies provider dispatch, and opaque remote failure does not produce false result',async()=>{
  const store=fixture(),stats={executions:0,bills:0,terminals:0,settled:0};
  const adapter=createFunctionAdapter({capabilities:['g5.paid'],execute:async()=>{
    stats.executions++;
    throw Error('ambiguous paid provider timeout');
  }});
  const billing={mode:'test',authorize:async()=>{
    stats.bills++;return {ok:true,finalize:async()=>{stats.settled++;}};
  }};
  store.setOnline(false);
  await assert.rejects(()=>provider(store.ledger(),need,adapter,billing,stats).runOnce(),x=>x.publicCode==='lifecycle_ledger_unavailable');
  assert.equal(stats.executions,0);
  assert.equal(stats.bills,0);
  store.setOnline(true);
  await provider(store.ledger(),need,adapter,billing,stats).runOnce();
  assert.equal(stats.executions,1);
  assert.equal(stats.terminals,0);
  assert.equal(stats.settled,0,'uncertain external charge cannot be finalized');
  assert.equal((await store.ledger().getEffect(need.id)).status,'unknown');
  await provider(store.ledger(),need,adapter,billing,stats).runOnce();
  assert.equal(stats.executions,1,'unknown effect cannot replay');
});
