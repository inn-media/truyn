import { randomUUID } from 'node:crypto';

const DEFAULT_MAX_CONFIGS_PER_TASK = 8;
const DEFAULT_MAX_TOKEN_BYTES = 8 * 1024;
const DEFAULT_MAX_CREDENTIAL_BYTES = 16 * 1024;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, name, { allowEmpty = false, maxBytes = 8 * 1024 } = {}) {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  const normalized = value.trim();
  if (!allowEmpty && normalized.length === 0) throw new Error(`${name} must be a non-empty string`);
  if (Buffer.byteLength(normalized) > maxBytes) throw new Error(`${name} exceeds byte limit`);
  return normalized;
}

function normalizePushUrl(value, { allowInsecureLoopback = true } = {}) {
  const url = new URL(boundedString(value, 'A2A push notification url'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A2A push notification url must use http or https');
  if (url.username || url.password) throw new Error('A2A push notification url must not contain credentials');
  if (url.hash) throw new Error('A2A push notification url must not contain a fragment');
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecureLoopback && loopback)) {
    throw new Error('A2A push notification url must use https outside loopback');
  }
  return url.toString();
}

function normalizeAuthentication(value) {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw new Error('A2A push notification authentication must be an object');
  return {
    scheme: boundedString(value.scheme, 'A2A push notification authentication scheme', { maxBytes: 256 }),
    credentials: boundedString(value.credentials, 'A2A push notification authentication credentials', {
      allowEmpty: true,
      maxBytes: DEFAULT_MAX_CREDENTIAL_BYTES
    })
  };
}

export function normalizeTaskPushNotificationConfig(config, {
  taskId,
  tenant = '',
  allowInsecureLoopback = true,
  generateId = true
} = {}) {
  if (!isObject(config)) throw new Error('A2A TaskPushNotificationConfig must be an object');
  const authoritativeTaskId = boundedString(taskId, 'A2A taskId');
  if (config.taskId !== undefined && config.taskId !== null && String(config.taskId).trim() && String(config.taskId).trim() !== authoritativeTaskId) {
    throw new Error('A2A push notification taskId does not match authoritative task');
  }
  const configId = typeof config.id === 'string' && config.id.trim()
    ? boundedString(config.id, 'A2A push notification config id', { maxBytes: 1024 })
    : (generateId ? randomUUID() : '');
  if (!configId) throw new Error('A2A push notification config id is required');
  const requestedTenant = typeof config.tenant === 'string' ? config.tenant.trim() : '';
  if (requestedTenant !== tenant) throw new Error('A2A push notification tenant does not match authoritative tenant');
  return {
    tenant,
    id: configId,
    taskId: authoritativeTaskId,
    url: normalizePushUrl(config.url, { allowInsecureLoopback }),
    token: typeof config.token === 'string'
      ? boundedString(config.token, 'A2A push notification token', { allowEmpty: true, maxBytes: DEFAULT_MAX_TOKEN_BYTES })
      : '',
    authentication: normalizeAuthentication(config.authentication)
  };
}

export class A2aPushNotificationStore {
  constructor({ maxConfigsPerTask = DEFAULT_MAX_CONFIGS_PER_TASK, allowInsecureLoopback = true, tenant = '' } = {}) {
    if (!Number.isInteger(maxConfigsPerTask) || maxConfigsPerTask < 1 || maxConfigsPerTask > 64) {
      throw new Error('A2A maxConfigsPerTask must be an integer between 1 and 64');
    }
    if (typeof tenant !== 'string') throw new Error('A2A push notification tenant must be a string');
    this.maxConfigsPerTask = maxConfigsPerTask;
    this.allowInsecureLoopback = allowInsecureLoopback;
    this.tenant = tenant;
    this.byTaskId = new Map();
  }

  create(task, ownerKey, config, { tenant = this.tenant } = {}) {
    if (!task || task.id === undefined) throw new Error('A2A task is required for push configuration');
    if (task.ownerKey !== ownerKey) throw new Error('A2A push configuration owner mismatch');
    if (tenant !== this.tenant) throw new Error('A2A push notification tenant does not match authoritative tenant');
    const normalized = normalizeTaskPushNotificationConfig(config, {
      taskId: task.id,
      tenant: this.tenant,
      allowInsecureLoopback: this.allowInsecureLoopback
    });
    const configs = this.byTaskId.get(task.id) || new Map();
    if (!configs.has(normalized.id) && configs.size >= this.maxConfigsPerTask) {
      throw new Error('A2A push notification config capacity reached for task');
    }
    configs.set(normalized.id, { ownerKey, config: normalized });
    this.byTaskId.set(task.id, configs);
    return structuredClone(normalized);
  }

  get(task, ownerKey, configId) {
    if (!task || task.ownerKey !== ownerKey) return null;
    const record = this.byTaskId.get(task.id)?.get(configId);
    if (!record || record.ownerKey !== ownerKey) return null;
    return structuredClone(record.config);
  }

  list(task, ownerKey) {
    if (!task || task.ownerKey !== ownerKey) return [];
    return [...(this.byTaskId.get(task.id)?.values() || [])]
      .filter((record) => record.ownerKey === ownerKey)
      .map((record) => structuredClone(record.config));
  }

  delete(task, ownerKey, configId) {
    if (!task || task.ownerKey !== ownerKey) return false;
    const configs = this.byTaskId.get(task.id);
    const record = configs?.get(configId);
    if (!record || record.ownerKey !== ownerKey) return false;
    configs.delete(configId);
    if (configs.size === 0) this.byTaskId.delete(task.id);
    return true;
  }

  clearTask(taskId) {
    return this.byTaskId.delete(taskId);
  }
}