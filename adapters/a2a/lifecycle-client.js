import { randomUUID } from 'node:crypto';
import { A2A_PROTOCOL_VERSION } from './mapping.js';
import { normalizeOutboundA2aPart, normalizeVerifiedRemoteArtifact, partIntegrity } from './artifact-integrity.js';
import { validateA2aAgentCard } from './client.js';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_PARTS = 64;
const RESERVED_HEADERS = new Set(['a2a-version', 'accept', 'content-length', 'content-type', 'connection', 'host', 'transfer-encoding']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHeaders(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error('A2A authHeaders must be an object');
  const result = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName).trim().toLowerCase();
    if (!name) throw new Error('A2A auth header name must not be empty');
    if (RESERVED_HEADERS.has(name)) throw new Error(`A2A authHeaders may not override ${name}`);
    if (rawValue === undefined || rawValue === null) continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) throw new Error(`A2A auth header ${name} must be a scalar`);
    result[name] = String(rawValue);
  }
  return result;
}

async function readBoundedJson(response, maxBytes) {
  const chunks = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) throw new Error('A2A lifecycle response exceeds maxResponseBytes');
      chunks.push(bytes);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) throw new Error('A2A lifecycle response body is empty');
  try { return JSON.parse(text); } catch { throw new Error('A2A lifecycle response is not valid JSON'); }
}

function remoteError(method, body) {
  const error = new Error(`A2A ${method} error ${body.error.code}: ${body.error.message || 'remote error'}`);
  error.code = 'A2A_REMOTE_ERROR';
  error.remoteError = structuredClone(body.error);
  return error;
}

function validateEnvelope(body, id, method) {
  if (!isObject(body) || body.jsonrpc !== '2.0' || body.id !== id) throw new Error(`A2A ${method} returned an invalid JSON-RPC envelope`);
  if (isObject(body.error)) throw remoteError(method, body);
  if (!Object.prototype.hasOwnProperty.call(body, 'result')) throw new Error(`A2A ${method} response is missing result`);
  return body.result;
}

function normalizeOutboundMessage(message, maxArtifactBytes) {
  if (!isObject(message) || !Array.isArray(message.parts) || message.parts.length === 0) throw new Error('A2A lifecycle message requires a non-empty parts array');
  if (message.parts.length > MAX_PARTS) throw new Error('A2A lifecycle message exceeds part limit');
  let remaining = maxArtifactBytes;
  const parts = message.parts.map((part) => {
    const normalized = normalizeOutboundA2aPart(part, { maxArtifactBytes: remaining });
    remaining -= partIntegrity(normalized)?.sizeBytes || 0;
    if (remaining < 0) throw new Error('A2A lifecycle message exceeds maxArtifactBytes');
    return normalized;
  });
  return { ...structuredClone(message), parts };
}

function correlateStreamEvent(event, correlation) {
  if (!isObject(event)) throw new Error('A2A stream event must be an object');
  const payloads = ['task', 'message', 'statusUpdate', 'artifactUpdate'].filter((key) => Object.prototype.hasOwnProperty.call(event, key));
  if (payloads.length !== 1) throw new Error('A2A stream event must contain exactly one payload');
  const payload = event[payloads[0]];
  let taskId = null;
  let contextId = null;
  if (payloads[0] === 'task') {
    taskId = payload?.id || null;
    contextId = payload?.contextId || null;
  } else if (payloads[0] === 'message') {
    taskId = payload?.taskId || null;
    contextId = payload?.contextId || null;
  } else {
    taskId = payload?.taskId || null;
    contextId = payload?.contextId || null;
  }
  if (taskId) {
    if (correlation.taskId && correlation.taskId !== taskId) throw new Error(`A2A stream taskId mismatch: expected ${correlation.taskId}, got ${taskId}`);
    correlation.taskId ||= taskId;
  }
  if (contextId) {
    if (correlation.contextId && correlation.contextId !== contextId) throw new Error(`A2A stream contextId mismatch: expected ${correlation.contextId}, got ${contextId}`);
    correlation.contextId ||= contextId;
  }
  return payloads[0];
}

async function* parseSse(response, { id, method, maxResponseBytes, artifactOptions, expectedTaskId = null }) {
  if (!response.ok) throw new Error(`A2A ${method} request failed with HTTP ${response.status}`);
  if (!String(response.headers.get('content-type') || '').toLowerCase().startsWith('text/event-stream')) throw new Error(`A2A ${method} did not return text/event-stream`);
  if (!response.body) throw new Error(`A2A ${method} stream body is empty`);
  const decoder = new TextDecoder();
  let buffer = '';
  let total = 0;
  const correlation = { taskId: expectedTaskId, contextId: null };
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxResponseBytes) throw new Error('A2A lifecycle stream exceeds maxResponseBytes');
    buffer += decoder.decode(bytes, { stream: true }).replace(/\r\n/g, '\n');
    while (true) {
      const boundary = buffer.indexOf('\n\n');
      if (boundary < 0) break;
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLines = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      let envelope;
      try { envelope = JSON.parse(dataLines.join('\n')); } catch { throw new Error(`A2A ${method} SSE data is not valid JSON`); }
      const event = validateEnvelope(envelope, id, method);
      const kind = correlateStreamEvent(event, correlation);
      if (kind === 'artifactUpdate') {
        if (!isObject(event.artifactUpdate.artifact)) throw new Error('A2A artifactUpdate requires artifact');
        event.artifactUpdate.artifact = await normalizeVerifiedRemoteArtifact(event.artifactUpdate.artifact, artifactOptions);
      }
      yield structuredClone(event);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) throw new Error(`A2A ${method} ended with an incomplete SSE frame`);
}

export function createA2aLifecycleClient({
  agentCardUrl,
  authHeaders = null,
  getAuthHeaders = null,
  allowCrossOriginInterface = false,
  allowInsecureHttp = false,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
  resolveArtifactUrl = null,
  fetchImpl = fetch
} = {}) {
  if (typeof agentCardUrl !== 'string' || !agentCardUrl.trim()) throw new Error('A2A Agent Card URL is required');
  if (getAuthHeaders !== null && getAuthHeaders !== undefined && typeof getAuthHeaders !== 'function') throw new Error('A2A getAuthHeaders must be a function');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024) throw new Error('A2A maxResponseBytes must be an integer >= 1024');
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes < 1) throw new Error('A2A maxArtifactBytes must be a positive safe integer');
  if (resolveArtifactUrl !== null && resolveArtifactUrl !== undefined && typeof resolveArtifactUrl !== 'function') throw new Error('A2A resolveArtifactUrl must be a function');
  if (typeof fetchImpl !== 'function') throw new Error('A2A fetchImpl must be a function');
  const cardUrl = new URL(agentCardUrl);
  let discovery = null;
  const artifactOptions = { maxArtifactBytes, resolveArtifactUrl };

  async function headers(extra = {}) {
    const dynamic = getAuthHeaders ? await getAuthHeaders() : authHeaders;
    return { ...normalizeHeaders(dynamic), ...extra };
  }

  async function discover() {
    const response = await fetchImpl(cardUrl, {
      method: 'GET',
      headers: await headers({ accept: 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION }),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`A2A Agent Card request failed with HTTP ${response.status}`);
    const card = await readBoundedJson(response, maxResponseBytes);
    discovery = validateA2aAgentCard(card, { cardUrl: cardUrl.toString(), allowCrossOriginInterface, allowInsecureHttp });
    return structuredClone(discovery);
  }

  async function requireDiscovery() {
    if (!discovery) await discover();
    return discovery;
  }

  async function rpc(method, params = {}) {
    const current = await requireDiscovery();
    const id = randomUUID();
    const response = await fetchImpl(current.interface.url, {
      method: 'POST',
      headers: await headers({ accept: 'application/json', 'content-type': 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION }),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`A2A ${method} request failed with HTTP ${response.status}`);
    return validateEnvelope(await readBoundedJson(response, maxResponseBytes), id, method);
  }

  async function* streamRpc(method, params, { expectedTaskId = null } = {}) {
    const current = await requireDiscovery();
    const id = randomUUID();
    const response = await fetchImpl(current.interface.url, {
      method: 'POST',
      headers: await headers({ accept: 'text/event-stream', 'content-type': 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION }),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error'
    });
    yield* parseSse(response, { id, method, maxResponseBytes, artifactOptions, expectedTaskId });
  }

  async function* sendStreamingMessage(message, configuration = {}) {
    const normalized = normalizeOutboundMessage(message, maxArtifactBytes);
    yield* streamRpc('SendStreamingMessage', { message: normalized, configuration });
  }

  async function* subscribeToTask(id) {
    if (typeof id !== 'string' || !id) throw new Error('A2A task id is required');
    yield* streamRpc('SubscribeToTask', { id }, { expectedTaskId: id });
  }

  async function cancelTask(id) {
    if (typeof id !== 'string' || !id) throw new Error('A2A task id is required');
    const task = await rpc('CancelTask', { id });
    if (!isObject(task) || task.id !== id) throw new Error('A2A CancelTask returned mismatched task');
    return task;
  }

  async function createTaskPushNotificationConfig(config) {
    if (!isObject(config)) throw new Error('A2A push notification config must be an object');
    return rpc('CreateTaskPushNotificationConfig', structuredClone(config));
  }

  async function getTaskPushNotificationConfig({ taskId, id, tenant = '' }) {
    return rpc('GetTaskPushNotificationConfig', { tenant, taskId, id });
  }

  async function listTaskPushNotificationConfigs({ taskId, tenant = '' }) {
    return rpc('ListTaskPushNotificationConfigs', { tenant, taskId });
  }

  async function deleteTaskPushNotificationConfig({ taskId, id, tenant = '' }) {
    return rpc('DeleteTaskPushNotificationConfig', { tenant, taskId, id });
  }

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    discover,
    sendStreamingMessage,
    subscribeToTask,
    cancelTask,
    createTaskPushNotificationConfig,
    getTaskPushNotificationConfig,
    listTaskPushNotificationConfigs,
    deleteTaskPushNotificationConfig,
    get discovery() { return discovery ? structuredClone(discovery) : null; }
  };
}
