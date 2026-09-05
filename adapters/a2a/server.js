import http from 'node:http';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES, a2aError, a2aErrorData, mapA2aMessageToTruynInput, normalizeA2aMessage, normalizeA2aSkill, projectA2aSkill } from './mapping.js';
import { A2aTaskStore } from './task-store.js';
import { A2aPushNotificationStore } from './push-notification-store.js';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_BLOCKING_WAIT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 25;
const DEFAULT_PUSH_DELIVERY_TIMEOUT_MS = 5_000;
const AUTHENTICATION_ERROR_CODE = -32000;
const TASK_NOT_FOUND_ERROR_CODE = -32001;
const TASK_NOT_CANCELABLE_ERROR_CODE = -32002;
const PUSH_NOTIFICATION_NOT_SUPPORTED_ERROR_CODE = -32003;
const UNSUPPORTED_OPERATION_ERROR_CODE = -32004;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAsyncIterable(value) {
  return Boolean(value) && typeof value[Symbol.asyncIterator] === 'function';
}

function sendJson(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(data);
}

function beginSse(res) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff'
  });
}

function writeSse(res, body, { event = null } = {}) {
  if (res.writableEnded) return;
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(body)}\n\n`);
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('request_too_large');
      error.httpStatus = 413;
      error.closeConnection = true;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) throw a2aError(-32600, 'Invalid Request', 'INVALID_REQUEST');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw a2aError(-32700, 'Parse error', 'PARSE_ERROR');
  }
}

function assertLoopback(host) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The reference A2A facade is loopback-only; place an authenticated gateway in front for remote exposure');
  }
}

function normalizeRpcPath(value) {
  const path = String(value || '/a2a').trim();
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) throw new Error('A2A rpcPath must be an absolute path');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function requestId(body) {
  return Object.prototype.hasOwnProperty.call(body || {}, 'id') ? body.id : null;
}

function errorResponse(id, error) {
  const code = Number.isInteger(error?.a2aCode) ? error.a2aCode : -32603;
  const response = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message: code === -32603 ? 'Internal error' : String(error?.message || 'A2A error')
    }
  };
  const data = a2aErrorData(error);
  if (data) response.error.data = data;
  return response;
}

function stablePrincipalKey(principal, principalKey) {
  if (principal === null || principal === undefined) return null;
  if (principalKey) {
    const value = principalKey(principal);
    if (typeof value !== 'string' || value.length === 0) throw new Error('A2A principalKey must return a non-empty string');
    return value;
  }
  if (typeof principal === 'string' && principal.length > 0) return principal;
  for (const key of ['id', 'sub', 'subject', 'nodeId']) {
    if (typeof principal?.[key] === 'string' && principal[key].length > 0) return principal[key];
  }
  throw new Error('Authenticated A2A principal requires a stable id/sub/subject/nodeId or principalKey hook');
}

function normalizeAgent(agent = {}) {
  const required = ['name', 'description', 'version'];
  for (const field of required) {
    if (typeof agent[field] !== 'string' || agent[field].trim().length === 0) throw new Error(`A2A agent ${field} is required`);
  }
  const result = {
    name: agent.name.trim(),
    description: agent.description.trim(),
    version: agent.version.trim()
  };
  for (const field of ['documentationUrl', 'iconUrl']) if (typeof agent[field] === 'string' && agent[field].trim()) result[field] = agent[field].trim();
  if (isObject(agent.provider)) result.provider = structuredClone(agent.provider);
  return result;
}

function aggregateModes(skills, field, fallback) {
  const values = [...new Set(skills.flatMap((skill) => skill[field]))];
  return values.length > 0 ? values : fallback;
}

function resultMetadataPolicy(task, message, skill) {
  return {
    interoperability: {
      protocol: 'a2a',
      protocolVersion: A2A_PROTOCOL_VERSION,
      taskId: task.id,
      contextId: task.contextId,
      messageId: message.messageId,
      skillId: skill.id
    }
  };
}

export function createA2aServer({
  node,
  agent,
  skills,
  authenticate = null,
  authorize = null,
  principalKey = null,
  selectSkill = null,
  buildPolicy = null,
  securitySchemes = null,
  security = null,
  rpcPath = '/a2a',
  advertiseUrl = null,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  maxBlockingWaitMs = DEFAULT_BLOCKING_WAIT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxTasks = 1024,
  taskTtlMs = 60 * 60 * 1000,
  allowAnonymousTaskAccess = false,
  enableStreaming = false,
  enableCancellation = false,
  enablePushNotifications = false,
  deliverPushNotification = null,
  maxPushConfigsPerTask = 8,
  pushDeliveryTimeoutMs = DEFAULT_PUSH_DELIVERY_TIMEOUT_MS
} = {}) {
  if (!node) throw new Error('node is required');
  const normalizedAgent = normalizeAgent(agent);
  if (!Array.isArray(skills) || skills.length === 0) throw new Error('A2A facade requires at least one configured skill');
  const normalizedSkills = skills.map(normalizeA2aSkill);
  const skillIds = new Set();
  for (const skill of normalizedSkills) {
    if (skillIds.has(skill.id)) throw new Error(`Duplicate A2A skill id: ${skill.id}`);
    skillIds.add(skill.id);
  }
  for (const [name, hook] of Object.entries({ authenticate, authorize, principalKey, selectSkill, buildPolicy })) {
    if (hook !== null && hook !== undefined && typeof hook !== 'function') throw new Error(`A2A ${name} must be a function`);
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new Error('A2A maxBodyBytes must be an integer >= 1024');
  if (!Number.isInteger(maxBlockingWaitMs) || maxBlockingWaitMs < 1) throw new Error('A2A maxBlockingWaitMs must be a positive integer');
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 0) throw new Error('A2A pollIntervalMs must be a non-negative integer');
  if (typeof enableStreaming !== 'boolean') throw new Error('A2A enableStreaming must be boolean');
  if (typeof enableCancellation !== 'boolean') throw new Error('A2A enableCancellation must be boolean');
  if (typeof enablePushNotifications !== 'boolean') throw new Error('A2A enablePushNotifications must be boolean');
  if (deliverPushNotification !== null && deliverPushNotification !== undefined && typeof deliverPushNotification !== 'function') throw new Error('A2A deliverPushNotification must be a function');
  if (enablePushNotifications && typeof deliverPushNotification !== 'function') throw new Error('A2A push notifications require an explicit deliverPushNotification hook');
  if (!Number.isInteger(pushDeliveryTimeoutMs) || pushDeliveryTimeoutMs < 1) throw new Error('A2A pushDeliveryTimeoutMs must be a positive integer');

  const normalizedRpcPath = normalizeRpcPath(rpcPath);
  const store = new A2aTaskStore({ maxTasks, taskTtlMs });
  const pushStore = new A2aPushNotificationStore({ maxConfigsPerTask: maxPushConfigsPerTask });
  const pushCursorByTaskId = new Map();
  let registered = false;
  let registerPromise = null;
  let pollTail = Promise.resolve();
  let compactPollTail = Promise.resolve();
  let listeningUrl = null;

  async function ensureRegistered() {
    if (registered && node.sessionToken) return;
    if (!registerPromise) {
      registerPromise = node.register({ name: 'truyn-a2a-facade', protocols: ['TRUYN/1', 'A2A/1.0'] })
        .then(() => { registered = true; })
        .finally(() => { registerPromise = null; });
    }
    await registerPromise;
  }

  async function authenticateRequest(req) {
    if (!authenticate) return null;
    try {
      return await authenticate(req);
    } catch (cause) {
      throw a2aError(AUTHENTICATION_ERROR_CODE, 'Authentication required', 'AUTHENTICATION_REQUIRED', {
        cause: cause?.message || 'authentication_failed'
      });
    }
  }

  async function requestAuth(req) {
    const principal = await authenticateRequest(req);
    return { principal, ownerKey: stablePrincipalKey(principal, principalKey) };
  }

  async function skillAuthorized(skill, principal, req, operation) {
    if (skill.visibility === 'authenticated' && !principal) return false;
    if (skill.visibility === 'authenticated' && !authorize) return false;
    if (!authorize) return skill.visibility === 'public';
    return Boolean(await authorize({ principal, skill, operation, req }));
  }

  async function discoverSkillOffers(skill) {
    await ensureRegistered();
    const result = await node.find(skill.capability);
    return Array.isArray(result?.offers) ? result.offers : [];
  }

  function offerAccessMode(offer) {
    return offer?.payload?.metadata?.accessMode || null;
  }

  function isOwnOffer(offer) {
    return offer?.from === node.identity?.nodeId;
  }

  async function skillOperationallyVisible(skill, principal, req, operation) {
    if (!(await skillAuthorized(skill, principal, req, operation))) return false;
    const offers = await discoverSkillOffers(skill);
    const dispatchableOffers = offers.filter((offer) => !isOwnOffer(offer));
    if (dispatchableOffers.length === 0) return false;
    if (skill.visibility === 'public') return dispatchableOffers.every((offer) => offerAccessMode(offer) === 'public');
    return true;
  }

  async function visibleSkills(principal, req, { extended = false, operation = 'discover' } = {}) {
    const projected = [];
    for (const skill of normalizedSkills) {
      if (!extended && skill.visibility !== 'public') continue;
      if (await skillOperationallyVisible(skill, principal, req, operation)) projected.push(skill);
    }
    return projected;
  }

  function rpcUrl() {
    if (advertiseUrl) return String(advertiseUrl);
    if (!listeningUrl) throw new Error('A2A server must listen before Agent Card projection');
    return `${listeningUrl}${normalizedRpcPath === '/' ? '' : normalizedRpcPath}`;
  }

  async function agentCard(principal, req, { extended = false } = {}) {
    const allowed = await visibleSkills(principal, req, { extended, operation: 'discover' });
    const hasExtended = Boolean(authenticate && authorize && normalizedSkills.some((skill) => skill.visibility === 'authenticated'));
    const card = {
      ...normalizedAgent,
      capabilities: {
        streaming: enableStreaming,
        pushNotifications: enablePushNotifications,
        extendedAgentCard: hasExtended
      },
      defaultInputModes: aggregateModes(allowed, 'inputModes', ['text/plain', 'application/json']),
      defaultOutputModes: aggregateModes(allowed, 'outputModes', ['text/plain', 'application/json']),
      skills: allowed.map(projectA2aSkill),
      supportedInterfaces: [{ url: rpcUrl(), protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }]
    };
    if (securitySchemes && isObject(securitySchemes)) card.securitySchemes = structuredClone(securitySchemes);
    if (Array.isArray(security)) card.security = structuredClone(security);
    return card;
  }

  async function deliverWithTimeout(payload) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve(deliverPushNotification(payload)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A2A push delivery timed out')), pushDeliveryTimeoutMs); })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function deliverPendingPushEvents(task) {
    if (!enablePushNotifications || !task) return;
    const from = pushCursorByTaskId.get(task.id) || 0;
    const batch = store.streamEventsSince(task, from);
    pushCursorByTaskId.set(task.id, batch.cursor);
    if (batch.events.length === 0) return;
    const configs = pushStore.list(task, task.ownerKey);
    if (configs.length === 0) return;
    for (const event of batch.events) {
      for (const config of configs) {
        try {
          await deliverWithTimeout({
            config: structuredClone(config),
            event: structuredClone(event),
            task: store.snapshot(task)
          });
        } catch {
          // Delivery is deliberately non-authoritative: callback failure must not change TRUYN/A2A task state.
        }
      }
    }
  }

  async function drainTruynEvents() {
    const run = pollTail.then(async () => {
      await ensureRegistered();
      const polled = await node.poll();
      for (const event of polled.events || []) {
        const task = store.completeFromTruynEvent(event);
        await deliverPendingPushEvents(task);
      }
      return polled;
    });
    pollTail = run.catch(() => {});
    return run;
  }

  async function drainCompactEvents() {
    const run = compactPollTail.then(async () => {
      await ensureRegistered();
      const polled = await node.pollCompact({ waitMs: 0 });
      for (const event of polled.events || []) {
        const task = store.recordCompactEvent(event);
        await deliverPendingPushEvents(task);
      }
      return polled;
    });
    compactPollTail = run.catch(() => {});
    return run;
  }

  async function waitForTerminal(task) {
    const deadline = Date.now() + maxBlockingWaitMs;
    while (!store.isTerminal(task)) {
      await drainTruynEvents();
      if (store.isTerminal(task)) break;
      if (Date.now() >= deadline) throw new Error('A2A blocking task wait timed out');
      await delay(pollIntervalMs);
    }
    return task;
  }

  async function chooseSkill(message, principal, req) {
    const candidates = await visibleSkills(principal, req, { extended: true, operation: 'execute' });
    const requestedId = isObject(message.metadata) && typeof message.metadata['io.truyn/skillId'] === 'string'
      ? message.metadata['io.truyn/skillId']
      : null;
    if (requestedId) {
      const selected = candidates.find((skill) => skill.id === requestedId);
      if (!selected) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
      return selected;
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) throw a2aError(-32602, 'No authorized A2A skill is available', 'INVALID_PARAMS');
    if (!selectSkill) throw a2aError(-32602, 'Multiple authorized A2A skills require a server-side selection policy', 'INVALID_PARAMS');
    const selected = await selectSkill({ message: structuredClone(message), principal, skills: [...candidates] });
    const id = typeof selected === 'string' ? selected : selected?.id;
    const matched = candidates.find((skill) => skill.id === id);
    if (!matched) throw a2aError(-32602, 'A2A selection policy returned an unauthorized skill', 'INVALID_PARAMS');
    return matched;
  }

  async function createTaskFromRequest(params, req, { compact = false, auth = null } = {}) {
    if (!isObject(params)) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const message = normalizeA2aMessage(params.message);
    const resolvedAuth = auth || await requestAuth(req);
    const { principal, ownerKey } = resolvedAuth;

    if (message.taskId) {
      const existing = store.getAccessible(message.taskId, ownerKey, { allowAnonymous: allowAnonymousTaskAccess });
      if (!existing) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Task not found', 'TASK_NOT_FOUND', { taskId: message.taskId });
      throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'Task continuation is not supported by the bounded A2A facade', 'UNSUPPORTED_OPERATION', { taskId: message.taskId });
    }

    const skill = await chooseSkill(message, principal, req);
    if (Array.isArray(params.configuration?.acceptedOutputModes) && params.configuration.acceptedOutputModes.some((mode) => !skill.outputModes.includes(mode))) {
      throw a2aError(-32005, 'Requested output mode is not supported', 'CONTENT_TYPE_NOT_SUPPORTED');
    }

    const task = store.create({ ownerKey, contextId: message.contextId || null, message, skill });
    if (params.configuration?.taskPushNotificationConfig !== undefined) {
      if (!enablePushNotifications) throw a2aError(PUSH_NOTIFICATION_NOT_SUPPORTED_ERROR_CODE, 'Push notifications are not enabled', 'PUSH_NOTIFICATION_NOT_SUPPORTED');
      try {
        pushStore.create(task, ownerKey, params.configuration.taskPushNotificationConfig, { tenant: '' });
        pushCursorByTaskId.set(task.id, task.streamEvents.length);
      } catch (error) {
        store.delete(task.id, { forgetCorrelation: true });
        throw a2aError(-32602, 'Invalid task push notification configuration', 'INVALID_PARAMS', { cause: error.message });
      }
    }

    const input = await mapA2aMessageToTruynInput(skill, message, { principal, taskId: task.id, contextId: task.contextId });
    const policyFromHook = buildPolicy ? await buildPolicy({ principal, skill, message: structuredClone(message), task: store.snapshot(task) }) : {};
    if (!isObject(policyFromHook)) throw new Error('A2A buildPolicy must return an object');
    const policy = { ...structuredClone(policyFromHook), ...resultMetadataPolicy(task, message, skill) };

    try {
      await ensureRegistered();
      const matched = compact
        ? await node.compactNeed(skill.capability, input, policy, { waitMs: 0 })
        : await node.need(skill.capability, input, policy);
      store.start(task.id, {
        truynRequestId: matched.needId,
        providerNodeId: matched.provider || null,
        providerTrust: matched.providerTrust || matched.trust || null
      });
    } catch (error) {
      store.reject(task.id, error?.body?.error || error.message || 'TRUYN dispatch rejected');
      await deliverPendingPushEvents(task);
    }
    return { task, principal, ownerKey, skill, message };
  }

  async function sendMessage(params, req) {
    const returnImmediately = Boolean(params?.configuration?.returnImmediately);
    const auth = await requestAuth(req);
    if (returnImmediately && auth.ownerKey === null && !allowAnonymousTaskAccess) {
      throw a2aError(-32602, 'Anonymous non-blocking tasks are disabled because they cannot be securely polled', 'INVALID_PARAMS');
    }
    const created = await createTaskFromRequest(params, req, { compact: false, auth });
    if (!returnImmediately && !store.isTerminal(created.task)) await waitForTerminal(created.task);
    return { task: store.snapshot(created.task) };
  }

  async function getTask(params, req) {
    if (!isObject(params) || typeof params.id !== 'string' || params.id.length === 0) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    if (params.historyLength !== undefined && (!Number.isInteger(params.historyLength) || params.historyLength < 0)) throw a2aError(-32602, 'Invalid historyLength', 'INVALID_PARAMS');
    const { ownerKey } = await requestAuth(req);
    await Promise.all([drainTruynEvents(), drainCompactEvents()]);
    const task = store.getAccessible(params.id, ownerKey, { allowAnonymous: allowAnonymousTaskAccess });
    if (!task) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Task not found', 'TASK_NOT_FOUND', { taskId: params.id });
    return store.snapshot(task, { historyLength: params.historyLength });
  }

  async function cancelTask(params, req) {
    if (!enableCancellation) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'CancelTask is not enabled', 'UNSUPPORTED_OPERATION');
    if (!isObject(params) || typeof params.id !== 'string' || params.id.length === 0) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { ownerKey } = await requestAuth(req);
    await Promise.all([drainTruynEvents(), drainCompactEvents()]);
    const task = store.getAccessible(params.id, ownerKey, { allowAnonymous: allowAnonymousTaskAccess });
    if (!task) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Task not found', 'TASK_NOT_FOUND', { taskId: params.id });
    if (task.status.state === A2A_TASK_STATES.canceled) return store.snapshot(task);
    if (store.isTerminal(task)) throw a2aError(TASK_NOT_CANCELABLE_ERROR_CODE, 'Task is already terminal and cannot be canceled', 'TASK_NOT_CANCELABLE', { taskId: params.id });
    if (!task.truynRequestId) throw a2aError(TASK_NOT_CANCELABLE_ERROR_CODE, 'Task has no active TRUYN request', 'TASK_NOT_CANCELABLE', { taskId: params.id });

    try {
      await node.revoke(task.truynRequestId, 'a2a_cancelled', { targetKind: 'need' });
    } catch (error) {
      if (error?.status === 409) {
        await Promise.all([drainTruynEvents(), drainCompactEvents()]);
        if (store.isTerminal(task)) throw a2aError(TASK_NOT_CANCELABLE_ERROR_CODE, 'Task became terminal before cancellation', 'TASK_NOT_CANCELABLE', { taskId: params.id });
      }
      throw error;
    }
    store.cancel(task.id, 'Task canceled by A2A requester');
    await deliverPendingPushEvents(task);
    return store.snapshot(task);
  }

  async function* streamTask(task, { cursor = 0 } = {}) {
    yield { task: store.snapshot(task) };
    if (store.isTerminal(task)) return;
    const deadline = Date.now() + maxBlockingWaitMs;
    let nextCursor = cursor;
    while (!store.isTerminal(task)) {
      await drainCompactEvents();
      const batch = store.streamEventsSince(task, nextCursor);
      nextCursor = batch.cursor;
      for (const event of batch.events) yield event;
      if (store.isTerminal(task)) break;
      if (Date.now() >= deadline) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'Bounded A2A stream timed out before terminal state', 'UNSUPPORTED_OPERATION', { taskId: task.id });
      await delay(pollIntervalMs);
    }
    const finalBatch = store.streamEventsSince(task, nextCursor);
    for (const event of finalBatch.events) yield event;
  }

  async function sendStreamingMessage(params, req) {
    if (!enableStreaming) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'SendStreamingMessage is not enabled', 'UNSUPPORTED_OPERATION');
    const created = await createTaskFromRequest(params, req, { compact: true });
    return streamTask(created.task);
  }

  async function subscribeToTask(params, req) {
    if (!enableStreaming) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'SubscribeToTask is not enabled', 'UNSUPPORTED_OPERATION');
    if (!isObject(params) || typeof params.id !== 'string' || params.id.length === 0) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { ownerKey } = await requestAuth(req);
    await drainCompactEvents();
    const task = store.getAccessible(params.id, ownerKey, { allowAnonymous: allowAnonymousTaskAccess });
    if (!task) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Task not found', 'TASK_NOT_FOUND', { taskId: params.id });
    if (store.isTerminal(task)) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'Terminal tasks cannot be resubscribed', 'UNSUPPORTED_OPERATION', { taskId: params.id });
    return streamTask(task, { cursor: task.streamEvents.length });
  }

  function requirePushEnabled() {
    if (!enablePushNotifications) throw a2aError(PUSH_NOTIFICATION_NOT_SUPPORTED_ERROR_CODE, 'Push notifications are not enabled', 'PUSH_NOTIFICATION_NOT_SUPPORTED');
  }

  async function accessiblePushTask(taskId, req) {
    if (typeof taskId !== 'string' || taskId.length === 0) throw a2aError(-32602, 'Invalid taskId', 'INVALID_PARAMS');
    const { ownerKey } = await requestAuth(req);
    const task = store.getAccessible(taskId, ownerKey, { allowAnonymous: allowAnonymousTaskAccess });
    if (!task) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Task not found', 'TASK_NOT_FOUND', { taskId });
    return { task, ownerKey };
  }

  async function createPushConfig(params, req) {
    requirePushEnabled();
    if (!isObject(params)) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { task, ownerKey } = await accessiblePushTask(params.taskId, req);
    try {
      const created = pushStore.create(task, ownerKey, params, { tenant: typeof params.tenant === 'string' ? params.tenant : '' });
      pushCursorByTaskId.set(task.id, task.streamEvents.length);
      return created;
    } catch (error) {
      throw a2aError(-32602, 'Invalid push notification configuration', 'INVALID_PARAMS', { cause: error.message });
    }
  }

  async function getPushConfig(params, req) {
    requirePushEnabled();
    if (!isObject(params) || typeof params.id !== 'string' || !params.id) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { task, ownerKey } = await accessiblePushTask(params.taskId, req);
    const config = pushStore.get(task, ownerKey, params.id);
    if (!config) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Push notification configuration not found', 'TASK_NOT_FOUND', { taskId: task.id });
    return config;
  }

  async function listPushConfigs(params, req) {
    requirePushEnabled();
    if (!isObject(params)) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { task, ownerKey } = await accessiblePushTask(params.taskId, req);
    return { configs: pushStore.list(task, ownerKey) };
  }

  async function deletePushConfig(params, req) {
    requirePushEnabled();
    if (!isObject(params) || typeof params.id !== 'string' || !params.id) throw a2aError(-32602, 'Invalid parameters', 'INVALID_PARAMS');
    const { task, ownerKey } = await accessiblePushTask(params.taskId, req);
    if (!pushStore.delete(task, ownerKey, params.id)) throw a2aError(TASK_NOT_FOUND_ERROR_CODE, 'Push notification configuration not found', 'TASK_NOT_FOUND', { taskId: task.id });
    return {};
  }

  async function getExtendedAgentCard(_params, req) {
    if (!authenticate || !authorize) throw a2aError(UNSUPPORTED_OPERATION_ERROR_CODE, 'Extended Agent Card is not supported', 'UNSUPPORTED_OPERATION');
    const principal = await authenticateRequest(req);
    if (!principal) throw a2aError(AUTHENTICATION_ERROR_CODE, 'Authentication required', 'AUTHENTICATION_REQUIRED');
    return agentCard(principal, req, { extended: true });
  }

  async function dispatchRpc(body, req) {
    if (!isObject(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || body.method.length === 0) throw a2aError(-32600, 'Invalid Request', 'INVALID_REQUEST');
    const version = String(req.headers['a2a-version'] || '').trim();
    if (version !== A2A_PROTOCOL_VERSION) {
      throw a2aError(-32009, `A2A version ${version || '0.3'} is not supported by this interface`, 'VERSION_NOT_SUPPORTED', {
        requestedVersion: version || '0.3', supportedVersion: A2A_PROTOCOL_VERSION
      });
    }
    if (body.method === 'SendMessage') return sendMessage(body.params || {}, req);
    if (body.method === 'SendStreamingMessage') return sendStreamingMessage(body.params || {}, req);
    if (body.method === 'SubscribeToTask') return subscribeToTask(body.params || {}, req);
    if (body.method === 'GetTask') return getTask(body.params || {}, req);
    if (body.method === 'CancelTask') return cancelTask(body.params || {}, req);
    if (body.method === 'CreateTaskPushNotificationConfig') return createPushConfig(body.params || {}, req);
    if (body.method === 'GetTaskPushNotificationConfig') return getPushConfig(body.params || {}, req);
    if (body.method === 'ListTaskPushNotificationConfigs') return listPushConfigs(body.params || {}, req);
    if (body.method === 'DeleteTaskPushNotificationConfig') return deletePushConfig(body.params || {}, req);
    if (body.method === 'GetExtendedAgentCard') return getExtendedAgentCard(body.params || {}, req);
    throw a2aError(-32601, 'Method not found', 'METHOD_NOT_FOUND');
  }

  const server = http.createServer(async (req, res) => {
    let body = null;
    try {
      const url = new URL(req.url, 'http://a2a.local');
      if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, protocol: 'A2A/1.0' });
      if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') return sendJson(res, 200, await agentCard(null, req, { extended: false }), { vary: 'A2A-Version, Authorization' });
      if (req.method === 'POST' && url.pathname === normalizedRpcPath) {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          body = { id: null };
          throw a2aError(-32600, 'A2A JSON-RPC requires application/json', 'INVALID_REQUEST');
        }
        body = await readJson(req, maxBodyBytes);
        const result = await dispatchRpc(body, req);
        if (isAsyncIterable(result)) {
          beginSse(res);
          try {
            for await (const event of result) writeSse(res, { jsonrpc: '2.0', id: requestId(body), result: event });
          } catch (error) {
            writeSse(res, errorResponse(requestId(body), error), { event: 'error' });
          } finally {
            if (!res.writableEnded) res.end();
          }
          return;
        }
        return sendJson(res, 200, { jsonrpc: '2.0', id: requestId(body), result });
      }
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      if (error.closeConnection && !res.headersSent) {
        res.shouldKeepAlive = false;
        res.setHeader('connection', 'close');
      }
      if (error.httpStatus === 413) return sendJson(res, 413, { ok: false, error: 'request_too_large' });
      return sendJson(res, 200, errorResponse(requestId(body), error));
    }
  });

  return {
    server,
    store,
    pushStore,
    async publicAgentCard() { return agentCard(null, { headers: {} }, { extended: false }); },
    async listen({ host = '127.0.0.1', port = 8792 } = {}) {
      assertLoopback(host);
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      listeningUrl = `http://${host}:${address.port}`;
      return listeningUrl;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
