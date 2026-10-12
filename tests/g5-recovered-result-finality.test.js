import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createIdentity} from '../core/identity/index.js';
import {canonicalize,createEnvelope,verifyEnvelope} from '../core/protocol/index.js';
import {createCosmosLifecycleLedger} from '../network/relay/cosmos-lifecycle-ledger.js';
import {withCosmosEffectReceipts,wrapRuntimeG5ReceiptAdapter} from '../runtime/g5-durable-response-receipt.js';
import {createRuntimeG5RecoveredResultFinalizer} from '../runtime/g5-recovered-result-finality.js';
import {createAzureOpenAIProvider} from '../adapters/providers/azure-openai.js';
import {TruynAdapterHost} from '../adapters/sdk/index.js';
import {readFileSync} from 'node:fs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fails=(f,code)=>assert.rejects(f,e=>e.publicCode===code);

// Real ledger/receipt/provider/host code with a deterministic HTTP ETag model.
// These counters are model writes/requests, NOT live Cosmos or vendor charges.
async function fixture({unreceipted=false,completed=false,limit=256}={}) {
  const requester=createIdentity(),provider=createIdentity(),docs=new Map();
  const need=createEnvelope({type:'NEED',from:requester.nodeId,...{
    publicKeyPem:requester.publicKeyPem,privateKeyPem:requester.privateKeyPem},
    id:'finality-case',payload:{capability:{name:'research'},input:'fixture',policy:{}}});
  let rev=0,posts=0,gets=0,usageWrites=0,putCount=0,billingCalls=0,terminalCalls=0;
  let loseCommit=false,offline=false,blockGet=false,onGet=null,beforePut=null;
  const reply=(status,v)=>new Response(v===null?null:JSON.stringify(v),{status,
    headers:v?{etag:v._etag||'', 'x-ms-session-token':'0:'+rev}:{}});
  const fetchImpl=async (url,options)=>{
    assert.equal(new URL(url).hostname,'fixture.documents.azure.com');
    assert.equal(options.redirect,'error');
    if(offline)throw Error('model-network-down');
    if(options.headers['x-ms-documentdb-isquery']==='True'){
      const who=JSON.parse(options.body).parameters[0].value;
      return reply(200,{Documents:[...docs.values()].filter(d=>d.kind==='need' &&
        d.deliveries.some(v=>v.recipient===who&&v.acknowledgedAt===null&&(v.kind!=='NEED'||d.status==='matched')))});
    }
    const id=JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0],prior=docs.get(id);
    if(options.method==='GET')return reply(prior?200:404,prior||null);
    if(options.method==='POST'&&prior)return reply(409,null);
    if(options.method==='PUT'){
      putCount++;
      if(beforePut){const fn=beforePut;beforePut=null;await fn();}
      if(options.headers['if-match']!==docs.get(id)?._etag)return reply(412,null);
    }
    const row={...JSON.parse(options.body),_etag:'v'+(++rev)};
    docs.set(id,row);
    if(row.kind==='need'&&row.recoveredUsage){
      usageWrites++;
      if(loseCommit){loseCommit=false;throw Error('model-response-lost-after-CAS');}
    }
    return reply(options.method==='POST'?201:200,row);
  };
  const opts={endpoint:'https://fixture.documents.azure.com',database:'g5',container:'test',
    getAccessToken:async()=>'model-entra',fetchImpl,maxDeliveriesPerNeed:limit};
  const ledger=()=>withCosmosEffectReceipts(createCosmosLifecycleLedger(opts),opts);
  const env={TRUYN_G5_RECOVERED_RESULT_FINALITY:'1',TRUYN_G5_DURABLE_AZURE_RECEIPTS:'1',
    TRUYN_G5_AZURE_STORE_RESPONSES:'1',AZURE_OPENAI_ENDPOINT:'https://fixture.openai.azure.com',AZURE_OPENAI_MODEL:'fixture'};
  const a=ledger();
  await a.reserveNeed({id:need.id,requester:need.from,provider:provider.nodeId,
    fingerprint:hash(JSON.stringify(need)),scope:need.from,policyDigest:hash('{}'),mode:'legacy',capability:'research',
    delivery:{kind:'NEED',recipient:provider.nodeId,event:{kind:'NEED',envelope:need}}});
  const effectBinding={id:need.id,requester:need.from,provider:provider.nodeId,
    fingerprint:hash(JSON.stringify([need.id,need.from,need.payload]))};
  await a.beginEffect(effectBinding);
  const {executionToken}=await a.claimReceiptExecution(effectBinding);
  const receipt={version:1,provider:'azure-openai',responseId:'resp_finality',model:'fixture-version',
    usage:{input_tokens:3,output_tokens:4,total_tokens:7},outputDigest:hash('recovered output'),
    scopeDigest:hash(JSON.stringify([env.AZURE_OPENAI_ENDPOINT,env.AZURE_OPENAI_MODEL]))};
  if(!unreceipted)await a.captureEffectReceipt({...effectBinding,executionToken,value:receipt});
  await a.finishEffect({id:need.id,provider:provider.nodeId,outcome:completed?'completed':'unknown'});
  const make=({policy=null,nodeId=provider.nodeId}={})=>{
    const shared=ledger();
    const adapter=wrapRuntimeG5ReceiptAdapter({ledger:shared,env,adapter:createAzureOpenAIProvider({
      endpoint:env.AZURE_OPENAI_ENDPOINT,model:env.AZURE_OPENAI_MODEL,apiKey:'test-only',persistResponses:true,
      fetchImpl:async(_url,o)=>{
        if(o.method==='POST'){posts++;throw Error('unexpected-external-create');}
        assert.equal(o.method,'GET');gets++;
        if(onGet)await onGet();
        if(blockGet)return new Promise(()=>{});
        return reply(200,{id:receipt.responseId,model:receipt.model,status:'completed',
          output_text:'recovered output',usage:receipt.usage});
      }
    })});
    return new TruynAdapterHost({node:{identity:{...provider,nodeId},result:()=>{terminalCalls++;}},adapter,
      effectLedger:shared,accessPolicy:policy||{mode:'owner-only',authorize:n=>({ok:n.from===requester.nodeId})},
      billingPolicy:{authorize:()=>{billingCalls++;throw Error('no-financial-side-effects');}},
      recoveredResultFinalizer:createRuntimeG5RecoveredResultFinalizer({env,ledger:shared})});
  };
  const cancel=()=>a.transitionNeed({id:need.id,requester:need.from,to:'cancelled',
    delivery:{kind:'REVOKE',recipient:provider.nodeId,event:{kind:'REVOKE',test:true}}});
  return {need,provider,requester,docs,env,ledger,make,cancel,effectBinding,receipt,
    get effect(){return docs.get('effect-'+hash(need.id));},get row(){return docs.get('need-'+hash(need.id));},
    get counters(){return {posts,gets,usageWrites,putCount,billingCalls,terminalCalls};},
    set loseCommit(v){loseCommit=v;},set offline(v){offline=v;},set onGet(v){onGet=v;},
    set beforePut(v){beforePut=v;},set blockGet(v){blockGet=v;}};
}

test('G5 recovered finality: explicit default-off and actual runtime/host wiring',async()=>{
  assert.equal(createRuntimeG5RecoveredResultFinalizer({env:{}}),null);
  assert.throws(()=>createRuntimeG5RecoveredResultFinalizer({env:{TRUYN_G5_RECOVERED_RESULT_FINALITY:'1'}}),/configuration_required/);
  const f=await fixture();
  for(const changed of [{TRUYN_G5_DURABLE_AZURE_RECEIPTS:'0'},{TRUYN_G5_AZURE_STORE_RESPONSES:'0'},{TRUYN_PROVIDER_BILLING_MODE:'managed'}])
    assert.throws(()=>createRuntimeG5RecoveredResultFinalizer({env:{...f.env,...changed},ledger:f.ledger()}),/configuration_required/);
  const host=f.make();host.recoveredResultFinalizer=null;
  await fails(()=>host.finalizeRecoveredResult({need:f.need}),'provider_result_finality_not_enabled');
  assert.match(readFileSync(new URL('../runtime/service.js',import.meta.url),'utf8'),/recoveredResultFinalizer: createRuntimeG5RecoveredResultFinalizer/);
});

for(const completed of [false,true])test('G5 recovered finality: one usage and signed RESULT, original effect '+(completed?'completed':'unknown'),async()=>{
  const f=await fixture({completed}),before=structuredClone(f.effect),host=f.make();
  const result=await host.finalizeRecoveredResult({need:f.need});
  assert.equal(result.recorded,true);assert.equal(result.idempotent,false);
  assert.equal(result.usageRecord.totalTokens,7);assert.equal(result.usageRecord.vendorChargeVerified,false);
  assert.equal(result.providerInvoiceVerified,false);assert.equal(result.accountingSettled,false);
  assert.equal(result.resultQueued,true);assert.equal(result.terminalDelivered,false);
  assert.equal(f.row.status,'completed');assert.deepEqual(f.effect,before,'no effect promotion or receipt overwrite');
  const pending=await f.ledger().pendingDeliveries({recipient:f.need.from});
  assert.equal(pending.length,1);assert.deepEqual(verifyEnvelope(pending[0].event.envelope),{ok:true});
  assert.equal(pending[0].event.envelope.payload.output,'recovered output');
  assert.deepEqual(f.counters,{posts:0,gets:1,usageWrites:1,putCount:4,billingCalls:0,terminalCalls:0});
});

test('G5 recovered finality: 24 rival clients produce one operational usage mutation',async()=>{
  const f=await fixture();
  const results=await Promise.all(Array.from({length:24},()=>f.make().finalizeRecoveredResult({need:f.need})));
  assert.equal(results.filter(r=>!r.idempotent).length,1);assert.equal(f.counters.usageWrites,1);
  assert.equal(f.row.deliveries.filter(d=>d.kind==='RESULT').length,1);
  assert.equal(f.counters.posts,0);assert.equal(f.counters.billingCalls,0);
});

test('G5 recovered finality: lost commit response is reconciled on new client without second PUT',async()=>{
  const f=await fixture();f.loseCommit=true;
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'lifecycle_ledger_unavailable');
  assert.equal(f.row.status,'completed');assert.equal(f.counters.usageWrites,1);
  const writes=f.counters.putCount;
  const replay=await f.make().finalizeRecoveredResult({need:f.need});
  assert.equal(replay.idempotent,true);assert.equal(f.counters.putCount,writes);
  assert.equal(f.counters.usageWrites,1);assert.equal(f.counters.posts,0);
});

test('G5 recovered finality: ACK and receipt survive repeated reconcilers without redelivery',async()=>{
  const f=await fixture();await f.make().finalizeRecoveredResult({need:f.need});
  const [event]=await f.ledger().pendingDeliveries({recipient:f.need.from});
  await f.ledger().acknowledgeDelivery({eventId:event.eventId,recipient:f.need.from});
  const writes=f.counters.putCount,prior=structuredClone(f.row.recoveredUsage);
  assert.equal((await f.make().finalizeRecoveredResult({need:f.need})).idempotent,true);
  assert.equal(f.counters.putCount,writes);assert.deepEqual(f.row.recoveredUsage,prior);
  assert.deepEqual(await f.ledger().pendingDeliveries({recipient:f.need.from}),[]);
});

test('G5 recovered finality: canceled or failed NEED is never resurrected or charged',async()=>{
  for(const state of ['cancelled','failed']){
    const f=await fixture();await f.ledger().transitionNeed({id:f.need.id,requester:f.need.from,to:state});
    await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),state==='cancelled'?'request_cancelled':'request_failed');
    assert.equal(f.counters.gets,0);assert.equal(f.row.recoveredUsage,undefined);assert.equal(f.row.status,state);
  }
});

test('G5 recovered finality: cancellation during GET wins without terminal or usage',async()=>{
  const f=await fixture();f.onGet=()=>f.cancel();
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'request_cancelled');
  assert.equal(f.row.status,'cancelled');assert.equal(f.row.recoveredUsage,undefined);
  assert.equal(f.row.deliveries.filter(d=>d.kind==='RESULT').length,0);assert.equal(f.counters.posts,0);
});

test('G5 recovered finality: cancellation at ETag compare defeats stale completion',async()=>{
  const f=await fixture();f.beforePut=()=>f.cancel();
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'request_cancelled');
  assert.equal(f.row.status,'cancelled');assert.equal(f.row.recoveredUsage,undefined);
});

test('G5 recovered finality: signature, identity and original payload/receiver are bound',async()=>{
  const f=await fixture();
  await fails(()=>f.make().finalizeRecoveredResult({need:{...f.need,from:f.provider.nodeId}}),'invalid_recovered_need');
  const changed=createEnvelope({type:'NEED',from:f.need.from,publicKeyPem:f.requester.publicKeyPem,
    privateKeyPem:f.requester.privateKeyPem,id:f.need.id,payload:{...f.need.payload,input:'changed'}});
  await fails(()=>f.make().finalizeRecoveredResult({need:changed}),'recovered_need_binding_mismatch');
  await fails(()=>f.make({nodeId:'foreign'}).finalizeRecoveredResult({need:f.need}),'recovered_need_binding_mismatch');
  assert.equal(f.row.recoveredUsage,undefined);assert.equal(f.counters.posts,0);
});

test('G5 recovered finality: compact/chain and policy revocation remain fail-closed',async()=>{
  const f=await fixture();
  for(const extra of [{compact:true},{chain:true}])await fails(()=>f.make().finalizeRecoveredResult({need:{...f.need,...extra}}),'invalid_recovered_need');
  let allowed=true;const host=f.make({policy:{authorize:()=>({ok:allowed})}});f.onGet=()=>{allowed=false;};
  await fails(()=>host.finalizeRecoveredResult({need:f.need}),'provider_access_denied');
  assert.equal(f.row.recoveredUsage,undefined);assert.equal(f.counters.usageWrites,0);
});

test('G5 recovered finality: absent durable response ID stays UNKNOWN; no external POST or inference',async()=>{
  const f=await fixture({unreceipted:true});
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'effect_receipt_unknown');
  assert.equal(f.effect.status,'unknown');assert.equal(f.row.status,'matched');
  assert.equal(f.counters.gets,0);assert.equal(f.counters.posts,0);assert.equal(f.row.recoveredUsage,undefined);
});

test('G5 recovered finality: modified committed receipt / usage never overwrites completed evidence',async()=>{
  const f=await fixture();await f.make().finalizeRecoveredResult({need:f.need});
  const prior=structuredClone(f.row);f.effect.effectReceipt.usage={input_tokens:9,output_tokens:8,total_tokens:17};
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'effect_receipt_unverified');
  assert.deepEqual(f.row,prior);
});

test('G5 recovered finality: preserve limits and fail closed on ledger unavailability',async()=>{
  const f=await fixture({limit:1});
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'lifecycle_outbox_capacity_reached');
  assert.equal(f.row.status,'matched');assert.equal(f.row.recoveredUsage,undefined);
  f.offline=true;
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'lifecycle_ledger_unavailable');
  assert.equal(f.counters.posts,0);
});

test('G5 recovered finality: aborted operation and caller mutation do not authorize completion',async()=>{
  const f=await fixture(),controller=new AbortController();controller.abort();
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need,signal:controller.signal}),'recovered_result_aborted');
  const caller=structuredClone(f.need);f.onGet=()=>{caller.from=f.provider.nodeId;};
  assert.equal((await f.make().finalizeRecoveredResult({need:caller})).recorded,true);
  assert.equal(f.row.recoveredUsage.requester,f.requester.nodeId);
});

test('G5 recovered finality: no backfill of a preexisting legacy terminal without matching usage',async()=>{
  const f=await fixture();await f.ledger().transitionNeed({id:f.need.id,provider:f.provider.nodeId,to:'completed',
    delivery:{kind:'RESULT',recipient:f.need.from,event:{kind:'RESULT',fixture:'other'}}});
  await fails(()=>f.make().finalizeRecoveredResult({need:f.need}),'request_already_completed');
  assert.equal(f.row.recoveredUsage,undefined);assert.equal(f.counters.usageWrites,0);
});


test('G5 recovered finality: completed replay works without a retained vendor response or new GET',async()=>{
  const f=await fixture();await f.make().finalizeRecoveredResult({need:f.need});
  const gets=f.counters.gets;f.onGet=()=>{throw Error('expired-vendor-response');};
  assert.equal((await f.make().finalizeRecoveredResult({need:f.need})).idempotent,true);
  assert.equal(f.counters.gets,gets);assert.equal(f.counters.usageWrites,1);
});

test('G5 recovered finality: hung provider read and ignored cancellation cannot dispatch later writes',async()=>{
  const f=await fixture(),host=f.make();f.blockGet=true;
  host.recoveredResultFinalizer=createRuntimeG5RecoveredResultFinalizer({env:f.env,ledger:host.effectLedger,timeoutMs:50});
  await fails(()=>host.finalizeRecoveredResult({need:f.need}),'g5_result_finality_timeout');
  assert.equal(f.row.status,'matched');assert.equal(f.row.recoveredUsage,undefined);
  assert.equal(f.counters.posts,0);assert.equal(f.counters.usageWrites,0);
});

test('G5 recovered finality: low-level caller cannot inject unverified monetary flags or changed tokens',async()=>{
  const f=await fixture();await f.make().finalizeRecoveredResult({need:f.need});
  const existing=f.row.deliveries.find(d=>d.kind==='RESULT').event.envelope;
  for(const metadata of [{...existing.payload.metadata,providerInvoiceVerified:true},
    {...existing.payload.metadata,usage:{input_tokens:0,output_tokens:0,total_tokens:0}}]){
    const signed=createEnvelope({type:'RESULT',from:f.provider.nodeId,to:f.need.from,
      id:existing.id,createdAt:existing.createdAt,publicKeyPem:f.provider.publicKeyPem,
      privateKeyPem:f.provider.privateKeyPem,payload:{...existing.payload,metadata}});
    await fails(()=>f.ledger().commitRecoveredResult({need:f.need,provider:f.provider.nodeId,
      receiptDigest:f.row.recoveredUsage.receiptDigest,
      delivery:{kind:'RESULT',recipient:f.need.from,event:{kind:'RESULT',envelope:signed}}}),
      'invalid_recovered_usage_metadata');
  }
  assert.equal(f.counters.usageWrites,1);
});
