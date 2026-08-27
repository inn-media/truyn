import { createServer } from 'node:http';
import {
  createMcpHandler,
  fromJsonSchema,
  McpServer
} from '@modelcontextprotocol/server';

const SDK_PACKAGE = '@modelcontextprotocol/server';
const SDK_VERSION = '2.0.0';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const HOST = '127.0.0.1';
const MAX_BIND_ATTEMPTS = 3;

const stats = {
  executionCount: 0,
  toolInputs: [],
  requests: []
};

const inputSchema = fromJsonSchema({
  type: 'object',
  properties: {
    a2a: { type: 'object', additionalProperties: true },
    parts: {
      type: 'array',
      items: { type: 'object', additionalProperties: true }
    }
  },
  required: ['parts'],
  additionalProperties: true
});

const outputSchema = fromJsonSchema({
  type: 'object',
  properties: {
    answer: { type: 'string' }
  },
  required: ['answer'],
  additionalProperties: false
});

function createIndependentMcpServer() {
  const server = new McpServer({
    name: 'Sprint D official MCP SDK black-box server',
    version: '1.0.0-sprint-d'
  });

  server.registerTool('bridge_lookup', {
    description: 'Return a deterministic structured response from the independent official MCP SDK server.',
    inputSchema,
    outputSchema
  }, async ({ a2a, parts }) => {
    stats.executionCount += 1;
    stats.toolInputs.push(structuredClone({ a2a, parts }));
    const query = parts?.[0]?.data?.query ?? '';
    const output = { answer: `official-mcp:${query}` };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output,
      _meta: {
        fixture: 'sprint-d-independent-mcp',
        sdkPackage: SDK_PACKAGE,
        sdkVersion: SDK_VERSION
      }
    };
  });

  return server;
}

const handler = createMcpHandler(() => createIndependentMcpServer());

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function toHeaders(rawHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

async function serveMcp(req, res, body) {
  const url = `http://${req.headers.host}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: toHeaders(req.headers),
    body: body.length > 0 ? body : undefined
  });
  const response = await handler(request);
  const responseBody = Buffer.from(await response.arrayBuffer());
  const responseHeaders = {};
  response.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });
  res.writeHead(response.status, responseHeaders);
  res.end(responseBody);
}

const httpServer = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/__truyn_black_box_stats') {
      const payload = Buffer.from(JSON.stringify({
        sdkPackage: SDK_PACKAGE,
        sdkVersion: SDK_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        ...stats
      }));
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': payload.length
      });
      res.end(payload);
      return;
    }

    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);
    let parsed = null;
    try {
      parsed = body.length > 0 ? JSON.parse(body.toString('utf8')) : null;
    } catch {
      // The official SDK handler remains authoritative for malformed MCP input.
    }
    stats.requests.push({
      httpMethod: req.method,
      path: req.url,
      protocolVersion: req.headers['mcp-protocol-version'] ?? null,
      mcpMethod: req.headers['mcp-method'] ?? null,
      mcpName: req.headers['mcp-name'] ?? null,
      jsonRpcMethod: parsed?.method ?? null
    });
    await serveMcp(req, res, body);
  } catch (error) {
    const payload = Buffer.from(JSON.stringify({ error: String(error?.message || error) }));
    res.writeHead(500, {
      'content-type': 'application/json',
      'content-length': payload.length
    });
    res.end(payload);
  }
});

function listen(candidate) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      candidate.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      candidate.off('error', onError);
      resolve();
    };
    candidate.once('error', onError);
    candidate.once('listening', onListening);
    candidate.listen({ port: 0, host: HOST, exclusive: true });
  });
}

async function bindEphemeralServer() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS; attempt += 1) {
    try {
      await listen(httpServer);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'EADDRINUSE' || attempt === MAX_BIND_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw lastError ?? new Error('Unable to bind independent MCP fixture');
}

await bindEphemeralServer();
const address = httpServer.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve independent MCP fixture port');

const baseUrl = `http://${HOST}:${address.port}`;
const endpoint = `${baseUrl}/mcp`;
const statsUrl = `${baseUrl}/__truyn_black_box_stats`;

process.stdout.write(`${JSON.stringify({
  type: 'ready',
  sdkPackage: SDK_PACKAGE,
  sdkVersion: SDK_VERSION,
  protocolVersion: MCP_PROTOCOL_VERSION,
  endpoint,
  statsUrl
})}\n`);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!httpServer.listening) {
    process.exit(0);
    return;
  }
  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
