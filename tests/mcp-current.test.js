import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import {
  createMcpHandler,
  createMcpHttpServer,
  createMcpModernMeta,
  MCP_MODERN_VERSION,
  MCP_PROTOCOL_VERSION_META_KEY,
  MCP_CLIENT_INFO_META_KEY,
  MCP_CLIENT_CAPABILITIES_META_KEY,
  MCP_SERVER_INFO_META_KEY
} from '../adapters/mcp/server.js';
import { encodeMcpHeaderValue, decodeMcpHeaderValue } from '../adapters/mcp/http-headers.js';
import { createMcpHttpToolProvider } from '../adapters/providers/mcp-http-tool.js';

function stubNode() {
  return {
    identity: { nodeId: 'truyn:node:mcp-test', algorithm: 'ed25519' },
    sessionToken: 'test-session',
    async register() { this.sessionToken = 'test-session'; },
    async find(capability) { return { capability, offers: [] }; },
    async offer(capability) { return { offerId: `offer:${capability}` }; },
    async need(capability) { return { needId: `need:${capability}` }; },
    async poll() { return { events: [] }; },
    async result(requestId) { return { requestId, accepted: true }; }
  };
}

function modernParams(extra = {}, metaOptions = {}) {
  return { ...extra, _meta: createMcpModernMeta({ clientName: 'c1-test', clientVersion: '1', ...metaOptions }) };
}

function modernHeaders(method, name) {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_MODERN_VERSION,
    'mcp-method': method,
    ...(name ? { 'mcp-name': encodeMcpHeaderValue(name) } : {})
  };
}

async function postJson(url, method, params, headers = modernHeaders(method, params?.name)) {
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-1`, method, params })
  });
}

test('MCP 2026-07-28 is self-describing and does not require initialize', async () => {
  const node = stubNode();
  const handle = createMcpHandler({ node, serverName: 'truyn-c1', serverVersion: 'c1' });

  const discover = await handle({
    jsonrpc: '2.0',
    id: 'discover',
    method: 'server/discover',
    params: modernParams()
  });
  assert.equal(discover.result.resultType, 'complete');
  assert.ok(discover.result.supportedVersions.includes(MCP_MODERN_VERSION));
  assert.equal(discover.result.cacheScope, 'private');
  assert.ok(discover.result.ttlMs > 0);
  assert.deepEqual(discover.result._meta[MCP_SERVER_INFO_META_KEY], { name: 'truyn-c1', version: 'c1' });

  const list = await handle({
    jsonrpc: '2.0',
    id: 'list',
    method: 'tools/list',
    params: modernParams()
  });
  assert.equal(list.result.resultType, 'complete');
  assert.equal(list.result.cacheScope, 'private');
  assert.ok(list.result.ttlMs > 0);
  assert.ok(list.result.tools.some((tool) => tool.name === 'truyn_need'));
  assert.deepEqual(list.result._meta[MCP_SERVER_INFO_META_KEY], { name: 'truyn-c1', version: 'c1' });

  const call = await handle({
    jsonrpc: '2.0',
    id: 'call',
    method: 'tools/call',
    params: modernParams({ name: 'truyn_identity', arguments: {} })
  });
  assert.equal(call.result.resultType, 'complete');
  assert.equal(call.result.structuredContent.nodeId, node.identity.nodeId);
  assert.deepEqual(call.result._meta[MCP_SERVER_INFO_META_KEY], { name: 'truyn-c1', version: 'c1' });
});

test('MCP 2026-07-28 rejects initialize while legacy initialize remains explicit', async () => {
  const handle = createMcpHandler({ node: stubNode() });

  const modernInitialize = await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: modernParams({ protocolVersion: MCP_MODERN_VERSION })
  });
  assert.equal(modernInitialize.error.code, -32601);

  const legacyInitialize = await handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25' }
  });
  assert.equal(legacyInitialize.result.protocolVersion, '2025-11-25');
  assert.equal(legacyInitialize.result.resultType, undefined);
  assert.ok(legacyInitialize.result.serverInfo);

  const unsupportedInitialize = await handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'initialize',
    params: { protocolVersion: '2099-01-01' }
  });
  assert.equal(unsupportedInitialize.error.code, -32022);
});

test('MCP 2026-07-28 requires protocol version and client capabilities in request metadata', async () => {
  const handle = createMcpHandler({ node: stubNode() });

  const missingMeta = await handle({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} });
  assert.equal(missingMeta.error.code, -32602);

  const missingCapabilities = await handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {
      _meta: {
        [MCP_PROTOCOL_VERSION_META_KEY]: MCP_MODERN_VERSION,
        [MCP_CLIENT_INFO_META_KEY]: { name: 'test', version: '1' }
      }
    }
  });
  assert.equal(missingCapabilities.error.code, -32602);

  const withoutClientInfo = await handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
    params: {
      _meta: {
        [MCP_PROTOCOL_VERSION_META_KEY]: MCP_MODERN_VERSION,
        [MCP_CLIENT_CAPABILITIES_META_KEY]: {}
      }
    }
  });
  assert.equal(withoutClientInfo.error, undefined, 'clientInfo is recommended, not mandatory');
});

test('MCP header values use the 2026-07-28 Base64 sentinel when plain ASCII is unsafe', () => {
  for (const value of ['исследование', ' padded ', 'line1\nline2', '=?base64?literal?=']) {
    const encoded = encodeMcpHeaderValue(value);
    assert.match(encoded, /^=\?base64\?.+\?=$/);
    assert.equal(decodeMcpHeaderValue(encoded), value);
  }
  assert.equal(encodeMcpHeaderValue('research'), 'research');
  assert.equal(decodeMcpHeaderValue('research'), 'research');
  assert.equal(decodeMcpHeaderValue('=?base64?***?='), null);
});

test('MCP Streamable HTTP enforces modern routing headers, metadata and JSON content type', async (t) => {
  const mcp = createMcpHttpServer({ node: stubNode() });
  const url = await mcp.listen({ port: 0 });
  t.after(() => mcp.close());

  const valid = await postJson(url, 'tools/call', modernParams({ name: 'truyn_identity', arguments: {} }));
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).result.structuredContent.nodeId, 'truyn:node:mcp-test');

  const encodedUnknown = await postJson(url, 'tools/call', modernParams({ name: 'исследование', arguments: {} }));
  assert.equal(encodedUnknown.status, 200, 'encoded Mcp-Name must pass HTTP header/body validation');
  assert.equal((await encodedUnknown.json()).error.code, -32602, 'unknown tool fails after routing validation');

  const missingVersionHeader = await postJson(
    url,
    'tools/list',
    modernParams(),
    { 'content-type': 'application/json', accept: 'application/json', 'mcp-method': 'tools/list' }
  );
  assert.equal(missingVersionHeader.status, 400);
  assert.equal((await missingVersionHeader.json()).error.code, -32020);

  const methodMismatch = await postJson(
    url,
    'tools/list',
    modernParams(),
    modernHeaders('tools/call')
  );
  assert.equal(methodMismatch.status, 400);
  assert.equal((await methodMismatch.json()).error.code, -32020);

  const nameMismatch = await postJson(
    url,
    'tools/call',
    modernParams({ name: 'truyn_identity', arguments: {} }),
    modernHeaders('tools/call', 'truyn_find')
  );
  assert.equal(nameMismatch.status, 400);
  assert.equal((await nameMismatch.json()).error.code, -32020);

  const missingName = await postJson(
    url,
    'tools/call',
    modernParams({ name: 'truyn_identity', arguments: {} }),
    { ...modernHeaders('tools/call', 'truyn_identity'), 'mcp-name': undefined }
  );
  assert.equal(missingName.status, 400);
  assert.equal((await missingName.json()).error.code, -32020);

  const unsupportedVersion = await postJson(
    url,
    'tools/list',
    { _meta: { [MCP_PROTOCOL_VERSION_META_KEY]: '2099-01-01', [MCP_CLIENT_CAPABILITIES_META_KEY]: {} } },
    { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' }
  );
  assert.equal(unsupportedVersion.status, 400);
  assert.equal((await unsupportedVersion.json()).error.code, -32022);

  const nonJson = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}'
  });
  assert.equal(nonJson.status, 415);

  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 405);
});

test('MCP remote tool provider emits a self-describing stateless 2026-07-28 call and accepts SSE', async () => {
  let captured;
  const provider = createMcpHttpToolProvider({
    endpoint: 'https://mcp.example.test/mcp',
    tool: 'research',
    authMode: 'none',
    fetchImpl: async (_url, options) => {
      captured = options;
      const request = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'text/event-stream' : null },
        async text() {
          return `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resultType: 'complete', content: [], structuredContent: { answer: 42 } } })}\n\n`;
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'research', input: { q: 'life' }, policy: {} });
  const body = JSON.parse(captured.body);
  assert.equal(captured.headers['mcp-protocol-version'], MCP_MODERN_VERSION);
  assert.equal(captured.headers['mcp-method'], 'tools/call');
  assert.equal(captured.headers['mcp-name'], 'research');
  assert.equal(captured.headers.accept, 'application/json, text/event-stream');
  assert.equal(body.params._meta[MCP_PROTOCOL_VERSION_META_KEY], MCP_MODERN_VERSION);
  assert.deepEqual(body.params._meta[MCP_CLIENT_CAPABILITIES_META_KEY], {});
  assert.equal(body.params._meta[MCP_CLIENT_INFO_META_KEY].name, 'truyn-byok-provider');
  assert.deepEqual(result.output, { answer: 42 });
});

test('MCP remote tool provider Base64-encodes unsafe Mcp-Name values', async () => {
  let capturedHeader;
  const tool = 'исследование';
  const provider = createMcpHttpToolProvider({
    endpoint: 'https://mcp.example.test/mcp',
    tool,
    authMode: 'none',
    fetchImpl: async (_url, options) => {
      capturedHeader = options.headers['mcp-name'];
      const request = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        async json() { return { jsonrpc: '2.0', id: request.id, result: { resultType: 'complete', content: [] } }; }
      };
    }
  });
  await provider.execute({ capability: 'research', input: {}, policy: {} });
  assert.equal(decodeMcpHeaderValue(capturedHeader), tool);
  assert.notEqual(capturedHeader, tool);
});

test('MCP edge cannot discover or dispatch an unauthorized private provider', async (t) => {
  const providerIdentity = createIdentity();
  const ownerIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const owner = new TruynNode({ relayUrl, identity: ownerIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  await owner.register();
  await attacker.register();

  let executions = 0;
  const adapter = createFunctionAdapter({
    name: 'private-mcp-proof',
    capabilities: ['reasoning.private.mcp'],
    async execute() { executions += 1; return { output: 'must not run' }; }
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [ownerIdentity.nodeId] })
  });
  await host.publishCapabilities();

  const handle = createMcpHandler({ node: attacker });
  const find = await handle({
    jsonrpc: '2.0', id: 'find', method: 'tools/call',
    params: modernParams({ name: 'truyn_find', arguments: { capability: 'reasoning.private.mcp' } })
  });
  assert.deepEqual(find.result.structuredContent.offers, []);

  const need = await handle({
    jsonrpc: '2.0', id: 'need', method: 'tools/call',
    params: modernParams({ name: 'truyn_need', arguments: { capability: 'reasoning.private.mcp', input: { q: 'steal credits' } } })
  });
  assert.equal(need.result.isError, true);
  assert.equal(executions, 0);
  assert.equal((await providerNode.poll()).events.length, 0);
});
