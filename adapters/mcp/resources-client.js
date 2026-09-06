import { encodeMcpHeaderValue } from './http-headers.js';
import {
  MCP_CLIENT_CAPABILITIES_META_KEY,
  MCP_CLIENT_INFO_META_KEY,
  MCP_CURRENT_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_META_KEY,
  MCP_SERVER_INFO_META_KEY
} from './client.js';
import { normalizeMcpResourceUri } from './resource-runtime.js';

export const MCP_SUBSCRIPTION_ID_META_KEY = 'io.modelcontextprotocol/subscriptionId';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SUBSCRIPTION_EVENT_BYTES = 256 * 1024;
const DEFAULT_MAX_SUBSCRIPTION_EVENTS = 4096;
const DEFAULT_MAX_RESOURCE_PAGES = 16;
const DEFAULT_MAX_RESOURCES = 512;
const DEFAULT_MAX_TEMPLATES = 512;

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

function assertComplete(result, operation) {
  if (!isObject(result) || result.resultType !== 'complete') throw new Error(`MCP ${operation} requires resultType=complete`);
}

function assertCacheHints(result, operation) {
  if (!Number.isSafeInteger(result.ttlMs) || result.ttlMs < 0) throw new Error(`MCP ${operation} requires non-negative integer ttlMs`);
  if (!['private', 'public'].includes(result.cacheScope)) throw new Error(`MCP ${operation} requires cacheScope private or public`);
}

async function cancelBody(response) {
  try { await response?.body?.cancel?.(); } catch {}
}

async function readBoundedText(response, maxResponseBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    await cancelBody(response);
    throw new Error('MCP response exceeds size limit');
  }
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    throw new Error('MCP response body must support bounded streaming reads');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxResponseBytes) {
      await cancelBody(response);
      throw new Error('MCP response exceeds size limit');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonRpcResponse(response, expectedId, maxResponseBytes) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    await cancelBody(response);
    throw new Error(`MCP resource request requires application/json response, received ${contentType || 'unknown content type'}`);
  }
  const text = await readBoundedText(response, maxResponseBytes);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error('MCP resource provider returned invalid JSON'); }
  if (!response.ok) throw new Error(body?.error?.message || `MCP HTTP ${response.status}`);
  if (!body || body.jsonrpc !== '2.0' || body.id !== expectedId) throw new Error('MCP resource JSON-RPC response id mismatch');
  if (body.error) throw new Error(body.error.message || 'MCP resource JSON-RPC error');
  if (!isObject(body.result)) throw new Error('MCP resource JSON-RPC response is missing result');
  return body.result;
}

function validateCursor(result, operation) {
  if (result.nextCursor !== undefined && result.nextCursor !== null && typeof result.nextCursor !== 'string') {
    throw new Error(`MCP ${operation} nextCursor must be a string when present`);
  }
}

function validateResource(resource) {
  if (!isObject(resource)) throw new Error('MCP resources/list returned a non-object resource');
  const uri = normalizeMcpResourceUri(resource.uri);
  if (typeof resource.name !== 'string' || !resource.name.trim() || resource.name.length > 1024) {
    throw new Error('MCP resources/list returned an invalid resource name');
  }
  if (resource.mimeType !== undefined && (typeof resource.mimeType !== 'string' || resource.mimeType.length > 512)) {
    throw new Error('MCP resources/list returned an invalid mimeType');
  }
  if (resource.size !== undefined && (!Number.isSafeInteger(resource.size) || resource.size < 0)) {
    throw new Error('MCP resources/list returned an invalid size');
  }
  return Object.freeze({ ...structuredClone(resource), uri });
}

function validateResourceTemplate(template) {
  if (!isObject(template)) throw new Error('MCP resources/templates/list returned a non-object template');
  if (typeof template.name !== 'string' || !template.name.trim() || template.name.length > 1024) {
    throw new Error('MCP resource template requires a non-empty name');
  }
  if (typeof template.uriTemplate !== 'string' || !template.uriTemplate.trim() || template.uriTemplate.length > 8192) {
    throw new Error('MCP resource template requires a bounded uriTemplate');
  }
  if (/\p{Cc}/u.test(template.uriTemplate)) throw new Error('MCP resource template must not contain control characters');
  return Object.freeze(structuredClone(template));
}

function validateReadResult(result, requestedUri) {
  assertComplete(result, 'resources/read');
  assertCacheHints(result, 'resources/read');
  if (!Array.isArray(result.contents) || result.contents.length < 1) throw new Error('MCP resources/read requires non-empty contents');
  for (const content of result.contents) {
    if (!isObject(content)) throw new Error('MCP resources/read content entries must be objects');
    if (normalizeMcpResourceUri(content.uri) !== requestedUri) throw new Error('MCP resources/read content URI mismatch');
    const hasText = Object.prototype.hasOwnProperty.call(content, 'text');
    const hasBlob = Object.prototype.hasOwnProperty.call(content, 'blob');
    if (hasText === hasBlob) throw new Error('MCP resource content must contain exactly one of text or blob');
  }
  return result;
}

function sseData(frame) {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

async function* iterateSseMessages(response, maxEventBytes) {
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    throw new Error('MCP subscription response body must be an async iterable');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (Buffer.byteLength(frame, 'utf8') > maxEventBytes) throw new Error('MCP subscription event exceeds size limit');
      const data = sseData(frame);
      if (!data) continue;
      let message;
      try { message = JSON.parse(data); } catch { throw new Error('MCP subscription returned invalid JSON'); }
      yield message;
    }
    if (Buffer.byteLength(buffer, 'utf8') > maxEventBytes) throw new Error('MCP subscription event exceeds size limit');
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    if (Buffer.byteLength(buffer, 'utf8') > maxEventBytes) throw new Error('MCP subscription event exceeds size limit');
    const data = sseData(buffer);
    if (data) {
      let message;
      try { message = JSON.parse(data); } catch { throw new Error('MCP subscription returned invalid JSON'); }
      yield message;
    }
  }
}

function normalizeSubscriptionUris(values) {
  if (!Array.isArray(values) || values.length < 1) throw new Error('MCP resource subscription requires at least one URI');
  if (values.length > 256) throw new Error('MCP resource subscription exceeds URI limit');
  const uris = values.map(normalizeMcpResourceUri);
  if (new Set(uris).size !== uris.length) throw new Error('MCP resource subscription contains duplicate URIs');
  return uris;
}

export function createMcpResourceHttpClient({
  endpoint,
  apiKey,
  authMode = apiKey ? 'bearer' : 'none',
  clientName = 'truyn-mcp-resource-importer',
  clientVersion = '0.1.0',
  clientCapabilities = {},
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!['none', 'bearer'].includes(authMode)) throw new Error(`Unsupported MCP auth mode: ${authMode}`);
  if (authMode === 'bearer' && !apiKey) throw new Error('MCP bearer auth requires an API key');
  if (!isObject(clientCapabilities)) throw new Error('MCP clientCapabilities must be an object');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new Error('maxResponseBytes must be a positive safe integer');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error('requestTimeoutMs must be a positive safe integer');
  let requestCounter = 0;

  function headersFor(method, name = null) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_CURRENT_PROTOCOL_VERSION,
      'mcp-method': method,
      ...(name === null ? {} : { 'mcp-name': encodeMcpHeaderValue(name) })
    };
    if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;
    return headers;
  }

  function requestBody(id, method, params = {}) {
    return JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: modernMeta({ clientName, clientVersion, clientCapabilities })
      }
    });
  }

  async function request(method, params = {}, { name = null } = {}) {
    const id = `truyn-mcp-resource-${Date.now()}-${++requestCounter}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(normalizedEndpoint, {
        method: 'POST',
        headers: headersFor(method, name),
        body: requestBody(id, method, params),
        redirect: 'error',
        signal: controller.signal
      });
      return await readJsonRpcResponse(response, id, maxResponseBytes);
    } catch (error) {
      if (controller.signal.aborted && error?.name === 'AbortError') {
        const timeoutError = new Error(`MCP ${method} request timed out`);
        timeoutError.code = 'MCP_REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    protocolVersion: MCP_CURRENT_PROTOCOL_VERSION,
    endpoint: normalizedEndpoint,
    async discover() {
      const result = await request('server/discover');
      assertComplete(result, 'server/discover');
      assertCacheHints(result, 'server/discover');
      if (!Array.isArray(result.supportedVersions) || !result.supportedVersions.includes(MCP_CURRENT_PROTOCOL_VERSION)) {
        throw new Error(`Remote MCP server does not advertise ${MCP_CURRENT_PROTOCOL_VERSION}`);
      }
      if (!isObject(result.capabilities?.resources)) throw new Error('Remote MCP server does not advertise resources capability');
      return result;
    },
    async listResources({ cursor } = {}) {
      const result = await request('resources/list', cursor === undefined ? {} : { cursor });
      assertComplete(result, 'resources/list');
      assertCacheHints(result, 'resources/list');
      if (!Array.isArray(result.resources)) throw new Error('MCP resources/list requires resources array');
      validateCursor(result, 'resources/list');
      return Object.freeze({ ...result, resources: Object.freeze(result.resources.map(validateResource)) });
    },
    async listAllResources({ maxPages = DEFAULT_MAX_RESOURCE_PAGES, maxResources = DEFAULT_MAX_RESOURCES } = {}) {
      if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be a positive integer');
      if (!Number.isInteger(maxResources) || maxResources < 1) throw new Error('maxResources must be a positive integer');
      const resources = [];
      const seenUris = new Set();
      const seenCursors = new Set();
      const cacheHints = [];
      let cursor;
      let pages = 0;
      while (true) {
        if (pages >= maxPages) throw new Error('MCP resources/list exceeded page limit');
        const page = await this.listResources({ cursor });
        pages += 1;
        cacheHints.push({ ttlMs: page.ttlMs, cacheScope: page.cacheScope });
        for (const resource of page.resources) {
          if (seenUris.has(resource.uri)) throw new Error(`MCP resources/list returned duplicate URI: ${resource.uri}`);
          seenUris.add(resource.uri);
          resources.push(resource);
          if (resources.length > maxResources) throw new Error('MCP resources/list exceeded resource limit');
        }
        if (!page.nextCursor) break;
        if (seenCursors.has(page.nextCursor)) throw new Error('MCP resources/list repeated a cursor');
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      return Object.freeze({ resources: Object.freeze(resources), pages, cacheHints: Object.freeze(cacheHints) });
    },
    async listResourceTemplates({ cursor } = {}) {
      const result = await request('resources/templates/list', cursor === undefined ? {} : { cursor });
      assertComplete(result, 'resources/templates/list');
      assertCacheHints(result, 'resources/templates/list');
      if (!Array.isArray(result.resourceTemplates)) throw new Error('MCP resources/templates/list requires resourceTemplates array');
      validateCursor(result, 'resources/templates/list');
      if (result.resourceTemplates.length > DEFAULT_MAX_TEMPLATES) throw new Error('MCP resources/templates/list exceeded template limit');
      return Object.freeze({ ...result, resourceTemplates: Object.freeze(result.resourceTemplates.map(validateResourceTemplate)) });
    },
    async readResource(resourceUriValue) {
      const resourceUri = normalizeMcpResourceUri(resourceUriValue);
      const result = await request('resources/read', { uri: resourceUri }, { name: resourceUri });
      return validateReadResult(result, resourceUri);
    },
    async *listenResourceUpdates(resourceUris, {
      signal,
      maxEvents = DEFAULT_MAX_SUBSCRIPTION_EVENTS,
      maxEventBytes = DEFAULT_MAX_SUBSCRIPTION_EVENT_BYTES
    } = {}) {
      const requestedUris = normalizeSubscriptionUris(resourceUris);
      if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error('maxEvents must be a positive safe integer');
      if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1) throw new Error('maxEventBytes must be a positive safe integer');
      const id = `truyn-mcp-listen-${Date.now()}-${++requestCounter}`;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener?.('abort', onAbort, { once: true });
      let connectTimeout;
      try {
        connectTimeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        const response = await fetchImpl(normalizedEndpoint, {
          method: 'POST',
          headers: headersFor('subscriptions/listen'),
          body: requestBody(id, 'subscriptions/listen', {
            notifications: { resourceSubscriptions: requestedUris }
          }),
          redirect: 'error',
          signal: controller.signal
        });
        clearTimeout(connectTimeout);
        connectTimeout = null;
        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (!response.ok) {
          const text = await readBoundedText(response, maxResponseBytes);
          let body = null;
          try { body = JSON.parse(text); } catch {}
          throw new Error(body?.error?.message || `MCP subscriptions/listen HTTP ${response.status}`);
        }
        if (!contentType.includes('text/event-stream')) {
          await cancelBody(response);
          throw new Error('MCP subscriptions/listen requires text/event-stream response');
        }

        let acknowledged = false;
        let honoredUris = null;
        let delivered = 0;
        for await (const message of iterateSseMessages(response, maxEventBytes)) {
          if (!message || message.jsonrpc !== '2.0') throw new Error('MCP subscription returned invalid JSON-RPC');
          if (message.id === id) {
            if (message.error) throw new Error(message.error.message || 'MCP subscriptions/listen failed');
            if (isObject(message.result)) return;
            throw new Error('MCP subscriptions/listen returned malformed terminal result');
          }
          if (message.method === 'notifications/subscriptions/acknowledged') {
            if (acknowledged) throw new Error('MCP subscriptions/listen acknowledged more than once');
            const subscriptionId = message.params?._meta?.[MCP_SUBSCRIPTION_ID_META_KEY];
            if (subscriptionId !== id) throw new Error('MCP subscription acknowledgement id mismatch');
            const honored = message.params?.notifications?.resourceSubscriptions;
            if (!Array.isArray(honored)) throw new Error('MCP subscription acknowledgement missing resourceSubscriptions');
            honoredUris = new Set(honored.map(normalizeMcpResourceUri));
            for (const uri of honoredUris) {
              if (!requestedUris.includes(uri)) throw new Error('MCP subscription acknowledged an unrequested resource URI');
            }
            acknowledged = true;
            continue;
          }
          if (message.method !== 'notifications/resources/updated') continue;
          if (!acknowledged || !honoredUris) throw new Error('MCP resource update arrived before subscription acknowledgement');
          const subscriptionId = message.params?._meta?.[MCP_SUBSCRIPTION_ID_META_KEY];
          if (subscriptionId !== id) throw new Error('MCP resource update subscription id mismatch');
          const uri = normalizeMcpResourceUri(message.params?.uri);
          if (!honoredUris.has(uri)) throw new Error('MCP resource update URI was not honored by the subscription');
          delivered += 1;
          if (delivered > maxEvents) throw new Error('MCP resource subscription exceeded event limit');
          yield Object.freeze({ type: 'resource_updated', uri, subscriptionId: id });
        }
      } catch (error) {
        if (controller.signal.aborted && signal?.aborted) return;
        if (controller.signal.aborted && connectTimeout !== null) {
          const timeoutError = new Error('MCP subscriptions/listen connection timed out');
          timeoutError.code = 'MCP_REQUEST_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      } finally {
        if (connectTimeout) clearTimeout(connectTimeout);
        signal?.removeEventListener?.('abort', onAbort);
        controller.abort();
      }
    },
    serverInfoFrom(discovery) {
      return isObject(discovery?._meta?.[MCP_SERVER_INFO_META_KEY])
        ? structuredClone(discovery._meta[MCP_SERVER_INFO_META_KEY])
        : null;
    }
  });
}
