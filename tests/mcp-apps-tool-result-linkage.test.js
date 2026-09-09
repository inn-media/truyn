import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_APPS_RESOURCE_MIME_TYPE } from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const ENDPOINT = 'https://mcp.example.test/mcp';
const WEATHER_URI = 'ui://weather/view.html';
const ALERTS_URI = 'ui://alerts/view.html';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function makeFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, ENDPOINT);
    const request = JSON.parse(options.body);
    calls.push({ method: request.method, params: request.params });

    if (request.method === 'server/discover') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
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
            {
              name: 'weather',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              _meta: { ui: { resourceUri: WEATHER_URI } }
            },
            {
              name: 'alerts',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              _meta: { ui: { resourceUri: ALERTS_URI } }
            },
            {
              name: 'plain',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false }
            }
          ],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'tools/call') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: `result:${request.params.name}` }],
          ttlMs: 1000,
          cacheScope: 'private',
          _meta: {
            usage: { inputTokens: 1, outputTokens: 1 },
            ui: {
              resourceUri: request.params.name === 'weather' ? ALERTS_URI : WEATHER_URI
            }
          }
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
          contents: [{
            uri,
            text: uri === WEATHER_URI ? '<html>weather-ui</html>' : '<html>alerts-ui</html>',
            mimeType: MCP_APPS_RESOURCE_MIME_TYPE
          }],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    throw new Error(`unexpected MCP method: ${request.method}`);
  };
  return { fetchImpl, calls };
}

async function makeProvider(fetchImpl) {
  return createMcpDiscoveryProvider({
    endpoint: ENDPOINT,
    authMode: 'none',
    allowTools: ['weather', 'alerts', 'plain'],
    fetchImpl
  });
}

test('P3-M3 links tools/call to only the UI resource declared by the called tool', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);

  const result = await provider.execute({ capability: 'mcp.weather', input: {} });
  assert.equal(result.output, 'result:weather');
  assert.deepEqual(result.metadata.appResource, {
    providerAuthority: ENDPOINT,
    tool: 'weather',
    resourceUri: WEATHER_URI
  });
  assert.deepEqual(calls.map((entry) => entry.method), [
    'server/discover',
    'tools/list',
    'tools/call'
  ]);

  const alertsRef = provider.discovery.appResources.find((entry) => entry.tool === 'alerts');
  result.metadata.appResource = alertsRef;

  const ui = await provider.resolveToolResultAppResource(result);
  assert.equal(ui.contents[0].uri, WEATHER_URI);
  assert.equal(ui.contents[0].text, '<html>weather-ui</html>');
  assert.deepEqual(calls.map((entry) => entry.method), [
    'server/discover',
    'tools/list',
    'tools/call',
    'resources/read'
  ]);
  assert.equal(calls.at(-1).params.uri, WEATHER_URI);
});

test('P3-M3 ignores a resourceUri supplied by the remote tools/call result', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);

  const result = await provider.execute({ capability: 'mcp.weather', input: {} });
  assert.equal(result.metadata.appResource.resourceUri, WEATHER_URI);
  assert.equal(result.metadata.tool, 'weather');
  assert.deepEqual(result.metadata.usage, { inputTokens: 1, outputTokens: 1 });

  const ui = await provider.resolveToolResultAppResource(result);
  assert.equal(ui.contents[0].uri, WEATHER_URI);
  assert.equal(calls.at(-1).params.uri, WEATHER_URI);
  assert.equal(calls.some((entry) => entry.method === 'resources/read' && entry.params.uri === ALERTS_URI), false);
});

test('P3-M3 rejects forged or copied tool results before resources/read', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);

  const result = await provider.execute({ capability: 'mcp.weather', input: {} });
  const forged = {
    ...result,
    metadata: {
      ...result.metadata,
      appResource: {
        providerAuthority: ENDPOINT,
        tool: 'weather',
        resourceUri: WEATHER_URI
      }
    }
  };

  await assert.rejects(
    () => provider.resolveToolResultAppResource(forged),
    (error) => error?.code === 'MCP_APPS_TOOL_RESULT_RESOURCE_UNBOUND'
  );
  await assert.rejects(
    () => provider.resolveToolResultAppResource(structuredClone(result)),
    (error) => error?.code === 'MCP_APPS_TOOL_RESULT_RESOURCE_UNBOUND'
  );

  assert.equal(calls.some((entry) => entry.method === 'resources/read'), false);
});

test('P3-M3 rejects tool results from tools without explicit UI linkage', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);

  const result = await provider.execute({ capability: 'mcp.plain', input: {} });
  assert.equal(Object.prototype.hasOwnProperty.call(result.metadata, 'appResource'), false);

  await assert.rejects(
    () => provider.resolveToolResultAppResource(result),
    (error) => error?.code === 'MCP_APPS_TOOL_RESULT_RESOURCE_UNBOUND'
  );
  assert.equal(calls.some((entry) => entry.method === 'resources/read'), false);
});

test('P3-M3 keeps result-driven linkage distinct for two tools on the same provider', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);

  const weather = await provider.execute({ capability: 'mcp.weather', input: {} });
  const alerts = await provider.execute({ capability: 'mcp.alerts', input: {} });

  const weatherUi = await provider.resolveToolResultAppResource(weather);
  const alertsUi = await provider.resolveToolResultAppResource(alerts);

  assert.equal(weatherUi.contents[0].uri, WEATHER_URI);
  assert.equal(alertsUi.contents[0].uri, ALERTS_URI);
  assert.deepEqual(
    calls.filter((entry) => entry.method === 'resources/read').map((entry) => entry.params.uri),
    [WEATHER_URI, ALERTS_URI]
  );
});
