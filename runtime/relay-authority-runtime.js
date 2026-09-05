import { createAuthorityHttpClient, createAuthoritySnapshotCache } from './authority-client.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority
} from '../core/security/relay-provider-policy.js';

let activeManagedRuntime = null;

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function integer(value, fallback, min, max, label) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}..${max}`);
  return number;
}

export function managedRelayAuthorityStatus() {
  if (!activeManagedRuntime) return { ready: false, reason: 'managed_authority_not_initialized' };
  return activeManagedRuntime.status();
}

export async function initializeRelayAuthorityFromEnv(env = process.env, dependencies = {}) {
  const client = dependencies.client || createAuthorityHttpClient({
    baseUrl: env.TRUYN_AUTHORITY_URL,
    token: env.TRUYN_AUTHORITY_RUNTIME_TOKEN,
    fetchImpl: dependencies.fetchImpl || fetch,
    requestTimeoutMs: integer(env.TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS, 5_000, 100, 60_000, 'TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS')
  });
  const cache = createAuthoritySnapshotCache({
    client,
    stateDir: required(env.TRUYN_AUTHORITY_CACHE_DIR || '/tmp/truyn-authority-cache', 'TRUYN_AUTHORITY_CACHE_DIR'),
    refreshMs: integer(env.TRUYN_AUTHORITY_REFRESH_MS, 1_000, 100, 60_000, 'TRUYN_AUTHORITY_REFRESH_MS'),
    maxStaleMs: integer(env.TRUYN_AUTHORITY_MAX_STALE_MS, 5_000, 100, 300_000, 'TRUYN_AUTHORITY_MAX_STALE_MS'),
    nowMs: dependencies.nowMs
  });
  await cache.initialize();
  configureRelayAccountTenantAuthority(cache.accountTenantAuthority);
  configureRelayProviderGrantAuthority(cache.providerGrantAuthority);
  cache.start();
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    // Keep the managed authorities installed while the relay is still closing. The cache will
    // age past maxStaleMs and stay fail closed if shutdown is delayed.
    cache.stop();
  }

  const runtime = Object.freeze({ cache, stop, status: () => cache.status() });
  activeManagedRuntime = runtime;
  return runtime;
}
