import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import {
  MCP_APPS_RESOURCE_MIME_TYPE,
  MCP_APPS_UI_TRUST_BOUNDARY,
  validateMcpAppsResourceReadResult
} from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const ENDPOINT = 'https://matrix-c.example.test/mcp';
const RESOURCE_URI = 'ui://matrix-c/view.html';
const OTHER_URI = 'ui://matrix-c/other.html';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

async function captureAsync(fn) {
  try { await fn(); } catch (error) { return error; }
  assert.fail('negative matrix row unexpectedly passed');
}

function captureSync(fn) {
  try { fn(); } catch (error) { return error; }
  assert.fail('negative matrix row unexpectedly passed');
}

function tool(name, visibility = ['model', 'app']) {
  return {
    name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    _meta: {
      ui: {
        resourceUri: name === 'safe' ? RESOURCE_URI : 'ui://matrix-c/app-only.html',
        visibility
      }
    }
  };
}

function appRead(uri = RESOURCE_URI, text = '<html>accepted</html>') {
  return {
    resultType: 'complete',
    contents: [{ uri, text, mimeType: MCP_APPS_RESOURCE_MIME_TYPE }],
    ttlMs: 1000,
    cacheScope: 'private'
  };
}

function makeTransport({ resourcePlan = ['ok'] } = {}) {
  const counters = { toolCalls: 0, resourceReads: 0, implicitFetches: 0 };
  const fetchImpl = async (url, options) => {
    if (url !== ENDPOINT) {
      counters.implicitFetches += 1;
      throw new Error(`unexpected implicit fetch: ${url}`);
    }
    const request = JSON.parse(options.body);

    if (request.method === 'server/discover') {
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        result: {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            extensions: { [MCP_UI_EXTENSION_ID]: {} }
          },
          ttlMs: 1000, cacheScope: 'private'
        }
      });
    }

    if (request.method === 'tools/list') {
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        result: {
          resultType: 'complete',
          tools: [tool('safe'), tool('app-only', ['app'])],
          ttlMs: 1000, cacheScope: 'private'
        }
      });
    }

    if (request.method === 'tools/call') {
      counters.toolCalls += 1;
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: 'safe result' }],
          ttlMs: 1000, cacheScope: 'private'
        }
      });
    }

    if (request.method === 'resources/read') {
      const mode = resourcePlan[Math.min(counters.resourceReads, resourcePlan.length - 1)];
      counters.resourceReads += 1;
      const result = mode === 'missing'
        ? { resultType: 'complete', contents: [], ttlMs: 1000, cacheScope: 'private' }
        : appRead(mode === 'mismatch' ? OTHER_URI : request.params.uri,
          mode === 'ok' ? '<html>accepted</html>' : '<html>rejected</html>');
      return jsonResponse({ jsonrpc: '2.0', id: request.id, result });
    }

    throw new Error(`unexpected MCP method: ${request.method}`);
  };
  return { fetchImpl, counters };
}

async function makeProvider(resourcePlan) {
  const transport = makeTransport({ resourcePlan });
  const provider = await createMcpDiscoveryProvider({
    endpoint: ENDPOINT,
    authMode: 'none',
    allowTools: ['safe', 'app-only'],
    fetchImpl: transport.fetchImpl
  });
  return { provider, ...transport };
}

function assertAuthorityBoundary(provider) {
  assert.deepEqual(provider.capabilities.map((entry) => entry.name), ['mcp.safe']);
  assert.deepEqual(provider.discovery.appOnlyTools, [{ tool: 'app-only', visibility: ['app'] }]);
  assert.deepEqual(provider.discovery.appResourceTrust, MCP_APPS_UI_TRUST_BOUNDARY);
  assert.deepEqual(provider.discovery.appResourceTrust.authority, {
    authorization: false,
    providerSelection: false,
    billing: false,
    entitlement: false,
    execution: false
  });
}

async function missingReferencedResourceRow() {
  const stable = captureSync(() => validateMcpAppsResourceReadResult(RESOURCE_URI, {
    resultType: 'complete', contents: [], ttlMs: 1000, cacheScope: 'private'
  }));
  assert.equal(stable.code, 'MCP_APPS_RESOURCE_MISSING');
  assert.deepEqual(stable.appResource, { resourceUri: RESOURCE_URI });

  const { provider, counters } = await makeProvider(['missing']);
  assertAuthorityBoundary(provider);
  const integrated = await captureAsync(() => provider.resolveAppResource(RESOURCE_URI));
  assert.equal(integrated.message, 'MCP resources/read requires non-empty contents');
  assert.equal(counters.resourceReads, 1);
  assert.equal(counters.toolCalls, 0);
  assert.equal(counters.implicitFetches, 0);

  return {
    code: stable.code,
    details: stable.appResource,
    integratedFailure: integrated.message,
    resourceReads: counters.resourceReads,
    remoteExecutions: counters.toolCalls,
    implicitFetches: counters.implicitFetches
  };
}

async function uriMismatchRow() {
  const stable = captureSync(() => validateMcpAppsResourceReadResult(RESOURCE_URI, appRead(OTHER_URI)));
  assert.equal(stable.code, 'MCP_APPS_RESOURCE_URI_MISMATCH');
  assert.deepEqual(stable.appResource, {
    resourceUri: RESOURCE_URI,
    index: 0,
    receivedResourceUri: OTHER_URI
  });

  const { provider, counters } = await makeProvider(['mismatch']);
  assertAuthorityBoundary(provider);
  const integrated = await captureAsync(() => provider.resolveAppResource(RESOURCE_URI));
  assert.equal(integrated.message, 'MCP resources/read content URI mismatch');
  assert.equal(counters.resourceReads, 1);
  assert.equal(counters.toolCalls, 0);
  assert.equal(counters.implicitFetches, 0);

  return {
    code: stable.code,
    details: stable.appResource,
    integratedFailure: integrated.message,
    resourceReads: counters.resourceReads,
    remoteExecutions: counters.toolCalls,
    implicitFetches: counters.implicitFetches
  };
}

async function customCallerMarkerRow() {
  const { provider, counters } = await makeProvider(['ok']);
  assertAuthorityBoundary(provider);
  const error = await captureAsync(() => provider.execute({
    capability: 'mcp.app-only',
    input: { _meta: { ui: { caller: 'app', appOrigin: true, provenance: 'trusted' } } }
  }));
  assert.equal(error.message, 'Unknown imported MCP capability: mcp.app-only');
  assert.equal(counters.toolCalls, 0);
  assert.equal(counters.resourceReads, 0);
  assert.equal(counters.implicitFetches, 0);
  assertAuthorityBoundary(provider);
  return {
    code: error.code || null,
    message: error.message,
    resourceReads: counters.resourceReads,
    remoteExecutions: counters.toolCalls,
    implicitFetches: counters.implicitFetches,
    capabilities: provider.capabilities.map((entry) => entry.name)
  };
}

async function failedReresolutionRow() {
  const { provider, counters } = await makeProvider(['ok', 'mismatch']);
  assertAuthorityBoundary(provider);
  const runtimeBefore = {
    capabilities: structuredClone(provider.capabilities),
    selectedTools: structuredClone(provider.discovery.selectedTools),
    appOnlyTools: structuredClone(provider.discovery.appOnlyTools),
    appResources: structuredClone(provider.discovery.appResources),
    trust: structuredClone(provider.discovery.appResourceTrust)
  };
  const accepted = await provider.resolveAppResource(RESOURCE_URI);
  assert.equal(accepted.contents[0].text, '<html>accepted</html>');
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.contents[0]), true);
  const error = await captureAsync(() => provider.resolveAppResource(RESOURCE_URI));
  assert.equal(error.message, 'MCP resources/read content URI mismatch');
  const runtimeAfter = {
    capabilities: structuredClone(provider.capabilities),
    selectedTools: structuredClone(provider.discovery.selectedTools),
    appOnlyTools: structuredClone(provider.discovery.appOnlyTools),
    appResources: structuredClone(provider.discovery.appResources),
    trust: structuredClone(provider.discovery.appResourceTrust)
  };
  assert.deepEqual(runtimeAfter, runtimeBefore);
  assert.equal(accepted.contents[0].text, '<html>accepted</html>');
  assert.equal(counters.resourceReads, 2);
  assert.equal(counters.toolCalls, 0);
  assert.equal(counters.implicitFetches, 0);
  return {
    integratedFailure: error.message,
    acceptedText: accepted.contents[0].text,
    runtimeUnchanged: true,
    resourceReads: counters.resourceReads,
    remoteExecutions: counters.toolCalls,
    implicitFetches: counters.implicitFetches
  };
}

const MATRIX = [
  { name: 'missing referenced UI resource', run: missingReferencedResourceRow },
  { name: 'UI resource URI mismatch', run: uriMismatchRow },
  { name: 'custom caller marker cannot prove App origin', run: customCallerMarkerRow },
  { name: 'failed UI re-resolution preserves accepted runtime state', run: failedReresolutionRow }
];

test('P3-M3 Negative matrix C closes remaining Apps resource/provenance failures deterministically', async (t) => {
  assert.deepEqual(MATRIX.map((row) => row.name), [
    'missing referenced UI resource',
    'UI resource URI mismatch',
    'custom caller marker cannot prove App origin',
    'failed UI re-resolution preserves accepted runtime state'
  ]);
  for (const row of MATRIX) {
    await t.test(row.name, async () => {
      const first = await row.run();
      const second = await row.run();
      assert.equal(first.remoteExecutions, 0, `${row.name}: remote execution must remain zero`);
      assert.equal(second.remoteExecutions, 0, `${row.name}: repeated remote execution must remain zero`);
      assert.equal(first.implicitFetches, 0, `${row.name}: implicit fetches must remain zero`);
      assert.equal(second.implicitFetches, 0, `${row.name}: repeated implicit fetches must remain zero`);
      assert.deepEqual(second, first, `${row.name}: failure boundary must be deterministic`);
    });
  }
});
