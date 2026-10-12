import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';
import { TruynNode } from '../node/client.js';

// The two relay instances are *actual independent OS processes*. Only their
// Cosmos DATA PLANE is a deterministic local HTTP mock. This is not a live
// cloud-region partition test or paid provider receipt evidence.
function mockCosmos(t) {
  const docs=new Map(),partitioned=new Set();
  let version=0,externalCreates=0;
  const server=http.createServer(async(req,res)=>{
    const reply=(status,obj=null,etag=null)=>{
      res.writeHead(status,{'content-type':'application/json',...(etag?{etag}:{})});
      res.end(obj===null?'':JSON.stringify(obj));
    };
    try {
      let raw='';for await(const chunk of req)raw+=chunk;
      if(partitioned.has(req.headers['x-g5-test-worker']))return reply(503,{code:'ServiceUnavailable'});
      if(req.headers['x-ms-documentdb-isquery']==='True') {
        const query=JSON.parse(raw);
        const recipient=query.parameters.find(x=>x.name==='@recipient')?.value;
        const Documents=[...docs.values()].filter(d=>d.kind==='need'&&d.deliveries.some(e=>e.recipient===recipient&&e.acknowledgedAt===null));
        return reply(200,{Documents});
      }
      const key=JSON.parse(req.headers['x-ms-documentdb-partitionkey'])[0];
      if(req.method==='POST') {
        const doc=JSON.parse(raw);
        assert.equal(key,doc.id);
        if(docs.has(key))return reply(409,{code:'Conflict'});
        const etag=`etag-${++version}`,value={...doc,_etag:etag};
        docs.set(key,value);
        if(value.kind==='effect')externalCreates++;
        return reply(201,value,etag);
      }
      const row=docs.get(key);
      if(!row)return reply(404);
      if(req.method==='GET')return reply(200,row,row._etag);
      assert.equal(req.method,'PUT');
      if(req.headers['if-match']!==row._etag)return reply(412,{code:'PreconditionFailed'});
      const etag=`etag-${++version}`,value={...JSON.parse(raw),_etag:etag};
      docs.set(key,value);
      return reply(200,value,etag);
    } catch(error) {reply(500,{error:error.message});}
  });
  t.after(async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));});
  return {
    docs,partitioned,
    async listen(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;},
    ledger(url){
      const fetchImpl=(uri,options)=>fetch(url+new URL(uri).pathname,{
        ...options,headers:{...options.headers,'x-g5-test-worker':'parent'}
      });
      return createCosmosLifecycleLedger({
        endpoint:'https://g5-fixture.documents.azure.com',
        database:'g5',container:'ledger',
        getAccessToken:async()=> 'fixture-only-token',fetchImpl
      });
    },
    getExternalCreateCount:()=>externalCreates
  };
}
async function launchWorker(t,url,id){
  const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/g5-cosmos-relay-worker.mjs',import.meta.url))],{
    env:{...process.env,TRUYN_G5_TEST_WORKER:JSON.stringify({mockUrl:url,id})},
    stdio:['ignore','pipe','pipe','ipc']
  });
  let errorLog='';child.stderr.on('data',chunk=>errorLog+=chunk.toString());
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('G5 relay child launch timeout: '+errorLog)),12_000);
    child.once('error',err=>{clearTimeout(timeout);reject(err);});
    child.once('exit',(code,signal)=>{clearTimeout(timeout);reject(Error('G5 relay child exited prematurely: '+code+'/'+signal+' '+errorLog));});
    child.once('message',msg=>{
      clearTimeout(timeout);
      if(!msg?.ready)return reject(Error('G5 relay child not ready: '+(msg?.error||errorLog)));
      resolve({child,relayUrl:msg.relayUrl});
    });
  });
}
async function post(node,path,body) {
  const response=await fetch(node.relayUrl+path,{
    method:'POST',headers:{'content-type':'application/json',...node.authHeaders()},
    body:JSON.stringify(body)
  });
  return {status:response.status,body:await response.json()};
}
function signedFastNeed(requester,id) {
  const payload={capability:{name:'g5.os.crash'},input:{id},policy:{}};
  return {frame:requester.compactFrame('NEED',payload,{id}),payload};
}

test('G5 real SIGKILL of relay process: recovered host terminal CAS/ACK without redispatch',async t=>{
  const store=mockCosmos(t),url=await store.listen();
  const a=await launchWorker(t,url,'A'),b=await launchWorker(t,url,'B');
  const providerA=new TruynNode({relayUrl:a.relayUrl});
  const requesterA=new TruynNode({relayUrl:a.relayUrl});
  const providerB=new TruynNode({relayUrl:b.relayUrl,identity:providerA.identity});
  const requesterB=new TruynNode({relayUrl:b.relayUrl,identity:requesterA.identity});
  await Promise.all([providerA.register(),requesterA.register(),providerB.register(),requesterB.register()]);
  await Promise.all([providerA.offer('g5.os.crash'),providerB.offer('g5.os.crash')]);

  const id='g5-os-sigkill-before-result';
  const claimed=await post(requesterA,'/v1/fast/needs?waitMs=0',signedFastNeed(requesterA,id));
  assert.equal(claimed.status,200);
  assert.equal((await store.ledger(url).getNeed(id)).status,'matched');

  // Kill -9 AFTER durable reservation and signed provider delivery, BEFORE
  // RESULT on its original relay. No restart state can recreate a new NEED.
  const killed=once(a.child,'exit');a.child.kill('SIGKILL');const [code,signal]=await killed;
  assert.equal(code,null);assert.equal(signal,'SIGKILL');

  store.partitioned.add('B');
  const duringSplit=await post(providerB,'/v1/fast/results',{
    frame:providerB.compactFrame('RESULT',{output:{ok:true},metadata:{}},{id}),
    payload:{output:{ok:true},metadata:{}}
  });
  assert.equal(duringSplit.status,503,'a partitioned relay must not acknowledge an uncommitted terminal');
  store.partitioned.delete('B');
  const completed=await providerB.compactResult(id,{ok:true});
  assert.equal(completed.ok,true);assert.equal(completed.recovered,true);
  assert.equal((await store.ledger(url).getNeed(id)).status,'completed');
  const duplicate=await post(requesterB,'/v1/fast/needs?waitMs=0',signedFastNeed(requesterB,id));
  assert.equal(duplicate.status,409,'same NEED id remains tombstoned across killed host');
  const recovery=await fetch(b.relayUrl+'/v1/lifecycle/deliveries?limit=16',{headers:requesterB.authHeaders()});
  assert.equal(recovery.status,200);
  const results=(await recovery.json()).deliveries.filter(row=>row.kind==='RESULT'&&row.requestId===id);
  assert.equal(results.length,1,'exactly one signed terminal is durable');
  assert.equal((await post(requesterB,'/v1/lifecycle/deliveries/ack',{eventId:results[0].eventId})).status,200);
  const recovered=await fetch(b.relayUrl+'/v1/lifecycle/deliveries?limit=16',{headers:requesterB.authHeaders()});
  assert.equal((await recovered.json()).deliveries.filter(row=>row.kind==='RESULT'&&row.requestId===id).length,0);
});

test('G5 shared effect intent survives independent relay restart; identity collision and partition fail closed',async t=>{
  const store=mockCosmos(t),url=await store.listen(),a=await launchWorker(t,url,'A'),b=await launchWorker(t,url,'B');
  const input={id:'g5-paid-effect-no-double-invoke',requester:'alice',provider:'provider',fingerprint:'signed-immutable'};
  const first=await store.ledger(url).beginEffect(input);
  assert.equal(first.acquired,true);assert.equal(store.getExternalCreateCount(),1);
  const killed=once(a.child,'exit');a.child.kill('SIGKILL');await killed;
  // Make sure a valid signed OFFER is present on B BEFORE the storage split,
  // otherwise a 404 no-matching-provider would not exercise the CAS gate.
  const requester=new TruynNode({relayUrl:b.relayUrl});
  const provider=new TruynNode({relayUrl:b.relayUrl});
  await Promise.all([requester.register(),provider.register()]);
  await provider.offer('g5.os.crash');
  store.partitioned.add('B');
  // Direct shared ledgers cannot return a false fresh acquisition during a
  // partition. Existing intent must remain intact after reconnect.
  const noMatch=await post(requester,'/v1/fast/needs?waitMs=0',signedFastNeed(requester,'g5-partition-new-need'));
  assert.equal(noMatch.status,503);
  store.partitioned.delete('B');
  const replica=await store.ledger(url).beginEffect(input);
  assert.equal(replica.acquired,false);
  assert.equal(store.getExternalCreateCount(),1,'no second effect reservation after kill');
  await assert.rejects(()=>store.ledger(url).beginEffect({...input,requester:'mallory'}),e=>e.publicCode==='effect_identity_conflict');
});
