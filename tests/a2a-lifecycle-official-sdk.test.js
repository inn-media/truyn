import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { Role, TaskState } from '@a2a-js/sdk';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';

const SDK_PACKAGE = '@a2a-js/sdk';
const SDK_VERSION = '1.0.1';

function agent() {
  return {
    name: 'TRUYN P3-A1 official SDK target',
    description: 'A2A 1.0 lifecycle black-box target for the exact official SDK.',
    version: '0.1.0-p3-a1'
  };
}

function sdkMessage(text, id = `official-${Math.random().toString(16).slice(2)}`) {
  return {
    messageId: id,
    role: Role.ROLE_USER,
    parts: [{
      content: { $case: 'text', value: text },
      metadata: undefined,
      filename: '',
      mediaType: 'text/plain'
    }],
    taskId: '',
    contextId: '',
    extensions: [],
    metadata: {},
    referenceTaskIds: []
  };
}

function sendParams(text, { configuration, messageId } = {}) {
  return {
    tenant: '',
    metadata: {},
    message: sdkMessage(text, messageId),
    configuration
  };
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

async function officialClient(baseUrl) {
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory()]
    })
  );
  const client = await factory.createFromUrl(baseUrl);
  assert.equal(client.protocolVersion, '1.0');
  return client;
}

async function harness(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  const hosts = [];
  const facades = [];
  const callbackServers = [];
  t.after(async () => {
    for (const server of callbackServers.reverse()) {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
    for (const facade of facades.reverse()) await facade.close();
    for (const host of hosts.reverse()) await host.stop();
    await relay.close();
  });
  return {
    relay,
    relayUrl,
    async provider({ capability, execute }) {
      const node = new TruynNode({ relayUrl });
      const host = new TruynAdapterHost({
        node,
        adapter: createFunctionAdapter({ name: `official-${capability}`, capabilities: [capability], execute }),
        accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
        pollIntervalMs: 5,
        fastPath: true,
        socketPath: false,
        longPollMs: 25
      });
      await host.start();
      hosts.push(host);
      return { node, host };
    },
    async facade(options) {
      const facade = createA2aServer(options);
      const url = await facade.listen({ port: 0 });
      facades.push(facade);
      return { facade, url };
    },
    async callbackCounter() {
      let count = 0;
      const server = http.createServer((_req, res) => {
        count += 1;
        res.writeHead(204);
        res.end();
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      callbackServers.push(server);
      const address = server.address();
      return {
        url: `http://127.0.0.1:${address.port}/push`,
        get count() { return count; }
      };
    }
  };
}

test('P3-A1 official @a2a-js/sdk@1.0.1 black-box proves streaming and resubscription', { timeout: 15_000 }, async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  let releaseSecond;
  const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
  let firstPartialResolve;
  const firstPartial = new Promise((resolve) => { firstPartialResolve = resolve; });

  await h.provider({
    capability: 'p3.a1.official.stream',
    execute: async ({ emitPartial }) => {
      executions += 1;
      await emitPartial('one');
      firstPartialResolve();
      await secondGate;
      await emitPartial('two');
      return { output: 'onetwo' };
    }
  });

  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{
      id: 'official-stream',
      name: 'Official stream',
      description: 'Official SDK streaming proof',
      capability: 'p3.a1.official.stream',
      visibility: 'public'
    }],
    allowAnonymousTaskAccess: true,
    enableStreaming: true,
    pollIntervalMs: 2
  });

  const client = await officialClient(url);
  const card = await client.getAgentCard();
  assert.equal(card.capabilities.streaming, true);

  const initialStream = client.sendMessageStream(sendParams('stream'));
  const first = await initialStream.next();
  assert.equal(first.done, false);
  assert.equal(first.value.payload?.$case, 'task');
  const task = first.value.payload.value;
  assert.equal(task.status.state, TaskState.TASK_STATE_WORKING);
  await firstPartial;
  await initialStream.return();

  const resumed = client.resubscribeTask({ tenant: '', id: task.id });
  const received = [];
  const consuming = (async () => {
    for await (const event of resumed) received.push(event);
  })();
  await until(() => received.some((event) => event.payload?.$case === 'task'));
  releaseSecond();
  await consuming;

  const updates = received.filter((event) => event.payload?.$case === 'artifactUpdate').map((event) => event.payload.value);
  assert.ok(updates.length >= 1);
  assert.equal(updates.at(-1).taskId, task.id);
  assert.equal(updates.at(-1).contextId, task.contextId);
  const statuses = received.filter((event) => event.payload?.$case === 'statusUpdate').map((event) => event.payload.value);
  assert.equal(statuses.at(-1).status.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(executions, 1, 'resubscription must not dispatch a second TRUYN NEED');
});

test('P3-A1 official @a2a-js/sdk@1.0.1 black-box proves exactly-once cancellation', { timeout: 15_000 }, async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  let abortObserved = false;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });

  await h.provider({
    capability: 'p3.a1.official.cancel',
    execute: async ({ signal }) => {
      executions += 1;
      startedResolve();
      await new Promise((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => {
          abortObserved = true;
          resolve();
        }, { once: true });
      });
      return { output: 'late-result-must-be-suppressed' };
    }
  });

  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{
      id: 'official-cancel',
      name: 'Official cancel',
      description: 'Official SDK cancellation proof',
      capability: 'p3.a1.official.cancel',
      visibility: 'public'
    }],
    allowAnonymousTaskAccess: true,
    enableCancellation: true,
    pollIntervalMs: 2
  });

  const client = await officialClient(url);
  const submitted = await client.sendMessage(sendParams('cancel', {
    configuration: { returnImmediately: true, acceptedOutputModes: [] }
  }));
  assert.equal(submitted.status.state, TaskState.TASK_STATE_WORKING);
  const requestId = h.relay.state.requests.keys().next().value;
  assert.ok(requestId);
  await started;

  const firstCancel = await client.cancelTask({ tenant: '', id: submitted.id, metadata: {} });
  assert.equal(firstCancel.status.state, TaskState.TASK_STATE_CANCELED);
  await until(() => abortObserved);
  assert.equal(h.relay.state.requests.get(requestId).status, 'cancelled');
  assert.equal(executions, 1);

  const repeated = await client.cancelTask({ tenant: '', id: submitted.id, metadata: {} });
  assert.equal(repeated.status.state, TaskState.TASK_STATE_CANCELED);
  assert.equal(executions, 1, 'idempotent repeated cancellation must not re-execute work');

  await new Promise((resolve) => setTimeout(resolve, 25));
  const fetched = await client.getTask({ tenant: '', id: submitted.id, historyLength: 0 });
  assert.equal(fetched.status.state, TaskState.TASK_STATE_CANCELED);
  assert.equal(fetched.artifacts.length, 0, 'late provider result must not become an A2A artifact');
});

test('P3-A1 official @a2a-js/sdk@1.0.1 black-box proves push CRUD and hook-only delivery', { timeout: 15_000 }, async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  const callback = await h.callbackCounter();
  const delivered = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  await h.provider({
    capability: 'p3.a1.official.push',
    execute: async () => {
      await gate;
      return { output: 'push-complete' };
    }
  });

  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{
      id: 'official-push',
      name: 'Official push',
      description: 'Official SDK push proof',
      capability: 'p3.a1.official.push',
      visibility: 'public'
    }],
    allowAnonymousTaskAccess: true,
    enablePushNotifications: true,
    deliverPushNotification: async (delivery) => { delivered.push(delivery); },
    pollIntervalMs: 2
  });

  const client = await officialClient(url);
  const card = await client.getAgentCard();
  assert.equal(card.capabilities.pushNotifications, true);

  const submitted = await client.sendMessage(sendParams('push', {
    configuration: { returnImmediately: true, acceptedOutputModes: [] }
  }));
  assert.equal(submitted.status.state, TaskState.TASK_STATE_WORKING);

  const config = await client.createTaskPushNotificationConfig({
    tenant: '',
    id: 'official-push-config',
    taskId: submitted.id,
    url: callback.url,
    token: 'opaque-token',
    authentication: undefined
  });
  assert.equal(config.taskId, submitted.id);
  assert.equal(config.id, 'official-push-config');

  const fetchedConfig = await client.getTaskPushNotificationConfig({ tenant: '', taskId: submitted.id, id: config.id });
  assert.equal(fetchedConfig.url, callback.url);
  const listed = await client.listTaskPushNotificationConfig({ tenant: '', taskId: submitted.id, pageSize: 0, pageToken: '' });
  assert.equal(listed.configs.length, 1);
  assert.equal(listed.configs[0].id, config.id);

  release();
  await until(async () => {
    const task = await client.getTask({ tenant: '', id: submitted.id, historyLength: 0 });
    return task.status.state === TaskState.TASK_STATE_COMPLETED ? task : null;
  });
  await until(() => delivered.some((entry) => entry.event?.statusUpdate?.status?.state === 'TASK_STATE_COMPLETED'));
  assert.equal(callback.count, 0, 'TRUYN must never fetch the configured callback URL implicitly');
  assert.equal(delivered.at(-1).config.id, config.id);
  assert.equal(delivered.at(-1).task.id, submitted.id);

  await client.deleteTaskPushNotificationConfig({ tenant: '', taskId: submitted.id, id: config.id });
  const afterDelete = await client.listTaskPushNotificationConfig({ tenant: '', taskId: submitted.id, pageSize: 0, pageToken: '' });
  assert.deepEqual(afterDelete.configs, []);

  assert.equal(SDK_PACKAGE, '@a2a-js/sdk');
  assert.equal(SDK_VERSION, '1.0.1');
});