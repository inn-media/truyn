import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createAccountTenantAuthority } from '../core/security/account-tenant-authority.js';
import { configureRelayAccountTenantAuthority } from '../core/security/relay-provider-policy.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';
import { createMcpHttpClient, MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const skill = { id: 'c8-review', capability: 'c8.review' };

function message(messageId) {
  return { messageId, role: 'ROLE_USER', parts: [{ text: 'x', mediaType: 'text/plain' }] };
}

test('C8 replay marker survives terminal task capacity eviction until TTL', () => {
  let now = 10_000;
  const store = new A2aTaskStore({ maxTasks: 1, taskTtlMs: 1_000, now: () => now });
  const first = store.create({ ownerKey: 'owner', message: message('same-message'), skill });
  store.reject(first.id, 'done');

  assert.throws(
    () => store.create({ ownerKey: 'owner', message: message('same-message'), skill }),
    (error) => error.code === 'A2A_MESSAGE_ID_REPLAY'
  );
  assert.equal(store.tasks.size, 0, 'terminal task may be evicted while replay marker remains authoritative');

  now += 1_001;
  const afterTtl = store.create({ ownerKey: 'owner', message: message('same-message'), skill });
  assert.ok(afterTtl.id, 'messageId may be reused only after the bounded replay-retention TTL expires');
});

test('C8 replay correlation tuple cannot collide with anonymous sentinel-like owner values', () => {
  const store = new A2aTaskStore({ maxTasks: 3 });
  const anonymous = store.create({ ownerKey: null, message: message('same-message'), skill });
  store.reject(anonymous.id, 'done');

  const authenticated = store.create({ ownerKey: '<anonymous>', message: message('same-message'), skill });
  assert.ok(authenticated.id);
  assert.notEqual(authenticated.id, anonymous.id);
});

test('C8 replay marker cache is independently bounded and fails closed at capacity', () => {
  let now = 20_000;
  const store = new A2aTaskStore({
    maxTasks: 1,
    maxReplayMarkers: 2,
    taskTtlMs: 1_000,
    now: () => now
  });

  const first = store.create({ ownerKey: 'owner', message: message('m1'), skill });
  store.reject(first.id, 'done');
  const second = store.create({ ownerKey: 'owner', message: message('m2'), skill });
  store.reject(second.id, 'done');

  assert.throws(
    () => store.create({ ownerKey: 'owner', message: message('m3'), skill }),
    (error) => error.code === 'A2A_REPLAY_CAPACITY_REACHED'
  );
  assert.equal(store.byMessageCorrelation.size, 2, 'replay cache must remain bounded without evicting live protection');
  assert.equal(store.tasks.size, 0, 'capacity rejection must happen before a third task can dispatch');

  now += 1_001;
  const afterExpiry = store.create({ ownerKey: 'owner', message: message('m3'), skill });
  assert.ok(afterExpiry.id, 'expired replay markers free bounded capacity');
});

test('C8 replay retention refreshes with the linked task lifetime', () => {
  let now = 30_000;
  const store = new A2aTaskStore({
    maxTasks: 2,
    maxReplayMarkers: 4,
    taskTtlMs: 100,
    now: () => now
  });

  const task = store.create({ ownerKey: 'owner', message: message('refresh-me'), skill });
  now += 90;
  store.start(task.id, { truynRequestId: 'need-refresh' });
  now += 90;
  store.reject(task.id, 'terminal');
  now += 20;

  assert.throws(
    () => store.create({ ownerKey: 'owner', message: message('refresh-me'), skill }),
    (error) => error.code === 'A2A_MESSAGE_ID_REPLAY'
  );
  assert.equal(store.tasks.get(task.id)?.status.state, 'TASK_STATE_REJECTED');
});

test('C8 account/tenant authority cannot be bypassed by forged offer metadata and preserves zero/one dispatch invariant', async (t) => {
  const providerIdentity = createIdentity();
  const allowedIdentity = createIdentity();
  const deniedIdentity = createIdentity();
  const authority = createAccountTenantAuthority({
    accounts: [{ accountId: 'c8-account' }],
    organizations: [{ organizationId: 'c8-org', accountId: 'c8-account' }],
    tenants: [{ tenantId: 'c8-tenant', organizationId: 'c8-org' }],
    memberships: [
      { membershipId: 'c8-provider-membership', principalId: 'provider-principal', scopeType: 'tenant', scopeId: 'c8-tenant', roles: ['provider-operator'] },
      { membershipId: 'c8-allowed-membership', principalId: 'allowed-principal', scopeType: 'tenant', scopeId: 'c8-tenant', roles: ['member'] },
      { membershipId: 'c8-denied-membership', principalId: 'denied-principal', scopeType: 'tenant', scopeId: 'c8-tenant', roles: ['member'] }
    ],
    nodeBindings: [
      { nodeId: providerIdentity.nodeId, principalId: 'provider-principal', tenantId: 'c8-tenant' },
      { nodeId: allowedIdentity.nodeId, principalId: 'allowed-principal', tenantId: 'c8-tenant' },
      { nodeId: deniedIdentity.nodeId, principalId: 'denied-principal', tenantId: 'c8-tenant' }
    ],
    providerBindings: [{ providerNodeId: providerIdentity.nodeId, providerId: 'c8-provider' }]
  });
  configureRelayAccountTenantAuthority(authority);
  t.after(() => configureRelayAccountTenantAuthority(null));

  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const allowed = new TruynNode({ relayUrl, identity: allowedIdentity });
  const denied = new TruynNode({ relayUrl, identity: deniedIdentity });
  await provider.register();
  await allowed.register();
  await denied.register();

  await provider.offer('c8.authority.private', {
    accessMode: 'owner-only',
    allowedRequesterIds: [allowedIdentity.nodeId],
    tenantId: 'forged-tenant',
    ownerId: deniedIdentity.nodeId,
    billingResponsibility: deniedIdentity.nodeId
  });

  assert.equal((await denied.find('c8.authority.private')).offers.length, 0, 'forged metadata must not make a private provider visible');
  await assert.rejects(
    denied.need('c8.authority.private', { prompt: 'unauthorized' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  const deniedPoll = await provider.poll();
  assert.equal(deniedPoll.events.filter((event) => event.kind === 'NEED').length, 0, 'negative authority path must dispatch zero remote executions');

  assert.equal((await allowed.find('c8.authority.private')).offers.length, 1);
  const valid = await allowed.need('c8.authority.private', { prompt: 'authorized' });
  assert.equal(valid.provider, providerIdentity.nodeId);
  const validPoll = await provider.poll();
  assert.equal(validPoll.events.filter((event) => event.kind === 'NEED').length, 1, 'valid authority path must dispatch exactly one remote execution');

  authority.suspend('membership', 'c8-allowed-membership');
  assert.equal((await allowed.find('c8.authority.private')).offers.length, 0, 'suspended membership must immediately remove visibility');
  await assert.rejects(
    allowed.need('c8.authority.private', { prompt: 'suspended' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  const suspendedPoll = await provider.poll();
  assert.equal(suspendedPoll.events.filter((event) => event.kind === 'NEED').length, 0, 'suspended authority path must dispatch zero additional remote executions');
});

test('C8 MCP timeout bounds response body consumption after headers arrive', async () => {
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    requestTimeoutMs: 10,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === 'content-type') return 'application/json';
          return null;
        }
      },
      body: {
        async *[Symbol.asyncIterator]() {
          await new Promise(() => {});
        }
      }
    })
  });

  await assert.rejects(client.discover(), (error) => error.code === 'MCP_REQUEST_TIMEOUT');
});

test('C8 MCP declared oversize response cancels body before rejecting', async () => {
  let cancelled = 0;
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    maxResponseBytes: 5,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          const key = String(name).toLowerCase();
          if (key === 'content-type') return 'application/json';
          if (key === 'content-length') return '10';
          return null;
        }
      },
      body: {
        async cancel() { cancelled += 1; },
        async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); }
      }
    })
  });

  await assert.rejects(client.discover(), /size limit/);
  assert.equal(cancelled, 1);
});

test('C8 MCP rejects non-streaming response bodies before unbounded text buffering', async () => {
  let textCalls = 0;
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === 'content-type') return 'application/json';
          return null;
        }
      },
      body: null,
      async text() {
        textCalls += 1;
        return 'x'.repeat(2 * 1024 * 1024);
      }
    })
  });

  await assert.rejects(client.discover(), /bounded streaming reads/);
  assert.equal(textCalls, 0, 'unbounded text fallback must never be invoked');
});

test('C8 MCP discovery provider forwards the configured bounded request timeout', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const request = JSON.parse(options.body);
    const result = request.method === 'server/discover'
      ? {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: { tools: { listChanged: false } },
          ttlMs: 1000,
          cacheScope: 'private'
        }
      : {
          resultType: 'complete',
          tools: [{ name: 'slow', inputSchema: { type: 'object', properties: {} } }],
          ttlMs: 1000,
          cacheScope: 'private'
        };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  await assert.rejects(
    createMcpDiscoveryProvider({
      endpoint: 'https://mcp.example.test/mcp',
      authMode: 'none',
      allowTools: ['slow'],
      requestTimeoutMs: 5,
      fetchImpl
    }),
    (error) => error.code === 'MCP_REQUEST_TIMEOUT'
  );
  assert.equal(calls, 1, 'discovery timeout must stop before tools/list begins');
});
