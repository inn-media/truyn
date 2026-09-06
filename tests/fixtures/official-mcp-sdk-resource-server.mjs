import { createServer } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';

const SDK_PACKAGE = '@modelcontextprotocol/server';
const SDK_VERSION = '2.0.0';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const HOST = '127.0.0.1';
const RESOURCE_URI = 'memory://official/p3-m1/general-resource';

let generation = 1;
let value = 'alpha';
let lastModified = '2026-09-06T07:00:00Z';
const stats = {
  resourceReadCount: 0,
  updateCount: 0,
  subscriptionListenCount: 0,
  requests: []
};

function createIndependentMcpServer() {
  const server = new McpServer(
    { name: 'TRUYN P3-M1 official MCP resource fixture', version: '1.0.0-p3-m1' },
    { capabilities: { resources: { subscribe: true } } }
  );
  server.registerResource(
    'general-resource',
    RESOURCE_URI,
    {
      title: 'General mutable resource',
      description: 'Independent official SDK resource for P3-M1 OBJECT/STATE materialization.',
      mimeType: 'text/plain'
    },
    async (uri) => {
      stats.resourceReadCount += 1;
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/plain',
          text: value,
          annotations: { lastModified }
        }]
      };
    }
  );
  return server;
}

const handler = createMcpHandler(() => createIndependentMcpServer(), {
  maxSubscriptions: 16,
  keepAliveMs: 1_000
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function toHeaders(rawHeaders) {
  const headers = new Headers();
  for (const [name, raw] of Object.entries(rawHeaders)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) headers.append(name, item);
    } else {
      headers.set(name, raw);
    }
  }
  return headers;
}

async function serveMcp(req, res, body) {
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: toHeaders(req.headers),
    body: body.length > 0 ? body : undefined
  });
  const response = await handler.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(chunk))) await new Promise((resolve) => res.once('drain', resolve));
    }
  } catch (error) {
    if (!res.destroyed) res.destroy(error);
    return;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (!res.writableEnded) res.end();
}

function sendJson(res, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': bytes.length,
    'cache-control': 'no-store'
  });
  res.end(bytes);
}

const httpServer = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/__truyn_black_box_stats') {
      sendJson(res, 200, {
        sdkPackage: SDK_PACKAGE,
        sdkVersion: SDK_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        resourceUri: RESOURCE_URI,
        generation,
        value,
        lastModified,
        ...stats
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/__truyn_update') {
      generation += 1;
      value = generation === 2 ? 'beta' : `value-${generation}`;
      lastModified = new Date(Date.parse('2026-09-06T07:00:00Z') + ((generation - 1) * 60_000)).toISOString();
      stats.updateCount += 1;
      await handler.notify.resourceUpdated(RESOURCE_URI);
      sendJson(res, 200, { generation, value, lastModified });
      return;
    }
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);
    let parsed = null;
    try { parsed = body.length ? JSON.parse(body.toString('utf8')) : null; } catch {}
    if (parsed?.method === 'subscriptions/listen') stats.subscriptionListenCount += 1;
    stats.requests.push({
      httpMethod: req.method,
      protocolVersion: req.headers['mcp-protocol-version'] ?? null,
      mcpMethod: req.headers['mcp-method'] ?? null,
      mcpName: req.headers['mcp-name'] ?? null,
      jsonRpcMethod: parsed?.method ?? null
    });
    await serveMcp(req, res, body);
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: 'official_mcp_resource_fixture_error' });
    else if (!res.destroyed) res.destroy(error);
  }
});

await new Promise((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen({ host: HOST, port: 0, exclusive: true }, resolve);
});
const address = httpServer.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve official MCP resource fixture port');
const baseUrl = `http://${HOST}:${address.port}`;

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExit = setTimeout(() => process.exit(1), 2_000);
  forceExit.unref();
  try {
    await handler.close();
    await new Promise((resolve) => {
      if (!httpServer.listening) return resolve();
      httpServer.close(resolve);
      httpServer.closeIdleConnections?.();
    });
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

process.stdout.write(`${JSON.stringify({
  type: 'ready',
  sdkPackage: SDK_PACKAGE,
  sdkVersion: SDK_VERSION,
  protocolVersion: MCP_PROTOCOL_VERSION,
  endpoint: `${baseUrl}/mcp`,
  statsUrl: `${baseUrl}/__truyn_black_box_stats`,
  updateUrl: `${baseUrl}/__truyn_update`,
  resourceUri: RESOURCE_URI
})}\n`);
