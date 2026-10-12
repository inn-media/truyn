import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';

// The actual ledger is under test. Transport and storage below are explicit
// deterministic models, not Azure execution, paid receipts or G5 admission.
const never = () => new Promise(() => {});
const config = { endpoint:'https://fixture.documents.azure.com', database:'fixture', container:'ledger',
  requestTimeoutMs:20, getAccessToken:async()=> 'fixture-not-a-credential' };
const reservation = {id:'deadline-case',requester:'requester',provider:'provider',fingerprint:'fingerprint',
  capability:'research',mode:'test',scope:'requester',policyDigest:'policy'};
const binding = {id:reservation.id,requester:reservation.requester,provider:reservation.provider,fingerprint:reservation.fingerprint};
const unavailable = e => e.httpStatus===503 && e.publicCode==='lifecycle_ledger_unavailable';
const authUnavailable = e => e.httpStatus===503 && e.publicCode==='lifecycle_ledger_auth_unavailable';
async function boundedTest(promise) {
  let timer;
  const bound = new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('test_deadline_exceeded')),300);});
  try {return await Promise.race([promise,bound]);} finally {clearTimeout(timer);}
}
function model() {
  const docs=new Map();let posts=0,puts=0,mode=null,lastSignal;
  const response=(status,doc)=>({status,headers:new Headers(doc?{etag:doc._etag,'x-ms-session-token':'0:42'}:{}),json:async()=>structuredClone(doc)});
  const fetchImpl=async (_url,options)=>{
    lastSignal=options.signal;
    const key=options.headers['x-ms-documentdb-partitionkey'];
    if(options.headers['x-ms-documentdb-isquery']) return response(200,{Documents:[...docs.values()]});
    const id=JSON.parse(key)[0],current=docs.get(id);
    if(options.method==='GET') return response(current?200:404,current||null);
    if(options.method==='POST'){
      posts++;
      if(current)return response(409,current);
    } else {
      assert.equal(options.method,'PUT');puts++;
      if(!current)return response(404,null);
      if(options.headers['if-match']!==current._etag)return response(412,current);
    }
    const doc={...JSON.parse(options.body),_etag:'version-'+(posts+puts)};
    docs.set(id,doc);
    const status=options.method==='POST'?201:200;
    if(mode==='lost-headers'){mode=null;return never();}
    const result=response(status,doc);
    if(mode==='lost-body'){mode=null;result.json=never;}
    return result;
  };
  return {fetchImpl,docs,setMode:v=>{mode=v;},get posts(){return posts;},get puts(){return puts;},get lastSignal(){return lastSignal;}};
}

test('G5 deadline: reject invalid timers before any token or storage operation',()=>{
  for(const value of [0,-1,NaN,Infinity,0.5,'20',2_147_483_648]){
    assert.throws(()=>createCosmosLifecycleLedger({...config,requestTimeoutMs:value}),/invalid requestTimeoutMs/);
  }
});

test('G5 deadline: hanging Entra acquisition is bounded and never reaches storage',async()=>{
  let calls=0;
  const ledger=createCosmosLifecycleLedger({...config,getAccessToken:never,fetchImpl:async()=>{calls++;return new Response(null,{status:404});}});
  await assert.rejects(()=>boundedTest(ledger.getNeed('test')),authUnavailable);
  assert.equal(calls,0);
});

test('G5 deadline: late token completion cannot dispatch after caller was timed out',async()=>{
  let release,calls=0;
  const token=new Promise(resolve=>{release=resolve;});
  const ledger=createCosmosLifecycleLedger({...config,getAccessToken:()=>token,fetchImpl:async()=>{calls++;return new Response(null,{status:404});}});
  const request=ledger.getNeed('test');
  try {await assert.rejects(()=>boundedTest(request),authUnavailable);}
  finally {release('late-fixture-token');await sleep(10);}
  assert.equal(calls,0);
});

test('G5 deadline: synchronous auth errors are sanitized and no request is emitted',async()=>{
  let calls=0;
  const ledger=createCosmosLifecycleLedger({...config,getAccessToken:()=>{throw Error('private credential detail');},fetchImpl:async()=>{calls++;}});
  await assert.rejects(()=>ledger.getNeed('test'),e=>authUnavailable(e)&&!e.message.includes('private'));
  assert.equal(calls,0);
});

test('G5 deadline: a transport that ignores AbortSignal still terminates once',async()=>{
  let calls=0,signal;
  const ledger=createCosmosLifecycleLedger({...config,fetchImpl:async(_url,options)=>{calls++;signal=options.signal;return never();}});
  await assert.rejects(()=>boundedTest(ledger.reserveNeed(reservation)),unavailable);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
});

test('G5 deadline: token, headers and body share a single budget rather than resetting it',async()=>{
  let calls=0;
  const ledger=createCosmosLifecycleLedger({...config,requestTimeoutMs:80,
    getAccessToken:async()=>{await sleep(50);return 'fixture';},
    fetchImpl:async()=>{calls++;await sleep(50);return new Response(null,{status:404});}});
  await assert.rejects(()=>boundedTest(ledger.getNeed('test')),e=>unavailable(e)||authUnavailable(e));
  assert.ok(calls<=1);
});

test('G5 deadline: stalled response body is unavailable, not successful or endlessly pending',async()=>{
  const ledger=createCosmosLifecycleLedger({...config,fetchImpl:async()=>({status:200,headers:new Headers(),json:never})});
  await assert.rejects(()=>boundedTest(ledger.getNeed('test')),unavailable);
});

test('G5 deadline: committed reservation with lost body stays reserved on independent client',async()=>{
  const f=model();f.setMode('lost-body');
  const first=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  await assert.rejects(()=>boundedTest(first.reserveNeed(reservation)),unavailable);
  assert.equal(f.posts,1);assert.equal(f.docs.size,1);assert.equal(f.lastSignal.aborted,true);
  // Session headers from the committed write are retained even when its body times out.
  assert.equal(first.receiptSession.requestHeaders()['x-ms-session-token'],'0:42');
  const peer=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  await assert.rejects(()=>peer.reserveNeed(reservation),e=>e.publicCode==='duplicate_request');
  assert.equal(f.docs.size,1);assert.equal((await peer.getNeed(reservation.id)).status,'matched');
});

test('G5 deadline: ambiguous effect create never authorizes a second execution',async()=>{
  const f=model();f.setMode('lost-headers');
  const first=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  await assert.rejects(()=>boundedTest(first.beginEffect(binding)),unavailable);
  assert.equal(f.posts,1);
  const peer=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  const retry=await peer.beginEffect(binding);
  assert.equal(retry.acquired,false);assert.equal(retry.existing.status,'started');assert.equal(f.docs.size,1);
  await assert.rejects(()=>peer.beginEffect({...binding,requester:'forged'}),e=>e.publicCode==='effect_identity_conflict');
});

test('G5 deadline: terminal write ambiguity preserves one outbox result with no repeated PUT',async()=>{
  const f=model(),first=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  await first.reserveNeed(reservation);f.setMode('lost-body');
  const finish={id:reservation.id,provider:reservation.provider,to:'completed',delivery:{kind:'RESULT',recipient:reservation.requester,event:{kind:'RESULT',output:'fixture'}}};
  await assert.rejects(()=>boundedTest(first.transitionNeed(finish)),unavailable);
  assert.equal(f.puts,1);
  const peer=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  await assert.rejects(()=>peer.transitionNeed(finish),e=>e.publicCode==='request_already_completed');
  assert.equal(f.puts,1);const row=await peer.getNeed(reservation.id);
  assert.equal(row.status,'completed');assert.equal(row.deliveries.length,1);
});

test('G5 deadline: query timeout does not masquerade as an empty outbox or start another page',async()=>{
  let calls=0;
  const ledger=createCosmosLifecycleLedger({...config,fetchImpl:async(_url,options)=>{calls++;assert.equal(options.headers['x-ms-documentdb-isquery'],'True');return {status:200,headers:new Headers(),json:never};}});
  await assert.rejects(()=>boundedTest(ledger.pendingDeliveries({recipient:'requester'})),unavailable);
  assert.equal(calls,1);
});

test('G5 deadline: quick successful operations clear their deadline and retain original behavior',async()=>{
  const f=model(),ledger=createCosmosLifecycleLedger({...config,fetchImpl:f.fetchImpl});
  const value=await ledger.reserveNeed(reservation),signal=f.lastSignal;
  assert.equal(value.status,'matched');await sleep(40);assert.equal(signal.aborted,false);
  assert.equal((await ledger.getNeed(reservation.id)).fingerprint,reservation.fingerprint);
});
