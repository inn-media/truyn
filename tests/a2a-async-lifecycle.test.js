import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2aClient } from '../adapters/a2a/client.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';

function sendJson(res, body) {
  const data = JSON.stringify(body);
  res.writeHead(200, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function startAsyncAgent(t, {
  initialState = A2A_TASK_STATES.submitted,
  pollStates = [A2A_TASK_STATES.working, A2A_TASK_STATES.completed],
  taskId = 'task-c5-1',
  contextId = 'context-c5-1',
  getTaskId = null,
  getContextId = null,
  output = { answer: 'async-complete' }
} = {}) {
  let sendCount = 0;
  let getCount = 0;
  let lastConfiguration = null;
  const seenAuthorization = [];
  const seenVersions = [];

  const server = http.createServer(async (req, res) => {
    seenAuthorization.push(req.headers.authorization || null);
    seenVersions.push(req.headers['a2a-version'] || null);

    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      return sendJson(res, {
        name: 'C5 async agent',
        description: 'Long-running A2A test agent',
        version: '1.0.0',
        capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
        defaultInputModes: ['application/json'],
        defaultOutputModes: ['application/json'],
        skills: [{
          id: 'long-job',
          name: 'Long job',
          description: 'Runs a long-lived task',
          inputModes: ['application/json'],
          outputModes: ['application/json']
        }],
        supportedInterfaces: [{
          url: `${baseUrl}/a2a`,
          protocolBinding: 'JSONRPC',
          protocolVersion: A2A_PROTOCOL_VERSION
        }]
      });
    }

    if (req.method !== 'POST' || req.url !== '/a2a') {
      res.writeHead(404);
      res.end();
      return;
    }

    const body = await readJson(req);
    const response = { jsonrpc: '2.0', id: body.id };

    if (body.method === 'SendMessage') {
      sendCount += 1;
      lastConfiguration = body.params?.configuration || null;
      response.result = {
        task: {
          id: taskId,
          contextId,
          status: { state: initialState }
        }
      };
      return sendJson(res, response);
    }

    if (body.method === 'GetTask') {
      getCount += 1;
      const state = pollStates[Math.min(getCount - 1, pollStates.length - 1)];
      const returnedTaskId = getTaskId || taskId;
      const returnedContextId = getContextId || contextId;
      response.result = {
        id: returnedTaskId,
        contextId: returnedContextId,
        status: { state },
        ...(state === A2A_TASK_STATES.completed ? {
          artifacts: [{
            artifactId: 'artifact-c5-1',
            name: 'Async result',
            parts: [{ data: output, mediaType: 'application/json' }]
          }]
        } : {})
      };
      return sendJson(res, response);
    }

    response.error = { code: -32601, message: 'Method not found' };
    sendJson(res, response);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    cardUrl: `${baseUrl}/.well-known/agent-card.json`,
    get sendCount() { return sendCount; },
    get getCount() { return getCount; },
    get lastConfiguration() { return lastConfiguration; },
    get seenAuthorization() { return [...seenAuthorization]; },
    get seenVersions() { return [...seenVersions]; }
  };
}

function message() {
  return {
    messageId: 'message-c5-1',
    role: 'ROLE_USER',
    parts: [{ data: { prompt: 'run long task' }, mediaType: 'application/json' }]
  };
}

function skill() {
  return { id: 'long-job' };
}

test('C5 polling mode completes a long-running A2A task with one SendMessage and bounded GetTask polling', async (t) => {
  const remote = await startAsyncAgent(t, {
    pollStates: [A2A_TASK_STATES.working, A2A_TASK_STATES.working, A2A_TASK_STATES.completed]
  });
  let authCalls = 0;
  const adapter = await createA2aDiscoveryProvider({
    agentCardUrl: remote.cardUrl,
    allowSkills: ['long-job'],
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 1000,
    getAuthHeaders: async () => {
      authCalls += 1;
      return { authorization: 'Bearer c5-token' };
    }
  });

  assert.equal(adapter.discovery.taskExecutionMode, 'polling');
  const result = await adapter.execute({
    capability: 'a2a.long-job',
    input: { prompt: 'run long task' }
  });

  assert.deepEqual(result.output, { answer: 'async-complete' });
  assert.equal(remote.sendCount, 1, 'long-running execution must never resend SendMessage while polling');
  assert.equal(remote.getCount, 3);
  assert.deepEqual(remote.lastConfiguration, { returnImmediately: true });
  assert.equal(result.metadata.interoperability.remoteTaskId, 'task-c5-1');
  assert.equal(result.metadata.interoperability.remoteContextId, 'context-c5-1');
  assert.equal(result.metadata.interoperability.taskExecutionMode, 'polling');
  assert.equal(result.metadata.interoperability.taskPollCount, 3);
  assert.ok(authCalls >= 5, 'dynamic auth must be refreshed for card, SendMessage, and every GetTask');
  assert.ok(remote.seenAuthorization.every((value) => value === 'Bearer c5-token'));
  assert.ok(remote.seenVersions.every((value) => value === A2A_PROTOCOL_VERSION));
});

test('C5 GetTask correlation fails closed on task-id substitution', async (t) => {
  const remote = await startAsyncAgent(t, {
    initialState: A2A_TASK_STATES.working,
    pollStates: [A2A_TASK_STATES.completed],
    getTaskId: 'task-attacker'
  });
  const client = createA2aClient({
    agentCardUrl: remote.cardUrl,
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 1000
  });

  await assert.rejects(
    client.execute({ skill: skill(), message: message() }),
    (error) => error.code === 'A2A_TASK_ID_MISMATCH'
  );
  assert.equal(remote.sendCount, 1);
  assert.equal(remote.getCount, 1);
});

test('C5 task correlation fails closed when contextId changes during polling', async (t) => {
  const remote = await startAsyncAgent(t, {
    initialState: A2A_TASK_STATES.working,
    pollStates: [A2A_TASK_STATES.completed],
    getContextId: 'context-attacker'
  });
  const client = createA2aClient({
    agentCardUrl: remote.cardUrl,
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 1000
  });

  await assert.rejects(
    client.execute({ skill: skill(), message: message() }),
    (error) => error.code === 'A2A_CONTEXT_ID_MISMATCH'
  );
  assert.equal(remote.sendCount, 1);
  assert.equal(remote.getCount, 1);
});

test('C5 INPUT_REQUIRED stops without polling or duplicate execution', async (t) => {
  const remote = await startAsyncAgent(t, { initialState: A2A_TASK_STATES.inputRequired });
  const client = createA2aClient({
    agentCardUrl: remote.cardUrl,
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 1000
  });
  await assert.rejects(
    client.execute({ skill: skill(), message: message() }),
    (error) => error.code === 'A2A_INPUT_REQUIRED'
  );
  assert.equal(remote.sendCount, 1);
  assert.equal(remote.getCount, 0);
});

test('C5 AUTH_REQUIRED stops without polling or duplicate execution', async (t) => {
  const remote = await startAsyncAgent(t, { initialState: A2A_TASK_STATES.authRequired });
  const client = createA2aClient({
    agentCardUrl: remote.cardUrl,
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 1000
  });
  await assert.rejects(
    client.execute({ skill: skill(), message: message() }),
    (error) => error.code === 'A2A_AUTH_REQUIRED'
  );
  assert.equal(remote.sendCount, 1);
  assert.equal(remote.getCount, 0);
});

test('C5 working task timeout is bounded and never repeats SendMessage', async (t) => {
  const remote = await startAsyncAgent(t, {
    initialState: A2A_TASK_STATES.working,
    pollStates: [A2A_TASK_STATES.working]
  });
  const client = createA2aClient({
    agentCardUrl: remote.cardUrl,
    taskExecutionMode: 'polling',
    pollIntervalMs: 0,
    taskTimeoutMs: 5
  });
  await assert.rejects(
    client.execute({ skill: skill(), message: message() }),
    (error) => error.code === 'A2A_TASK_TIMEOUT'
  );
  assert.equal(remote.sendCount, 1);
  assert.ok(remote.getCount >= 1);
});
