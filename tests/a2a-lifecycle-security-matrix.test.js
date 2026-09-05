import test from 'node:test';
import assert from 'node:assert/strict';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';
import { A2aPushNotificationStore, normalizeTaskPushNotificationConfig } from '../adapters/a2a/push-notification-store.js';
import { createA2aLifecycleClient } from '../adapters/a2a/lifecycle-client.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

function userMessage(id = 'security-message') {
  return { messageId: id, role: 'ROLE_USER', parts: [{ text: 'x', mediaType: 'text/plain' }] };
}

function createStartedTask(store, suffix = '') {
  const task = store.create({
    ownerKey: 'owner',
    message: userMessage(`security-message-${suffix}`),
    skill: { id: 'security', capability: 'p3.a1.security' }
  });
  store.start(task.id, { truynRequestId: `need-${suffix || '1'}`, providerNodeId: 'provider-1' });
  return task;
}

function compactPartial(task, { sequence = 0, delta = 'x', from = 'provider-1', verified = true, includeDelta = true } = {}) {
  return {
    kind: 'PARTIAL',
    requestId: task.truynRequestId,
    from,
    verification: { ok: verified },
    payload: {
      sequence,
      ...(includeDelta ? { delta } : {})
    }
  };
}

test('P3-A1 stream bridge rejects unverified/wrong-provider input and fails closed on non-contiguous PARTIAL sequence', () => {
  const store = new A2aTaskStore();
  const ignored = createStartedTask(store, 'ignored');
  assert.equal(store.recordCompactEvent(compactPartial(ignored, { verified: false })), null);
  assert.equal(store.recordCompactEvent(compactPartial(ignored, { from: 'provider-2' })), null);
  assert.equal(ignored.status.state, A2A_TASK_STATES.working);
  assert.equal(ignored.streamEvents.length, 0);

  const outOfOrder = createStartedTask(store, 'out-of-order');
  store.recordCompactEvent(compactPartial(outOfOrder, { sequence: 1 }));
  assert.equal(outOfOrder.status.state, A2A_TASK_STATES.failed);
  assert.equal(outOfOrder.artifacts.length, 0);
  assert.equal(outOfOrder.streamEvents.length, 1);
  assert.equal(outOfOrder.streamEvents[0].statusUpdate.status.message.metadata['io.truyn/errorCode'], 'A2A_PARTIAL_SEQUENCE_MISMATCH');

  const missingDelta = createStartedTask(store, 'missing-delta');
  store.recordCompactEvent(compactPartial(missingDelta, { includeDelta: false }));
  assert.equal(missingDelta.status.state, A2A_TASK_STATES.failed);
  assert.equal(missingDelta.streamEvents[0].statusUpdate.status.message.metadata['io.truyn/errorCode'], 'A2A_PARTIAL_DELTA_REQUIRED');

  const duplicate = createStartedTask(store, 'duplicate');
  store.recordCompactEvent(compactPartial(duplicate, { sequence: 0 }));
  assert.equal(duplicate.status.state, A2A_TASK_STATES.working);
  assert.equal(duplicate.nextStreamSequence, 1);
  store.recordCompactEvent(compactPartial(duplicate, { sequence: 0 }));
  assert.equal(duplicate.status.state, A2A_TASK_STATES.failed);
  assert.equal(duplicate.streamEvents.at(-1).statusUpdate.status.message.metadata['io.truyn/errorCode'], 'A2A_PARTIAL_SEQUENCE_MISMATCH');
});

test('P3-A1 push configuration validation blocks SSRF-shaped URLs, cross-owner access, and capacity overflow', () => {
  const task = { id: 'task-1', ownerKey: 'owner' };
  assert.throws(() => normalizeTaskPushNotificationConfig({ url: 'file:///etc/passwd' }, { taskId: task.id }), /http or https/);
  assert.throws(() => normalizeTaskPushNotificationConfig({ url: 'https://user:pass@example.com/hook' }, { taskId: task.id }), /must not contain credentials/);
  assert.throws(() => normalizeTaskPushNotificationConfig({ url: 'https://example.com/hook#secret' }, { taskId: task.id }), /must not contain a fragment/);
  assert.throws(() => normalizeTaskPushNotificationConfig({ url: 'http://example.com/hook' }, { taskId: task.id }), /must use https outside loopback/);
  assert.doesNotThrow(() => normalizeTaskPushNotificationConfig({ url: 'http://127.0.0.1/hook' }, { taskId: task.id }));

  const store = new A2aPushNotificationStore({ maxConfigsPerTask: 1 });
  const first = store.create(task, 'owner', { id: 'one', taskId: task.id, url: 'https://example.com/one' });
  assert.equal(first.id, 'one');
  assert.equal(store.get(task, 'other', 'one'), null);
  assert.deepEqual(store.list(task, 'other'), []);
  assert.equal(store.delete(task, 'other', 'one'), false);
  assert.throws(() => store.create(task, 'owner', { id: 'two', taskId: task.id, url: 'https://example.com/two' }), /capacity reached/);
  assert.throws(() => store.create(task, 'other', { id: 'two', taskId: task.id, url: 'https://example.com/two' }), /owner mismatch/);
});

function agentCard() {
  return {
    name: 'Lifecycle security fixture',
    description: 'P3-A1 lifecycle client negative fixture',
    version: '1.0.0',
    capabilities: { streaming: true, pushNotifications: true, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 'security', name: 'Security', description: 'Security fixture', inputModes: ['text/plain'], outputModes: ['text/plain'] }],
    supportedInterfaces: [{ protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION, url: 'https://agent.example/a2a' }]
  };
}

function fakeLifecycleFetch(responseFactory) {
  return async (url, init = {}) => {
    if ((init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify(agentCard()), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const request = JSON.parse(init.body);
    return responseFactory(request, String(url));
  };
}

async function consume(iterable) {
  for await (const _ of iterable) { /* consume */ }
}

test('P3-A1 lifecycle client fails closed on task correlation and JSON-RPC id mismatch', async () => {
  const wrongTask = createA2aLifecycleClient({
    agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
    fetchImpl: fakeLifecycleFetch((request) => new Response(
      `data: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { statusUpdate: { taskId: 'other-task', contextId: 'ctx', status: { state: 'working' } } } })}\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))
  });
  await assert.rejects(consume(wrongTask.subscribeToTask('expected-task')), /taskId mismatch/);

  const wrongId = createA2aLifecycleClient({
    agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
    fetchImpl: fakeLifecycleFetch((request) => new Response(
      `data: ${JSON.stringify({ jsonrpc: '2.0', id: `${request.id}-spoofed`, result: { task: { id: 'expected-task', contextId: 'ctx', status: { state: 'working' } } } })}\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))
  });
  await assert.rejects(consume(wrongId.subscribeToTask('expected-task')), /invalid JSON-RPC envelope/);
});

test('P3-A1 lifecycle client bounds SSE bytes and rejects incomplete frames', async () => {
  const oversized = createA2aLifecycleClient({
    agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
    maxResponseBytes: 1024,
    fetchImpl: fakeLifecycleFetch(() => new Response(`data: ${'x'.repeat(1100)}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }))
  });
  await assert.rejects(consume(oversized.subscribeToTask('expected-task')), /exceeds maxResponseBytes/);

  const incomplete = createA2aLifecycleClient({
    agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
    fetchImpl: fakeLifecycleFetch((request) => new Response(
      `data: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { task: { id: 'expected-task', contextId: 'ctx', status: { state: 'working' } } } })}`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))
  });
  await assert.rejects(consume(incomplete.subscribeToTask('expected-task')), /incomplete SSE frame/);
});