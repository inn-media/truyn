import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpResourceHttpClient, MCP_SUBSCRIPTION_ID_META_KEY } from '../adapters/mcp/resources-client.js';
import { McpResourceStateStore } from '../adapters/mcp/resource-runtime.js';

const RESOURCE_URI = 'memory://security/resource';

function responseBody(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    async *[Symbol.asyncIterator]() { yield bytes; },
    async cancel() {}
  };
}

function jsonResponse(value, { declaredLength } = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return 'application/json';
        if (key === 'content-length') return declaredLength ?? String(Buffer.byteLength(JSON.stringify(value)));
        return null;
      }
    },
    body: responseBody(value)
  };
}

function sseResponseFrames(frames) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'text/event-stream' : null },
    body: {
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) yield Buffer.from(`data: ${JSON.stringify(frame)}\n\n`);
      },
      async cancel() {}
    }
  };
}

function readResult(uri, text, lastModified = '2026-09-06T07:00:00Z') {
  return {
    resultType: 'complete',
    ttlMs: 100,
    cacheScope: 'private',
    contents: [{ uri, text, annotations: { lastModified } }]
  };
}

test('P3-M1 rejects duplicate resource URIs and repeated pagination cursors', async () => {
  let listCall = 0;
  const duplicate = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      listCall += 1;
      return jsonResponse({ jsonrpc: '2.0', id: request.id, result: {
        resultType: 'complete', ttlMs: 0, cacheScope: 'private',
        resources: [{ uri: RESOURCE_URI, name: `resource-${listCall}` }],
        ...(listCall === 1 ? { nextCursor: 'page-2' } : {})
      } });
    }
  });
  await assert.rejects(duplicate.listAllResources(), /duplicate URI/);

  let cursorCall = 0;
  const repeatedCursor = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      cursorCall += 1;
      return jsonResponse({ jsonrpc: '2.0', id: request.id, result: {
        resultType: 'complete', ttlMs: 0, cacheScope: 'private',
        resources: [{ uri: `memory://security/resource-${cursorCall}`, name: `resource-${cursorCall}` }],
        nextCursor: 'same-cursor'
      } });
    }
  });
  await assert.rejects(repeatedCursor.listAllResources(), /repeated a cursor/);
});

test('P3-M1 rejects resource updates before acknowledgement and acknowledgements that expand authority', async () => {
  const beforeAck = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      return sseResponseFrames([{
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: {
          uri: RESOURCE_URI,
          _meta: { [MCP_SUBSCRIPTION_ID_META_KEY]: request.id }
        }
      }]);
    }
  });
  await assert.rejects(async () => {
    for await (const _event of beforeAck.listenResourceUpdates([RESOURCE_URI])) {}
  }, /before subscription acknowledgement/);

  const authorityExpansion = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      return sseResponseFrames([{
        jsonrpc: '2.0',
        method: 'notifications/subscriptions/acknowledged',
        params: {
          notifications: { resourceSubscriptions: [RESOURCE_URI, 'memory://security/unrequested'] },
          _meta: { [MCP_SUBSCRIPTION_ID_META_KEY]: request.id }
        }
      }]);
    }
  });
  await assert.rejects(async () => {
    for await (const _event of authorityExpansion.listenResourceUpdates([RESOURCE_URI])) {}
  }, /unrequested resource URI/);
});

test('P3-M1 bounds subscription events and declared resource responses before parsing', async () => {
  const oversizedEvent = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      return sseResponseFrames([{
        jsonrpc: '2.0',
        method: 'notifications/subscriptions/acknowledged',
        params: {
          notifications: { resourceSubscriptions: [RESOURCE_URI] },
          padding: 'x'.repeat(1024),
          _meta: { [MCP_SUBSCRIPTION_ID_META_KEY]: request.id }
        }
      }]);
    }
  });
  await assert.rejects(async () => {
    for await (const _event of oversizedEvent.listenResourceUpdates([RESOURCE_URI], { maxEventBytes: 128 })) {}
  }, /event exceeds size limit/);

  let cancelled = 0;
  const declaredOversize = createMcpResourceHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    maxResponseBytes: 128,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const response = jsonResponse({ jsonrpc: '2.0', id: request.id, result: readResult(RESOURCE_URI, 'small') }, { declaredLength: '1000' });
      response.body.cancel = async () => { cancelled += 1; };
      return response;
    }
  });
  await assert.rejects(declaredOversize.readResource(RESOURCE_URI), /size limit/);
  assert.equal(cancelled, 1);
});

test('P3-M1 failed refresh cannot overwrite prior authoritative STATE', () => {
  const store = new McpResourceStateStore({
    providerAuthority: 'https://mcp.example.test/mcp',
    clock: () => 5_000
  });
  const first = store.materialize(RESOURCE_URI, readResult(RESOURCE_URI, 'alpha'));
  assert.equal(first.state.version, 1);
  store.invalidate(RESOURCE_URI);

  assert.throws(() => store.materialize(RESOURCE_URI, {
    resultType: 'complete', ttlMs: 0, cacheScope: 'private',
    contents: [{ uri: 'memory://security/forged', text: 'forged' }]
  }), /URI mismatch/);

  const retained = store.get(RESOURCE_URI);
  assert.equal(retained.state.version, 1);
  assert.equal(retained.state.digest, first.state.digest);
  assert.equal(store.isInvalidated(RESOURCE_URI), true, 'failed reread must leave the prior state invalidated rather than silently accepting injected content');
});

test('P3-M1 provider authority is part of stable STATE identity', () => {
  const left = new McpResourceStateStore({ providerAuthority: 'https://one.example.test/mcp', clock: () => 6_000 });
  const right = new McpResourceStateStore({ providerAuthority: 'https://two.example.test/mcp', clock: () => 6_000 });
  const one = left.materialize(RESOURCE_URI, readResult(RESOURCE_URI, 'same'));
  const two = right.materialize(RESOURCE_URI, readResult(RESOURCE_URI, 'same'));
  assert.notEqual(one.state.stateId, two.state.stateId, 'same MCP URI at a different provider authority must not alias STATE');
  assert.equal(one.rootObject.objectId, two.rootObject.objectId, 'identical immutable bytes may deduplicate as the same content-addressed OBJECT');
});
