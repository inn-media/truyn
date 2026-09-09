import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_APPS_RESOURCE_MIME_TYPE } from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function makeFetch(options = {}) {
  const hasMimeType = Object.prototype.hasOwnProperty.call(options, 'mimeType');
  const mimeType = hasMimeType ? options.mimeType : MCP_APPS_RESOURCE_MIME_TYPE;
  const calls = [];
  const fetchImpl = async (_url, requestOptions) => {
    const request = JSON.parse(requestOptions.body);
    calls.push(request.method);

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
            _meta: { ui: { resourceUri: 'ui://weather/view.html' } }
          }],
          ttlMs: 1000,
          cacheScope: 'private'
        }
      });
    }

    if (request.method === 'resources/read') {
      const content = {
        uri: request.params.uri,
        text: '<html>ok</html>',
        ...(mimeType === undefined ? {} : { mimeType })
      };
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resultType: 'complete',
          contents: [content],
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
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl
  });
}

test('P3-M3 accepts the exact MCP App UI resource MIME/profile', async () => {
  const { fetchImpl, calls } = makeFetch();
  const provider = await makeProvider(fetchImpl);
  const read = await provider.resolveAppResource('ui://weather/view.html');

  assert.equal(MCP_APPS_RESOURCE_MIME_TYPE, 'text/html;profile=mcp-app');
  assert.equal(read.contents[0].mimeType, MCP_APPS_RESOURCE_MIME_TYPE);
  assert.deepEqual(calls, ['server/discover', 'tools/list', 'resources/read']);
});

test('P3-M3 fails deterministically for a wrong or missing App UI MIME/profile', async () => {
  const wrongMimeTypes = [
    undefined,
    'text/html',
    'text/html; profile=mcp-app',
    'text/html;profile=other',
    'text/html+skybridge',
    'application/xhtml+xml',
    'text/html;profile=mcp-app;charset=utf-8'
  ];

  for (const mimeType of wrongMimeTypes) {
    const { fetchImpl } = makeFetch({ mimeType });
    const provider = await makeProvider(fetchImpl);

    await assert.rejects(
      () => provider.resolveAppResource('ui://weather/view.html'),
      (error) => {
        assert.equal(error?.code, 'MCP_APPS_RESOURCE_MIME_UNSUPPORTED');
        assert.deepEqual(error?.appResource, {
          resourceUri: 'ui://weather/view.html',
          index: 0,
          expectedMimeType: MCP_APPS_RESOURCE_MIME_TYPE,
          receivedMimeType: mimeType ?? null
        });
        return true;
      }
    );
  }
});

test('P3-M3 rejects a mixed resources/read payload when any UI content has the wrong MIME', async () => {
  const fetchImpl = async (_url, options) => {
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
          tools: [{
            name: 'weather',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            _meta: { ui: { resourceUri: 'ui://weather/view.html' } }
          }],
          ttlMs: 1000, cacheScope: 'private'
        }
      });
    }
    if (request.method === 'resources/read') {
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        result: {
          resultType: 'complete',
          contents: [
            { uri: request.params.uri, text: '<html>one</html>', mimeType: MCP_APPS_RESOURCE_MIME_TYPE },
            { uri: request.params.uri, text: '<html>two</html>', mimeType: 'text/html' }
          ],
          ttlMs: 1000, cacheScope: 'private'
        }
      });
    }
    throw new Error(`unexpected MCP method: ${request.method}`);
  };

  const provider = await makeProvider(fetchImpl);
  await assert.rejects(
    () => provider.resolveAppResource('ui://weather/view.html'),
    (error) => error?.code === 'MCP_APPS_RESOURCE_MIME_UNSUPPORTED'
      && error?.appResource?.index === 1
      && error?.appResource?.receivedMimeType === 'text/html'
  );
});
