import { createCosmosLifecycleLedger, lifecycleRecordCapacityFromEnv } from '../network/relay/cosmos-lifecycle-ledger.js';
import { containerAppsManagedIdentityToken } from '../adapters/providers/common/azure-auth.js';
import { withCosmosEffectReceipts } from './g5-durable-response-receipt.js';

// The provider and relay use asynchronous shared Cosmos adapters. Receipt
// operations extend the same effect record; they never enable paid execution
// or production admission merely because the factory was configured.
export function createRuntimeG5ProviderEffectLedger({
  env = process.env, tokenProvider = null, fetchImpl = fetch
} = {}) {
  const recordCapacity = lifecycleRecordCapacityFromEnv(env);
  const mode = env.TRUYN_G5_PROVIDER_EFFECT_LEDGER || 'off';
  if (!['off','cosmos'].includes(mode)) throw new Error('Unsupported G5 provider effect ledger mode');
  if (mode === 'off') {
    if (recordCapacity !== null) throw new Error('G5 record capacity requires configured Cosmos ledger');
    if (env.TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE === '1') {
      throw new Error('G5 provider effect fence is required but not configured');
    }
    return null;
  }
  const endpoint = env.TRUYN_G5_COSMOS_ENDPOINT;
  const database = env.TRUYN_G5_COSMOS_DATABASE;
  const container = env.TRUYN_G5_COSMOS_CONTAINER;
  if (![endpoint,database,container].every(x => typeof x === 'string' && x.length > 0)) {
    throw new Error('G5 Cosmos endpoint, database and container are all required');
  }
  if (!tokenProvider && (!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER)) {
    throw new Error('G5 Cosmos effect fence requires Azure managed identity, not account keys');
  }
  if (!tokenProvider) {
    let endpointUrl;
    try { endpointUrl = new URL(env.IDENTITY_ENDPOINT); }
    catch { throw new Error('G5 managed identity endpoint must be loopback'); }
    if (endpointUrl.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(endpointUrl.hostname)) {
      throw new Error('G5 managed identity endpoint must be loopback');
    }
  }
  const getAccessToken = tokenProvider || (() => containerAppsManagedIdentityToken({
    fetchImpl, resource: 'https://cosmos.azure.com/'
  }));
  const options = { endpoint, database, container, getAccessToken, fetchImpl, recordCapacity };
  return withCosmosEffectReceipts(createCosmosLifecycleLedger(options), options);
}
