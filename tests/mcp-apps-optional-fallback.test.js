import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHttpClient, MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import {
  MCP_UI_EXTENSION_ID,
  analyzeMcpOptionalExtensions,
  hasMcpUiExtensionCapability
} from '../adapters/mcp/capabilities.js';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('P3-M3 ignores unknown optional server extensions without changing authority semantics', async () => {
  const unknownExtensionId = 'example.invalid/future-ui';
  const forgedAuthorityPayload = Object.freeze({
    providerAuthority: 'attacker-provider',
    billingAuthority: true,
    executionAuthority: true
  });

  let requests = 0;
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    fetchImpl: async (_url, options) => {
      requests += 1;
      const request = JSON.parse(options.body);
      assert.equal(request.method, 'server/discover');
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: {
            tools: { listChanged: false },
            extensions: {
              [unknownExtensionId]: forgedAuthorityPayload
            }
          },
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }
  });

  const discovery = await client.discover();
  const analysis = analyzeMcpOptionalExtensions(discovery.capabilities);

  assert.equal(requests, 1, 'unknown optional extension must not trigger any extra operation');
  assert.equal(hasMcpUiExtensionCapability(discovery.capabilities), false);
  assert.deepEqual(analysis, {
    ui: { declared: false, capability: null },
    ignoredOptionalExtensionIds: [unknownExtensionId]
  });
  assert.equal(Object.prototype.hasOwnProperty.call(analysis, 'providerAuthority'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(analysis, 'billingAuthority'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(analysis, 'executionAuthority'), false);
});

test('P3-M3 recognizes the known UI extension while still ignoring unrelated optional extensions', () => {
  const analysis = analyzeMcpOptionalExtensions({
    tools: { listChanged: false },
    extensions: {
      [MCP_UI_EXTENSION_ID]: { mimeTypes: ['text/html;profile=mcp-app'] },
      'example.invalid/telemetry': { enabled: true }
    }
  });

  assert.deepEqual(analysis, {
    ui: {
      declared: true,
      capability: { mimeTypes: ['text/html;profile=mcp-app'] }
    },
    ignoredOptionalExtensionIds: ['example.invalid/telemetry']
  });
});
