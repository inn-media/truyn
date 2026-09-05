import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

function agent() {
  return { name: 'TRUYN P3-A1 A2A facade', description: 'Extended A2A lifecycle proof facade', version: '0.1.0-p3-a1' };
}

function message(text, metadata) {
  return {
    messageId: `p3-a1-${Math.random().toString(16).slice(2)}`,
    role: 'ROLE_USER',
    parts: [{ text, mediaType: 'text/plain' }],
    ...(metadata ? { metadata } : {})
  };
}

function principal(req) {
  if (req.headers.authorization === 'Bearer owner-token') return { sub: 'owner' };
  if (req.headers.authorization === 'Bearer other-token') return { sub: 'other' };
  return null;
}

async function until(predicate, { timeoutMs = 3_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('condition_timeout');
}

async function rpc(url, method, params = {}, { token } = {}) {
  const headers = { 'content-type': 'application/json', 'a2a-version': A2A_PROTOCOL_VERSION };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Math.random()}`, method, params })
  });
  return response.json();
}

function parseSse(text) {
  return text
    .split(/\n\n+/)
    .map((frame) => frame.split('\n').find((line) => line.startsWith('data: ')))
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

async function harness(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  const hosts = [];
  const facades = [];
  t.after(async () => {
    for (const facade of facades.reverse()) await facade.close();
    for (const host of hosts.reverse()) await host.stop();
    await relay.close();
  });
  return {
    relay,
    relayUrl,
    async provider({ capability, execute, fastPath = false, accessPolicy = createProviderAccessPolicy({ mode: 'public' }) }) {
      const node = new TruynNode({ relayUrl });
      const host = new TruynAdapterHost({
        node,
        adapter: createFunctionAdapter({ name: `p3-a1-${capability}`, capabilities: [capability], execute }),
        accessPolicy,
        pollIntervalMs: 5,
        fastPath,
        socketPath: false,
        longPollMs: 25
      });
      await host.start();
      hosts.push(host);
      return { node, host };
    },
    async facade(options) {
      const value = createA2aServer(options);
      const url = await value.listen({ port: 0 });
      facades.push(value);
      return { value, url };
    }
  };
}

test('P3-A1 streaming is opt-in and maps signed ordered TRUYN PARTIAL events to A2A SSE', { timeout: 10_000 }, async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  await h.provider({
    capability: 'p3.a1.stream',
    fastPath: true,
    execute: async ({ emitPartial }) => {
      executions += 1;
      await emitPartial('Hel', { tokenCount: 1 });
      await emitPartial('lo', { tokenCount: 1 });
      return { output: 'Hello' };
    }
  });
  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{ id: 'stream', name: 'Stream', description: 'Streaming lifecycle proof', capability: 'p3.a1.stream', visibility: 'public' }],
    enableStreaming: true,
    pollIntervalMs: 2
  });

  const card = await (await fetch(`${url}/.well-known/agent-card.json`)).json();
  assert.equal(card.capabilities.streaming, true);
  assert.equal(card.capabilities.pushNotifications, false);

  const requestId = 'p3-a1-stream-rpc';
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'a2a-version': A2A_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'SendStreamingMessage',
      params: { message: message('stream this') }
    })
  });
  assert.match(response.headers.get('content-type') || '', /^text\/event-stream/);
  const events = parseSse(await response.text());
  assert.ok(events.length >= 4);
  assert.ok(events.every((event) => event.jsonrpc === '2.0' && event.id === requestId));
  assert.equal(events[0].result.task.status.state, A2A_TASK_STATES.working);

  const artifactUpdates = events.map((event) => event.result?.artifactUpdate).filter(Boolean);
  assert.equal(artifactUpdates.length, 2);
  assert.equal(artifactUpdates[0].metadata['io.truyn/sequence'], 0);
  assert.equal(artifactUpdates[0].append, false);
  assert.equal(artifactUpdates[0].lastChunk, false);
  assert.equal(artifactUpdates[0].artifact.parts[0].text, 'Hel');
  assert.equal(artifactUpdates[1].metadata['io.truyn/sequence'], 1);
  assert.equal(artifactUpdates[1].append, true);
  assert.equal(artifactUpdates[1].artifact.parts[0].text, 'lo');
  assert.equal(artifactUpdates[0].artifact.artifactId, artifactUpdates[1].artifact.artifactId);

  const terminal = events.map((event) => event.result?.statusUpdate).filter(Boolean).at(-1);
  assert.ok(terminal);
  assert.equal(terminal.status.state, A2A_TASK_STATES.completed);
  assert.equal(executions, 1, 'streaming must execute exactly one TRUYN provider workload');

  const taskId = events[0].result.task.id;
  const fetched = await rpc(url, 'GetTask', { id: taskId });
  assert.equal(fetched.result.status.state, A2A_TASK_STATES.completed);
  assert.equal(fetched.result.artifacts[0].parts[0].text, 'Hello');
});

test('P3-A1 CancelTask maps to requester-owned TRUYN REVOKE, aborts provider work, and is principal scoped', { timeout: 10_000 }, async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  let abortObserved = false;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });

  await h.provider({
    capability: 'p3.a1.cancel',
    fastPath: true,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [facadeNode.identity.nodeId] }),
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
      return { output: 'must-not-be-delivered' };
    }
  });

  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{ id: 'cancel', name: 'Cancel', description: 'Cancellation lifecycle proof', capability: 'p3.a1.cancel', visibility: 'authenticated' }],
    authenticate: principal,
    authorize: ({ principal: caller }) => caller?.sub === 'owner',
    enableCancellation: true,
    pollIntervalMs: 2
  });

  const sent = await rpc(url, 'SendMessage', {
    message: message('cancel me'),
    configuration: { returnImmediately: true }
  }, { token: 'owner-token' });
  assert.equal(sent.error, undefined);
  const taskId = sent.result.task.id;
  const requestId = h.relay.state.requests.keys().next().value;
  assert.ok(requestId);
  await started;

  const hidden = await rpc(url, 'CancelTask', { id: taskId }, { token: 'other-token' });
  assert.equal(hidden.error.code, -32001);
  assert.equal(h.relay.state.requests.get(requestId).status, 'dispatched');

  const cancelled = await rpc(url, 'CancelTask', { id: taskId }, { token: 'owner-token' });
  assert.equal(cancelled.error, undefined);
  assert.equal(cancelled.result.status.state, A2A_TASK_STATES.canceled);
  await until(() => abortObserved);
  assert.equal(h.relay.state.requests.get(requestId).status, 'cancelled');
  assert.equal(executions, 1);

  const repeated = await rpc(url, 'CancelTask', { id: taskId }, { token: 'owner-token' });
  assert.equal(repeated.result.status.state, A2A_TASK_STATES.canceled);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const fetched = await rpc(url, 'GetTask', { id: taskId }, { token: 'owner-token' });
  assert.equal(fetched.result.status.state, A2A_TASK_STATES.canceled);
  assert.equal(fetched.result.artifacts, undefined, 'late provider RESULT must not become an A2A artifact after cancellation');
});

test('P3-A1 feature flags preserve g1 defaults', async (t) => {
  const h = await harness(t);
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl });
  await h.provider({ capability: 'p3.a1.default', execute: async () => ({ output: 'ok' }) });
  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [{ id: 'default', name: 'Default', description: 'g1 compatibility check', capability: 'p3.a1.default', visibility: 'public' }]
  });
  const card = await (await fetch(`${url}/.well-known/agent-card.json`)).json();
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.capabilities.pushNotifications, false);
  const stream = await rpc(url, 'SendStreamingMessage', { message: message('x') });
  assert.equal(stream.error.code, -32004);
  const cancel = await rpc(url, 'CancelTask', { id: 'missing' });
  assert.equal(cancel.error.code, -32004);
});