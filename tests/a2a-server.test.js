import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

async function jsonRpc(baseUrl, method, params = {}, { token = null, version = A2A_PROTOCOL_VERSION } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (version !== null) headers['a2a-version'] = version;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/a2a`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-1`, method, params })
  });
  return { response, body: await response.json() };
}

function userMessage(text, metadata = undefined) {
  return {
    messageId: `message-${Math.random().toString(16).slice(2)}`,
    role: 'ROLE_USER',
    parts: [{ text, mediaType: 'text/plain' }],
    ...(metadata ? { metadata } : {})
  };
}

function bearerPrincipal(req) {
  const value = String(req.headers.authorization || '');
  if (value === 'Bearer owner-token') return { sub: 'owner' };
  if (value === 'Bearer other-token') return { sub: 'other' };
  return null;
}

async function createNetwork(t) {
  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  return { relay, relayUrl };
}

async function startProvider(t, { relayUrl, identity = createIdentity(), capability, accessPolicy, execute }) {
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({
      name: `a2a-provider-${capability}`,
      capabilities: [capability],
      execute
    }),
    accessPolicy,
    pollIntervalMs: 5
  });
  await host.start();
  t.after(() => host.stop());
  return { node, host };
}

function defaultAgent() {
  return {
    name: 'TRUYN A2A facade',
    description: 'Bounded TRUYN A2A interoperability facade',
    version: '0.1.0'
  };
}

test('C3 public Agent Card exposes only operational public TRUYN capabilities', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const facadeIdentity = createIdentity();
  const facadeNode = new TruynNode({ relayUrl, identity: facadeIdentity });

  await startProvider(t, {
    relayUrl,
    capability: 'research.public',
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    execute: async () => ({ output: 'public' })
  });
  await startProvider(t, {
    relayUrl,
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [facadeIdentity.nodeId]
    }),
    execute: async () => ({ output: 'private' })
  });

  const a2a = createA2aServer({
    node: facadeNode,
    agent: defaultAgent(),
    skills: [
      {
        id: 'public-research',
        name: 'Public research',
        description: 'A genuinely public TRUYN capability',
        capability: 'research.public',
        visibility: 'public'
      },
      {
        id: 'dangerous-private-projection',
        name: 'Private reasoning',
        description: 'Must never become public through Agent Card projection',
        capability: 'reasoning.private',
        visibility: 'public'
      }
    ]
  });
  const url = await a2a.listen({ port: 0 });
  t.after(() => a2a.close());

  const response = await fetch(`${url}/.well-known/agent-card.json`);
  assert.equal(response.status, 200);
  const card = await response.json();
  assert.equal(card.name, 'TRUYN A2A facade');
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.capabilities.pushNotifications, false);
  assert.equal(card.supportedInterfaces.length, 1);
  assert.equal(card.supportedInterfaces[0].protocolBinding, 'JSONRPC');
  assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
  assert.equal(card.supportedInterfaces[0].url, `${url}/a2a`);
  assert.deepEqual(card.skills.map((skill) => skill.id), ['public-research']);
  assert.equal(JSON.stringify(card).includes('reasoning.private'), false, 'private TRUYN capability must not leak into the public card');
});

test('C3 Extended Agent Card requires external auth and server-side authorization', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const facadeIdentity = createIdentity();
  const facadeNode = new TruynNode({ relayUrl, identity: facadeIdentity });

  await startProvider(t, {
    relayUrl,
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [facadeIdentity.nodeId]
    }),
    execute: async () => ({ output: 'private' })
  });

  const a2a = createA2aServer({
    node: facadeNode,
    agent: defaultAgent(),
    skills: [{
      id: 'private-reasoning',
      name: 'Private reasoning',
      description: 'Owner-authorized reasoning',
      capability: 'reasoning.private',
      visibility: 'authenticated'
    }],
    authenticate: bearerPrincipal,
    authorize: ({ principal }) => principal?.sub === 'owner'
  });
  const url = await a2a.listen({ port: 0 });
  t.after(() => a2a.close());

  const publicCard = await (await fetch(`${url}/.well-known/agent-card.json`)).json();
  assert.deepEqual(publicCard.skills, []);
  assert.equal(publicCard.capabilities.extendedAgentCard, true);

  const unauthenticated = await jsonRpc(url, 'GetExtendedAgentCard');
  assert.equal(unauthenticated.body.error.code, -32000);
  assert.equal(unauthenticated.body.error.data[0].reason, 'AUTHENTICATION_REQUIRED');

  const unauthorized = await jsonRpc(url, 'GetExtendedAgentCard', {}, { token: 'other-token' });
  assert.deepEqual(unauthorized.body.result.skills, []);

  const authorized = await jsonRpc(url, 'GetExtendedAgentCard', {}, { token: 'owner-token' });
  assert.deepEqual(authorized.body.result.skills.map((skill) => skill.id), ['private-reasoning']);
  assert.equal(JSON.stringify(authorized.body.result).includes(facadeIdentity.nodeId), false, 'Agent Card must not expose the TRUYN facade identity as A2A ownership');
});

test('C3 blocking SendMessage maps A2A Message -> TRUYN NEED -> RESULT -> A2A Artifact', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const facadeNode = new TruynNode({ relayUrl });
  let executions = 0;
  let receivedInput = null;

  const provider = await startProvider(t, {
    relayUrl,
    capability: 'research.public',
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    execute: async ({ input }) => {
      executions += 1;
      receivedInput = input;
      return { output: { answer: 'TRUYN' }, metadata: { source: 'test-provider' } };
    }
  });

  const a2a = createA2aServer({
    node: facadeNode,
    agent: defaultAgent(),
    skills: [{
      id: 'research',
      name: 'Research',
      description: 'Public research through TRUYN',
      capability: 'research.public',
      visibility: 'public'
    }],
    pollIntervalMs: 2
  });
  const url = await a2a.listen({ port: 0 });
  t.after(() => a2a.close());

  const sent = await jsonRpc(url, 'SendMessage', { message: userMessage('What is TRUYN?') });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.body.error, undefined);
  const task = sent.body.result.task;
  assert.equal(task.status.state, A2A_TASK_STATES.completed);
  assert.equal(task.artifacts.length, 1);
  assert.deepEqual(task.artifacts[0].parts, [{ data: { answer: 'TRUYN' }, mediaType: 'application/json' }]);
  assert.equal(task.history.length, 1);
  assert.equal(task.history[0].role, 'ROLE_USER');
  assert.equal(executions, 1);
  assert.equal(receivedInput.a2a.protocolVersion, '1.0');
  assert.equal(receivedInput.parts[0].text, 'What is TRUYN?');
  assert.equal(task.artifacts[0].metadata['io.truyn/provenance'].providerNodeId, provider.node.identity.nodeId);
  assert.ok(task.artifacts[0].metadata['io.truyn/provenance'].requestId);
  assert.ok(task.artifacts[0].metadata['io.truyn/provenance'].trust.score > 0);
});

test('C3 non-blocking GetTask is scoped to the authenticated A2A principal', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const facadeNode = new TruynNode({ relayUrl });
  let executions = 0;

  await startProvider(t, {
    relayUrl,
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [facadeNode.identity.nodeId]
    }),
    execute: async ({ input }) => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { output: `private:${input.parts[0].text}` };
    }
  });

  const a2a = createA2aServer({
    node: facadeNode,
    agent: defaultAgent(),
    skills: [{
      id: 'private-reasoning',
      name: 'Private reasoning',
      description: 'Authenticated owner reasoning',
      capability: 'reasoning.private',
      visibility: 'authenticated'
    }],
    authenticate: bearerPrincipal,
    authorize: ({ principal }) => principal?.sub === 'owner',
    pollIntervalMs: 2
  });
  const url = await a2a.listen({ port: 0 });
  t.after(() => a2a.close());

  const sent = await jsonRpc(url, 'SendMessage', {
    message: userMessage('secret'),
    configuration: { returnImmediately: true }
  }, { token: 'owner-token' });
  const taskId = sent.body.result.task.id;
  assert.equal(sent.body.result.task.status.state, A2A_TASK_STATES.working);

  const hidden = await jsonRpc(url, 'GetTask', { id: taskId }, { token: 'other-token' });
  assert.equal(hidden.body.error.code, -32001);
  assert.equal(hidden.body.error.data[0].reason, 'TASK_NOT_FOUND');

  let completed = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const polled = await jsonRpc(url, 'GetTask', { id: taskId, historyLength: 1 }, { token: 'owner-token' });
    if (polled.body.result?.status?.state === A2A_TASK_STATES.completed) {
      completed = polled.body.result;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(completed, 'authenticated owner should observe task completion');
  assert.equal(completed.artifacts[0].parts[0].text, 'private:secret');
  assert.equal(executions, 1);
});

test('C3 rejects wrong A2A versions, unsupported operations, raw content and unauthorized private execution', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const facadeNode = new TruynNode({ relayUrl });
  let executions = 0;

  await startProvider(t, {
    relayUrl,
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [facadeNode.identity.nodeId]
    }),
    execute: async () => {
      executions += 1;
      return { output: 'should-not-run' };
    }
  });

  const a2a = createA2aServer({
    node: facadeNode,
    agent: defaultAgent(),
    skills: [{
      id: 'private-reasoning',
      name: 'Private reasoning',
      description: 'Authenticated owner reasoning',
      capability: 'reasoning.private',
      visibility: 'authenticated'
    }],
    authenticate: bearerPrincipal,
    authorize: ({ principal }) => principal?.sub === 'owner'
  });
  const url = await a2a.listen({ port: 0 });
  t.after(() => a2a.close());

  const wrongVersion = await jsonRpc(url, 'SendMessage', { message: userMessage('x') }, { token: 'owner-token', version: '0.3' });
  assert.equal(wrongVersion.body.error.code, -32009);
  assert.equal(wrongVersion.body.error.data[0].reason, 'VERSION_NOT_SUPPORTED');

  const missingVersion = await jsonRpc(url, 'SendMessage', { message: userMessage('x') }, { token: 'owner-token', version: null });
  assert.equal(missingVersion.body.error.code, -32009);

  const unsupported = await jsonRpc(url, 'CancelTask', { id: 'x' }, { token: 'owner-token' });
  assert.equal(unsupported.body.error.code, -32004);
  assert.equal(unsupported.body.error.data[0].reason, 'UNSUPPORTED_OPERATION');

  const raw = await jsonRpc(url, 'SendMessage', {
    message: {
      messageId: 'raw-1',
      role: 'ROLE_USER',
      parts: [{ raw: 'AQID', mediaType: 'application/octet-stream' }]
    }
  }, { token: 'owner-token' });
  assert.equal(raw.body.error.code, -32005);
  assert.equal(raw.body.error.data[0].reason, 'CONTENT_TYPE_NOT_SUPPORTED');

  const anonymous = await jsonRpc(url, 'SendMessage', { message: userMessage('steal owner credits') });
  assert.equal(anonymous.body.error.code, -32602);
  assert.equal(executions, 0, 'unauthorized A2A requests must cause zero remote provider execution');
  assert.equal((await facadeNode.poll()).events.length, 0, 'unauthorized A2A request must create zero RESULT events for facade');
});
