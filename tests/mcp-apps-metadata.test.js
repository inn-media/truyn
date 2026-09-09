import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import {
  MCP_APPS_DEFAULT_VISIBILITY,
  MCP_APPS_RESOURCE_URI_MAX_BYTES,
  parseMcpAppsToolMetadata
} from '../adapters/mcp/apps-metadata.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function discoveryFetch({ declareUi = false, tools = [] } = {}) {
  return async (_url, options) => {
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
            ...(declareUi ? { extensions: { [MCP_UI_EXTENSION_ID]: {} } } : {})
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
          tools,
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }
    throw new Error(`unexpected MCP method: ${request.method}`);
  };
}

function tool(name, meta = undefined) {
  return {
    name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ...(meta === undefined ? {} : { _meta: meta })
  };
}

test('P3-M3 parses only bounded _meta.ui.resourceUri and _meta.ui.visibility fields', () => {
  assert.deepEqual(parseMcpAppsToolMetadata(undefined), {
    declared: false,
    resourceUri: null,
    visibility: ['model', 'app']
  });

  assert.deepEqual(parseMcpAppsToolMetadata({ unrelated: true }), {
    declared: false,
    resourceUri: null,
    visibility: ['model', 'app']
  });

  assert.deepEqual(parseMcpAppsToolMetadata({ ui: {} }), {
    declared: true,
    resourceUri: null,
    visibility: ['model', 'app']
  });

  assert.deepEqual(parseMcpAppsToolMetadata({
    ui: {
      resourceUri: 'ui://weather/view.html',
      visibility: ['app', 'model']
    }
  }), {
    declared: true,
    resourceUri: 'ui://weather/view.html',
    visibility: ['model', 'app']
  });

  assert.deepEqual(MCP_APPS_DEFAULT_VISIBILITY, ['model', 'app']);
});

test('P3-M3 does not infer nested Apps metadata from the legacy flat resource key', () => {
  assert.deepEqual(parseMcpAppsToolMetadata({
    'ui/resourceUri': 'ui://legacy/view.html'
  }), {
    declared: false,
    resourceUri: null,
    visibility: ['model', 'app']
  });
});

test('P3-M3 rejects unknown fields inside _meta.ui', () => {
  for (const field of ['csp', 'domain', 'sandbox', 'permissions', 'providerAuthority']) {
    assert.throws(
      () => parseMcpAppsToolMetadata({ ui: { [field]: {} } }),
      (error) => error?.code === 'MCP_APPS_METADATA_INVALID'
        && error?.metadata?.field === 'ui'
        && error?.metadata?.unsupportedFields?.includes(field)
    );
  }

  assert.throws(
    () => parseMcpAppsToolMetadata({ ui: { zzz: true, aaa: true } }),
    /unsupported fields: aaa, zzz/
  );
});

test('P3-M3 bounds resourceUri before any resolution semantics', () => {
  const accepted = `ui://${'a'.repeat(MCP_APPS_RESOURCE_URI_MAX_BYTES - 5)}`;
  assert.equal(Buffer.byteLength(accepted, 'utf8'), MCP_APPS_RESOURCE_URI_MAX_BYTES);
  assert.equal(parseMcpAppsToolMetadata({ ui: { resourceUri: accepted } }).resourceUri, accepted);

  const oversized = `${accepted}x`;
  assert.throws(
    () => parseMcpAppsToolMetadata({ ui: { resourceUri: oversized } }),
    (error) => error?.code === 'MCP_APPS_METADATA_INVALID'
      && error?.metadata?.maxBytes === MCP_APPS_RESOURCE_URI_MAX_BYTES
  );

  for (const value of [null, 42, '', ' ui://x', 'ui://x ', 'ui://x\nnext']) {
    assert.throws(
      () => parseMcpAppsToolMetadata({ ui: { resourceUri: value } }),
      (error) => error?.code === 'MCP_APPS_METADATA_INVALID' && error?.metadata?.field === 'resourceUri'
    );
  }
});

test('P3-M3 bounds visibility to unique model/app entries only', () => {
  assert.deepEqual(parseMcpAppsToolMetadata({ ui: { visibility: ['model'] } }).visibility, ['model']);
  assert.deepEqual(parseMcpAppsToolMetadata({ ui: { visibility: ['app'] } }).visibility, ['app']);
  assert.deepEqual(parseMcpAppsToolMetadata({ ui: { visibility: ['model', 'app'] } }).visibility, ['model', 'app']);

  for (const value of [null, 'model', [], ['model', 'app', 'model'], ['model', 'model'], ['app', 'app'], ['host'], [1]]) {
    assert.throws(
      () => parseMcpAppsToolMetadata({ ui: { visibility: value } }),
      (error) => error?.code === 'MCP_APPS_METADATA_INVALID' && error?.metadata?.field === 'visibility'
    );
  }
});

test('P3-M3 discovery import accepts bounded Apps metadata only when UI extension is declared', async () => {
  const provider = await createMcpDiscoveryProvider({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['good-ui', 'bad-ui', 'legacy-ui'],
    fetchImpl: discoveryFetch({
      declareUi: true,
      tools: [
        tool('good-ui', { ui: { resourceUri: 'ui://good/view.html', visibility: ['model'] } }),
        tool('bad-ui', { ui: { resourceUri: 'ui://bad/view.html', providerAuthority: 'attacker' } }),
        tool('legacy-ui', { 'ui/resourceUri': 'ui://legacy/view.html' })
      ]
    })
  });

  assert.deepEqual(provider.discovery.selectedTools, [
    { tool: 'good-ui', capability: 'mcp.good-ui' }
  ]);
  assert.deepEqual(provider.discovery.rejectedTools, [
    { name: 'bad-ui', reason: 'MCP Apps _meta.ui contains unsupported fields: providerAuthority' },
    { name: 'legacy-ui', reason: 'legacy MCP Apps _meta["ui/resourceUri"] is not accepted; use _meta.ui.resourceUri' }
  ]);
});

test('P3-M3 discovery import rejects _meta.ui when the UI extension capability was not declared', async () => {
  const provider = await createMcpDiscoveryProvider({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['plain', 'undeclared-ui'],
    fetchImpl: discoveryFetch({
      declareUi: false,
      tools: [
        tool('plain'),
        tool('undeclared-ui', { ui: { resourceUri: 'ui://hidden/view.html' } })
      ]
    })
  });

  assert.deepEqual(provider.discovery.selectedTools, [
    { tool: 'plain', capability: 'mcp.plain' }
  ]);
  assert.deepEqual(provider.discovery.rejectedTools, [
    {
      name: 'undeclared-ui',
      reason: `MCP Apps _meta.ui requires explicit ${MCP_UI_EXTENSION_ID} server extension capability`
    }
  ]);
});
