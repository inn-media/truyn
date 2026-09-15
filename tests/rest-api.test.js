import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, verifyValue } from '../core/identity/index.js';
import { createHttpAdapterServer, REST_API_PROFILE, TRUYN_PROTOCOL_PROFILE } from '../adapters/http/server.js';

function localNodeFixture() {
  return {
    identity: {
      nodeId: 'truyn:node:rest-version-fixture',
      algorithm: 'Ed25519'
    }
  };
}

test('REST health and version endpoints expose only bounded public metadata', async (t) => {
  const bridge = createHttpAdapterServer({ node: localNodeFixture() });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const versionResponse = await fetch(`${baseUrl}/v1/version`);
  assert.equal(versionResponse.status, 200);
  assert.equal(versionResponse.headers.get('cache-control'), 'no-store');
  const version = await versionResponse.json();

  assert.equal(version.ok, true);
  assert.equal(version.api, REST_API_PROFILE);
  assert.equal(version.protocol, TRUYN_PROTOCOL_PROFILE);
  assert.match(version.runtime, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  assert.deepEqual(Object.keys(version).sort(), ['api', 'ok', 'protocol', 'runtime']);

  const serialized = JSON.stringify(version).toLowerCase();
  for (const forbidden of ['privatekey', 'sessiontoken', 'credential', 'tenant', 'billing', 'truyn-platform']) {
    assert.equal(serialized.includes(forbidden), false, `version metadata must not expose ${forbidden}`);
  }
});

test('REST Agent Descriptor route serves only the accepted signed public descriptor', async (t) => {
  const identity = createIdentity();
  const node = {
    identity,
    async capabilities() {
      return ['public.search', 'private.internal'];
    }
  };
  const descriptorEnv = {
    TRUYN_PUBLIC_AGENT_DESCRIPTOR: '1',
    TRUYN_PUBLIC_AGENT_DESCRIPTOR_URL: 'https://example.test/truyn',
    TRUYN_PUBLIC_CAPABILITIES: 'public.search'
  };
  const bridge = createHttpAdapterServer({ node, descriptorEnv });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/agent-descriptor`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const descriptor = await response.json();
  assert.equal(descriptor.schema, 'truyn.agent-descriptor/v1');
  assert.equal(descriptor.identity, identity.nodeId);
  assert.deepEqual(descriptor.protocols, ['TRUYN/1']);
  assert.deepEqual(descriptor.capabilities, [{ id: 'public.search' }]);
  assert.equal(descriptor.capabilities.some(({ id }) => id === 'private.internal'), false);
  const { signature, ...unsigned } = descriptor;
  assert.equal(verifyValue(unsigned, signature, identity.publicKeyPem), true);

  const serialized = JSON.stringify(descriptor).toLowerCase();
  for (const forbidden of ['privatekey', 'sessiontoken', 'credential', 'tenant', 'billing', 'truyn-platform']) {
    assert.equal(serialized.includes(forbidden), false, `descriptor must not expose ${forbidden}`);
  }
});

test('REST Agent Descriptor route stays fail-closed when public descriptor serving is disabled', async (t) => {
  const identity = createIdentity();
  const bridge = createHttpAdapterServer({ node: { identity }, descriptorEnv: {} });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/agent-descriptor`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
});

test('REST discovery delegates visibility and authorization to the canonical node find path', async (t) => {
  const calls = [];
  const node = {
    identity: { nodeId: 'truyn:node:rest-discovery-fixture', algorithm: 'Ed25519' },
    sessionToken: null,
    async register(metadata) {
      calls.push(['register', metadata]);
      this.sessionToken = 'opaque-session';
    },
    async find(capability) {
      calls.push(['find', capability]);
      return [{ capability, provider: 'truyn:node:visible-provider' }];
    }
  };
  const bridge = createHttpAdapterServer({ node });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/discovery?capability=public.search`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ capability: 'public.search', provider: 'truyn:node:visible-provider' }]);
  assert.deepEqual(calls, [
    ['register', { name: 'truyn-http-adapter' }],
    ['find', 'public.search']
  ]);
});

test('REST discovery fails closed when canonical registration or discovery denies access', async (t) => {
  let findCalls = 0;
  const node = {
    identity: { nodeId: 'truyn:node:rest-discovery-denied', algorithm: 'Ed25519' },
    sessionToken: null,
    async register() {
      const error = new Error('forbidden');
      error.status = 403;
      throw error;
    },
    async find() {
      findCalls += 1;
      return [{ provider: 'truyn:node:private-provider' }];
    }
  };
  const bridge = createHttpAdapterServer({ node });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/discovery?capability=private.internal`);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  assert.equal(findCalls, 0, 'denied registration must prevent provider discovery/enumeration');
});
