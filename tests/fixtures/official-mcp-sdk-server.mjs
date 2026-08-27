import { createServer } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const SDK_PACKAGE = '@modelcontextprotocol/server';
const SDK_VERSION = '2.0.0';
const NODE_PACKAGE = '@modelcontextprotocol/node';
const NODE_VERSION = '2.0.0';
const PROTOCOL_VERSION = '2026-07-28';
const HOST = '127.0.0.1';

const stats = {
  executionCount: 0,
  calls: [],
  requests: []
};

const handler = createMcpHandler(({ era }) => {
  const server = new McpServer({
    name: 'Sprint D official MCP SDK black-box server',
    version: '1.0.0-sprint-d'
  });

  server.registerTool(
    'bridge_lookup',
    {
      description: 'Return a deterministic structured answer for the Sprint D external MCP proof.',
      inputSchema: z.object({
        a2a: z.object({
          protocolVersion: z.string()
        }).passthrough(),
        parts: z.array(z.object({
          data: z.object({
            query: z.string()
          }).passthrough(),
          mediaType: z.string().optional()
        }).passthrough())
      }).passthrough(),
      outputSchema: z.object({
        answer: z.string()
      })
    },
    async (args) => {
      stats.executionCount += 1;
      stats.calls.push(structuredClone(args));
      const query = args.parts?.[0]?.data?.query ?? '';
      const output = { answer: `official-mcp:${query}` };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
        _meta: {
          usage: {
            fixture: 'sprint-d-independent-mcp',
            era
          }
        }
      };
    }
  );

  return server;
}, {
  legacy: 'reject',
  responseMode: 'json'
});

const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || HOST}`);

  if (req.method === 'GET' && requestUrl.pathname === '/__truyn_black_box_stats') {
    const payload = JSON.stringify({
      sdkPackage: SDK_PACKAGE,
      sdkVersion: SDK_VERSION,
      nodePackage: NODE_PACKAGE,
      nodeVersion: NODE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      ...stats
    });
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload)
    });
    res.end(payload);
    return;
  }

  if (requestUrl.pathname !== '/mcp') {
    res.writeHead(404).end();
    return;
  }

  stats.requests.push({
    method: req.method,
    path: requestUrl.pathname,
    mcpProtocolVersion: req.headers['mcp-protocol-version'] ?? null,
    mcpMethod: req.headers['mcp-method'] ?? null,
    mcpName: req.headers['mcp-name'] ?? null
  });

  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  void nodeHandler(req, res);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, HOST, resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve independent MCP fixture port');
const baseUrl = `http://${HOST}:${address.port}`;

process.stdout.write(`${JSON.stringify({
  type: 'ready',
  sdkPackage: SDK_PACKAGE,
  sdkVersion: SDK_VERSION,
  nodePackage: NODE_PACKAGE,
  nodeVersion: NODE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  endpoint: `${baseUrl}/mcp`,
  statsUrl: `${baseUrl}/__truyn_black_box_stats`
})}\n`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await handler.close().catch(() => {});
  if (!server.listening) {
    process.exit(0);
    return;
  }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
