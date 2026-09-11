import { createAuthorityHttpClient } from './authority-client.js';
import { assertRelayAuthorityRuntime } from '../core/security/platform-contracts.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority
} from '../core/security/relay-provider-policy.js';

let activeManagedRuntime = null;

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
  if (typeof dependencies.createAuthorityRuntime !== 'function') {
    throw new Error('managed relay authority requires TRUYN Platform runtime adapter');
  }

  const client = dependencies.client || createAuthorityHttpClient({
    baseUrl: env.TRUYN_AUTHORITY_URL,
    token: env.TRUYN_AUTHORITY_RUNTIME_TOKEN,
    fetchImpl: dependencies.fetchImpl || fetch,
    requestTimeoutMs: integer(env.TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS, 5_000, 100, 60_000, 'TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS')
  });

  const platformRuntime = assertRelayAuthorityRuntime(await dependencies.createAuthorityRuntime({
    client,
    env,
    nowMs: dependencies.nowMs
  }));

  const previousAccountTenant = configureRelayAccountTenantAuthority(platformRuntime.accountTenantAuthority);
  const previousGrants = configureRelayProviderGrantAuthority(platformRuntime.providerGrantAuthority);
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    try { platformRuntime.stop(); } finally {
      configureRelayProviderGrantAuthority(previousGrants);
      configureRelayAccountTenantAuthority(previousAccountTenant);
    }
  }

  const runtime = Object.freeze({
    platformRuntime,
    accountTenantAuthority: platformRuntime.accountTenantAuthority,
    providerGrantAuthority: platformRuntime.providerGrantAuthority,
    stop,
    status: () => platformRuntime.status()
  });
  activeManagedRuntime = runtime;
  return runtime;
}
