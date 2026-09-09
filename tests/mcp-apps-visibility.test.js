import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

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
        ...(visibility === undefined ? {} : { visibility })
      }
    }
  };
}

test('P3-M3 keeps app-only tools out of ordinary TRUYN/model-callable provider capabilities', async () => {
  const mappedTools = [];
  let toolCalls = 0;

  const fetchImpl = async (_url, options) => {
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
            tool('model-only', ['model']),
            tool('app-only', ['app']),
            tool('dual', ['model', 'app']),
            tool('default-dual')
          ],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }
    if (request.method === 'tools/call') {
      toolCalls += 1;
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: 'ok' }]
        }
      });
    }
    throw new Error(`unexpected MCP method: ${request.method}`);
  };

  const provider = await createMcpDiscoveryProvider({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['model-only', 'app-only', 'dual', 'default-dual'],
    mapCapability(toolDefinition) {
      mappedTools.push(toolDefinition.name);
      return `mapped.${toolDefinition.name}`;
    },
    fetchImpl
  });

  assert.deepEqual(mappedTools.sort(), ['default-dual', 'dual', 'model-only']);
  assert.deepEqual(provider.capabilities.map((entry) => entry.name), [
    'mapped.default-dual',
    'mapped.dual',
    'mapped.model-only'
  ]);
  assert.deepEqual(provider.discovery.selectedTools, [
    { tool: 'default-dual', capability: 'mapped.default-dual' },
    { tool: 'dual', capability: 'mapped.dual' },
    { tool: 'model-only', capability: 'mapped.model-only' }
  ]);
  assert.deepEqual(provider.discovery.appOnlyTools, [
    { tool: 'app-only', visibility: ['app'] }
  ]);

  await assert.rejects(
    () => provider.execute({ capability: 'mapped.app-only', input: {} }),
    /Unknown imported MCP capability: mapped\.app-only/
  );
  assert.equal(toolCalls, 0, 'app-only execution must fail before any remote tools/call');
});

test('P3-M3 still imports model-only and dual visibility tools as ordinary provider capabilities', async () => {
  const fetchImpl = async (_url, options) => {
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
          tools: [tool('model-only', ['model']), tool('dual', ['model', 'app'])],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }
    throw new Error(`unexpected MCP method: ${request.method}`);
  };

  const provider = await createMcpDiscoveryProvider({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['model-only', 'dual'],
    fetchImpl
  });

  assert.deepEqual(provider.capabilities.map((entry) => entry.name), ['mcp.dual', 'mcp.model-only']);
  assert.deepEqual(provider.discovery.appOnlyTools, []);
});
