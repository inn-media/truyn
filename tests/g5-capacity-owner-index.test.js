import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCosmosLifecycleLedger,createLifecycleCapacityDocument} from '../network/relay/cosmos-lifecycle-ledger.js';

test('G5 global capacity: retained owner-directory index shares the same cardinality budget',async()=>{
  const options={endpoint:'https://capacity-fixture.documents.azure.com',database:'isolated',container:'ledger',recordCapacity:1};
  const seed=createLifecycleCapacityDocument(options);
  seed.tickets=['offer-owner-'+createHash('sha256').update('owner').digest('hex')];seed.reserved=1;
  const row={...seed,_etag:'capacity-1'};let mutations=0;
  const ledger=createCosmosLifecycleLedger({...options,getAccessToken:async()=> 'fixture-token',fetchImpl:async(_url,request)=>{
    if(request.method!=='GET'){mutations++;throw new Error('capacity already exhausted');}
    return new Response(JSON.stringify(row),{status:200,headers:{etag:row._etag}});
  }});
  assert.deepEqual(await ledger.verifyCapacityContract(),{enabled:true,recordCapacity:1,reserved:1,tombstonesRecyclable:false});
  await assert.rejects(()=>ledger.reserveOffer({id:'new-offer',owner:'owner',fingerprint:'signed'}),e=>e.publicCode==='lifecycle_global_capacity_reached');
  assert.equal(mutations,0);
});
