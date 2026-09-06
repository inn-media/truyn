import { createHash } from 'node:crypto';
import { normalizeMcpResourceUri } from './resource-runtime.js';
import { normalizeMcpPromptName } from './prompts-client.js';

export const MCP_PROMPT_OBJECT_PROFILE = 'mcp-prompt-object/v1';
export const DEFAULT_MAX_MCP_PROMPT_BYTES = 1024 * 1024;
export const DEFAULT_MAX_MCP_PROMPT_MESSAGES = 128;
export const DEFAULT_MAX_MCP_PROMPT_ARGUMENTS = 64;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedString(value, label, maxLength = 8192, { allowEmpty = false, controls = true } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new Error(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string up to ${maxLength} characters`);
  }
  if (!controls && /\p{Cc}/u.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}

function strictBase64(value, label, maxBytes) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} requires non-empty base64`);
  if (value.length > Math.ceil(maxBytes * 4 / 3) + 16) throw new Error(`${label} exceeds encoded size limit`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error(`${label} must use canonical base64`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maxBytes) throw new Error(`${label} exceeds size limit`);
  if (value.replace(/=+$/, '') !== bytes.toString('base64').replace(/=+$/, '')) throw new Error(`${label} must use valid base64`);
  return bytes.toString('base64');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = stableValue(value[key]);
  return output;
}

function stableBytes(value) {
  return Buffer.from(JSON.stringify(stableValue(value)), 'utf8');
}

function boundedJson(value, label, maxBytes = 64 * 1024) {
  const bytes = stableBytes(value);
  if (bytes.length > maxBytes) throw new Error(`${label} exceeds size limit`);
  return stableValue(structuredClone(value));
}

function normalizeProviderAuthority(value) {
  return boundedString(value, 'MCP prompt provider authority', 4096, { controls: false });
}

function normalizeArguments(argumentsValue = {}) {
  if (!isObject(argumentsValue)) throw new Error('MCP prompt arguments must be an object');
  const entries = Object.entries(argumentsValue);
  if (entries.length > DEFAULT_MAX_MCP_PROMPT_ARGUMENTS) throw new Error('MCP prompt arguments exceed argument limit');
  const normalized = {};
  for (const [name, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const key = boundedString(name, 'MCP prompt argument name', 256, { controls: false });
    if (typeof value !== 'string' || value.length > 64 * 1024) throw new Error(`MCP prompt argument ${key} must be a bounded string`);
    normalized[key] = value;
  }
  return normalized;
}

function normalizeAnnotations(value) {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('MCP prompt annotations must be an object');
  return boundedJson(value, 'MCP prompt annotations');
}

function normalizeMeta(value) {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('MCP prompt _meta must be an object');
  return boundedJson(value, 'MCP prompt _meta');
}

function normalizeResourceContents(resource, remainingBytes) {
  if (!isObject(resource)) throw new Error('MCP embedded prompt resource must be an object');
  const uri = normalizeMcpResourceUri(resource.uri);
  const hasText = Object.prototype.hasOwnProperty.call(resource, 'text');
  const hasBlob = Object.prototype.hasOwnProperty.call(resource, 'blob');
  if (hasText === hasBlob) throw new Error('MCP embedded prompt resource must contain exactly one of text or blob');
  const normalized = { uri };
  if (resource.mimeType !== undefined) normalized.mimeType = boundedString(resource.mimeType, 'MCP embedded resource mimeType', 512, { controls: false });
  if (hasText) {
    if (typeof resource.text !== 'string') throw new Error('MCP embedded text resource must be a string');
    if (Buffer.byteLength(resource.text, 'utf8') > remainingBytes) throw new Error('MCP embedded text resource exceeds prompt size limit');
    normalized.text = resource.text;
  } else {
    normalized.blob = strictBase64(resource.blob, 'MCP embedded blob resource', remainingBytes);
  }
  if (resource.annotations !== undefined) normalized.annotations = normalizeAnnotations(resource.annotations);
  if (resource._meta !== undefined) normalized._meta = normalizeMeta(resource._meta);
  return normalized;
}

function normalizeContentBlock(content, remainingBytes) {
  if (!isObject(content) || typeof content.type !== 'string') throw new Error('MCP prompt message content must be a typed object');
  if (content.type === 'text') {
    if (typeof content.text !== 'string') throw new Error('MCP prompt text content requires text');
    if (Buffer.byteLength(content.text, 'utf8') > remainingBytes) throw new Error('MCP prompt text content exceeds size limit');
    const normalized = { type: 'text', text: content.text };
    if (content.annotations !== undefined) normalized.annotations = normalizeAnnotations(content.annotations);
    if (content._meta !== undefined) normalized._meta = normalizeMeta(content._meta);
    return normalized;
  }
  if (content.type === 'image' || content.type === 'audio') {
    const normalized = {
      type: content.type,
      data: strictBase64(content.data, `MCP prompt ${content.type} content`, remainingBytes),
      mimeType: boundedString(content.mimeType, `MCP prompt ${content.type} mimeType`, 512, { controls: false })
    };
    if (content.annotations !== undefined) normalized.annotations = normalizeAnnotations(content.annotations);
    if (content._meta !== undefined) normalized._meta = normalizeMeta(content._meta);
    return normalized;
  }
  if (content.type === 'resource_link') {
    const normalized = {
      type: 'resource_link',
      uri: normalizeMcpResourceUri(content.uri)
    };
    if (content.name !== undefined) normalized.name = boundedString(content.name, 'MCP prompt resource link name', 1024, { controls: true });
    if (content.title !== undefined) normalized.title = boundedString(content.title, 'MCP prompt resource link title', 1024, { controls: true });
    if (content.description !== undefined) normalized.description = boundedString(content.description, 'MCP prompt resource link description', 8192, { allowEmpty: true, controls: true });
    if (content.mimeType !== undefined) normalized.mimeType = boundedString(content.mimeType, 'MCP prompt resource link mimeType', 512, { controls: false });
    if (content.size !== undefined) {
      if (!Number.isSafeInteger(content.size) || content.size < 0) throw new Error('MCP prompt resource link size must be a non-negative safe integer');
      normalized.size = content.size;
    }
    if (content.annotations !== undefined) normalized.annotations = normalizeAnnotations(content.annotations);
    if (content._meta !== undefined) normalized._meta = normalizeMeta(content._meta);
    return normalized;
  }
  if (content.type === 'resource') {
    const normalized = { type: 'resource', resource: normalizeResourceContents(content.resource, remainingBytes) };
    if (content.annotations !== undefined) normalized.annotations = normalizeAnnotations(content.annotations);
    if (content._meta !== undefined) normalized._meta = normalizeMeta(content._meta);
    return normalized;
  }
  throw new Error(`Unsupported MCP prompt content type: ${content.type}`);
}

function normalizeMessages(messages, maxPromptBytes, maxMessages) {
  if (!Array.isArray(messages)) throw new Error('MCP prompts/get complete result requires messages array');
  if (messages.length > maxMessages) throw new Error('MCP prompt exceeds message limit');
  const normalized = [];
  for (const message of messages) {
    if (!isObject(message) || !['user', 'assistant'].includes(message.role)) throw new Error('MCP prompt message role must be user or assistant');
    const content = normalizeContentBlock(message.content, maxPromptBytes);
    normalized.push({ role: message.role, content });
    if (stableBytes(normalized).length > maxPromptBytes) throw new Error('MCP prompt exceeds materialization size limit');
  }
  return normalized;
}

function promptObject({ providerAuthority, promptName, argumentsValue, result, observedAtUnixMs, maxPromptBytes, maxMessages }) {
  if (!isObject(result) || result.resultType !== 'complete') throw new Error('MCP prompt materialization requires resultType=complete');
  const normalizedArguments = normalizeArguments(argumentsValue);
  const payload = {
    profile: MCP_PROMPT_OBJECT_PROFILE,
    promptName,
    arguments: normalizedArguments,
    ...(result.description === undefined ? {} : { description: boundedString(result.description, 'MCP prompt description', 8192, { allowEmpty: true, controls: true }) }),
    messages: normalizeMessages(result.messages, maxPromptBytes, maxMessages)
  };
  if (result._meta !== undefined) payload._meta = normalizeMeta(result._meta);
  const bytes = stableBytes(payload);
  if (bytes.length > maxPromptBytes) throw new Error('MCP prompt exceeds materialization size limit');
  const digest = sha256Hex(bytes);
  const argumentsDigest = sha256Hex(stableBytes(normalizedArguments));
  return Object.freeze({
    type: 'OBJECT',
    profile: MCP_PROMPT_OBJECT_PROFILE,
    objectId: `sha256:${digest}`,
    digestAlgorithm: 'sha256',
    digest,
    contentType: 'application/vnd.truyn.mcp-prompt+json',
    sizeBytes: bytes.length,
    inlineDataBase64: bytes.toString('base64'),
    source: Object.freeze({
      protocol: 'mcp',
      authority: providerAuthority,
      promptName,
      argumentsDigest,
      executionAuthority: false,
      implicitResourceFetch: false
    }),
    createdAtUnixMs: observedAtUnixMs
  });
}

function snapshotKey(promptName, argumentsValue) {
  const args = normalizeArguments(argumentsValue);
  return `${promptName}\u0000${sha256Hex(stableBytes(args))}`;
}

export class McpPromptSnapshotStore {
  constructor({
    providerAuthority,
    maxPromptBytes = DEFAULT_MAX_MCP_PROMPT_BYTES,
    maxMessages = DEFAULT_MAX_MCP_PROMPT_MESSAGES,
    clock = Date.now
  } = {}) {
    this.providerAuthority = normalizeProviderAuthority(providerAuthority);
    if (!Number.isSafeInteger(maxPromptBytes) || maxPromptBytes < 1) throw new Error('maxPromptBytes must be a positive safe integer');
    if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > 1024) throw new Error('maxMessages must be between 1 and 1024');
    if (typeof clock !== 'function') throw new Error('clock must be a function');
    this.maxPromptBytes = maxPromptBytes;
    this.maxMessages = maxMessages;
    this.clock = clock;
    this.snapshots = new Map();
    this.catalogInvalidated = false;
  }

  materialize(promptNameValue, argumentsValue, result) {
    const promptName = normalizeMcpPromptName(promptNameValue);
    const key = snapshotKey(promptName, argumentsValue);
    const observedAtUnixMs = Number(this.clock());
    if (!Number.isSafeInteger(observedAtUnixMs) || observedAtUnixMs < 0) throw new Error('clock must return a non-negative safe integer timestamp');
    const object = promptObject({
      providerAuthority: this.providerAuthority,
      promptName,
      argumentsValue,
      result,
      observedAtUnixMs,
      maxPromptBytes: this.maxPromptBytes,
      maxMessages: this.maxMessages
    });
    const previous = this.snapshots.get(key) ?? null;
    const changed = !previous || previous.object.digest !== object.digest;
    const revision = previous ? (changed ? previous.revision + 1 : previous.revision) : 1;
    const snapshot = Object.freeze({
      profile: MCP_PROMPT_OBJECT_PROFILE,
      promptName,
      arguments: Object.freeze(normalizeArguments(argumentsValue)),
      object,
      changed,
      revision,
      catalogInvalidatedBeforeRead: this.catalogInvalidated,
      trustedExecutionAuthority: false
    });
    this.snapshots.set(key, snapshot);
    return snapshot;
  }

  noteListChanged() {
    this.catalogInvalidated = true;
    return Object.freeze({ invalidated: true, reason: 'prompts_list_changed' });
  }

  noteCatalogRefreshed() {
    this.catalogInvalidated = false;
    return Object.freeze({ invalidated: false });
  }

  isCatalogInvalidated() {
    return this.catalogInvalidated;
  }

  get(promptNameValue, argumentsValue = {}) {
    const promptName = normalizeMcpPromptName(promptNameValue);
    return this.snapshots.get(snapshotKey(promptName, argumentsValue)) ?? null;
  }
}

export function createMcpPromptImporter({ client, providerAuthority = client?.endpoint, ...storeOptions } = {}) {
  if (!client || typeof client.getPrompt !== 'function') throw new Error('MCP prompt importer requires a client with getPrompt()');
  const store = new McpPromptSnapshotStore({ providerAuthority, ...storeOptions });

  async function materializeResponse(promptName, argumentsValue, options = {}) {
    const result = await client.getPrompt(promptName, { arguments: argumentsValue, ...options });
    if (result.resultType === 'input_required') {
      return Object.freeze({ status: 'input_required', result, materialized: false });
    }
    return Object.freeze({ status: 'complete', materialized: true, snapshot: store.materialize(promptName, argumentsValue, result) });
  }

  return Object.freeze({
    store,
    async list(options) {
      if (typeof client.listPrompts !== 'function') throw new Error('MCP client does not implement listPrompts()');
      const result = await client.listPrompts(options);
      store.noteCatalogRefreshed();
      return result;
    },
    async listAll(options) {
      if (typeof client.listAllPrompts !== 'function') throw new Error('MCP client does not implement listAllPrompts()');
      const result = await client.listAllPrompts(options);
      store.noteCatalogRefreshed();
      return result;
    },
    async get(promptName, argumentsValue = {}) {
      return materializeResponse(promptName, argumentsValue);
    },
    async continuePrompt(promptName, argumentsValue = {}, { inputResponses, requestState } = {}) {
      if (inputResponses === undefined) throw new Error('MCP prompt continuation requires explicit inputResponses');
      return materializeResponse(promptName, argumentsValue, { inputResponses, requestState });
    },
    noteListChanged() {
      return store.noteListChanged();
    },
    async refresh(promptName, argumentsValue = {}) {
      return materializeResponse(promptName, argumentsValue);
    }
  });
}
