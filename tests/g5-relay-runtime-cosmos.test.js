import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRuntimeG5RelayLifecycleLedger, verifyRuntimeG5RelayLedger } from '../runtime/g5-relay-lifecycle-ledger.js';

const env={
  TRUYN_G5_RELAY_LIFECYCLE_LEDGER:'cosmos',
  TRUYN_G5_REQUIRE_RELAY_LIFECYCLE_LEDGER:'1',
  TRUYN_G5_COSMOS_ENDPOINT:'https://g5-test.documents.azure.com',
  TRUYN_G5_COSMOS_DATABASE:'g5-test',
  TRUYN_G5_COSMOS_CONTAINER:'needs-test'
};
test('G5 relay production runtime remains opt-in but require=true never falls back to ephemeral memory',()=>{
  assert.equal(createRuntimeG5RelayLifecycleLedger({env:{}}),null);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{TRUYN_G5_REQUIRE_RELAY_LIFECYCLE_LEDGER:'1'}}),/required but not configured/);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{TRUYN_G5_RELAY_LIFECYCLE_LEDGER:'sqlite'}}),/unsupported/);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{TRUYN_G5_RELAY_LIFECYCLE_LEDGER:'cosmos'}}),/endpoint, database and container/);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env}),/requires Azure managed identity/);
  assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{...env,IDENTITY_ENDPOINT:'https://evil.example/identity',IDENTITY_HEADER:'token'}}),/identity endpoint must be loopback/);
});

test('G5 relay read-only preflight issues authenticated Cosmos GET with no paid side-effect or mutation',async()=>{
  let reads=0;
  const ledger=createRuntimeG5RelayLifecycleLedger({
    env,tokenProvider:async()=> 'fixture-entra-token',
    fetchImpl:async (url,params)=>{
      assert.equal(params.method,'GET');
      assert.match(params.headers.authorization,/type%3Daad%26ver%3D1.0%26sig%3D/);
      reads++;
      if(url.endsWith('/colls/needs-test'))
        return new Response(JSON.stringify({partitionKey:{paths:['/partitionKey'],kind:'Hash'}}),{status:200});
      return new Response(null,{status:404});
    }
  });
  assert.equal(ledger.kind,'cosmos-multi-host-v1');
  assert.deepEqual(await verifyRuntimeG5RelayLedger(ledger),{enabled:true,readable:true});
  assert.equal(reads,2,'metadata read and absent sentinel GET, no mutation');
  assert.deepEqual(await verifyRuntimeG5RelayLedger(null),{enabled:false});
});

test('G5 relay identity/Cosmos partition outage is fail-closed before any listener or dispatch',async()=>{
  let attempts=0;
  const ledger=createRuntimeG5RelayLifecycleLedger({
    env,tokenProvider:async()=> 'fixture-entra-token',
    fetchImpl:async()=>{attempts++;throw Error('partitioned-cloud');}
  });
  await assert.rejects(()=>verifyRuntimeG5RelayLedger(ledger),e=>e.publicCode==='lifecycle_ledger_unavailable');
  assert.equal(attempts,1);
});

test('G5 accepted production service entrypoint awaits shared preflight and passes same ledger to relay',()=>{
  const code=readFileSync(new URL('../runtime/service.js',import.meta.url),'utf8');
  assert.match(code,/const lifecycleLedger = createRuntimeG5RelayLifecycleLedger/);
  assert.match(code,/await verifyRuntimeG5RelayLedger\(lifecycleLedger\)/);
  assert.match(code,/const relay = createRelay\(\{\s+lifecycleLedger,/);
});

test('G5 relay preflight rejects missing Cosmos container and unsafe partition schema',async()=>{
  for(const {metadata,status,error} of [
    {status:404,metadata:null,error:/container metadata rejected/},
    {status:200,metadata:{partitionKey:{paths:['/wrong'],kind:'Hash'}},error:/partition key must be/},
    {status:200,metadata:{partitionKey:{paths:['/partitionKey','/tenant'],kind:'MultiHash'}},error:/partition key must be/}
  ]){
    const ledger=createRuntimeG5RelayLifecycleLedger({
      env,tokenProvider:async()=> 'fixture-token',
      fetchImpl:async()=>new Response(status===200?JSON.stringify(metadata):null,{status})
    });
    await assert.rejects(()=>verifyRuntimeG5RelayLedger(ledger),error);
  }
});
