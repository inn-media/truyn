import { createServer } from 'node:http';

// Independent wire fixture for TRUYN P3-M3. This file deliberately imports no
// TRUYN implementation or fixture helper. Its Apps behavior is transcribed from
// the exact upstream sources recorded in pinned-ext-apps-v2.provenance.json.

const HOST = '127.0.0.1';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
const APPS_RESOURCE_MIME = 'text/html;profile=mcp-app';
const APPS_RESOURCE_URI = 'ui://pinned-ext-apps/weather.html';
const TOOL_NAME = 'pinned_weather';
const UPSTREAM = Object.freeze({
  package: '@modelcontextprotocol/ext-apps',
  sourceVersion: '2.0.0',
  repository: 'https://github.com/modelcontextprotocol/ext-apps',
  commit: '4cd427394755ee0964172df5760852aa053a5c99'
});

const stats = {
  requests: [],
  toolCalls: 0,
  resourceReads: 0
};

function sendJson(res, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': bytes.length,
    'cache-control': 'no-store'
  });
  res.end(bytes);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function complete(value) {
  return {
    resultType: 'complete',
    ...value,
    ttlMs: 1000,
    cacheScope: 'private'
  };
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function handleRpc(body, req) {
  if (!body || body.jsonrpc !== '2.0' || typeof body.id !== 'string' || typeof body.method !== 'string') {
    return { status: 400, body: rpcError(body?.id ?? null, -32600, 'invalid request') };
  }

  stats.requests.push({
    method: body.method,
    protocolVersion: req.headers['mcp-protocol-version'] ?? null,
    mcpMethod: req.headers['mcp-method'] ?? null,
    mcpName: req.headers['mcp-name'] ?? null
  });

  if (req.headers['mcp-protocol-version'] !== MCP_PROTOCOL_VERSION) {
    return { status: 400, body: rpcError(body.id, -32000, 'unsupported MCP protocol version') };
  }

  if (body.method === 'server/discover') {
    return {
      status: 200,
      body: rpcResult(body.id, complete({
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          extensions: { [APPS_EXTENSION_ID]: {} }
        },
        _meta: {
          'io.modelcontextprotocol/serverInfo': {
            name: 'pinned-ext-apps-independent-fixture',
            version: UPSTREAM.sourceVersion
          }
        }
      }))
    };
  }

  if (body.method === 'tools/list') {
    return {
      status: 200,
      body: rpcResult(body.id, complete({
        tools: [{
          name: TOOL_NAME,
          description: 'Independent pinned MCP Apps weather fixture',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' }
            },
            required: ['city'],
            additionalProperties: false
          },
          _meta: {
            ui: {
              resourceUri: APPS_RESOURCE_URI,
              visibility: ['model', 'app']
            }
          }
        }]
      }))
    };
  }

  if (body.method === 'tools/call') {
    if (body.params?.name !== TOOL_NAME) {
      return { status: 200, body: rpcError(body.id, -32602, 'unknown tool') };
    }
    stats.toolCalls += 1;
    const city = String(body.params?.arguments?.city ?? 'unknown');
    return {
      status: 200,
      body: rpcResult(body.id, complete({
        content: [{ type: 'text', text: `weather:${city}:sunny` }],
        _meta: {
          usage: { inputTokens: 3, outputTokens: 3 },
          ui: { resourceUri: APPS_RESOURCE_URI }
        }
      }))
    };
  }

  if (body.method === 'resources/read') {
    if (body.params?.uri !== APPS_RESOURCE_URI) {
      return { status: 200, body: rpcError(body.id, -32002, 'resource not found') };
    }
    stats.resourceReads += 1;
    return {
      status: 200,
      body: rpcResult(body.id, complete({
        contents: [{
          uri: APPS_RESOURCE_URI,
          mimeType: APPS_RESOURCE_MIME,
          text: '<!doctype html><html><body><main id="weather">Pinned Apps fixture</main></body></html>',
          _meta: {
            ui: {
              csp: { connectDomains: [] },
              prefersBorder: true
            }
          }
        }]
      }))
    };
  }

  return { status: 200, body: rpcError(body.id, -32601, 'method not found') };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/__truyn_black_box_stats') {
      sendJson(res, 200, {
        upstream: UPSTREAM,
        protocolVersion: MCP_PROTOCOL_VERSION,
        extensionId: APPS_EXTENSION_ID,
        resourceMime: APPS_RESOURCE_MIME,
        resourceUri: APPS_RESOURCE_URI,
        toolName: TOOL_NAME,
        ...stats
      });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    const body = await readJson(req);
    const response = handleRpc(body, req);
    sendJson(res, response.status, response.body);
  } catch {
    sendJson(res, 500, { error: 'pinned_ext_apps_fixture_error' });
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen({ host: HOST, port: 0, exclusive: true }, resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve pinned Apps fixture port');
const baseUrl = `http://${HOST}:${address.port}`;

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.stdout.write(`${JSON.stringify({
  type: 'ready',
  endpoint: `${baseUrl}/mcp`,
  statsUrl: `${baseUrl}/__truyn_black_box_stats`,
  protocolVersion: MCP_PROTOCOL_VERSION,
  extensionId: APPS_EXTENSION_ID,
  resourceMime: APPS_RESOURCE_MIME,
  resourceUri: APPS_RESOURCE_URI,
  toolName: TOOL_NAME,
  upstream: UPSTREAM
})}\n`);
