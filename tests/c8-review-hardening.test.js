import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
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
  assert.throws(() => store.create({ ownerKey: 'owner', message: message('same-message'), skill }), (error) => error.code === 'A2A_MESSAGE_ID_REPLAY');
  assert.equal(store.tasks.size, 0);
  now += 1_001;
  assert.ok(store.create({ ownerKey: 'owner', message: message('same-message'), skill }).id);
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
  const store = new A2aTaskStore({ maxTasks: 1, maxReplayMarkers: 2, taskTtlMs: 1_000, now: () => now });
  for (const id of ['m1', 'm2']) {
    const task = store.create({ ownerKey: 'owner', message: message(id), skill });
    store.reject(task.id, 'done');
  }
  assert.throws(() => store.create({ ownerKey: 'owner', message: message('m3'), skill }), (error) => error.code === 'A2A_REPLAY_CAPACITY_REACHED');
  assert.equal(store.byMessageCorrelation.size, 2);
  assert.equal(store.tasks.size, 0);
  now += 1_001;
  assert.ok(store.create({ ownerKey: 'owner', message: message('m3'), skill }).id);
});

test('C8 replay retention refreshes with the linked task lifetime', () => {
  let now = 30_000;
  const store = new A2aTaskStore({ maxTasks: 2, maxReplayMarkers: 4, taskTtlMs: 100, now: () => now });
  const task = store.create({ ownerKey: 'owner', message: message('refresh-me'), skill });
  now += 90;
  store.start(task.id, { truynRequestId: 'need-refresh' });
  now += 90;
  store.reject(task.id, 'terminal');
  now += 20;
  assert.throws(() => store.create({ ownerKey: 'owner', message: message('refresh-me'), skill }), (error) => error.code === 'A2A_MESSAGE_ID_REPLAY');
  assert.equal(store.tasks.get(task.id)?.status.state, 'TASK_STATE_REJECTED');
});

test('C8 injected account/tenant contract cannot be bypassed by forged offer metadata and preserves zero/one dispatch invariant', async (t) => {
  const providerIdentity = createIdentity();
  const allowedIdentity = createIdentity();
  const deniedIdentity = createIdentity();
  const suspended = new Set();
  const authority = {
    resolveRequester(nodeId) {
      if (suspended.has(nodeId)) return { ok: false, reason: 'active_membership_required' };
      if (nodeId === allowedIdentity.nodeId) return { ok: true, nodeId, principalId: 'allowed-principal', tenantId: 'c8-tenant' };
      if (nodeId === deniedIdentity.nodeId) return { ok: true, nodeId, principalId: 'denied-principal', tenantId: 'c8-tenant' };
      return { ok: false, reason: 'requester_not_found' };
    },
    resolveProvider(nodeId) {
      return nodeId === providerIdentity.nodeId
        ? { ok: true, providerNodeId: nodeId, principalId: 'provider-principal', tenantId: 'c8-tenant' }
        : { ok: false, reason: 'provider_not_found' };
    }
  };
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
  assert.equal((await denied.find('c8.authority.private')).offers.length, 0);
  await assert.rejects(denied.need('c8.authority.private', { prompt: 'unauthorized' }), (error) => error.status === 404 && error.body?.error === 'no_matching_provider');
  assert.equal((await provider.poll()).events.filter((event) => event.kind === 'NEED').length, 0);
  assert.equal((await allowed.find('c8.authority.private')).offers.length, 1);
  const valid = await allowed.need('c8.authority.private', { prompt: 'authorized' });
  assert.equal(valid.provider, providerIdentity.nodeId);
  assert.equal((await provider.poll()).events.filter((event) => event.kind === 'NEED').length, 1);
  suspended.add(allowedIdentity.nodeId);
  assert.equal((await allowed.find('c8.authority.private')).offers.length, 0);
  await assert.rejects(allowed.need('c8.authority.private', { prompt: 'suspended' }), (error) => error.status === 404 && error.body?.error === 'no_matching_provider');
  assert.equal((await provider.poll()).events.filter((event) => event.kind === 'NEED').length, 0);
});

test('C8 MCP timeout bounds response body consumption after headers arrive', async () => {
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    requestTimeoutMs: 10,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : null; } },
      body: { async *[Symbol.asyncIterator]() { await new Promise(() => {}); } }
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
      headers: { get(name) { const key = String(name).toLowerCase(); return key === 'content-type' ? 'application/json' : key === 'content-length' ? '10' : null; } },
      body: { async cancel() { cancelled += 1; }, async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); } }
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
      headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : null; } },
      body: null,
      async text() { textCalls += 1; return 'x'.repeat(2 * 1024 * 1024); }
    })
  });
  await assert.rejects(client.discover(), /bounded streaming reads/);
  assert.equal(textCalls, 0);
});

test('C8 MCP discovery provider forwards the configured bounded request timeout', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const request = JSON.parse(options.body);
    const result = request.method === 'server/discover'
      ? { resultType: 'complete', supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION], capabilities: { tools: { listChanged: false } }, ttlMs: 1000, cacheScope: 'private' }
      : { resultType: 'complete', tools: [{ name: 'slow', inputSchema: { type: 'object', properties: {} } }], ttlMs: 1000, cacheScope: 'private' };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(createMcpDiscoveryProvider({ endpoint: 'https://mcp.example.test/mcp', authMode: 'none', allowTools: ['slow'], requestTimeoutMs: 5, fetchImpl }), (error) => error.code === 'MCP_REQUEST_TIMEOUT');
  assert.equal(calls, 1);
});
