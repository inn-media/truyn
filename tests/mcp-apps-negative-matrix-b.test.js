import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2A_MCP_COMPATIBILITY_GENERATION,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_APPS_UI_TRUST_BOUNDARY } from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const ENDPOINT = 'https://matrix-b.example.test/mcp';
const UNKNOWN_REQUIRED_EXTENSION = 'example.invalid/required-authority-v9';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function tool(name, visibility) {
  return {
    name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    _meta: {
      ui: {
        resourceUri: `ui://${name}/view.html`,
        visibility
      }
    }
  };
}

function captureSync(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('negative matrix row unexpectedly passed');
}

async function captureAsync(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail('negative matrix row unexpectedly passed');
}

function makeTransport() {
  const counters = { toolCalls: 0 };
  const fetchImpl = async (url, options) => {
    assert.equal(url, ENDPOINT);
    const request = JSON.parse(options.body);

    if (request.method === 'server/discover') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: {
            tools: { listChanged: false },
            extensions: { [MCP_UI_EXTENSION_ID]: {} }
          },
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'tools/list') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          tools: [
            tool('safe', ['model']),
            tool('app-only', ['app']),
            tool('forged-visibility', ['model', 'admin'])
          ],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'tools/call') {
      counters.toolCalls += 1;
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: 'unexpected remote execution' }],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    throw new Error(`unexpected MCP method: ${request.method}`);
  };
  return { counters, fetchImpl };
}

async function makeProvider() {
  const transport = makeTransport();
  const provider = await createMcpDiscoveryProvider({
    endpoint: ENDPOINT,
    authMode: 'none',
    allowTools: ['safe', 'app-only', 'forged-visibility'],
    fetchImpl: transport.fetchImpl
  });
  return { provider, counters: transport.counters };
}

function assertNoAuthorityExpansion(provider) {
  assert.deepEqual(provider.capabilities.map((entry) => entry.name), ['mcp.safe']);
  assert.deepEqual(provider.discovery.selectedTools, [{ tool: 'safe', capability: 'mcp.safe' }]);
  assert.deepEqual(provider.discovery.appOnlyTools, [{ tool: 'app-only', visibility: ['app'] }]);
  assert.deepEqual(provider.discovery.appResourceTrust, MCP_APPS_UI_TRUST_BOUNDARY);

  const trust = provider.discovery.appResourceTrust.authority;
  assert.deepEqual(trust, {
    authorization: false,
    providerSelection: false,
    billing: false,
    entitlement: false,
    execution: false
  });

  for (const capability of provider.capabilities) {
    const serialized = JSON.stringify(capability.metadata);
    assert.equal(serialized.includes('billing'), false);
    assert.equal(serialized.includes('authorization'), false);
    assert.equal(serialized.includes('entitlement'), false);
  }
}

async function appOnlyLeakageRow() {
  const { provider, counters } = await makeProvider();
  assertNoAuthorityExpansion(provider);
  const error = await captureAsync(() => provider.execute({ capability: 'mcp.app-only', input: {} }));
  assert.equal(error.message, 'Unknown imported MCP capability: mcp.app-only');
  assert.equal(counters.toolCalls, 0);
  return {
    code: error.code || null,
    message: error.message,
    remoteExecutions: counters.toolCalls,
    capabilities: provider.capabilities.map((entry) => entry.name)
  };
}

async function forgedVisibilityRow() {
  const { provider, counters } = await makeProvider();
  assertNoAuthorityExpansion(provider);
  const rejected = provider.discovery.rejectedTools.find((entry) => entry.name === 'forged-visibility');
  assert.ok(rejected);
  assert.equal(
    rejected.reason,
    'MCP Apps _meta.ui.visibility contains unsupported value: admin'
  );
  const error = await captureAsync(() => provider.execute({ capability: 'mcp.forged-visibility', input: {} }));
  assert.equal(error.message, 'Unknown imported MCP capability: mcp.forged-visibility');
  assert.equal(counters.toolCalls, 0);
  return {
    code: error.code || null,
    message: error.message,
    rejectedReason: rejected.reason,
    remoteExecutions: counters.toolCalls,
    capabilities: provider.capabilities.map((entry) => entry.name)
  };
}

async function unknownRequiredExtensionRow() {
  let remoteExecutions = 0;
  const error = captureSync(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredExtensions: [UNKNOWN_REQUIRED_EXTENSION]
  }));
  assert.equal(error.code, 'INTEROP_REQUIRED_EXTENSION_UNSUPPORTED');
  assert.equal(
    error.message,
    `Unsupported required MCP extensions: ${UNKNOWN_REQUIRED_EXTENSION}`
  );
  assert.deepEqual(error.compatibility, {
    generation: A2A_MCP_COMPATIBILITY_GENERATION,
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    unsupportedRequiredExtensions: [UNKNOWN_REQUIRED_EXTENSION]
  });
  assert.equal(remoteExecutions, 0);
  return {
    code: error.code,
    message: error.message,
    remoteExecutions,
    capabilities: []
  };
}

async function capabilityMismatchRow() {
  const { provider, counters } = await makeProvider();
  assertNoAuthorityExpansion(provider);
  const error = await captureAsync(() => provider.execute({ capability: 'mcp.admin', input: {} }));
  assert.equal(error.message, 'Unknown imported MCP capability: mcp.admin');
  assert.equal(counters.toolCalls, 0);
  return {
    code: error.code || null,
    message: error.message,
    remoteExecutions: counters.toolCalls,
    capabilities: provider.capabilities.map((entry) => entry.name)
  };
}

const MATRIX = [
  { name: 'app-only leakage', run: appOnlyLeakageRow },
  { name: 'forged visibility', run: forgedVisibilityRow },
  { name: 'unknown required extension', run: unknownRequiredExtensionRow },
  { name: 'capability mismatch', run: capabilityMismatchRow }
];

test('P3-M3 Negative matrix B prevents remote execution and authority expansion', async (t) => {
  assert.deepEqual(MATRIX.map((row) => row.name), [
    'app-only leakage',
    'forged visibility',
    'unknown required extension',
    'capability mismatch'
  ]);

  for (const row of MATRIX) {
    await t.test(row.name, async () => {
      const first = await row.run();
      const second = await row.run();
      assert.equal(first.remoteExecutions, 0, `${row.name}: remote execution must remain zero`);
      assert.equal(second.remoteExecutions, 0, `${row.name}: repeated remote execution must remain zero`);
      assert.deepEqual(second, first, `${row.name}: failure boundary must be deterministic`);
    });
  }
});
