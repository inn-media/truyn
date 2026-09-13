import { createAuthorityHttpClient } from './authority-client.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority
} from '../core/security/relay-provider-policy.js';

let statusProvider = null;

export function configureRelayAuthorityStatusProvider(provider = null) {
  if (provider != null && typeof provider !== 'function') {
    throw new Error('relay authority status provider must be a function or null');
  }
  const previous = statusProvider;
  statusProvider = provider;
  return previous;
}

export function relayAuthorityStatus() {
  if (!statusProvider) {
    return Object.freeze({ ready: false, revision: null, reason: 'authority_runtime_not_installed' });
  }
  const status = statusProvider();
  if (!status || typeof status !== 'object') {
    return Object.freeze({ ready: false, revision: null, reason: 'invalid_authority_runtime_status' });
  }
  return Object.freeze({ ...status, ready: status.ready === true });
}

export async function initializeRelayAuthorityFromEnv(env = process.env, dependencies = {}) {
  if (typeof dependencies.createAuthorityRuntime !== 'function') {
    throw new Error('TRUYN Platform runtime adapter is required for managed relay authority');
  }

  const client = dependencies.client || createAuthorityHttpClient({
    baseUrl: env.TRUYN_AUTHORITY_URL,
    token: env.TRUYN_AUTHORITY_RUNTIME_TOKEN,
    fetchImpl: dependencies.fetchImpl || fetch,
    requestTimeoutMs: Number(env.TRUYN_AUTHORITY_REQUEST_TIMEOUT_MS || 5000)
  });

  const runtime = await dependencies.createAuthorityRuntime({ env, client });
  if (!runtime || typeof runtime.status !== 'function' || typeof runtime.stop !== 'function') {
    throw new Error('TRUYN Platform runtime adapter must expose status() and stop()');
  }
  if (!runtime.accountTenantAuthority || !runtime.providerGrantAuthority) {
    throw new Error('TRUYN Platform runtime adapter must expose public authority contract surfaces');
  }

  const previousAccountTenant = configureRelayAccountTenantAuthority(runtime.accountTenantAuthority);
  const previousProviderGrants = configureRelayProviderGrantAuthority(runtime.providerGrantAuthority);
  const previousStatusProvider = configureRelayAuthorityStatusProvider(() => runtime.status());
  let stopped = false;

  return Object.freeze({
    status: () => relayAuthorityStatus(),
    stop() {
      if (stopped) return;
      stopped = true;
      try { runtime.stop(); }
      finally {
        configureRelayAccountTenantAuthority(previousAccountTenant);
        configureRelayProviderGrantAuthority(previousProviderGrants);
        configureRelayAuthorityStatusProvider(previousStatusProvider);
      }
    }
  });
}

// Transitional compatibility export for existing open relay bootstrap wiring.
// It resolves only the neutral injected status seam; no managed implementation exists in public.
export const managedRelayAuthorityStatus = relayAuthorityStatus;
