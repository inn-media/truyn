import { createHash } from 'node:crypto';
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
const PROOF_BYTES = Buffer.from('TRUYN Sprint E interop proof\n', 'utf8');
const PROOF_FILENAME = 'interop-proof.bin';
const PROOF_MEDIA_TYPE = 'application/octet-stream';
const PROOF_URI = 'https://sprint-e.invalid/interop-proof.bin';
const PROOF_DIGEST = createHash('sha256').update(PROOF_BYTES).digest('hex');
const INTEGRITY_KEY = 'io.truyn/integrity';

const stats = {
  executionCount: 0,
  resourceReadCount: 0,
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

function createIndependentMcpServer() {
  const server = new McpServer({
    name: 'Sprint E official MCP SDK artifact server',
    version: '1.0.0-sprint-e'
  });

  server.registerResource('interop-proof', PROOF_URI, {
    title: 'Sprint E interop proof',
    description: 'Deterministic binary resource for TRUYN external artifact interoperability proof.',
    mimeType: PROOF_MEDIA_TYPE
  }, async (uri) => {
    stats.resourceReadCount += 1;
    return {
      resultType: 'complete',
      ttlMs: 0,
      cacheScope: 'private',
      contents: [{
        uri: uri.href,
        mimeType: PROOF_MEDIA_TYPE,
        blob: PROOF_BYTES.toString('base64')
      }]
    };
  });

  server.registerTool('artifact_lookup', {
    description: 'Return a deterministic MCP resource_link without embedding the artifact bytes.',
    inputSchema
  }, async ({ a2a, parts }) => {
    stats.executionCount += 1;
    const mode = parts?.[0]?.data?.mode ?? 'ok';
    stats.toolInputs.push(structuredClone({ a2a, parts, mode }));
    const integrity = {
      algorithm: 'sha256',
      digest: mode === 'corrupt-digest' ? '0'.repeat(64) : PROOF_DIGEST,
      sizeBytes: mode === 'corrupt-size' ? PROOF_BYTES.length + 1 : PROOF_BYTES.length,
      encoding: 'raw'
    };
    return {
      content: [{
        type: 'resource_link',
        uri: PROOF_URI,
        name: PROOF_FILENAME,
        mimeType: PROOF_MEDIA_TYPE,
        size: PROOF_BYTES.length,
        _meta: { [INTEGRITY_KEY]: integrity }
      }],
      _meta: {
        fixture: 'sprint-e-independent-mcp-artifact',
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
  const response = await handler.fetch(request);
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
        proofUri: PROOF_URI,
        proofFilename: PROOF_FILENAME,
        proofMediaType: PROOF_MEDIA_TYPE,
        proofSizeBytes: PROOF_BYTES.length,
        proofSha256: PROOF_DIGEST,
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
    const payload = Buffer.from(JSON.stringify({ error: 'mcp_artifact_fixture_error' }));
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
  throw lastError ?? new Error('Unable to bind independent MCP artifact fixture');
}

await bindEphemeralServer();
const address = httpServer.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve independent MCP artifact fixture port');

const baseUrl = `http://${HOST}:${address.port}`;
const endpoint = `${baseUrl}/mcp`;
const statsUrl = `${baseUrl}/__truyn_black_box_stats`;

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExit = setTimeout(() => process.exit(1), 1_500);
  forceExit.unref();
  try {
    const httpClosed = httpServer.listening
      ? new Promise((resolve) => {
          httpServer.close(resolve);
          httpServer.closeIdleConnections?.();
        })
      : Promise.resolve();
    await handler.close();
    await httpClosed;
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
  endpoint,
  statsUrl,
  proofUri: PROOF_URI,
  proofFilename: PROOF_FILENAME,
  proofMediaType: PROOF_MEDIA_TYPE,
  proofSizeBytes: PROOF_BYTES.length,
  proofSha256: PROOF_DIGEST
})}\n`);
