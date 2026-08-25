import http from 'node:http';
import readline from 'node:readline';

export const MCP_MODERN_VERSION = '2026-07-28';
export const MCP_LEGACY_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18']);
export const MCP_SUPPORTED_VERSIONS = Object.freeze([MCP_MODERN_VERSION, ...MCP_LEGACY_VERSIONS]);
export const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
export const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
export const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
export const MCP_SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';

const CACHE_TTL_MS = 1000;
const CACHE_SCOPE = 'private';

const TOOLS = Object.freeze([
  { name: 'truyn_identity', title: 'TRUYN Identity', description: 'Return the cryptographic TRUYN Node identity connected to this MCP server.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'truyn_find', title: 'Find TRUYN Capability', description: 'Find authorized TRUYN providers offering a capability.', inputSchema: { type: 'object', properties: { capability: { type: 'string' } }, required: ['capability'], additionalProperties: false } },
  { name: 'truyn_offer', title: 'Offer TRUYN Capability', description: 'Advertise a capability from this TRUYN Node.', inputSchema: { type: 'object', properties: { capability: { type: 'string' }, metadata: { type: 'object' } }, required: ['capability'], additionalProperties: false } },
  { name: 'truyn_need', title: 'Request TRUYN Capability', description: 'Send a signed NEED through the relay authorization boundary.', inputSchema: { type: 'object', properties: { capability: { type: 'string' }, input: {}, policy: { type: 'object' } }, required: ['capability', 'input'], additionalProperties: false } },
  { name: 'truyn_poll', title: 'Poll TRUYN Events', description: 'Receive pending signed NEED or RESULT events for this node.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'truyn_result', title: 'Return TRUYN Result', description: 'Return a signed RESULT for a NEED handled by this node.', inputSchema: { type: 'object', properties: { requestId: { type: 'string' }, output: {}, metadata: { type: 'object' } }, required: ['requestId', 'output'], additionalProperties: false } }
]);

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message, data = undefined) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export function createMcpModernMeta({ clientName = 'truyn-client', clientVersion = '0.1.0', clientCapabilities = {} } = {}) {
  if (!isObject(clientCapabilities)) throw new Error('clientCapabilities must be an object');
  return {
    [MCP_PROTOCOL_VERSION_META_KEY]: MCP_MODERN_VERSION,
    [MCP_CLIENT_INFO_META_KEY]: { name: clientName, version: clientVersion },
    [MCP_CLIENT_CAPABILITIES_META_KEY]: clientCapabilities
  };
}

function modernEnvelopeError(params) {
  const meta = params?._meta;
  if (!isObject(meta)) return 'Modern MCP request requires params._meta';
  if (meta[MCP_PROTOCOL_VERSION_META_KEY] !== MCP_MODERN_VERSION) return `Modern MCP request requires ${MCP_PROTOCOL_VERSION_META_KEY}=${MCP_MODERN_VERSION}`;
  if (!isObject(meta[MCP_CLIENT_CAPABILITIES_META_KEY])) return `Modern MCP request requires ${MCP_CLIENT_CAPABILITIES_META_KEY}`;
  const clientInfo = meta[MCP_CLIENT_INFO_META_KEY];
  if (clientInfo !== undefined && (!isObject(clientInfo) || typeof clientInfo.name !== 'string' || typeof clientInfo.version !== 'string')) {
    return `${MCP_CLIENT_INFO_META_KEY} must contain string name/version when present`;
  }
  return null;
}

function requestMetaVersion(message) {
  return isObject(message?.params?._meta) ? message.params._meta[MCP_PROTOCOL_VERSION_META_KEY] : undefined;
}

function isModernMessage(message) {
  return message?.method === 'server/discover' || requestMetaVersion(message) === MCP_MODERN_VERSION;
}

function withServerInfo(result, serverInfo) {
  return {
    ...result,
    _meta: {
      ...(isObject(result?._meta) ? result._meta : {}),
      [MCP_SERVER_INFO_META_KEY]: serverInfo
    }
  };
}

function toolResult(value, modern) {
  return {
    ...(modern ? { resultType: 'complete' } : {}),
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function toolErrorResult(modern) {
  return {
    ...(modern ? { resultType: 'complete' } : {}),
    isError: true,
    content: [{ type: 'text', text: 'TRUYN tool request failed' }]
  };
}

function assertLoopback(host) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The public MCP HTTP bridge is local-only; use an authenticated gateway for remote access');
  }
}

function originIsLoopback(origin) {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(hostname);
  } catch {
    return false;
  }
}

function isJsonContentType(value) {
  if (typeof value !== 'string') return false;
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function expectedRoutingName(message) {
  if (typeof message?.params?.name === 'string') return message.params.name;
  if (typeof message?.params?.uri === 'string') return message.params.uri;
  return null;
}

function validateHttpProtocol(req, message) {
  const headerVersion = req.headers['mcp-protocol-version'];
  const metaVersion = requestMetaVersion(message);
  if (headerVersion && !MCP_SUPPORTED_VERSIONS.includes(headerVersion)) {
    return { status: 400, body: rpcError(message?.id, -32022, 'Unsupported protocol version', { supported: MCP_SUPPORTED_VERSIONS }) };
  }
  if (metaVersion && !MCP_SUPPORTED_VERSIONS.includes(metaVersion)) {
    return { status: 400, body: rpcError(message?.id, -32022, 'Unsupported protocol version', { supported: MCP_SUPPORTED_VERSIONS }) };
  }

  const modern = message?.method === 'server/discover' || headerVersion === MCP_MODERN_VERSION || metaVersion === MCP_MODERN_VERSION;
  if (!modern) {
    if (headerVersion && metaVersion && headerVersion !== metaVersion) {
      return { status: 400, body: rpcError(message?.id, -32020, 'MCP protocol version header/body mismatch') };
    }
    return { modern: false };
  }

  if (headerVersion !== MCP_MODERN_VERSION || metaVersion !== MCP_MODERN_VERSION) {
    return { status: 400, body: rpcError(message?.id, -32020, 'Modern MCP protocol version header/body mismatch') };
  }
  if (req.headers['mcp-method'] !== message?.method) {
    return { status: 400, body: rpcError(message?.id, -32020, 'Mcp-Method header mismatch') };
  }
  const expectedName = expectedRoutingName(message);
  if (expectedName !== null && req.headers['mcp-name'] !== expectedName) {
    return { status: 400, body: rpcError(message?.id, -32020, 'Mcp-Name header mismatch') };
  }
  const envelopeError = modernEnvelopeError(message?.params || {});
  if (envelopeError) {
    return { status: 400, body: rpcError(message?.id, -32602, envelopeError) };
  }
  return { modern: true };
}

export function createMcpHandler({ node, serverName = 'truyn-mvp', serverVersion = '0.1.0-mvp.2' }) {
  if (!node) throw new Error('node is required');
  let registered = false;
  const serverInfo = Object.freeze({ name: serverName, version: serverVersion });

  async function ensureRegistered() {
    if (!registered || !node.sessionToken) {
      await node.register({ name: serverName });
      registered = true;
    }
  }

  async function callTool(name, args = {}) {
    if (name === 'truyn_identity') return { nodeId: node.identity.nodeId, algorithm: node.identity.algorithm, protocol: 'TRUYN/1' };
    if (name === 'truyn_find') { if (!args.capability) throw new Error('capability is required'); await ensureRegistered(); return node.find(args.capability); }
    if (name === 'truyn_offer') { if (!args.capability) throw new Error('capability is required'); await ensureRegistered(); return node.offer(args.capability, args.metadata || {}); }
    if (name === 'truyn_need') { if (!args.capability || !Object.prototype.hasOwnProperty.call(args, 'input')) throw new Error('capability and input are required'); await ensureRegistered(); return node.need(args.capability, args.input, args.policy || {}); }
    if (name === 'truyn_poll') { await ensureRegistered(); return node.poll(); }
    if (name === 'truyn_result') { if (!args.requestId || !Object.prototype.hasOwnProperty.call(args, 'output')) throw new Error('requestId and output are required'); await ensureRegistered(); return node.result(args.requestId, args.output, args.metadata || {}); }
    const error = new Error(`Unknown tool: ${name}`); error.code = -32602; throw error;
  }

  function result(id, value, modern) {
    return rpcResult(id, modern ? withServerInfo(value, serverInfo) : value);
  }

  return async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message?.id, -32600, 'Invalid Request');
    const { id, method, params = {} } = message;
    const metaVersion = requestMetaVersion(message);
    if (metaVersion && !MCP_SUPPORTED_VERSIONS.includes(metaVersion)) {
      return rpcError(id, -32022, 'Unsupported protocol version', { supported: MCP_SUPPORTED_VERSIONS });
    }
    const modern = isModernMessage(message);
    if (modern) {
      const envelopeError = modernEnvelopeError(params);
      if (envelopeError) return rpcError(id, -32602, envelopeError);
      if (method === 'initialize') return rpcError(id, -32601, 'Method not found');
    }

    try {
      if (method === 'server/discover') {
        return result(id, {
          resultType: 'complete',
          supportedVersions: [...MCP_SUPPORTED_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          instructions: 'Use TRUYN tools through the relay authorization boundary.',
          ttlMs: CACHE_TTL_MS,
          cacheScope: CACHE_SCOPE
        }, true);
      }
      if (method === 'initialize') {
        const requested = params.protocolVersion;
        if (!MCP_LEGACY_VERSIONS.includes(requested)) {
          return rpcError(id, -32022, 'Unsupported protocol version for initialize', { supported: MCP_LEGACY_VERSIONS });
        }
        return rpcResult(id, {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions: 'TRUYN connects agent capabilities through signed and authorized OFFER, NEED, and RESULT messages.'
        });
      }
      if (method === 'notifications/initialized') return null;
      if (method === 'tools/list') {
        return result(id, {
          ...(modern ? { resultType: 'complete' } : {}),
          tools: [...TOOLS],
          ...(modern ? { ttlMs: CACHE_TTL_MS, cacheScope: CACHE_SCOPE } : {})
        }, modern);
      }
      if (method === 'tools/call') {
        if (!params.name) return rpcError(id, -32602, 'Tool name is required');
        const value = await callTool(params.name, params.arguments || {});
        return result(id, toolResult(value, modern), modern);
      }
      return rpcError(id, -32601, 'Method not found');
    } catch (error) {
      if (method === 'tools/call' && error.code !== -32602) return result(id, toolErrorResult(modern), modern);
      return rpcError(id, error.code || -32603, error.code === -32602 ? error.message : 'Request failed');
    }
  };
}

export async function runStdioMcpServer({ node, input = process.stdin, output = process.stdout, errorOutput = process.stderr }) {
  const handle = createMcpHandler({ node });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      const response = await handle(message);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch {
      errorOutput.write('TRUYN MCP request failed\n');
    }
  }
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('request_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

export function createMcpHttpServer({ node, maxBodyBytes = 256 * 1024 }) {
  const handle = createMcpHandler({ node });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url !== '/mcp') return sendJson(res, 404, rpcError(null, -32601, 'Not found'));
      if (req.method === 'GET' || req.method === 'DELETE') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
      if (!originIsLoopback(req.headers.origin)) return sendJson(res, 403, rpcError(null, -32000, 'Origin not allowed'));
      if (!isJsonContentType(req.headers['content-type'])) return sendJson(res, 415, rpcError(null, -32600, 'Content-Type must be application/json'));

      const message = await readJson(req, maxBodyBytes);
      const protocol = validateHttpProtocol(req, message);
      if (protocol.body) return sendJson(res, protocol.status, protocol.body);

      const response = await handle(message);
      if (!response) { res.writeHead(202); return res.end(); }
      return sendJson(res, 200, response);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return sendJson(res, status, rpcError(null, -32603, status < 500 ? error.message : 'Request failed'));
    }
  });
  return {
    server,
    async listen({ host = '127.0.0.1', port = 8791 } = {}) {
      assertLoopback(host);
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}/mcp`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
