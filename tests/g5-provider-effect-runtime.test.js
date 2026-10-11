import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeG5ProviderEffectLedger } from '../runtime/g5-provider-effect-ledger.js';

const env = {
  TRUYN_G5_PROVIDER_EFFECT_LEDGER:'cosmos',
  TRUYN_G5_COSMOS_ENDPOINT:'https://g5-account.documents.azure.com',
  TRUYN_G5_COSMOS_DATABASE:'g5',
  TRUYN_G5_COSMOS_CONTAINER:'ledger'
};

test('G5 provider runtime: disabled by default and no silent fallback when fence required',()=>{
  assert.equal(createRuntimeG5ProviderEffectLedger({env:{}}),null);
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({env:{TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE:'1'}}),/required but not configured/);
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({env:{TRUYN_G5_PROVIDER_EFFECT_LEDGER:'sqlite'}}),/Unsupported/);
});

test('G5 provider runtime: Cosmos mode rejects incomplete and non-Entra configuration before serving',()=>{
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({env:{TRUYN_G5_PROVIDER_EFFECT_LEDGER:'cosmos'}}),/endpoint, database and container/);
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({env}),/requires Azure managed identity/);
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({
    env:{...env,IDENTITY_ENDPOINT:'https://evil.example.com/msi',IDENTITY_HEADER:'secret'}
  }),/endpoint must be loopback/);
  assert.throws(()=>createRuntimeG5ProviderEffectLedger({
    env:{...env,TRUYN_G5_COSMOS_ENDPOINT:'http://localhost:8081',IDENTITY_ENDPOINT:'http://localhost:42356',IDENTITY_HEADER:'token'}
  }),/Cosmos account HTTPS endpoint required/);
});

test('G5 provider runtime: explicitly supplied OAuth callback, no live cloud and fail closed on partition',async()=>{
  let effects=0;
  const ledger=createRuntimeG5ProviderEffectLedger({
    env,
    tokenProvider:async()=> 'fake-unit-test-identity-token',
    fetchImpl:async()=>{effects++;throw new Error('simulated Cosmos partition');}
  });
  assert.equal(ledger.kind,'cosmos-multi-host-v1');
  await assert.rejects(
    ledger.beginEffect({id:'same-need',requester:'alice',provider:'bob',fingerprint:'signed-need-sha'}),
    error=>error.publicCode==='lifecycle_ledger_unavailable'
  );
  assert.equal(effects,1);
});
