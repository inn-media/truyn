import { randomUUID } from 'node:crypto';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from './mapping.js';
import { normalizeVerifiedRemoteArtifact, normalizeVerifiedRemotePart, partIntegrity } from './artifact-integrity.js';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_BYTES = 1024 * 1024;
const DEFAULT_TASK_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const TASK_EXECUTION_MODES = new Set(['blocking', 'polling']);
const TERMINAL_STATES = new Set([
  A2A_TASK_STATES.completed,
  A2A_TASK_STATES.failed,
  A2A_TASK_STATES.rejected,
  A2A_TASK_STATES.canceled
]);
const INTERRUPTED_STATES = new Set([
  A2A_TASK_STATES.inputRequired,
  A2A_TASK_STATES.authRequired
]);
const KNOWN_TASK_STATES = new Set([
  A2A_TASK_STATES.submitted,
  A2A_TASK_STATES.working,
  ...TERMINAL_STATES,
  ...INTERRUPTED_STATES
]);
const RESERVED_HEADERS = new Set([
  'a2a-version',
  'accept',
  'content-length',
  'content-type',
  'connection',
  'host',
  'transfer-encoding'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function absoluteHttpUrl(value, name, { allowInsecureHttp = false } = {}) {
  const url = new URL(nonEmptyString(value, name));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use http or https`);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback && !allowInsecureHttp) throw new Error(`${name} must use https outside loopback`);
  return url;
}

function normalizeHeaderMap(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error('A2A authHeaders must be an object');
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName).trim().toLowerCase();
    if (!name) throw new Error('A2A auth header name must not be empty');
    if (RESERVED_HEADERS.has(name)) throw new Error(`A2A authHeaders may not override ${name}`);
    if (rawValue === undefined || rawValue === null) continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) throw new Error(`A2A auth header ${name} must be a scalar`);
    headers[name] = String(rawValue);
  }
  return headers;
}

async function readBoundedJson(response, maxResponseBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxResponseBytes) throw new Error('A2A response exceeds maxResponseBytes');
  const chunks = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxResponseBytes) throw new Error('A2A response exceeds maxResponseBytes');
      chunks.push(bytes);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) throw new Error('A2A response body is empty');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('A2A response is not valid JSON');
  }
}

function validateModes(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function normalizeSkill(skill) {
  if (!isObject(skill)) throw new Error('A2A Agent Card skill must be an object');
  return {
    ...structuredClone(skill),
    id: nonEmptyString(skill.id, 'A2A skill id'),
    name: nonEmptyString(skill.name, 'A2A skill name'),
    description: nonEmptyString(skill.description, 'A2A skill description'),
    inputModes: validateModes(skill.inputModes, `A2A skill ${skill.id} inputModes`),
    outputModes: validateModes(skill.outputModes, `A2A skill ${skill.id} outputModes`)
  };
}

function selectJsonRpcInterface(card, cardUrl, { allowCrossOriginInterface, allowInsecureHttp }) {
  if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) {
    throw new Error('A2A Agent Card must declare supportedInterfaces');
  }
  const candidates = card.supportedInterfaces.filter((entry) => isObject(entry)
    && String(entry.protocolBinding || '').toUpperCase() === 'JSONRPC'
    && String(entry.protocolVersion || '') === A2A_PROTOCOL_VERSION);
  if (candidates.length === 0) throw new Error(`A2A Agent Card does not declare JSONRPC ${A2A_PROTOCOL_VERSION}`);
  const selected = structuredClone(candidates[0]);
  const interfaceUrl = absoluteHttpUrl(selected.url, 'A2A interface URL', { allowInsecureHttp });
  if (!allowCrossOriginInterface && interfaceUrl.origin !== cardUrl.origin) {
    throw new Error('A2A Agent Card cross-origin interface is denied by default');
  }
  selected.url = interfaceUrl.toString();
  selected.protocolBinding = 'JSONRPC';
  selected.protocolVersion = A2A_PROTOCOL_VERSION;
  return selected;
}

export function validateA2aAgentCard(card, {
  cardUrl,
  allowCrossOriginInterface = false,
  allowInsecureHttp = false
} = {}) {
  if (!isObject(card)) throw new Error('A2A Agent Card must be an object');
  const resolvedCardUrl = absoluteHttpUrl(cardUrl, 'A2A Agent Card URL', { allowInsecureHttp });
  const skills = Array.isArray(card.skills) ? card.skills.map(normalizeSkill) : [];
  const skillIds = new Set();
  for (const skill of skills) {
    if (skillIds.has(skill.id)) throw new Error(`A2A Agent Card contains duplicate skill id: ${skill.id}`);
    skillIds.add(skill.id);
  }
  const normalized = {
    ...structuredClone(card),
    name: nonEmptyString(card.name, 'A2A Agent Card name'),
    description: nonEmptyString(card.description, 'A2A Agent Card description'),
    version: nonEmptyString(card.version, 'A2A Agent Card version'),
    skills
  };
  const selectedInterface = selectJsonRpcInterface(normalized, resolvedCardUrl, { allowCrossOriginInterface, allowInsecureHttp });
  return { card: normalized, interface: selectedInterface, cardUrl: resolvedCardUrl.toString() };
}

function legacyOutputFromNormalizedParts(parts) {
  if (parts.length === 1) {
    const part = parts[0];
    if (Object.prototype.hasOwnProperty.call(part, 'text')) return part.text;
    if (Object.prototype.hasOwnProperty.call(part, 'data')) return structuredClone(part.data);
    if (Object.prototype.hasOwnProperty.call(part, 'raw')) {
      return {
        raw: part.raw,
        ...(part.mediaType ? { mediaType: part.mediaType } : {}),
        ...(part.filename ? { filename: part.filename } : {}),
        ...(isObject(part.metadata) ? { metadata: structuredClone(part.metadata) } : {})
      };
    }
  }
  return { parts: structuredClone(parts) };
}

function partIntegritySummary(parts) {
  return parts.map((part, index) => ({
    partIndex: index,
    kind: ['text', 'data', 'raw', 'url'].find((key) => Object.prototype.hasOwnProperty.call(part, key)),
    integrity: partIntegrity(part)
  }));
}

async function verifiedOutputFromParts(parts, options) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('A2A remote result contains no parts');
  const normalized = [];
  for (const part of parts) normalized.push(await normalizeVerifiedRemotePart(part, options));
  return {
    output: legacyOutputFromNormalizedParts(normalized),
    parts: normalized,
    integrity: partIntegritySummary(normalized)
  };
}

async function verifiedOutputFromTask(task, options) {
  if (!Array.isArray(task.artifacts) || task.artifacts.length === 0) throw new Error('Completed A2A task contains no artifacts');
  const artifacts = [];
  const artifactIds = new Set();
  for (const artifact of task.artifacts) {
    const normalized = await normalizeVerifiedRemoteArtifact(artifact, options);
    if (artifactIds.has(normalized.artifactId)) throw new Error(`Completed A2A task contains duplicate artifactId: ${normalized.artifactId}`);
    artifactIds.add(normalized.artifactId);
    artifacts.push(normalized);
  }
  if (artifacts.length === 1) {
    return {
      output: legacyOutputFromNormalizedParts(artifacts[0].parts),
      artifacts,
      integrity: [{ artifactId: artifacts[0].artifactId, parts: partIntegritySummary(artifacts[0].parts) }]
    };
  }
  return {
    output: { artifacts: structuredClone(artifacts) },
    artifacts,
    integrity: artifacts.map((artifact) => ({ artifactId: artifact.artifactId, parts: partIntegritySummary(artifact.parts) }))
  };
}

function normalizeTask(task) {
  if (!isObject(task)) throw new Error('A2A task response must be an object');
  if (typeof task.id !== 'string' || !task.id) throw new Error('A2A task response requires id');
  if (!isObject(task.status) || typeof task.status.state !== 'string') throw new Error('A2A task response requires status.state');
  if (!KNOWN_TASK_STATES.has(task.status.state)) {
    const error = new Error(`A2A task response contains unsupported state: ${task.status.state}`);
    error.code = 'A2A_TASK_STATE_INVALID';
    error.remoteTask = structuredClone(task);
    throw error;
  }
  return structuredClone(task);
}

function remoteExecutionError(task) {
  const state = task.status.state;
  if (INTERRUPTED_STATES.has(state)) {
    const error = new Error(`A2A remote task requires additional interaction: ${state}`);
    error.code = state === A2A_TASK_STATES.authRequired ? 'A2A_AUTH_REQUIRED' : 'A2A_INPUT_REQUIRED';
    error.remoteTask = task;
    return error;
  }
  const error = new Error(`A2A remote task did not complete successfully: ${state}`);
  error.code = 'A2A_REMOTE_TASK_FAILED';
  error.remoteTask = task;
  return error;
}

function taskCorrelationError(code, message, task) {
  const error = new Error(message);
  error.code = code;
  error.remoteTask = structuredClone(task);
  return error;
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createA2aClient({
  agentCardUrl,
  authHeaders = null,
  getAuthHeaders = null,
  allowCrossOriginInterface = false,
  allowInsecureHttp = false,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
  resolveArtifactUrl = null,
  taskTimeoutMs = DEFAULT_TASK_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  taskExecutionMode = 'blocking',
  fetchImpl = fetch
} = {}) {
  const cardUrl = absoluteHttpUrl(agentCardUrl, 'A2A Agent Card URL', { allowInsecureHttp });
  if (getAuthHeaders !== null && getAuthHeaders !== undefined && typeof getAuthHeaders !== 'function') throw new Error('A2A getAuthHeaders must be a function');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024) throw new Error('A2A maxResponseBytes must be an integer >= 1024');
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes < 1) throw new Error('A2A maxArtifactBytes must be a positive safe integer');
  if (resolveArtifactUrl !== null && resolveArtifactUrl !== undefined && typeof resolveArtifactUrl !== 'function') throw new Error('A2A resolveArtifactUrl must be a function');
  if (!Number.isInteger(taskTimeoutMs) || taskTimeoutMs < 1) throw new Error('A2A taskTimeoutMs must be a positive integer');
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 0) throw new Error('A2A pollIntervalMs must be a non-negative integer');
  if (!TASK_EXECUTION_MODES.has(taskExecutionMode)) throw new Error('A2A taskExecutionMode must be blocking or polling');
  if (typeof fetchImpl !== 'function') throw new Error('A2A fetchImpl must be a function');

  const artifactOptions = { maxArtifactBytes, resolveArtifactUrl };
  let discovery = null;

  async function requestHeaders(extra = {}) {
    const dynamic = getAuthHeaders ? await getAuthHeaders() : authHeaders;
    return { ...normalizeHeaderMap(dynamic), ...extra };
  }

  async function fetchCard() {
    const response = await fetchImpl(cardUrl, {
      method: 'GET',
      headers: await requestHeaders({ accept: 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION }),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`A2A Agent Card request failed with HTTP ${response.status}`);
    const body = await readBoundedJson(response, maxResponseBytes);
    return validateA2aAgentCard(body, {
      cardUrl: cardUrl.toString(),
      allowCrossOriginInterface,
      allowInsecureHttp
    });
  }

  async function rpc(interfaceUrl, method, params = {}) {
    const id = randomUUID();
    const response = await fetchImpl(interfaceUrl, {
      method: 'POST',
      headers: await requestHeaders({
        accept: 'application/json',
        'content-type': 'application/json',
        'a2a-version': A2A_PROTOCOL_VERSION
      }),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`A2A ${method} request failed with HTTP ${response.status}`);
    const body = await readBoundedJson(response, maxResponseBytes);
    if (!isObject(body) || body.jsonrpc !== '2.0' || body.id !== id) throw new Error(`A2A ${method} returned an invalid JSON-RPC envelope`);
    if (isObject(body.error)) {
      const error = new Error(`A2A ${method} error ${body.error.code}: ${body.error.message || 'remote error'}`);
      error.code = 'A2A_REMOTE_ERROR';
      error.remoteError = structuredClone(body.error);
      throw error;
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'result')) throw new Error(`A2A ${method} response is missing result`);
    return body.result;
  }

  async function discover({ extended = false } = {}) {
    const publicDiscovery = await fetchCard();
    let selected = publicDiscovery;
    if (extended) {
      if (publicDiscovery.card.capabilities?.extendedAgentCard !== true) throw new Error('A2A Agent Card does not advertise extendedAgentCard');
      const extendedCard = await rpc(publicDiscovery.interface.url, 'GetExtendedAgentCard', {});
      selected = validateA2aAgentCard(extendedCard, {
        cardUrl: cardUrl.toString(),
        allowCrossOriginInterface,
        allowInsecureHttp
      });
    }
    discovery = selected;
    return structuredClone(selected);
  }

  async function requireDiscovery() {
    if (!discovery) await discover();
    return discovery;
  }

  async function sendMessage(message, configuration = {}) {
    const current = await requireDiscovery();
    const result = await rpc(current.interface.url, 'SendMessage', { message, configuration });
    if (!isObject(result)) throw new Error('A2A SendMessage result must be an object');
    const hasTask = Object.prototype.hasOwnProperty.call(result, 'task');
    const hasMessage = Object.prototype.hasOwnProperty.call(result, 'message');
    if (hasTask === hasMessage) throw new Error('A2A SendMessage result must contain exactly one of task or message');
    return hasTask ? { task: normalizeTask(result.task) } : { message: structuredClone(result.message) };
  }

  async function getTask(id, { historyLength } = {}) {
    const current = await requireDiscovery();
    const params = { id };
    if (historyLength !== undefined) params.historyLength = historyLength;
    const task = normalizeTask(await rpc(current.interface.url, 'GetTask', params));
    if (task.id !== id) {
      throw taskCorrelationError('A2A_TASK_ID_MISMATCH', `A2A GetTask returned task ${task.id} for requested task ${id}`, task);
    }
    return task;
  }

  async function pollTask(initialTask) {
    let task = normalizeTask(initialTask);
    const taskId = task.id;
    const contextId = typeof task.contextId === 'string' && task.contextId ? task.contextId : null;
    const deadline = Date.now() + taskTimeoutMs;
    let pollCount = 0;

    while (!TERMINAL_STATES.has(task.status.state) && !INTERRUPTED_STATES.has(task.status.state)) {
      if (Date.now() >= deadline) {
        const error = new Error(`A2A remote task ${taskId} timed out`);
        error.code = 'A2A_TASK_TIMEOUT';
        error.remoteTask = structuredClone(task);
        error.pollCount = pollCount;
        throw error;
      }
      await delay(pollIntervalMs);
      const next = await getTask(taskId);
      pollCount += 1;
      if (contextId && next.contextId && next.contextId !== contextId) {
        throw taskCorrelationError('A2A_CONTEXT_ID_MISMATCH', `A2A task ${taskId} changed contextId during polling`, next);
      }
      task = next;
    }
    return { task, pollCount };
  }

  async function execute({ skill, message }) {
    const current = await requireDiscovery();
    const response = await sendMessage(message, { returnImmediately: taskExecutionMode === 'polling' });
    if (response.message) {
      const verified = await verifiedOutputFromParts(response.message.parts, artifactOptions);
      return {
        output: verified.output,
        metadata: {
          interoperability: {
            protocol: 'a2a',
            protocolVersion: A2A_PROTOCOL_VERSION,
            remoteAgent: current.card.name,
            remoteSkillId: skill.id,
            remoteMessageId: response.message.messageId || null,
            interfaceUrl: current.interface.url,
            taskExecutionMode,
            artifactIntegrity: verified.integrity
          }
        }
      };
    }

    const { task, pollCount } = await pollTask(response.task);
    if (task.status.state !== A2A_TASK_STATES.completed) throw remoteExecutionError(task);
    const verified = await verifiedOutputFromTask(task, artifactOptions);
    return {
      output: verified.output,
      metadata: {
        interoperability: {
          protocol: 'a2a',
          protocolVersion: A2A_PROTOCOL_VERSION,
          remoteAgent: current.card.name,
          remoteSkillId: skill.id,
          remoteTaskId: task.id,
          remoteContextId: task.contextId || null,
          interfaceUrl: current.interface.url,
          artifactCount: verified.artifacts.length,
          taskExecutionMode,
          taskPollCount: pollCount,
          artifactIntegrity: verified.integrity
        }
      }
    };
  }

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    taskExecutionMode,
    discover,
    sendMessage,
    getTask,
    execute,
    get discovery() { return discovery ? structuredClone(discovery) : null; }
  };
}
