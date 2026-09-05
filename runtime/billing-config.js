import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createAuthorityHttpClient } from './authority-client.js';
import { createManagedProviderBillingPolicy, managedBillingMode } from './managed-billing-policy.js';

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true' || String(value || '').trim() === '1';
}

function integer(value, fallback, min, max, label) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}..${max}`);
  return number;
}

function managedProviderNodeId(env, dependencies = {}) {
  if (typeof dependencies.providerNodeId === 'string' && dependencies.providerNodeId.trim()) return dependencies.providerNodeId.trim();
  let identity = null;
  try {
    if (env.TRUYN_IDENTITY_JSON) identity = JSON.parse(env.TRUYN_IDENTITY_JSON);
    else if (env.TRUYN_IDENTITY_B64) identity = JSON.parse(Buffer.from(env.TRUYN_IDENTITY_B64, 'base64').toString('utf8'));
  } catch {
    throw new Error('managed provider billing requires valid durable TRUYN identity');
  }
  const nodeId = typeof identity?.nodeId === 'string' ? identity.nodeId.trim() : '';
  if (!nodeId) throw new Error('managed provider billing requires durable TRUYN_IDENTITY_JSON/TRUYN_IDENTITY_B64');
  return nodeId;
}

export function createRuntimeProviderBillingPolicy(env = process.env, dependencies = {}) {
  const mode = String(env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded').trim().toLowerCase();
  if (env.TRUYN_AUTHORITY_URL && managedBillingMode(mode)) {
    const client = dependencies.authorityClient || createAuthorityHttpClient({
      baseUrl: env.TRUYN_AUTHORITY_URL,
      token: env.TRUYN_AUTHORITY_RUNTIME_TOKEN,
      fetchImpl: dependencies.fetchImpl || fetch,
      requestTimeoutMs: integer(env.TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS, 5_000, 100, 60_000, 'TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS')
    });
    return createManagedProviderBillingPolicy({
      client,
      providerNodeId: managedProviderNodeId(env, dependencies),
      mode
    });
  }

  return createProviderBillingPolicy({
    mode,
    sponsoredAccess: enabled(env.TRUYN_SPONSORED_ACCESS),
    freeDailyRequests: env.TRUYN_FREE_DAILY_REQUESTS || 0,
    freeDailyTokens: env.TRUYN_FREE_DAILY_TOKENS || 0,
    signedEntitlementVerifier: dependencies.signedEntitlementVerifier || null,
    sponsoredUsageStore: dependencies.sponsoredUsageStore || null
  });
}
