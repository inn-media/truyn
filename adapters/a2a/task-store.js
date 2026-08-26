import { randomUUID } from 'node:crypto';
import { A2A_TASK_STATES, artifactsFromTruynResult } from './mapping.js';

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
  return `${ownerKey === null ? '<anonymous>' : ownerKey}\u0000${messageId}`;
}

export class A2aTaskStore {
  constructor({ maxTasks = 1024, taskTtlMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
    if (!Number.isInteger(maxTasks) || maxTasks < 1) throw new Error('A2A maxTasks must be a positive integer');
    if (!Number.isInteger(taskTtlMs) || taskTtlMs < 1) throw new Error('A2A taskTtlMs must be a positive integer');
    this.maxTasks = maxTasks;
    this.taskTtlMs = taskTtlMs;
    this.now = now;
    this.tasks = new Map();
    this.byTruynRequestId = new Map();
    this.byMessageCorrelation = new Map();
    this.messageCorrelationByTaskId = new Map();
  }

  prune() {
    const threshold = this.now() - this.taskTtlMs;
    for (const [id, task] of this.tasks) {
      const modified = Date.parse(task.lastModified || task.createdAt || '') || 0;
      if (modified < threshold) this.delete(id);
    }
    while (this.tasks.size >= this.maxTasks) {
      const terminal = [...this.tasks.values()].find((task) => TERMINAL.has(task.status.state));
      if (!terminal) throw new Error('A2A task capacity reached');
      this.delete(terminal.id);
    }
  }

  delete(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.truynRequestId) this.byTruynRequestId.delete(task.truynRequestId);
    const correlationKey = this.messageCorrelationByTaskId.get(taskId);
    if (correlationKey) this.byMessageCorrelation.delete(correlationKey);
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
    const timestamp = nowIso(this.now());
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
      providerTrust: null
    };
    this.tasks.set(task.id, task);
    if (correlationKey) {
      this.byMessageCorrelation.set(correlationKey, task.id);
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
    task.truynRequestId = truynRequestId;
    task.providerNodeId = providerNodeId;
    task.providerTrust = providerTrust ? structuredClone(providerTrust) : null;
    task.status = { state: A2A_TASK_STATES.working, timestamp: nowIso(this.now()) };
    task.lastModified = task.status.timestamp;
    this.byTruynRequestId.set(truynRequestId, task.id);
    return task;
  }

  reject(taskId, message) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const timestamp = nowIso(this.now());
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
    return task;
  }

  completeFromTruynEvent(event) {
    if (!event || event.kind !== 'RESULT' || event.verification?.ok !== true) return null;
    const requestId = event.envelope?.payload?.requestId;
    const taskId = this.byTruynRequestId.get(requestId);
    if (!taskId) return null;
    const task = this.tasks.get(taskId);
    if (!task || TERMINAL.has(task.status.state)) return task || null;

    const payload = event.envelope.payload || {};
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const failed = Boolean(metadata.failed);
    const timestamp = nowIso(this.now());
    task.providerNodeId = event.envelope.from || task.providerNodeId;
    task.providerTrust = event.trust ? structuredClone(event.trust) : task.providerTrust;
    task.lastModified = timestamp;

    if (failed) {
      task.status = {
        state: A2A_TASK_STATES.failed,
        timestamp,
        message: {
          messageId: randomUUID(),
          role: 'ROLE_AGENT',
          parts: [{ text: String(metadata.error || 'TRUYN provider execution failed'), mediaType: 'text/plain' }]
        }
      };
      return task;
    }

    try {
      task.artifacts = artifactsFromTruynResult(payload.output, {
        artifactId: randomUUID(),
        requestId,
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
    return task;
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
