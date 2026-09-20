import { encodeMcpHeaderValue } from './http-headers.js';

export const MCP_CURRENT_PROTOCOL_VERSION = '2026-07-28';
export const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
export const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
export const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
export const MCP_SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEADER_TYPES = new Set(['string', 'integer', 'boolean']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error('MCP endpoint must be an absolute URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('MCP endpoint must use http or https');
  return parsed.toString();
}

function modernMeta({ clientName, clientVersion, clientCapabilities }) {
  return {
    [MCP_PROTOCOL_VERSION_META_KEY]: MCP_CURRENT_PROTOCOL_VERSION,
    [MCP_CLIENT_INFO_META_KEY]: { name: clientName, version: clientVersion },
    [MCP_CLIENT_CAPABILITIES_META_KEY]: clientCapabilities
  };
}

function parseSseJsonRpc(text, expectedId) {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    let message;
    try { message = JSON.parse(data); } catch { continue; }
    if (message?.id === expectedId) return message;
  }
  throw new Error('MCP SSE response did not contain the matching JSON-RPC result');
}

async function cancelResponseBody(response) {
  try {
    if (response?.body && typeof response.body.cancel === 'function') await response.body.cancel();
  } catch {}
}

async function readBoundedText(response, maxResponseBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    await cancelResponseBody(response);
    throw new Error('MCP response exceeds size limit');
  }

  if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxResponseBytes) {
        await cancelResponseBody(response);
        throw new Error('MCP response exceeds size limit');
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const bytes = Buffer.from(value);
        total += bytes.length;
        if (total > maxResponseBytes) {
          try { await reader.cancel(); } catch {}
          throw new Error('MCP response exceeds size limit');
        }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      try { reader.releaseLock?.(); } catch {}
    }
  }

  throw new Error('MCP response body must support bounded streaming reads');
}

async function readRpcResponse(response, expectedId, maxResponseBytes) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const text = await readBoundedText(response, maxResponseBytes);

  let body;
  if (contentType.includes('application/json')) {
    try { body = JSON.parse(text); } catch { throw new Error('MCP provider returned invalid JSON'); }
  } else if (contentType.includes('text/event-stream')) {
    body = parseSseJsonRpc(text, expectedId);
  } else {
    throw new Error(`MCP provider requires application/json or text/event-stream response, received ${contentType || 'unknown content type'}`);
  }

  if (!response.ok) throw new Error(body?.error?.message || `MCP HTTP ${response.status}`);
  if (!body || body.jsonrpc !== '2.0' || body.id !== expectedId) throw new Error('MCP JSON-RPC response id mismatch');
  if (body.error) throw new Error(body.error.message || 'MCP JSON-RPC error');
  if (!isObject(body.result)) throw new Error('MCP JSON-RPC response is missing result');
  return body.result;
}

function assertCompleteResult(result, operation) {
  if (result.resultType !== 'complete') {
    if (result.resultType === 'input_required') throw new Error(`MCP ${operation} returned input_required, which is not supported on this path`);
    throw new Error(`MCP ${operation} requires resultType=complete`);
  }
}

function assertCacheHints(result, operation) {
  if (!Number.isInteger(result.ttlMs) || result.ttlMs < 0) throw new Error(`MCP ${operation} requires non-negative integer ttlMs`);
  if (!['private', 'public'].includes(result.cacheScope)) throw new Error(`MCP ${operation} requires cacheScope private or public`);
}

function containsHeaderAnnotation(value) {
  if (Array.isArray(value)) return value.some(containsHeaderAnnotation);
  if (!isObject(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'x-mcp-header')) return true;
  return Object.values(value).some(containsHeaderAnnotation);
}

export function analyzeMcpToolDefinition(tool) {
  if (!isObject(tool) || typeof tool.name !== 'string' || tool.name.trim().length === 0) {
    return { ok: false, reason: 'tool name must be a non-empty string' };
  }
  if (!isObject(tool.inputSchema)) return { ok: false, reason: 'inputSchema must be an object' };

  const bindings = [];
  const headerNames = new Set();
  let invalidReason = null;

  function visitProperty(schema, path) {
    if (invalidReason || !isObject(schema)) return;
    if (Object.prototype.hasOwnProperty.call(schema, 'x-mcp-header')) {
      const headerName = schema['x-mcp-header'];
      if (typeof headerName !== 'string' || !HEADER_TOKEN.test(headerName)) {
        invalidReason = `invalid x-mcp-header at ${path.join('.')}`;
        return;
      }
      if (!HEADER_TYPES.has(schema.type)) {
        invalidReason = `x-mcp-header at ${path.join('.')} requires string, integer, or boolean type`;
        return;
      }
      const folded = headerName.toLowerCase();
      if (headerNames.has(folded)) {
        invalidReason = `duplicate x-mcp-header name ${headerName}`;
        return;
      }
      headerNames.add(folded);
      bindings.push({ path: [...path], headerName, type: schema.type });
    }

    for (const [key, value] of Object.entries(schema)) {
      if (key === 'properties') {
        if (!isObject(value)) continue;
        for (const [name, child] of Object.entries(value)) visitProperty(child, [...path, name]);
        continue;
      }
      if (key === 'x-mcp-header') continue;
      if (containsHeaderAnnotation(value)) {
        invalidReason = `x-mcp-header at ${path.join('.')} is not statically reachable through properties`;
        return;
      }
    }
  }

  if (isObject(tool.inputSchema.properties)) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) visitProperty(schema, [name]);
  }
  for (const [key, value] of Object.entries(tool.inputSchema)) {
    if (key === 'properties') continue;
    if (containsHeaderAnnotation(value)) {
      invalidReason = 'x-mcp-header is not statically reachable through properties';
      break;
    }
  }

  if (invalidReason) return { ok: false, reason: invalidReason };
  return { ok: true, tool, headerBindings: bindings };
}

function readPath(object, path) {
  let value = object;
  for (const key of path) {
    if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, key)) return { present: false, value: undefined };
    value = value[key];
  }
  return { present: true, value };
}

function encodeBindingValue(binding, value) {
  if (binding.type === 'string') {
    if (typeof value !== 'string') throw new Error(`MCP header parameter ${binding.path.join('.')} must be a string`);
    return encodeMcpHeaderValue(value);
  }
  if (binding.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`MCP header parameter ${binding.path.join('.')} must be a boolean`);
    return String(value);
  }
  if (!Number.isSafeInteger(value)) throw new Error(`MCP header parameter ${binding.path.join('.')} must be a safe integer`);
  return String(value);
}

export function mcpParamHeaders(tool, argumentsValue) {
  const analyzed = analyzeMcpToolDefinition(tool);
  if (!analyzed.ok) throw new Error(`Invalid MCP tool definition ${tool?.name || '<unknown>'}: ${analyzed.reason}`);
  const args = argumentsValue === undefined ? {} : argumentsValue;
  if (!isObject(args)) throw new Error('MCP tool arguments must be an object');
  const headers = {};
  for (const binding of analyzed.headerBindings) {
    const resolved = readPath(args, binding.path);
    if (!resolved.present) continue;
    headers[`mcp-param-${binding.headerName}`] = encodeBindingValue(binding, resolved.value);
  }
  return headers;
}

function outputFromToolResult(result) {
  if (Object.prototype.hasOwnProperty.call(result, 'structuredContent')) return result.structuredContent;
  const textItems = result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string');
  if (textItems.length === result.content.length) return textItems.map((item) => item.text).join('\n');
  return result.content;
}

function errorText(result) {
  const text = Array.isArray(result?.content)
    ? result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text).join('\n').trim()
    : '';
  return text || 'MCP tool returned an error';
}

export function createMcpHttpClient({
  endpoint,
  apiKey,
  authMode = apiKey ? 'bearer' : 'none',
  clientName = 'truyn-mcp-importer',
  clientVersion = '0.1.0',
  clientCapabilities = {},
  maxResponseBytes = MAX_RESPONSE_BYTES,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('MCP endpoint is required');
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!['none', 'bearer'].includes(authMode)) throw new Error(`Unsupported MCP auth mode: ${authMode}`);
  if (authMode === 'bearer' && !apiKey) throw new Error('MCP bearer auth requires an API key');
  if (!isObject(clientCapabilities)) throw new Error('MCP clientCapabilities must be an object');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new Error('MCP maxResponseBytes must be a positive safe integer');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error('MCP requestTimeoutMs must be a positive safe integer');
  let requestCounter = 0;

  async function request(method, params = {}, { name = null, extraHeaders = {} } = {}) {
    const id = `truyn-mcp-${Date.now()}-${++requestCounter}`;
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_CURRENT_PROTOCOL_VERSION,
      'mcp-method': method,
      ...(name === null ? {} : { 'mcp-name': encodeMcpHeaderValue(name) }),
      ...extraHeaders
    };
    if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;

    const controller = new AbortController();
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        const error = new Error(`MCP ${method} request timed out`);
        error.code = 'MCP_REQUEST_TIMEOUT';
        reject(error);
      }, requestTimeoutMs);
    });

    const operationPromise = (async () => {
      const response = await fetchImpl(normalizedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params: {
            ...params,
            _meta: modernMeta({ clientName, clientVersion, clientCapabilities })
          }
        }),
        redirect: 'error',
        signal: controller.signal
      });
      return readRpcResponse(response, id, maxResponseBytes);
    })();

    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    protocolVersion: MCP_CURRENT_PROTOCOL_VERSION,
    endpoint: normalizedEndpoint,
    async discover() {
      const result = await request('server/discover');
      assertCompleteResult(result, 'server/discover');
      assertCacheHints(result, 'server/discover');
      if (!Array.isArray(result.supportedVersions) || !result.supportedVersions.includes(MCP_CURRENT_PROTOCOL_VERSION)) {
        throw new Error(`Remote MCP server does not advertise ${MCP_CURRENT_PROTOCOL_VERSION}`);
      }
      if (!isObject(result.capabilities?.tools)) throw new Error('Remote MCP server does not advertise tools capability');
      return result;
    },
    async listTools({ cursor } = {}) {
      const result = await request('tools/list', cursor === undefined ? {} : { cursor });
      assertCompleteResult(result, 'tools/list');
      assertCacheHints(result, 'tools/list');
      if (!Array.isArray(result.tools)) throw new Error('MCP tools/list result requires tools array');
      if (result.nextCursor !== undefined && result.nextCursor !== null && typeof result.nextCursor !== 'string') {
        throw new Error('MCP tools/list nextCursor must be a string when present');
      }
      return result;
    },
    async listAllTools({ maxPages = 16, maxTools = 512 } = {}) {
      if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be a positive integer');
      if (!Number.isInteger(maxTools) || maxTools < 1) throw new Error('maxTools must be a positive integer');
      const tools = [];
      const seenNames = new Set();
      const seenCursors = new Set();
      const cacheHints = [];
      let cursor;
      let pages = 0;
      while (true) {
        if (pages >= maxPages) throw new Error('MCP tools/list exceeded page limit');
        const result = await this.listTools({ cursor });
        pages += 1;
        cacheHints.push({ ttlMs: result.ttlMs, cacheScope: result.cacheScope });
        for (const tool of result.tools) {
          if (!isObject(tool) || typeof tool.name !== 'string' || !tool.name.trim()) throw new Error('MCP tools/list returned an invalid tool name');
          if (seenNames.has(tool.name)) throw new Error(`MCP tools/list returned duplicate tool name: ${tool.name}`);
          seenNames.add(tool.name);
          tools.push(tool);
          if (tools.length > maxTools) throw new Error('MCP tools/list exceeded tool limit');
        }
        if (!result.nextCursor) break;
        if (seenCursors.has(result.nextCursor)) throw new Error('MCP tools/list repeated a cursor');
        seenCursors.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      return { tools, pages, cacheHints };
    },
    async callTool(tool, args = {}) {
      const result = await request('tools/call', { name: tool.name, arguments: args }, {
        name: tool.name,
        extraHeaders: mcpParamHeaders(tool, args)
      });
      assertCompleteResult(result, `tools/call ${tool.name}`);
      if (!Array.isArray(result.content)) throw new Error('MCP modern tool response requires content array');
      if (result.isError) throw new Error(errorText(result).slice(0, 500));
      return {
        output: outputFromToolResult(result),
        metadata: {
          provider: 'mcp-http-discovered',
          tool: tool.name,
          usage: result._meta?.usage || null
        }
      };
    }
  };
}
