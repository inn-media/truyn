import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { parseMcpAppsToolMetadata } from '../adapters/mcp/apps-metadata.js';
import {
  MCP_APPS_RESOURCE_MAX_BYTES,
  MCP_APPS_RESOURCE_MIME_TYPE,
  validateMcpAppsResourceReadResult
} from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const ENDPOINT = 'https://matrix-a.example.test/mcp';
const RESOURCE_URI = 'ui://matrix-a/view.html';
const FORGED_URI = 'ui://matrix-a/forged.html';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function appRead(contents) {
  return {
    resultType: 'complete',
    contents,
    ttlMs: 1000,
    cacheScope: 'private'
  };
}

function textContent(text, mimeType = MCP_APPS_RESOURCE_MIME_TYPE) {
  return { uri: RESOURCE_URI, text, mimeType };
}

async function forgedUriFailure() {
  const methods = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, ENDPOINT);
    const request = JSON.parse(options.body);
    methods.push(request.method);

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

    throw new Error(`unexpected MCP method: ${request.method}`);
  };

  const provider = await createMcpDiscoveryProvider({
    endpoint: ENDPOINT,
    authMode: 'none',
    allowTools: ['weather'],
    fetchImpl
  });

  let failure;
  try {
    await provider.resolveAppResource(FORGED_URI);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'forged URI must fail');
  assert.deepEqual(methods, ['server/discover', 'tools/list']);
  return failure;
}

function duplicateContentFailure() {
  return captureSync(() => validateMcpAppsResourceReadResult(
    RESOURCE_URI,
    appRead([
      textContent('<html>duplicate</html>'),
      textContent('<html>duplicate</html>')
    ])
  ));
}

function badMimeFailure() {
  return captureSync(() => validateMcpAppsResourceReadResult(
    RESOURCE_URI,
    appRead([textContent('<html>bad mime</html>', 'text/html')])
  ));
}

function malformedMetadataFailure() {
  return captureSync(() => parseMcpAppsToolMetadata({ ui: 'not-an-object' }));
}

function oversizedResourceFailure() {
  return captureSync(() => validateMcpAppsResourceReadResult(
    RESOURCE_URI,
    appRead([textContent('x'.repeat(MCP_APPS_RESOURCE_MAX_BYTES + 1))])
  ));
}

function captureSync(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('negative matrix row unexpectedly passed');
}

function snapshot(error) {
  return {
    code: error?.code || null,
    message: error?.message || null,
    details: error?.appResource || error?.metadata || null
  };
}

const MATRIX = [
  {
    name: 'forged URI',
    code: 'MCP_APPS_RESOURCE_UNDECLARED',
    run: forgedUriFailure,
    details: { providerAuthority: ENDPOINT, resourceUri: FORGED_URI }
  },
  {
    name: 'duplicate content',
    code: 'MCP_APPS_RESOURCE_DUPLICATE_CONTENT',
    run: async () => duplicateContentFailure(),
    details: { resourceUri: RESOURCE_URI, firstIndex: 0, duplicateIndex: 1 }
  },
  {
    name: 'bad MIME',
    code: 'MCP_APPS_RESOURCE_MIME_UNSUPPORTED',
    run: async () => badMimeFailure(),
    details: {
      resourceUri: RESOURCE_URI,
      index: 0,
      expectedMimeType: MCP_APPS_RESOURCE_MIME_TYPE,
      receivedMimeType: 'text/html'
    }
  },
  {
    name: 'malformed metadata',
    code: 'MCP_APPS_METADATA_INVALID',
    run: async () => malformedMetadataFailure(),
    details: { field: 'ui' }
  },
  {
    name: 'oversized resource',
    code: 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED',
    run: async () => oversizedResourceFailure(),
    details: {
      resourceUri: RESOURCE_URI,
      dimension: 'bytes',
      observed: MCP_APPS_RESOURCE_MAX_BYTES + 1,
      max: MCP_APPS_RESOURCE_MAX_BYTES
    }
  }
];

test('P3-M3 Negative matrix A fails every row deterministically', async (t) => {
  assert.deepEqual(MATRIX.map((row) => row.name), [
    'forged URI',
    'duplicate content',
    'bad MIME',
    'malformed metadata',
    'oversized resource'
  ]);

  for (const row of MATRIX) {
    await t.test(row.name, async () => {
      const first = snapshot(await row.run());
      const second = snapshot(await row.run());

      assert.equal(first.code, row.code);
      assert.deepEqual(first.details, row.details);
      assert.deepEqual(second, first, `${row.name} failure must be deterministic`);
    });
  }
});
