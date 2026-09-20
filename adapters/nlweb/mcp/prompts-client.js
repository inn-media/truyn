import { encodeMcpHeaderValue } from './http-headers.js';
import {
  MCP_CLIENT_CAPABILITIES_META_KEY,
  MCP_CLIENT_INFO_META_KEY,
  MCP_CURRENT_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_META_KEY,
  MCP_SERVER_INFO_META_KEY
} from './client.js';

export const MCP_SUBSCRIPTION_ID_META_KEY = 'io.modelcontextprotocol/subscriptionId';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PROMPT_PAGES = 16;
const DEFAULT_MAX_PROMPTS = 512;
const DEFAULT_MAX_PROMPT_ARGUMENTS = 64;
const DEFAULT_MAX_SUBSCRIPTION_EVENT_BYTES = 256 * 1024;
const DEFAULT_MAX_SUBSCRIPTION_EVENTS = 4096;
const DEFAULT_MAX_MRTR_BYTES = 256 * 1024;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, label, maxLength = 8192, { allowEmpty = false, controls = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new Error(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string up to ${maxLength} characters`);
  }
  if (!controls && /\p{Cc}/u.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}

function boundedJson(value, label, maxBytes = DEFAULT_MAX_MRTR_BYTES) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw new Error(`${label} must be JSON-serializable`); }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new Error(`${label} exceeds size limit`);
  return structuredClone(value);
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
    throw new Error(`MCP prompt request requires application/json response, received ${contentType || 'unknown content type'}`);
  }
  const text = await readBoundedText(response, maxResponseBytes);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error('MCP prompt provider returned invalid JSON'); }
  if (!response.ok) throw new Error(body?.error?.message || `MCP HTTP ${response.status}`);
  if (!body || body.jsonrpc !== '2.0' || body.id !== expectedId) throw new Error('MCP prompt JSON-RPC response id mismatch');
  if (body.error) throw new Error(body.error.message || 'MCP prompt JSON-RPC error');
  if (!isObject(body.result)) throw new Error('MCP prompt JSON-RPC response is missing result');
  return body.result;
}

function assertComplete(result, operation) {
  if (!isObject(result) || result.resultType !== 'complete') throw new Error(`MCP ${operation} requires resultType=complete`);
}

function assertCacheHints(result, operation) {
  if (!Number.isSafeInteger(result.ttlMs) || result.ttlMs < 0) throw new Error(`MCP ${operation} requires non-negative integer ttlMs`);
  if (!['private', 'public'].includes(result.cacheScope)) throw new Error(`MCP ${operation} requires cacheScope private or public`);
}

function validateCursor(result, operation) {
  if (result.nextCursor !== undefined && result.nextCursor !== null && typeof result.nextCursor !== 'string') {
    throw new Error(`MCP ${operation} nextCursor must be a string when present`);
  }
}

export function normalizeMcpPromptName(value) {
  return boundedString(value, 'MCP prompt name', 1024);
}

function normalizePromptArguments(argumentsValue = {}) {
  if (!isObject(argumentsValue)) throw new Error('MCP prompt arguments must be an object');
  const entries = Object.entries(argumentsValue);
  if (entries.length > DEFAULT_MAX_PROMPT_ARGUMENTS) throw new Error('MCP prompt arguments exceed argument limit');
  const normalized = {};
  for (const [name, value] of entries) {
    const normalizedName = boundedString(name, 'MCP prompt argument name', 256);
    if (typeof value !== 'string' || value.length > 64 * 1024) throw new Error(`MCP prompt argument ${normalizedName} must be a bounded string`);
    normalized[normalizedName] = value;
  }
  return normalized;
}

function validatePromptArgument(argument) {
  if (!isObject(argument)) throw new Error('MCP prompts/list returned a non-object prompt argument');
  const normalized = { name: boundedString(argument.name, 'MCP prompt argument name', 256) };
  if (argument.title !== undefined) normalized.title = boundedString(argument.title, 'MCP prompt argument title', 1024, { controls: true });
  if (argument.description !== undefined) normalized.description = boundedString(argument.description, 'MCP prompt argument description', 8192, { allowEmpty: true, controls: true });
  if (argument.required !== undefined) {
    if (typeof argument.required !== 'boolean') throw new Error('MCP prompt argument required must be boolean');
    normalized.required = argument.required;
  }
  return Object.freeze(normalized);
}

function validateIcon(icon) {
  if (!isObject(icon)) throw new Error('MCP prompt icon must be an object');
  const normalized = { src: boundedString(icon.src, 'MCP prompt icon src', 8192) };
  if (icon.mimeType !== undefined) normalized.mimeType = boundedString(icon.mimeType, 'MCP prompt icon mimeType', 512);
  if (icon.theme !== undefined) normalized.theme = boundedString(icon.theme, 'MCP prompt icon theme', 64);
  if (icon.sizes !== undefined) {
    if (!Array.isArray(icon.sizes) || icon.sizes.length > 32) throw new Error('MCP prompt icon sizes must be a bounded array');
    normalized.sizes = icon.sizes.map((size) => boundedString(size, 'MCP prompt icon size', 64));
  }
  return Object.freeze(normalized);
}

function validatePromptDescriptor(prompt) {
  if (!isObject(prompt)) throw new Error('MCP prompts/list returned a non-object prompt');
  const normalized = { name: normalizeMcpPromptName(prompt.name) };
  if (prompt.title !== undefined) normalized.title = boundedString(prompt.title, 'MCP prompt title', 1024, { controls: true });
  if (prompt.description !== undefined) normalized.description = boundedString(prompt.description, 'MCP prompt description', 8192, { allowEmpty: true, controls: true });
  if (prompt.arguments !== undefined) {
    if (!Array.isArray(prompt.arguments) || prompt.arguments.length > DEFAULT_MAX_PROMPT_ARGUMENTS) throw new Error('MCP prompt descriptor arguments must be a bounded array');
    const seen = new Set();
    normalized.arguments = prompt.arguments.map((argument) => {
      const value = validatePromptArgument(argument);
      if (seen.has(value.name)) throw new Error(`MCP prompt descriptor has duplicate argument name: ${value.name}`);
      seen.add(value.name);
      return value;
    });
  }
  if (prompt.icons !== undefined) {
    if (!Array.isArray(prompt.icons) || prompt.icons.length > 16) throw new Error('MCP prompt icons must be a bounded array');
    normalized.icons = prompt.icons.map(validateIcon);
  }
  if (prompt._meta !== undefined) normalized._meta = boundedJson(prompt._meta, 'MCP prompt descriptor _meta', 64 * 1024);
  return Object.freeze(normalized);
}

function validateGetPromptResult(result) {
  if (!isObject(result)) throw new Error('MCP prompts/get result must be an object');
  if (result.resultType === 'input_required') {
    const normalized = { resultType: 'input_required' };
    if (result.inputRequests !== undefined) {
      if (!isObject(result.inputRequests) || Object.keys(result.inputRequests).length > 64) throw new Error('MCP prompts/get inputRequests must be a bounded object');
      normalized.inputRequests = boundedJson(result.inputRequests, 'MCP prompts/get inputRequests');
    }
    if (result.requestState !== undefined) normalized.requestState = boundedJson(result.requestState, 'MCP prompts/get requestState');
    if (result._meta !== undefined) normalized._meta = boundedJson(result._meta, 'MCP prompts/get _meta', 64 * 1024);
    if (normalized.inputRequests === undefined && normalized.requestState === undefined) {
      throw new Error('MCP prompts/get input_required requires inputRequests or requestState');
    }
    return Object.freeze(normalized);
  }
  if (result.resultType !== 'complete') throw new Error('MCP prompts/get requires resultType=complete or input_required');
  if (!Array.isArray(result.messages)) throw new Error('MCP prompts/get complete result requires messages array');
  if (result.messages.length > 128) throw new Error('MCP prompts/get exceeded message limit');
  const normalized = {
    resultType: 'complete',
    messages: boundedJson(result.messages, 'MCP prompts/get messages', DEFAULT_MAX_RESPONSE_BYTES)
  };
  if (result.description !== undefined) normalized.description = boundedString(result.description, 'MCP prompts/get description', 8192, { allowEmpty: true, controls: true });
  if (result._meta !== undefined) normalized._meta = boundedJson(result._meta, 'MCP prompts/get _meta', 64 * 1024);
  return Object.freeze(normalized);
}

function sseData(frame) {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

async function* iterateSseMessages(response, maxEventBytes) {
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') throw new Error('MCP subscription response body must be an async iterable');
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
}

export function createMcpPromptHttpClient({
  endpoint,
  apiKey,
  authMode = apiKey ? 'bearer' : 'none',
  clientName = 'truyn-mcp-prompt-importer',
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
    const id = `truyn-mcp-prompt-${Date.now()}-${++requestCounter}`;
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
      if (!isObject(result.capabilities?.prompts)) throw new Error('Remote MCP server does not advertise prompts capability');
      return result;
    },
    async listPrompts({ cursor } = {}) {
      const result = await request('prompts/list', cursor === undefined ? {} : { cursor });
      assertComplete(result, 'prompts/list');
      assertCacheHints(result, 'prompts/list');
      if (!Array.isArray(result.prompts)) throw new Error('MCP prompts/list requires prompts array');
      validateCursor(result, 'prompts/list');
      return Object.freeze({ ...result, prompts: Object.freeze(result.prompts.map(validatePromptDescriptor)) });
    },
    async listAllPrompts({ maxPages = DEFAULT_MAX_PROMPT_PAGES, maxPrompts = DEFAULT_MAX_PROMPTS } = {}) {
      if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be a positive integer');
      if (!Number.isInteger(maxPrompts) || maxPrompts < 1) throw new Error('maxPrompts must be a positive integer');
      const prompts = [];
      const seenNames = new Set();
      const seenCursors = new Set();
      const cacheHints = [];
      let cursor;
      let pages = 0;
      while (true) {
        if (pages >= maxPages) throw new Error('MCP prompts/list exceeded page limit');
        const page = await this.listPrompts({ cursor });
        pages += 1;
        cacheHints.push({ ttlMs: page.ttlMs, cacheScope: page.cacheScope });
        for (const prompt of page.prompts) {
          if (seenNames.has(prompt.name)) throw new Error(`MCP prompts/list returned duplicate prompt name: ${prompt.name}`);
          seenNames.add(prompt.name);
          prompts.push(prompt);
          if (prompts.length > maxPrompts) throw new Error('MCP prompts/list exceeded prompt limit');
        }
        if (!page.nextCursor) break;
        if (seenCursors.has(page.nextCursor)) throw new Error('MCP prompts/list repeated a cursor');
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      return Object.freeze({ prompts: Object.freeze(prompts), pages, cacheHints: Object.freeze(cacheHints) });
    },
    async getPrompt(nameValue, {
      arguments: argumentsValue = {},
      inputResponses,
      requestState
    } = {}) {
      const name = normalizeMcpPromptName(nameValue);
      const params = { name, arguments: normalizePromptArguments(argumentsValue) };
      if (inputResponses !== undefined) {
        if (!isObject(inputResponses) || Object.keys(inputResponses).length > 64) throw new Error('MCP prompt inputResponses must be a bounded object');
        params.inputResponses = boundedJson(inputResponses, 'MCP prompt inputResponses');
      }
      if (requestState !== undefined) params.requestState = boundedJson(requestState, 'MCP prompt requestState');
      const result = await request('prompts/get', params, { name });
      return validateGetPromptResult(result);
    },
    async *listenPromptListChanges({
      signal,
      maxEvents = DEFAULT_MAX_SUBSCRIPTION_EVENTS,
      maxEventBytes = DEFAULT_MAX_SUBSCRIPTION_EVENT_BYTES
    } = {}) {
      if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error('maxEvents must be a positive safe integer');
      if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1) throw new Error('maxEventBytes must be a positive safe integer');
      const id = `truyn-mcp-prompt-listen-${Date.now()}-${++requestCounter}`;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener?.('abort', onAbort, { once: true });
      let connectTimeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetchImpl(normalizedEndpoint, {
          method: 'POST',
          headers: headersFor('subscriptions/listen'),
          body: requestBody(id, 'subscriptions/listen', { notifications: { promptsListChanged: true } }),
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
        let honored = false;
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
            if (message.params?._meta?.[MCP_SUBSCRIPTION_ID_META_KEY] !== id) throw new Error('MCP subscription acknowledgement id mismatch');
            honored = message.params?.notifications?.promptsListChanged === true;
            if (!honored) throw new Error('MCP subscription did not honor promptsListChanged');
            acknowledged = true;
            continue;
          }
          if (message.method !== 'notifications/prompts/list_changed') continue;
          if (!acknowledged || !honored) throw new Error('MCP prompt list change arrived before subscription acknowledgement');
          if (message.params?._meta?.[MCP_SUBSCRIPTION_ID_META_KEY] !== id) throw new Error('MCP prompt list change subscription id mismatch');
          delivered += 1;
          if (delivered > maxEvents) throw new Error('MCP prompt subscription exceeded event limit');
          yield Object.freeze({ type: 'prompts_list_changed', subscriptionId: id });
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
