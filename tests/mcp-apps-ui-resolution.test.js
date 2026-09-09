import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { parseMcpAppsToolMetadata } from '../adapters/mcp/apps-metadata.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function tool(name, resourceUri, visibility = ['model', 'app']) {
  return {
    name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    _meta: { ui: { resourceUri, visibility } }
  };
}

function makeFetch({ endpoint, advertiseResources = true } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, endpoint, 'Apps resolution must never fetch the ui:// URI directly');
    const request = JSON.parse(options.body);
    requests.push({ url, method: request.method, params: request.params });

    if (request.method === 'server/discover') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: {
            tools: { listChanged: false },
            extensions: { [MCP_UI_EXTENSION_ID]: {} },
            ...(advertiseResources ? { resources: { listChanged: false } } : {})
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
            tool('weather', 'ui://weather/view.html'),
            tool('app-helper', 'ui://weather/helper.html', ['app'])
          ],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'resources/read') {
      const uri = request.params.uri;
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          contents: [{ uri, text: '<html>ok</html>', mimeType: 'text/html;profile=mcp-app' }],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    throw new Error(`unexpected MCP method: ${request.method}`);
  };
  return { fetchImpl, requests };
}

test('P3-M3 resolves declared ui:// resources only through same-server MCP resources/read', async () => {
  const endpoint = 'https://mcp.example.test/mcp';
  const providerAuthority = 'https://mcp.example.test/mcp';
  const { fetchImpl, requests } = makeFetch({ endpoint });
  const provider = await createMcpDiscoveryProvider({
    endpoint,
    authMode: 'none',
    allowTools: ['weather', 'app-helper'],
    fetchImpl
  });

  assert.equal(provider.discovery.providerAuthority, providerAuthority);
  assert.deepEqual(provider.discovery.appResources, [
    { tool: 'app-helper', providerAuthority, resourceUri: 'ui://weather/helper.html', visibility: ['app'] },
    { tool: 'weather', providerAuthority, resourceUri: 'ui://weather/view.html', visibility: ['model', 'app'] }
  ]);

  const read = await provider.resolveAppResource('ui://weather/view.html');
  assert.equal(read.contents[0].uri, 'ui://weather/view.html');
  assert.deepEqual(requests.map((entry) => entry.method), ['server/discover', 'tools/list', 'resources/read']);
  assert.equal(requests[2].params.uri, 'ui://weather/view.html');

  const appOnlyRef = provider.discovery.appResources.find((entry) => entry.tool === 'app-helper');
  const appOnlyRead = await provider.resolveAppResource(appOnlyRef);
  assert.equal(appOnlyRead.contents[0].uri, 'ui://weather/helper.html');
  assert.deepEqual(provider.discovery.appOnlyTools, [{ tool: 'app-helper', visibility: ['app'] }]);
});

test('P3-M3 rejects undeclared UI resource resolution before any resources/read', async () => {
  const endpoint = 'https://mcp.example.test/mcp';
  const { fetchImpl, requests } = makeFetch({ endpoint });
  const provider = await createMcpDiscoveryProvider({
    endpoint,
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl
  });

  await assert.rejects(
    () => provider.resolveAppResource('ui://attacker/not-declared.html'),
    /was not declared by selected MCP tool metadata/
  );
  assert.deepEqual(requests.map((entry) => entry.method), ['server/discover', 'tools/list']);
});

test('P3-M3 requires advertised MCP resources capability before UI resolution', async () => {
  const endpoint = 'https://mcp.example.test/mcp';
  const { fetchImpl, requests } = makeFetch({ endpoint, advertiseResources: false });
  const provider = await createMcpDiscoveryProvider({
    endpoint,
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl
  });

  await assert.rejects(
    () => provider.resolveAppResource('ui://weather/view.html'),
    /requires declared MCP resources capability/
  );
  assert.deepEqual(requests.map((entry) => entry.method), ['server/discover', 'tools/list']);
});

test('P3-M3 Apps metadata accepts ui:// resource URIs and rejects non-ui schemes', () => {
  assert.equal(
    parseMcpAppsToolMetadata({ ui: { resourceUri: 'ui://weather/view.html' } }).resourceUri,
    'ui://weather/view.html'
  );

  for (const resourceUri of [
    'https://example.test/app.html',
    'http://127.0.0.1/app.html',
    'file:///local/app.html',
    'data:text/html,hello'
  ]) {
    assert.throws(
      () => parseMcpAppsToolMetadata({ ui: { resourceUri } }),
      (error) => error?.code === 'MCP_APPS_METADATA_INVALID' && error?.metadata?.field === 'resourceUri'
    );
  }
});
