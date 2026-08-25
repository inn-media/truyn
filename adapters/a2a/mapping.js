export const A2A_PROTOCOL_VERSION = '1.0';

export const A2A_TASK_STATES = Object.freeze({
  submitted: 'TASK_STATE_SUBMITTED',
  working: 'TASK_STATE_WORKING',
  completed: 'TASK_STATE_COMPLETED',
  failed: 'TASK_STATE_FAILED',
  rejected: 'TASK_STATE_REJECTED',
  inputRequired: 'TASK_STATE_INPUT_REQUIRED',
  authRequired: 'TASK_STATE_AUTH_REQUIRED',
  canceled: 'TASK_STATE_CANCELED'
});

const VISIBILITY = new Set(['public', 'authenticated']);
const DEFAULT_INPUT_MODES = ['text/plain', 'application/json'];
const DEFAULT_OUTPUT_MODES = ['text/plain', 'application/json'];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function stringList(value, fallback, name) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length === 0 || source.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${name} must be a non-empty string array`);
  }
  return [...new Set(source.map((item) => item.trim()))];
}

export function normalizeA2aSkill(skill) {
  if (!isObject(skill)) throw new Error('A2A skill must be an object');
  const visibility = skill.visibility || 'authenticated';
  if (!VISIBILITY.has(visibility)) throw new Error(`Unsupported A2A skill visibility: ${visibility}`);
  if (skill.mapInput !== undefined && typeof skill.mapInput !== 'function') throw new Error('A2A skill mapInput must be a function');
  return {
    id: nonEmptyString(skill.id, 'A2A skill id'),
    name: nonEmptyString(skill.name, 'A2A skill name'),
    description: nonEmptyString(skill.description, 'A2A skill description'),
    capability: nonEmptyString(skill.capability, 'TRUYN capability'),
    visibility,
    tags: Array.isArray(skill.tags) ? [...new Set(skill.tags.map(String).map((value) => value.trim()).filter(Boolean))] : [],
    examples: Array.isArray(skill.examples) ? skill.examples.map(String).map((value) => value.trim()).filter(Boolean) : [],
    inputModes: stringList(skill.inputModes, DEFAULT_INPUT_MODES, 'A2A skill inputModes'),
    outputModes: stringList(skill.outputModes, DEFAULT_OUTPUT_MODES, 'A2A skill outputModes'),
    mapInput: skill.mapInput || null
  };
}

export function projectA2aSkill(skill) {
  const projected = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: [...skill.tags],
    inputModes: [...skill.inputModes],
    outputModes: [...skill.outputModes]
  };
  if (skill.examples.length > 0) projected.examples = [...skill.examples];
  return projected;
}

function normalizePart(part) {
  if (!isObject(part)) throw new Error('A2A message part must be an object');
  const members = ['text', 'data', 'url', 'raw'].filter((key) => Object.prototype.hasOwnProperty.call(part, key));
  if (members.length !== 1) throw new Error('A2A v1 Part must contain exactly one of text, data, url, raw');
  const content = members[0];
  if (content === 'raw') {
    const error = new Error('Inline raw A2A parts are not supported by the bounded C3 facade');
    error.a2aCode = -32005;
    error.a2aReason = 'CONTENT_TYPE_NOT_SUPPORTED';
    throw error;
  }
  if (content === 'text' && typeof part.text !== 'string') throw new Error('A2A text part requires string text');
  if (content === 'url' && typeof part.url !== 'string') throw new Error('A2A URL part requires string url');
  const normalized = { [content]: part[content] };
  if (typeof part.mediaType === 'string' && part.mediaType.trim()) normalized.mediaType = part.mediaType.trim();
  if (typeof part.filename === 'string' && part.filename.trim()) normalized.filename = part.filename.trim();
  if (isObject(part.metadata)) normalized.metadata = structuredClone(part.metadata);
  return normalized;
}

export function normalizeA2aMessage(message) {
  if (!isObject(message)) throw new Error('A2A SendMessage requires message');
  if (message.role !== 'ROLE_USER') throw new Error('A2A v1 SendMessage requires role ROLE_USER');
  const messageId = nonEmptyString(message.messageId, 'A2A messageId');
  if (!Array.isArray(message.parts) || message.parts.length === 0 || message.parts.length > 64) {
    throw new Error('A2A message parts must contain between 1 and 64 entries');
  }
  const normalized = {
    messageId,
    role: 'ROLE_USER',
    parts: message.parts.map(normalizePart)
  };
  if (typeof message.contextId === 'string' && message.contextId.trim()) normalized.contextId = message.contextId.trim();
  if (typeof message.taskId === 'string' && message.taskId.trim()) normalized.taskId = message.taskId.trim();
  if (Array.isArray(message.referenceTaskIds)) normalized.referenceTaskIds = message.referenceTaskIds.map(String).filter(Boolean);
  if (isObject(message.metadata)) normalized.metadata = structuredClone(message.metadata);
  return normalized;
}

export function defaultTruynInputFromA2a(message) {
  return {
    a2a: {
      protocolVersion: A2A_PROTOCOL_VERSION,
      messageId: message.messageId,
      ...(message.contextId ? { contextId: message.contextId } : {}),
      ...(message.taskId ? { taskId: message.taskId } : {}),
      ...(message.referenceTaskIds?.length ? { referenceTaskIds: [...message.referenceTaskIds] } : {})
    },
    parts: structuredClone(message.parts)
  };
}

export async function mapA2aMessageToTruynInput(skill, message, context = {}) {
  if (!skill.mapInput) return defaultTruynInputFromA2a(message);
  const mapped = await skill.mapInput({ message: structuredClone(message), context });
  if (mapped === undefined) throw new Error(`A2A skill ${skill.id} mapInput returned undefined`);
  return mapped;
}

export function artifactFromTruynResult(output, { artifactId, requestId, providerNodeId, trust = null, metadata = null } = {}) {
  const parts = typeof output === 'string'
    ? [{ text: output, mediaType: 'text/plain' }]
    : [{ data: structuredClone(output), mediaType: 'application/json' }];
  const provenance = {
    protocol: 'TRUYN/1',
    ...(requestId ? { requestId } : {}),
    ...(providerNodeId ? { providerNodeId } : {}),
    ...(trust ? { trust: structuredClone(trust) } : {})
  };
  return {
    artifactId,
    name: 'TRUYN result',
    parts,
    metadata: {
      'io.truyn/provenance': provenance,
      ...(metadata && isObject(metadata) ? { 'io.truyn/resultMetadata': structuredClone(metadata) } : {})
    }
  };
}

export function a2aError(code, message, reason, metadata = {}) {
  const error = new Error(message);
  error.a2aCode = code;
  error.a2aReason = reason;
  error.a2aMetadata = metadata;
  return error;
}

export function a2aErrorData(error) {
  if (!error?.a2aReason) return undefined;
  return [{
    '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
    reason: error.a2aReason,
    domain: 'a2a-protocol.org',
    metadata: Object.fromEntries(Object.entries(error.a2aMetadata || {}).map(([key, value]) => [key, String(value)]))
  }];
}
