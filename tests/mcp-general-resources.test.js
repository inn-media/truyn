import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpResourceHttpClient, MCP_SUBSCRIPTION_ID_META_KEY } from '../adapters/mcp/resources-client.js';
import {
  McpResourceStateStore,
  createMcpResourceImporter,
  MCP_RESOURCE_OBJECT_PROFILE
} from '../adapters/mcp/resource-runtime.js';

const RESOURCE_URI = 'memory://provider/general-resource';

function readResult(text, lastModified, { ttlMs = 100, cacheScope = 'private' } = {}) {
  return {
    resultType: 'complete',
    ttlMs,
    cacheScope,
    contents: [{
      uri: RESOURCE_URI,
      mimeType: 'text/plain',
      text,
      annotations: { lastModified }
    }]
  };
}

function bodyFrom(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    async *[Symbol.asyncIterator]() { yield bytes; },
    async cancel() {}
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return 'application/json';
        if (key === 'content-length') return String(Buffer.byteLength(JSON.stringify(value)));
        return null;
      }
    },
    body: bodyFrom(value)
  };
}

function sseResponse(frames) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'text/event-stream; charset=utf-8';
        return null;
      }
    },
    body: {
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) yield Buffer.from(`data: ${JSON.stringify(frame)}\n\n`);
      },
      async cancel() {}
    }
  };
}

test('P3-M1 materializes immutable MCP resource snapshots into monotonic TRUYN OBJECT/STATE', () => {
  let now = 1_000;
  const store = new McpResourceStateStore({
    providerAuthority: 'https://mcp.example.test/mcp',
    clock: () => now
  });

  const first = store.materialize(RESOURCE_URI, readResult('alpha', '2026-09-06T07:00:00Z'));
  assert.equal(first.profile, MCP_RESOURCE_OBJECT_PROFILE);
  assert.equal(first.objects.length, 1);
  assert.equal(first.rootObject.type, 'OBJECT');
  assert.match(first.rootObject.objectId, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.rootObject.sizeBytes, 5);
  assert.equal(first.state.type, 'STATE');
  assert.equal(first.state.version, 1);
  assert.equal(first.state.objectRef.objectId, first.rootObject.objectId);
  assert.equal(first.state.expiresAtUnixMs, 1_100);
  assert.equal(first.changed, true);

  now = 1_050;
  const identical = store.materialize(RESOURCE_URI, readResult('alpha', '2026-09-06T07:00:00Z'));
  assert.equal(identical.state.version, 1, 'identical resource content is idempotent');
  assert.equal(identical.changed, false);

  const invalidated = store.invalidate(RESOURCE_URI);
  assert.equal(invalidated.currentState.version, 1);
  assert.equal(store.isInvalidated(RESOURCE_URI), true);

  now = 1_100;
  const second = store.materialize(RESOURCE_URI, readResult('beta', '2026-09-06T07:01:00Z'));
  assert.equal(second.state.version, 2);
  assert.equal(second.changed, true);
  assert.equal(second.invalidatedBeforeRead, true, 'update notification only marks the previous state stale until explicit reread');
  assert.equal(store.isInvalidated(RESOURCE_URI), false);
  assert.notEqual(second.state.digest, first.state.digest);

  assert.throws(
    () => store.materialize(RESOURCE_URI, readResult('rollback', '2026-09-06T06:59:59Z')),
    /stale/
  );
  assert.throws(
    () => store.materialize(RESOURCE_URI, readResult('conflict', '2026-09-06T07:01:00Z')),
    /conflicts/
  );
});

test('P3-M1 supports bounded multi-content resources through a content-addressed manifest and fails closed on injection', () => {
  const store = new McpResourceStateStore({
    providerAuthority: 'https://mcp.example.test/mcp',
    maxResourceBytes: 32,
    clock: () => 2_000
  });
  const snapshot = store.materialize(RESOURCE_URI, {
    resultType: 'complete',
    ttlMs: 0,
    cacheScope: 'private',
    contents: [
      { uri: RESOURCE_URI, mimeType: 'text/plain', text: 'one' },
      { uri: RESOURCE_URI, mimeType: 'text/plain', text: 'two' }
    ]
  });
  assert.equal(snapshot.objects.length, 3, 'two immutable leaf OBJECTs plus one manifest OBJECT');
  assert.equal(snapshot.rootObject.contentType, 'application/vnd.truyn.mcp-resource-manifest+json');
  assert.equal(snapshot.state.objectRef.objectId, snapshot.rootObject.objectId);

  assert.throws(() => store.materialize(RESOURCE_URI, {
    resultType: 'complete', ttlMs: 0, cacheScope: 'private',
    contents: [{ uri: 'memory://provider/other', text: 'cross-resource' }]
  }), /URI mismatch/);

  const smallStore = new McpResourceStateStore({
    providerAuthority: 'https://mcp.example.test/mcp',
    maxResourceBytes: 4,
    clock: () => 2_100
  });
  assert.throws(() => smallStore.materialize(RESOURCE_URI, {
    resultType: 'complete', ttlMs: 0, cacheScope: 'private',
    contents: [{ uri: RESOURCE_URI, text: '12345' }]
  }), /size limit/);
  assert.throws(() => store.materialize(RESOURCE_URI, {
    resultType: 'complete', ttlMs: 0, cacheScope: 'private',
    contents: [{ uri: RESOURCE_URI, blob: 'not-base64!' }]
  }), /base64/);
});

test('P3-M1 resource update notification cannot implicitly fetch or mutate trusted state', async () => {
  let reads = 0;
  let versionText = 'alpha';
  const client = {
    endpoint: 'https://mcp.example.test/mcp',
    async readResource() {
      reads += 1;
      return readResult(versionText, reads === 1 ? '2026-09-06T07:00:00Z' : '2026-09-06T07:01:00Z');
    },
    async listResources() { return { resources: [] }; },
    async listResourceTemplates() { return { resourceTemplates: [] }; }
  };
  const importer = createMcpResourceImporter({ client, clock: () => 3_000 + reads });
  const initial = await importer.read(RESOURCE_URI);
  assert.equal(reads, 1);
  assert.equal(initial.state.version, 1);

  importer.noteUpdate(RESOURCE_URI);
  assert.equal(reads, 1, 'notification must not trigger a network read');
  assert.equal(importer.store.get(RESOURCE_URI).state.version, 1, 'notification must not advance STATE');
  assert.equal(importer.store.isInvalidated(RESOURCE_URI), true);

  versionText = 'beta';
  const refreshed = await importer.refresh(RESOURCE_URI);
  assert.equal(reads, 2, 'only explicit refresh performs resources/read');
  assert.equal(refreshed.state.version, 2);
});

test('P3-M1 modern resource client implements discovery, bounded list/templates and explicit read with standard headers', async () => {
  const calls = [];
  const client = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      calls.push({ request, headers: options.headers });
      if (request.method === 'server/discover') {
        return jsonResponse({ jsonrpc: '2.0', id: request.id, result: {
          resultType: 'complete', ttlMs: 1000, cacheScope: 'public',
          supportedVersions: ['2026-07-28'], capabilities: { resources: { subscribe: true } },
          _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'resource-test', version: '1' } }
        } });
      }
      if (request.method === 'resources/list') {
        return jsonResponse({ jsonrpc: '2.0', id: request.id, result: {
          resultType: 'complete', ttlMs: 500, cacheScope: 'private',
          resources: [{ uri: RESOURCE_URI, name: 'general-resource', mimeType: 'text/plain' }]
        } });
      }
      if (request.method === 'resources/templates/list') {
        return jsonResponse({ jsonrpc: '2.0', id: request.id, result: {
          resultType: 'complete', ttlMs: 500, cacheScope: 'private',
          resourceTemplates: [{ uriTemplate: 'memory://provider/{id}', name: 'resource-by-id' }]
        } });
      }
      if (request.method === 'resources/read') {
        return jsonResponse({ jsonrpc: '2.0', id: request.id, result: readResult('alpha', '2026-09-06T07:00:00Z') });
      }
      throw new Error(`unexpected ${request.method}`);
    }
  });

  const discovery = await client.discover();
  assert.equal(discovery.capabilities.resources.subscribe, true);
  const catalog = await client.listAllResources();
  assert.equal(catalog.resources.length, 1);
  const templates = await client.listResourceTemplates();
  assert.equal(templates.resourceTemplates[0].uriTemplate, 'memory://provider/{id}');
  const read = await client.readResource(RESOURCE_URI);
  assert.equal(read.contents[0].text, 'alpha');

  const readCall = calls.find((entry) => entry.request.method === 'resources/read');
  assert.equal(readCall.headers['mcp-protocol-version'], '2026-07-28');
  assert.equal(readCall.headers['mcp-method'], 'resources/read');
  assert.ok(readCall.headers['mcp-name'], 'modern resources/read must carry Mcp-Name');
  assert.equal(readCall.request.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
});

test('P3-M1 subscriptions/listen accepts only acknowledged correlated resource updates', async () => {
  const client = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.method, 'subscriptions/listen');
      const meta = { [MCP_SUBSCRIPTION_ID_META_KEY]: request.id };
      return sseResponse([
        {
          jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged',
          params: { notifications: { resourceSubscriptions: [RESOURCE_URI] }, _meta: meta }
        },
        { jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri: RESOURCE_URI, _meta: meta } },
        { jsonrpc: '2.0', id: request.id, result: {} }
      ]);
    }
  });
  const events = [];
  for await (const event of client.listenResourceUpdates([RESOURCE_URI])) events.push(event);
  assert.deepEqual(events.map((event) => event.uri), [RESOURCE_URI]);
});

test('P3-M1 subscriptions/listen rejects forged subscription correlation and unrequested resource injection', async () => {
  const wrongIdClient = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      return sseResponse([{
        jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged',
        params: {
          notifications: { resourceSubscriptions: [RESOURCE_URI] },
          _meta: { [MCP_SUBSCRIPTION_ID_META_KEY]: `${request.id}-forged` }
        }
      }]);
    }
  });
  await assert.rejects(async () => {
    for await (const _event of wrongIdClient.listenResourceUpdates([RESOURCE_URI])) {}
  }, /id mismatch/);

  const injectedClient = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const meta = { [MCP_SUBSCRIPTION_ID_META_KEY]: request.id };
      return sseResponse([
        {
          jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged',
          params: { notifications: { resourceSubscriptions: [RESOURCE_URI] }, _meta: meta }
        },
        {
          jsonrpc: '2.0', method: 'notifications/resources/updated',
          params: { uri: 'memory://provider/not-authorized', _meta: meta }
        }
      ]);
    }
  });
  await assert.rejects(async () => {
    for await (const _event of injectedClient.listenResourceUpdates([RESOURCE_URI])) {}
  }, /not honored/);
});
