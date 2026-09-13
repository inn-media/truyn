import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorityHttpClient } from '../runtime/authority-client.js';
import { initializeRelayAuthorityFromEnv } from '../runtime/relay-authority-runtime.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority,
  providerPolicyFromOffer
} from '../core/security/relay-provider-policy.js';


test('authority HTTP timeout remains active through response body read', async () => {
  const fetchImpl = async (_url, options) => ({
    ok: true,
    status: 200,
    async json() {
      return await new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason);
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  const client = createAuthorityHttpClient({
    baseUrl: 'https://authority.internal',
    token: 'runtime-token',
    fetchImpl,
    requestTimeoutMs: 100
  });
  await assert.rejects(client.snapshot(), /authority_request_timeout/);
});

test('managed relay authority requires an injected TRUYN Platform runtime adapter', async () => {
  await assert.rejects(
    initializeRelayAuthorityFromEnv({
      TRUYN_AUTHORITY_URL: 'https://authority.internal',
      TRUYN_AUTHORITY_RUNTIME_TOKEN: 'runtime-token'
    }, {
      client: { async snapshot() { return {}; } }
    }),
    /TRUYN Platform runtime adapter/
  );
});

test('injected platform runtime installs only contract surfaces and stop restores previous relay authorities', { concurrency: false }, async (t) => {
  const previousAccountTenant = {
    resolveRequester() { return { ok: false, reason: 'previous' }; },
    resolveProvider() { return { ok: false, reason: 'previous' }; }
  };
  const previousGrants = {
    durable: true,
    authorize() { return { ok: false, reason: 'previous' }; },
    visibleToRequester() { return { ok: false, reason: 'previous' }; },
    getProviderPolicy() { return null; },
    revision: 1
  };
  configureRelayAccountTenantAuthority(previousAccountTenant);
  configureRelayProviderGrantAuthority(previousGrants);
  t.after(() => {
    configureRelayProviderGrantAuthority(null);
    configureRelayAccountTenantAuthority(null);
  });

  const accountTenantAuthority = {
    resolveRequester(nodeId) { return { ok: true, nodeId, tenantId: 'tenant' }; },
    resolveProvider(nodeId) { return { ok: true, providerNodeId: nodeId, tenantId: 'tenant' }; }
  };
  const providerGrantAuthority = {
    durable: true,
    authorize() { return { ok: true }; },
    visibleToRequester() { return { ok: true }; },
    getProviderPolicy() { return { mode: 'network' }; },
    revision: 7
  };
  let stopped = 0;
  const runtime = await initializeRelayAuthorityFromEnv({
    TRUYN_AUTHORITY_URL: 'https://authority.internal',
    TRUYN_AUTHORITY_RUNTIME_TOKEN: 'runtime-token'
  }, {
    client: { async snapshot() { return {}; } },
    async createAuthorityRuntime() {
      return {
        accountTenantAuthority,
        providerGrantAuthority,
        status: () => ({ ready: true, revision: 7 }),
        stop() { stopped += 1; }
      };
    }
  });

  const offer = {
    from: 'provider-node',
    payload: { capability: { name: 'reasoning.managed' }, metadata: { accessMode: 'public' } }
  };
  assert.equal(providerPolicyFromOffer(offer).accessMode, 'authority');
  assert.deepEqual(runtime.status(), { ready: true, revision: 7 });
  runtime.stop();
  assert.equal(stopped, 1);
  assert.equal(providerPolicyFromOffer(offer).accessMode, 'authority', 'previous durable authority is restored after stop');
});
