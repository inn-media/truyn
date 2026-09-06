import { createHash } from 'node:crypto';

export const MCP_RESOURCE_OBJECT_PROFILE = 'mcp-resource-object-state/v1';
export const DEFAULT_MAX_MCP_RESOURCE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_MCP_RESOURCE_CONTENTS = 32;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedString(value, label, maxLength = 8192) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string up to ${maxLength} characters`);
  }
  if (/\p{Cc}/u.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}

export function normalizeMcpResourceUri(value) {
  const uri = boundedString(value, 'MCP resource URI');
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error('MCP resource URI must be absolute'); }
  if (!parsed.protocol || parsed.protocol === ':') throw new Error('MCP resource URI requires a scheme');
  return parsed.toString();
}

function normalizeProviderAuthority(value) {
  const authority = boundedString(value, 'MCP provider authority', 4096);
  return authority;
}

function normalizeMimeType(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return boundedString(value, 'MCP resource mimeType', 512);
}

function strictBase64(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('MCP blob resource requires non-empty base64');
  if (value.length > Math.ceil(DEFAULT_MAX_MCP_RESOURCE_BYTES * 4 / 3) + 16) {
    throw new Error('MCP blob resource exceeds encoded size limit');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error('MCP blob resource must use canonical base64');
  }
  const bytes = Buffer.from(value, 'base64');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = bytes.toString('base64').replace(/=+$/, '');
  if (normalizedInput !== normalizedRoundTrip) throw new Error('MCP blob resource must use valid base64');
  return bytes;
}

function parseLastModified(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 128) throw new Error('MCP resource lastModified must be an ISO timestamp string');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('MCP resource lastModified must be a valid timestamp');
  return parsed;
}

function normalizeCacheHints(result) {
  if (!Number.isSafeInteger(result?.ttlMs) || result.ttlMs < 0) throw new Error('MCP resources/read requires non-negative integer ttlMs');
  if (!['private', 'public'].includes(result?.cacheScope)) throw new Error('MCP resources/read requires cacheScope private or public');
  return { ttlMs: result.ttlMs, cacheScope: result.cacheScope };
}

function objectRecord({ bytes, contentType, providerAuthority, resourceUri, createdAtUnixMs, role = 'content' }) {
  const digest = sha256Hex(bytes);
  return Object.freeze({
    type: 'OBJECT',
    profile: MCP_RESOURCE_OBJECT_PROFILE,
    objectId: `sha256:${digest}`,
    digestAlgorithm: 'sha256',
    digest,
    contentType,
    sizeBytes: bytes.length,
    inlineDataBase64: bytes.toString('base64'),
    source: Object.freeze({ protocol: 'mcp', authority: providerAuthority, resourceUri, role }),
    createdAtUnixMs
  });
}

function contentEntry(content, requestedUri, providerAuthority, observedAtUnixMs) {
  if (!isObject(content)) throw new Error('MCP resources/read content entries must be objects');
  const uri = normalizeMcpResourceUri(content.uri);
  if (uri !== requestedUri) throw new Error('MCP resources/read content URI mismatch');
  const hasText = Object.prototype.hasOwnProperty.call(content, 'text');
  const hasBlob = Object.prototype.hasOwnProperty.call(content, 'blob');
  if (hasText === hasBlob) throw new Error('MCP resource content must contain exactly one of text or blob');

  let bytes;
  let encoding;
  let fallbackMimeType;
  if (hasText) {
    if (typeof content.text !== 'string') throw new Error('MCP text resource content must be a string');
    bytes = Buffer.from(content.text, 'utf8');
    encoding = 'utf-8';
    fallbackMimeType = 'text/plain; charset=utf-8';
  } else {
    bytes = strictBase64(content.blob);
    encoding = 'base64';
    fallbackMimeType = 'application/octet-stream';
  }
  const contentType = normalizeMimeType(content.mimeType, fallbackMimeType);
  const lastModifiedMs = parseLastModified(content.annotations?.lastModified);
  return {
    uri,
    bytes,
    encoding,
    contentType,
    lastModifiedMs,
    annotations: isObject(content.annotations) ? structuredClone(content.annotations) : null,
    object: objectRecord({
      bytes,
      contentType,
      providerAuthority,
      resourceUri: uri,
      createdAtUnixMs: observedAtUnixMs
    })
  };
}

function createManifestObject(entries, providerAuthority, requestedUri, observedAtUnixMs) {
  const manifest = {
    profile: MCP_RESOURCE_OBJECT_PROFILE,
    resourceUri: requestedUri,
    entries: entries.map((entry, index) => ({
      index,
      objectId: entry.object.objectId,
      digestAlgorithm: entry.object.digestAlgorithm,
      digest: entry.object.digest,
      contentType: entry.object.contentType,
      sizeBytes: entry.object.sizeBytes,
      encoding: entry.encoding
    }))
  };
  const bytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  return objectRecord({
    bytes,
    contentType: 'application/vnd.truyn.mcp-resource-manifest+json',
    providerAuthority,
    resourceUri: requestedUri,
    createdAtUnixMs: observedAtUnixMs,
    role: 'manifest'
  });
}

function stableStateId(providerAuthority, resourceUri) {
  const digest = sha256Hex(Buffer.from(`${providerAuthority}\u0000${resourceUri}`, 'utf8'));
  return `sha256:${digest}`;
}

function stateSubject(providerAuthority, resourceUri) {
  return `mcp-resource:${providerAuthority}:${resourceUri}`;
}

function maxLastModified(entries) {
  const values = entries.map((entry) => entry.lastModifiedMs).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}

function snapshotState({ providerAuthority, requestedUri, rootObject, previous, observedAtUnixMs, ttlMs, cacheScope, lastModifiedMs }) {
  if (previous?.lastModifiedMs !== null && previous?.lastModifiedMs !== undefined && lastModifiedMs !== null) {
    if (lastModifiedMs < previous.lastModifiedMs) throw new Error('MCP resource update is stale');
    if (lastModifiedMs === previous.lastModifiedMs && rootObject.digest !== previous.digest) {
      throw new Error('MCP resource update conflicts at the same lastModified value');
    }
  }

  const changed = !previous || previous.digest !== rootObject.digest;
  const version = previous ? (changed ? previous.version + 1 : previous.version) : 1;
  return {
    changed,
    state: Object.freeze({
      type: 'STATE',
      profile: MCP_RESOURCE_OBJECT_PROFILE,
      stateId: stableStateId(providerAuthority, requestedUri),
      subject: stateSubject(providerAuthority, requestedUri),
      version,
      objectRef: Object.freeze({ type: 'OBJECT', objectId: rootObject.objectId }),
      digestAlgorithm: rootObject.digestAlgorithm,
      digest: rootObject.digest,
      sourceAuthority: providerAuthority,
      resourceUri: requestedUri,
      observedAtUnixMs,
      expiresAtUnixMs: ttlMs > 0 ? observedAtUnixMs + ttlMs : observedAtUnixMs,
      cacheScope,
      lastModifiedMs
    })
  };
}

export class McpResourceStateStore {
  constructor({
    providerAuthority,
    maxResourceBytes = DEFAULT_MAX_MCP_RESOURCE_BYTES,
    maxContents = DEFAULT_MAX_MCP_RESOURCE_CONTENTS,
    clock = Date.now
  } = {}) {
    this.providerAuthority = normalizeProviderAuthority(providerAuthority);
    if (!Number.isSafeInteger(maxResourceBytes) || maxResourceBytes < 1) throw new Error('maxResourceBytes must be a positive safe integer');
    if (!Number.isSafeInteger(maxContents) || maxContents < 1 || maxContents > 1024) throw new Error('maxContents must be between 1 and 1024');
    if (typeof clock !== 'function') throw new Error('clock must be a function');
    this.maxResourceBytes = maxResourceBytes;
    this.maxContents = maxContents;
    this.clock = clock;
    this.states = new Map();
    this.invalidated = new Set();
  }

  materialize(requestedUriValue, readResult) {
    const requestedUri = normalizeMcpResourceUri(requestedUriValue);
    if (!isObject(readResult)) throw new Error('MCP resources/read result must be an object');
    if (readResult.resultType !== 'complete') throw new Error('MCP resources/read requires resultType=complete');
    const { ttlMs, cacheScope } = normalizeCacheHints(readResult);
    if (!Array.isArray(readResult.contents) || readResult.contents.length < 1) throw new Error('MCP resources/read requires non-empty contents');
    if (readResult.contents.length > this.maxContents) throw new Error('MCP resources/read exceeded content entry limit');

    const observedAtUnixMs = Number(this.clock());
    if (!Number.isSafeInteger(observedAtUnixMs) || observedAtUnixMs < 0) throw new Error('clock must return a non-negative safe integer timestamp');
    const entries = readResult.contents.map((content) => contentEntry(content, requestedUri, this.providerAuthority, observedAtUnixMs));
    const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
    if (totalBytes > this.maxResourceBytes) throw new Error('MCP resource exceeds materialization size limit');

    const rootObject = entries.length === 1
      ? entries[0].object
      : createManifestObject(entries, this.providerAuthority, requestedUri, observedAtUnixMs);
    const previous = this.states.get(requestedUri)?.state ?? null;
    const { state, changed } = snapshotState({
      providerAuthority: this.providerAuthority,
      requestedUri,
      rootObject,
      previous,
      observedAtUnixMs,
      ttlMs,
      cacheScope,
      lastModifiedMs: maxLastModified(entries)
    });

    const objects = entries.map((entry) => entry.object);
    if (entries.length > 1) objects.push(rootObject);
    const snapshot = Object.freeze({
      profile: MCP_RESOURCE_OBJECT_PROFILE,
      resourceUri: requestedUri,
      objects: Object.freeze(objects),
      rootObject,
      state,
      changed,
      cache: Object.freeze({ ttlMs, cacheScope }),
      invalidatedBeforeRead: this.invalidated.has(requestedUri)
    });
    this.states.set(requestedUri, snapshot);
    this.invalidated.delete(requestedUri);
    return snapshot;
  }

  invalidate(resourceUriValue) {
    const resourceUri = normalizeMcpResourceUri(resourceUriValue);
    this.invalidated.add(resourceUri);
    const current = this.states.get(resourceUri) ?? null;
    return Object.freeze({ resourceUri, invalidated: true, currentState: current?.state ?? null });
  }

  get(resourceUriValue) {
    const resourceUri = normalizeMcpResourceUri(resourceUriValue);
    return this.states.get(resourceUri) ?? null;
  }

  isInvalidated(resourceUriValue) {
    return this.invalidated.has(normalizeMcpResourceUri(resourceUriValue));
  }
}

export function createMcpResourceImporter({ client, providerAuthority = client?.endpoint, ...storeOptions } = {}) {
  if (!client || typeof client.readResource !== 'function') throw new Error('MCP resource importer requires a client with readResource()');
  const store = new McpResourceStateStore({ providerAuthority, ...storeOptions });
  return Object.freeze({
    store,
    async list(options) {
      if (typeof client.listResources !== 'function') throw new Error('MCP client does not implement listResources()');
      return client.listResources(options);
    },
    async listTemplates(options) {
      if (typeof client.listResourceTemplates !== 'function') throw new Error('MCP client does not implement listResourceTemplates()');
      return client.listResourceTemplates(options);
    },
    async read(resourceUri) {
      const result = await client.readResource(resourceUri);
      return store.materialize(resourceUri, result);
    },
    noteUpdate(resourceUri) {
      return store.invalidate(resourceUri);
    },
    async refresh(resourceUri) {
      const result = await client.readResource(resourceUri);
      return store.materialize(resourceUri, result);
    }
  });
}
