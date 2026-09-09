import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

function message(text) {
  return {
    messageId: `p3-a1-negative-${Math.random().toString(16).slice(2)}`,
    role: 'ROLE_USER',
    parts: [{ text, mediaType: 'text/plain' }]
  };
}

async function rpc(url, method, params = {}) {
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Math.random()}`, method, params })
  });
  return response.json();
}

async function until(predicate, { timeoutMs = 4_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('condition_timeout');
}

test('P3-A1 push delivery hook failure is non-authoritative and terminal CancelTask fails closed', { timeout: 12_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  const facadeNode = new TruynNode({ relayUrl });
  const providerNode = new TruynNode({ relayUrl });
  let executions = 0;
  let deliveryAttempts = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const host = new TruynAdapterHost({
    node: providerNode,
    adapter: createFunctionAdapter({
      name: 'p3-a1-negative-provider',
      capabilities: ['p3.a1.negative'],
      execute: async () => {
        executions += 1;
        await gate;
        return { output: 'completed-despite-push-failure' };
      }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 5,
    socketPath: false,
    longPollMs: 25
  });
  await host.start();

  const server = createA2aServer({
    node: facadeNode,
    agent: { name: 'P3-A1 negative facade', description: 'Lifecycle negative proof', version: '0.1.0-p3-a1' },
    skills: [{
      id: 'negative',
      name: 'Negative',
      description: 'Lifecycle negative proof',
      capability: 'p3.a1.negative',
      visibility: 'public'
    }],
    allowAnonymousTaskAccess: true,
    enableCancellation: true,
    enablePushNotifications: true,
    deliverPushNotification: async () => {
      deliveryAttempts += 1;
      throw new Error('synthetic callback failure');
    },
    pollIntervalMs: 2,
    pushDeliveryTimeoutMs: 100
  });
  const url = await server.listen({ port: 0 });

  t.after(async () => {
    await server.close();
    await host.stop();
    await relay.close();
  });

  const submitted = await rpc(url, 'SendMessage', {
    message: message('complete once'),
    configuration: { returnImmediately: true }
  });
  assert.equal(submitted.error, undefined);
  const taskId = submitted.result.task.id;

  const config = await rpc(url, 'CreateTaskPushNotificationConfig', {
    tenant: '',
    id: 'failing-hook',
    taskId,
    url: 'https://callback.invalid/push',
    token: ''
  });
  assert.equal(config.error, undefined);
  assert.equal(config.result.id, 'failing-hook');

  release();
  const completed = await until(async () => {
    const fetched = await rpc(url, 'GetTask', { id: taskId, historyLength: 0 });
    return fetched.result?.status?.state === A2A_TASK_STATES.completed ? fetched.result : null;
  });
  assert.equal(completed.status.state, A2A_TASK_STATES.completed);
  assert.equal(completed.artifacts[0].parts[0].text, 'completed-despite-push-failure');
  assert.equal(executions, 1, 'push delivery failure must not duplicate provider execution');
  assert.ok(deliveryAttempts >= 1, 'explicit push hook must have been attempted');

  const terminalCancel = await rpc(url, 'CancelTask', { id: taskId });
  assert.equal(terminalCancel.error.code, -32002);
  assert.equal(executions, 1, 'terminal cancellation must not re-execute or revoke completed work');

  const fetchedAgain = await rpc(url, 'GetTask', { id: taskId, historyLength: 0 });
  assert.equal(fetchedAgain.result.status.state, A2A_TASK_STATES.completed);
});