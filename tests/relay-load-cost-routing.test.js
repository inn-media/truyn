import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

const source=readFileSync(new URL('../network/relay/server.js',import.meta.url),'utf8');
test('no recency herding, positive OFFER cache or budget-soft fallback',()=>{
  assert.doesNotMatch(source,/return eligible\.sort\(\(a,b\)=>nodeSeenAtMs/);
  assert.doesNotMatch(source,/offerLedgerCache/);
  assert.match(source,/if \(ceiling != null && !\(cost <= ceiling\)\) continue/);
  assert.match(source,/maxConcurrentOfferLedgerReads/);
  assert.match(source,/providerPolicyAllowsRequester\(offer\.policy/);
});
async function setup(t,metas,options={}){
  const relay=createRelay({localDevelopmentMode:true,...options});
  const url=await relay.listen({port:0});
  const requester=new TruynNode({relayUrl:url,identity:createIdentity()});
  await requester.register();
  const providers=[];
  for(const metadata of metas){
    const node=new TruynNode({relayUrl:url,identity:createIdentity()});
    await node.register();
    await node.offer('bench.llm',metadata);
    providers.push(node);
  }
  t.after(async()=>{for(const node of providers)node.close?.();requester.close?.();await relay.close();});
  return {requester,providers};
}
function serve(node,served){
  let stopped=false;
  void (async()=>{while(!stopped){
    let event;try{event=await node.nextSocketEvent({timeoutMs:300});}catch{continue;}
    if(event?.kind!=='NEED')continue;
    await new Promise(r=>setTimeout(r,50));
    served.set(node.identity.nodeId,(served.get(node.identity.nodeId)||0)+1);
    try{await node.compactResult(event.frame.i,{ok:true});}catch{}
  }})();
  return ()=>{stopped=true};
}
test('40 burst NEEDs balance across 4 workers',async(t)=>{
  const {requester,providers}=await setup(t,[{},{},{},{}],{defaultProviderMaxInFlight:2});
  for(const node of providers)await node.ensureFastSocket();
  const served=new Map(),stops=providers.map(node=>serve(node,served));
  t.after(()=>stops.forEach(fn=>fn()));
  const results=await Promise.all(Array.from({length:40},(_,i)=>requester.compactNeed('bench.llm',{i},{routing:{mode:'latency'}})));
  assert.equal(results.filter(r=>r.ok).length,40);
  const counts=providers.map(node=>served.get(node.identity.nodeId)||0);
  assert.equal(counts.reduce((a,b)=>a+b,0),40);
  assert.ok(Math.max(...counts)<=16,'herding: '+counts);
});
test('cheaper provider selected first, spills at capacity, max price is strict',async(t)=>{
  const {requester,providers}=await setup(t,[
    {pricing:{inputUsdPerMTok:15,outputUsdPerMTok:75},capacity:{maxInFlight:4}},
    {pricing:{inputUsdPerMTok:0.3,outputUsdPerMTok:1.2},capacity:{maxInFlight:2}}
  ]);
  const [premium,cheap]=providers;
  for(let i=0;i<3;i++){
    const got=await requester.compactNeed('bench.llm',{i},{},{waitMs:0});
    assert.equal(got.provider,i<2?cheap.identity.nodeId:premium.identity.nodeId);
  }
  await assert.rejects(requester.compactNeed('bench.llm',{i:3},{routing:{maxUnitCostUsdPerMTok:0.5}},{waitMs:0}),/no_matching_provider|404/);
  await assert.rejects(requester.compactNeed('bench.llm',{i:4},{routing:{maxUnitCostUsdPerMTok:'bad'}},{waitMs:0}),/invalid_max_unit_cost|400/);
});
test('missing prices are not implicitly free',async(t)=>{
  const {requester}=await setup(t,[{}]);
  await assert.rejects(requester.compactNeed('bench.llm',{i:0},{routing:{maxUnitCostUsdPerMTok:1}},{waitMs:0}),/no_matching_provider|404/);
});

test('external revocation in shared durable ledger is never hidden by a positive cache',async(t)=>{
  const saved=new Map();
  const ledger={
    kind:'cosmos-multi-host-v1',
    async getOffer(id){return saved.get(id)||null;},
    async reserveOffer({id,owner,fingerprint}){saved.set(id,{owner,fingerprint,revoked:false});},
    async getNeed(){return null;}
  };
  const {requester}=await setup(t,[{}],{lifecycleLedger:ledger});
  const found=await requester.find('bench.llm');
  assert.equal(found.offers.length,1);
  const [offerId]=saved.keys();
  saved.get(offerId).revoked=true; // represents a REVOKE committed on another relay replica
  await assert.rejects(requester.compactNeed('bench.llm',{i:3},{},{waitMs:0}),/no_matching_provider|404/);
});
