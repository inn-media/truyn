import { randomUUID } from 'node:crypto';
import { A2A_TASK_STATES, artifactFromTruynResult, artifactsFromTruynResult } from './mapping.js';

const TERMINAL = new Set([
  A2A_TASK_STATES.completed,
  A2A_TASK_STATES.failed,
  A2A_TASK_STATES.rejected,
  A2A_TASK_STATES.canceled
]);

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function cloneList(values) {
  return values.map((value) => structuredClone(value));
}

function boundedHistory(history, historyLength) {
  if (historyLength === 0) return undefined;
  if (!Number.isInteger(historyLength) || historyLength < 0) return cloneList(history);
  return cloneList(history.slice(-historyLength));
}

function messageCorrelationKey(ownerKey, message) {
  const messageId = typeof message?.messageId === 'string' && message.messageId.length > 0 ? message.messageId : null;
  if (!messageId) return null;
  return JSON.stringify([ownerKey, messageId]);
}

function statusUpdateEvent(task, metadata = undefined) {
  return {
    statusUpdate: {
      taskId: task.id,
      contextId: task.contextId,
      status: structuredClone(task.status),
      ...(metadata === undefined ? {} : { metadata: structuredClone(metadata) })
    }
  };
}

export class A2aTaskStore {
  constructor({ maxTasks = 1024, maxReplayMarkers = null, taskTtlMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
    if (!Number.isInteger(maxTasks) || maxTasks < 1) throw new Error('A2A maxTasks must be a positive integer');
    if (!Number.isInteger(taskTtlMs) || taskTtlMs < 1) throw new Error('A2A taskTtlMs must be a positive integer');
    const replayCapacity = maxReplayMarkers === null ? Math.max(1024, maxTasks * 4) : maxReplayMarkers;
    if (!Number.isSafeInteger(replayCapacity) || replayCapacity < 1) throw new Error('A2A maxReplayMarkers must be a positive safe integer');
    this.maxTasks = maxTasks;
    this.maxReplayMarkers = replayCapacity;
    this.taskTtlMs = taskTtlMs;
    this.now = now;
    this.tasks = new Map();
    this.byTruynRequestId = new Map();
    this.byMessageCorrelation = new Map();
    this.messageCorrelationByTaskId = new Map();
  }

  touchReplayMarker(task, nowMs = this.now()) {
    const correlationKey = this.messageCorrelationByTaskId.get(task?.id);
    if (!correlationKey) return;
    const record = this.byMessageCorrelation.get(correlationKey);
    if (!record) return;
    record.taskId = task.id;
    record.expiresAtMs = nowMs + this.taskTtlMs;
  }

  prune() {
    const nowMs = this.now();
    const threshold = nowMs - this.taskTtlMs;
    for (const [correlationKey, record] of this.byMessageCorrelation) {
      if (record.expiresAtMs < nowMs) this.byMessageCorrelation.delete(correlationKey);
    }
    for (const [id, task] of this.tasks) {
      const modified = Date.parse(task.lastModified || task.createdAt || '') || 0;
      if (modified < threshold) this.delete(id, { forgetCorrelation: true });
    }
    while (this.tasks.size >= this.maxTasks) {
      const terminal = [...this.tasks.values()].find((task) => TERMINAL.has(task.status.state));
      if (!terminal) throw new Error('A2A task capacity reached');
      this.delete(terminal.id, { forgetCorrelation: false });
    }
  }

  delete(taskId, { forgetCorrelation = false } = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.truynRequestId) this.byTruynRequestId.delete(task.truynRequestId);
    const correlationKey = this.messageCorrelationByTaskId.get(taskId);
    if (forgetCorrelation && correlationKey) this.byMessageCorrelation.delete(correlationKey);
    this.messageCorrelationByTaskId.delete(taskId);
    this.tasks.delete(taskId);
    return true;
  }

  create({ ownerKey = null, contextId = null, message, skill }) {
    this.prune();
    const correlationKey = messageCorrelationKey(ownerKey, message);
    if (correlationKey && this.byMessageCorrelation.has(correlationKey)) {
      const error = new Error('A2A messageId replay detected');
      error.code = 'A2A_MESSAGE_ID_REPLAY';
      throw error;
    }
    if (correlationKey && this.byMessageCorrelation.size >= this.maxReplayMarkers) {
      const error = new Error('A2A replay marker capacity reached');
      error.code = 'A2A_REPLAY_CAPACITY_REACHED';
      throw error;
    }
    const createdAtMs = this.now();
    const timestamp = nowIso(createdAtMs);
    const task = {
      id: randomUUID(),
      contextId: contextId || randomUUID(),
      ownerKey,
      skillId: skill.id,
      capability: skill.capability,
      status: { state: A2A_TASK_STATES.submitted, timestamp },
      artifacts: [],
      history: [structuredClone(message)],
      createdAt: timestamp,
      lastModified: timestamp,
      truynRequestId: null,
      providerNodeId: null,
      providerTrust: null,
      streamArtifactId: null,
      streamEvents: []
    };
    this.tasks.set(task.id, task);
    if (correlationKey) {
      this.byMessageCorrelation.set(correlationKey, {
        taskId: task.id,
        expiresAtMs: createdAtMs + this.taskTtlMs
      });
      this.messageCorrelationByTaskId.set(task.id, correlationKey);
    }
    return task;
  }

  get(taskId) {
    this.prune();
    return this.tasks.get(taskId) || null;
  }

  getAccessible(taskId, ownerKey, { allowAnonymous = false } = {}) {
    const task = this.get(taskId);
    if (!task) return null;
    if (task.ownerKey === null) return allowAnonymous ? task : null;
    return ownerKey !== null && task.ownerKey === ownerKey ? task : null;
  }

  start(taskId, { truynRequestId, providerNodeId = null, providerTrust = null } = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('A2A task not found');
    if (!truynRequestId) throw new Error('TRUYN request id is required');
    const nowMs = this.now();
    task.truynRequestId = truynRequestId;
    task.providerNodeId = providerNodeId;
    task.providerTrust = providerTrust ? structuredClone(providerTrust) : null;
    task.status = { state: A2A_TASK_STATES.working, timestamp: nowIso(nowMs) };
    task.lastModified = task.status.timestamp;
    this.byTruynRequestId.set(truynRequestId, task.id);
    this.touchReplayMarker(task, nowMs);
    return task;
  }

  reject(taskId, message) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const nowMs = this.now();
    const timestamp = nowIso(nowMs);
    task.status = {
      state: A2A_TASK_STATES.rejected,
      timestamp,
      message: {
        messageId: randomUUID(),
        role: 'ROLE_AGENT',
        parts: [{ text: String(message || 'Task rejected'), mediaType: 'text/plain' }]
      }
    };
    task.lastModified = timestamp;
    task.streamEvents.push(statusUpdateEvent(task, { 'io.truyn/source': 'dispatch' }));
    this.touchReplayMarker(task, nowMs);
    return task;
  }

  cancel(taskId, message = 'Task canceled') {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.status.state === A2A_TASK_STATES.canceled) return task;
    if (TERMINAL.has(task.status.state)) return null;
    const nowMs = this.now();
    const timestamp = nowIso(nowMs);
    task.status = {
      state: A2A_TASK_STATES.canceled,
      timestamp,
      message: {
        messageId: randomUUID(),
        role: 'ROLE_AGENT',
        parts: [{ text: String(message), mediaType: 'text/plain' }]
      }
    };
    task.lastModified = timestamp;
    task.streamEvents.push(statusUpdateEvent(task, { 'io.truyn/source': 'revoke' }));
    this.touchReplayMarker(task, nowMs);
    return task;
  }

  completeResult(task, { output, metadata = {}, providerNodeId = null, providerTrust = null } = {}) {
    if (!task || TERMINAL.has(task.status.state)) return task || null;
    const nowMs = this.now();
    const timestamp = nowIso(nowMs);
    task.providerNodeId = providerNodeId || task.providerNodeId;
    task.providerTrust = providerTrust ? structuredClone(providerTrust) : task.providerTrust;
    task.lastModified = timestamp;
    this.touchReplayMarker(task, nowMs);

    if (metadata?.failed) {
      task.status = {
        state: A2A_TASK_STATES.failed,
        timestamp,
        message: {
          messageId: randomUUID(),
          role: 'ROLE_AGENT',
          parts: [{ text: String(metadata.error || 'TRUYN provider execution failed'), mediaType: 'text/plain' }]
        }
      };
      task.streamEvents.push(statusUpdateEvent(task, { 'io.truyn/source': 'result' }));
      return task;
    }

    try {
      task.artifacts = artifactsFromTruynResult(output, {
        artifactId: randomUUID(),
        requestId: task.truynRequestId,
        providerNodeId: task.providerNodeId,
        trust: task.providerTrust,
        metadata
      });
      task.status = { state: A2A_TASK_STATES.completed, timestamp };
    } catch (error) {
      task.artifacts = [];
      task.status = {
        state: A2A_TASK_STATES.failed,
        timestamp,
        message: {
          messageId: randomUUID(),
          role: 'ROLE_AGENT',
          parts: [{ text: 'TRUYN result failed A2A artifact integrity validation', mediaType: 'text/plain' }],
          metadata: {
            'io.truyn/errorCode': error?.code || 'A2A_ARTIFACT_MAPPING_FAILED'
          }
        }
      };
    }
    task.streamEvents.push(statusUpdateEvent(task, { 'io.truyn/source': 'result' }));
    return task;
  }

  completeFromTruynEvent(event) {
    if (!event || event.kind !== 'RESULT' || event.verification?.ok !== true) return null;
    const requestId = event.envelope?.payload?.requestId;
    const taskId = this.byTruynRequestId.get(requestId);
    if (!taskId) return null;
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.providerNodeId && event.envelope?.from !== task.providerNodeId) return null;
    const payload = event.envelope.payload || {};
    return this.completeResult(task, {
      output: payload.output,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      providerNodeId: event.envelope.from || task.providerNodeId,
      providerTrust: event.trust || task.providerTrust
    });
  }

  recordCompactEvent(event) {
    if (!event || event.verification?.ok !== true) return null;
    const requestId = event.requestId || event.frame?.i;
    const taskId = this.byTruynRequestId.get(requestId);
    if (!taskId) return null;
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.providerNodeId && event.from && event.from !== task.providerNodeId) return null;
    if (TERMINAL.has(task.status.state)) return task;

    if (event.kind === 'PARTIAL') {
      const sequence = event.payload?.sequence;
      if (!Number.isSafeInteger(sequence) || sequence < 0 || !Object.prototype.hasOwnProperty.call(event.payload || {}, 'delta')) return null;
      try {
        task.streamArtifactId ||= randomUUID();
        const artifact = artifactFromTruynResult(event.payload.delta, {
          artifactId: task.streamArtifactId,
          requestId,
          providerNodeId: event.from || task.providerNodeId,
          trust: event.trust || task.providerTrust,
          metadata: event.payload.metadata || null
        });
        task.streamEvents.push({
          artifactUpdate: {
            taskId: task.id,
            contextId: task.contextId,
            artifact,
            append: sequence > 0,
            lastChunk: false,
            metadata: { 'io.truyn/sequence': sequence }
          }
        });
      } catch (error) {
        const nowMs = this.now();
        task.status = {
          state: A2A_TASK_STATES.failed,
          timestamp: nowIso(nowMs),
          message: {
            messageId: randomUUID(),
            role: 'ROLE_AGENT',
            parts: [{ text: 'TRUYN partial failed A2A artifact integrity validation', mediaType: 'text/plain' }],
            metadata: { 'io.truyn/errorCode': error?.code || 'A2A_PARTIAL_MAPPING_FAILED' }
          }
        };
        task.lastModified = task.status.timestamp;
        task.streamEvents.push(statusUpdateEvent(task, { 'io.truyn/source': 'partial' }));
      }
      return task;
    }

    if (event.kind === 'RESULT') {
      return this.completeResult(task, {
        output: event.payload?.output,
        metadata: event.payload?.metadata && typeof event.payload.metadata === 'object' ? event.payload.metadata : {},
        providerNodeId: event.from || task.providerNodeId,
        providerTrust: event.trust || task.providerTrust
      });
    }
    return null;
  }

  streamEventsSince(task, cursor = 0) {
    if (!task) return { events: [], cursor: 0 };
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? Math.min(cursor, task.streamEvents.length) : 0;
    return {
      events: cloneList(task.streamEvents.slice(safeCursor)),
      cursor: task.streamEvents.length
    };
  }

  snapshot(task, { historyLength, includeArtifacts = true } = {}) {
    const result = {
      id: task.id,
      contextId: task.contextId,
      status: structuredClone(task.status)
    };
    if (includeArtifacts && task.artifacts.length > 0) result.artifacts = cloneList(task.artifacts);
    const history = boundedHistory(task.history, historyLength);
    if (history !== undefined && history.length > 0) result.history = history;
    return result;
  }

  isTerminal(task) {
    return Boolean(task && TERMINAL.has(task.status.state));
  }
}