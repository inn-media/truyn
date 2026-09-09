import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_APPS_RESOURCE_MIME_TYPE } from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const RESOURCE_URI = 'ui://shared/view.html';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function providerFetch(endpoint, label) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, endpoint);
    const request = JSON.parse(options.body);
    calls.push({ method: request.method, uri: request.params?.uri ?? null });

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
          tools: [{
            name: 'weather',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            _meta: { ui: { resourceUri: RESOURCE_URI } }
          }],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'resources/read') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          contents: [{
            uri: request.params.uri,
            text: `<html>${label}</html>`,
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

async function makeProvider(endpoint, label) {
  const transport = providerFetch(endpoint, label);
  const provider = await createMcpDiscoveryProvider({
    endpoint,
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl: transport.fetchImpl
  });
  return { provider, calls: transport.calls };
}

test('P3-M3 correlates App resource URI with exact provider authority', async () => {
  const endpointA = 'https://provider-a.example.test/mcp';
  const endpointB = 'https://provider-b.example.test/mcp';
  const { provider: providerA, calls: callsA } = await makeProvider(endpointA, 'provider-a');
  const { provider: providerB, calls: callsB } = await makeProvider(endpointB, 'provider-b');

  const refA = providerA.discovery.appResources[0];
  const refB = providerB.discovery.appResources[0];

  assert.deepEqual(refA, {
    tool: 'weather',
    providerAuthority: endpointA,
    resourceUri: RESOURCE_URI,
    visibility: ['model', 'app']
  });
  assert.deepEqual(refB, {
    tool: 'weather',
    providerAuthority: endpointB,
    resourceUri: RESOURCE_URI,
    visibility: ['model', 'app']
  });
  assert.notEqual(refA.providerAuthority, refB.providerAuthority);
  assert.equal(refA.resourceUri, refB.resourceUri);

  await assert.rejects(
    () => providerA.resolveAppResource(refB),
    (error) => {
      assert.equal(error?.code, 'MCP_APPS_PROVIDER_AUTHORITY_MISMATCH');
      assert.deepEqual(error?.appResource, {
        expectedProviderAuthority: endpointA,
        receivedProviderAuthority: endpointB
      });
      return true;
    }
  );
  await assert.rejects(
    () => providerB.resolveAppResource(refA),
    (error) => error?.code === 'MCP_APPS_PROVIDER_AUTHORITY_MISMATCH'
  );

  assert.deepEqual(callsA.map((call) => call.method), ['server/discover', 'tools/list']);
  assert.deepEqual(callsB.map((call) => call.method), ['server/discover', 'tools/list']);

  const ownA = await providerA.resolveAppResource(refA);
  const ownB = await providerB.resolveAppResource(refB);
  assert.equal(ownA.contents[0].text, '<html>provider-a</html>');
  assert.equal(ownB.contents[0].text, '<html>provider-b</html>');
  assert.deepEqual(callsA.map((call) => call.method), ['server/discover', 'tools/list', 'resources/read']);
  assert.deepEqual(callsB.map((call) => call.method), ['server/discover', 'tools/list', 'resources/read']);
});

test('P3-M3 rejects a forged authority or undeclared URI before resources/read', async () => {
  const endpoint = 'https://provider-a.example.test/mcp';
  const { provider, calls } = await makeProvider(endpoint, 'provider-a');

  await assert.rejects(
    () => provider.resolveAppResource({
      providerAuthority: 'https://provider-b.example.test/mcp',
      resourceUri: RESOURCE_URI
    }),
    (error) => error?.code === 'MCP_APPS_PROVIDER_AUTHORITY_MISMATCH'
  );

  await assert.rejects(
    () => provider.resolveAppResource({
      providerAuthority: endpoint,
      resourceUri: 'ui://shared/not-declared.html'
    }),
    /was not declared by selected MCP tool metadata for provider/
  );

  assert.deepEqual(calls.map((call) => call.method), ['server/discover', 'tools/list']);
});
