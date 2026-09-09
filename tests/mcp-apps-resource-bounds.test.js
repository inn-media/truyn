import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import {
  MCP_APPS_RESOURCE_URI_MAX_BYTES,
  MCP_APPS_TOOL_META_MAX_BYTES,
  parseMcpAppsToolMetadata
} from '../adapters/mcp/apps-metadata.js';
import {
  MCP_APPS_RESOURCE_MAX_BYTES,
  MCP_APPS_RESOURCE_MAX_CONTENTS,
  MCP_APPS_RESOURCE_MIME_TYPE,
  validateMcpAppsResourceReadResult
} from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const RESOURCE_URI = 'ui://weather/view.html';

function content(text = '') {
  return { uri: RESOURCE_URI, text, mimeType: MCP_APPS_RESOURCE_MIME_TYPE };
}

function readResult(contents) {
  return {
    resultType: 'complete',
    contents,
    ttlMs: 1000,
    cacheScope: 'private'
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('P3-M3 fixes explicit Apps resource and metadata bounds', () => {
  assert.equal(MCP_APPS_RESOURCE_MAX_BYTES, 512 * 1024);
  assert.equal(MCP_APPS_RESOURCE_MAX_CONTENTS, 32);
  assert.equal(MCP_APPS_RESOURCE_URI_MAX_BYTES, 2048);
  assert.equal(MCP_APPS_TOOL_META_MAX_BYTES, 4096);
});

test('P3-M3 accepts exact App resource byte and contents boundaries', () => {
  const exactBytes = 'x'.repeat(MCP_APPS_RESOURCE_MAX_BYTES);
  const exactByteResult = readResult([content(exactBytes)]);
  assert.equal(
    validateMcpAppsResourceReadResult(RESOURCE_URI, exactByteResult),
    exactByteResult
  );

  const exactContents = Array.from(
    { length: MCP_APPS_RESOURCE_MAX_CONTENTS },
    (_, index) => content(`entry-${index}`)
  );
  const exactContentsResult = readResult(exactContents);
  assert.equal(
    validateMcpAppsResourceReadResult(RESOURCE_URI, exactContentsResult),
    exactContentsResult
  );
});

test('P3-M3 rejects cumulative App resource bytes above the bound', () => {
  const oversized = readResult([
    content('x'.repeat(MCP_APPS_RESOURCE_MAX_BYTES)),
    content('y')
  ]);

  assert.throws(
    () => validateMcpAppsResourceReadResult(RESOURCE_URI, oversized),
    (error) => {
      assert.equal(error?.code, 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED');
      assert.deepEqual(error?.appResource, {
        resourceUri: RESOURCE_URI,
        dimension: 'bytes',
        observed: MCP_APPS_RESOURCE_MAX_BYTES + 1,
        max: MCP_APPS_RESOURCE_MAX_BYTES
      });
      return true;
    }
  );
});

test('P3-M3 rejects too many App resource contents before content materialization', () => {
  const oversized = readResult(Array.from(
    { length: MCP_APPS_RESOURCE_MAX_CONTENTS + 1 },
    () => content('')
  ));

  assert.throws(
    () => validateMcpAppsResourceReadResult(RESOURCE_URI, oversized),
    (error) => {
      assert.equal(error?.code, 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED');
      assert.deepEqual(error?.appResource, {
        resourceUri: RESOURCE_URI,
        dimension: 'contents',
        observed: MCP_APPS_RESOURCE_MAX_CONTENTS + 1,
        max: MCP_APPS_RESOURCE_MAX_CONTENTS
      });
      return true;
    }
  );
});

test('P3-M3 applies the App byte bound to decoded blob content', () => {
  const blob = Buffer.alloc(MCP_APPS_RESOURCE_MAX_BYTES + 1, 0x61).toString('base64');
  const oversized = readResult([{
    uri: RESOURCE_URI,
    blob,
    mimeType: MCP_APPS_RESOURCE_MIME_TYPE
  }]);

  assert.throws(
    () => validateMcpAppsResourceReadResult(RESOURCE_URI, oversized),
    (error) => error?.code === 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED'
      && error?.appResource?.dimension === 'bytes'
      && error?.appResource?.observed === MCP_APPS_RESOURCE_MAX_BYTES + 1
  );
});

test('P3-M3 rejects oversized resourceUri and oversized _meta.ui before field acceptance', () => {
  const oversizedUri = `ui://${'a'.repeat(MCP_APPS_RESOURCE_URI_MAX_BYTES)}`;
  assert.ok(Buffer.byteLength(oversizedUri, 'utf8') > MCP_APPS_RESOURCE_URI_MAX_BYTES);
  assert.throws(
    () => parseMcpAppsToolMetadata({ ui: { resourceUri: oversizedUri } }),
    (error) => error?.code === 'MCP_APPS_METADATA_INVALID'
      && error?.metadata?.field === 'resourceUri'
      && error?.metadata?.maxBytes === MCP_APPS_RESOURCE_URI_MAX_BYTES
  );

  const oversizedMeta = {
    ui: {
      resourceUri: RESOURCE_URI,
      visibility: ['model', 'app'],
      padding: 'x'.repeat(MCP_APPS_TOOL_META_MAX_BYTES)
    }
  };
  assert.throws(
    () => parseMcpAppsToolMetadata(oversizedMeta),
    (error) => error?.code === 'MCP_APPS_METADATA_INVALID'
      && error?.metadata?.field === 'ui'
      && error?.metadata?.sizeBytes > MCP_APPS_TOOL_META_MAX_BYTES
      && error?.metadata?.maxBytes === MCP_APPS_TOOL_META_MAX_BYTES
  );
});

test('P3-M3 resolveAppResource fails on oversized HTML before returning materializable UI content', async () => {
  const calls = [];
  const oversizedHtml = 'x'.repeat(MCP_APPS_RESOURCE_MAX_BYTES + 1);
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
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
        result: readResult([{
          uri: request.params.uri,
          text: oversizedHtml,
          mimeType: MCP_APPS_RESOURCE_MIME_TYPE
        }])
      });
    }

    throw new Error(`unexpected MCP method: ${request.method}`);
  };

  const provider = await createMcpDiscoveryProvider({
    endpoint: 'https://mcp.example.test/mcp',
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl
  });

  await assert.rejects(
    () => provider.resolveAppResource(RESOURCE_URI),
    (error) => error?.code === 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED'
      && error?.appResource?.dimension === 'bytes'
      && error?.appResource?.observed === MCP_APPS_RESOURCE_MAX_BYTES + 1
  );
  assert.deepEqual(calls, ['server/discover', 'tools/list', 'resources/read']);
});
