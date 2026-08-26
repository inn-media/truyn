import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

function agent() {
  return { name: 'TRUYN A2A facade', description: 'Bounded TRUYN A2A interoperability facade', version: '0.1.0' };
}

function message(text, metadata) {
  return {
    messageId: `m-${Math.random().toString(16).slice(2)}`,
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

async function rpc(url, method, params = {}, { token, version = A2A_PROTOCOL_VERSION } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (version !== null) headers['a2a-version'] = version;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-1`, method, params })
  });
  return response.json();
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
    async provider({ capability, identity = createIdentity(), accessPolicy, execute }) {
      const node = new TruynNode({ relayUrl, identity });
      const host = new TruynAdapterHost({
        node,
        adapter: createFunctionAdapter({ name: `a2a-${capability}`, capabilities: [capability], execute }),
        accessPolicy,
        pollIntervalMs: 5
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

test('C3 public Agent Card exposes only operational public TRUYN capabilities', async (t) => {
  const h = await harness(t);
  const facadeIdentity = createIdentity();
  const facadeNode = new TruynNode({ relayUrl: h.relayUrl, identity: facadeIdentity });
  await h.provider({ capability: 'research.public', accessPolicy: createProviderAccessPolicy({ mode: 'public' }), execute: async () => ({ output: 'public' }) });
  await h.provider({
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [facadeIdentity.nodeId] }),
    execute: async () => ({ output: 'private' })
  });
  const { url } = await h.facade({
    node: facadeNode,
    agent: agent(),
    skills: [
      { id: 'public-research', name: 'Public research', description: 'Public capability', capability: 'research.public', visibility: 'public' },
      { id: 'private-misprojection', name: 'Private reasoning', description: 'Must stay private', capability: 'reasoning.private', visibility: 'public' }
    ]
  });
  const card = await (await fetch(`${url}/.well-known/agent-card.json`)).json();
  assert.deepEqual(card.skills.map((skill) => skill.id), ['public-research']);
  assert.equal(card.supportedInterfaces[0].protocolBinding, 'JSONRPC');
  assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
  assert.equal(card.supportedInterfaces[0].url, `${url}/a2a`);
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.capabilities.pushNotifications, false);
  assert.equal(JSON.stringify(card).includes('reasoning.private'), false);
});

test('C3 Extended Agent Card requires external auth and server authorization', async (t) => {
  const h = await harness(t);
  const identity = createIdentity();
  const node = new TruynNode({ relayUrl: h.relayUrl, identity });
  await h.provider({
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [identity.nodeId] }),
    execute: async () => ({ output: 'private' })
  });
  const { url } = await h.facade({
    node,
    agent: agent(),
    skills: [{ id: 'private', name: 'Private reasoning', description: 'Private capability', capability: 'reasoning.private', visibility: 'authenticated' }],
    authenticate: principal,
    authorize: ({ principal: caller }) => caller?.sub === 'owner'
  });
  const publicCard = await (await fetch(`${url}/.well-known/agent-card.json`)).json();
  assert.deepEqual(publicCard.skills, []);
  assert.equal(publicCard.capabilities.extendedAgentCard, true);
  const missing = await rpc(url, 'GetExtendedAgentCard');
  assert.equal(missing.error.code, -32000);
  const other = await rpc(url, 'GetExtendedAgentCard', {}, { token: 'other-token' });
  assert.deepEqual(other.result.skills, []);
  const owner = await rpc(url, 'GetExtendedAgentCard', {}, { token: 'owner-token' });
  assert.deepEqual(owner.result.skills.map((skill) => skill.id), ['private']);
  assert.equal(JSON.stringify(owner.result).includes(identity.nodeId), false);
});

test('C3 blocking SendMessage maps Message -> NEED -> RESULT -> Artifact', async (t) => {
  const h = await harness(t);
  const node = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  let received = null;
  const provider = await h.provider({
    capability: 'research.public',
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    execute: async ({ input }) => {
      executions += 1;
      received = input;
      return { output: { answer: 'TRUYN' }, metadata: { source: 'test' } };
    }
  });
  const { url } = await h.facade({
    node,
    agent: agent(),
    skills: [{ id: 'research', name: 'Research', description: 'Public research', capability: 'research.public', visibility: 'public' }],
    pollIntervalMs: 2
  });
  const sent = await rpc(url, 'SendMessage', { message: message('What is TRUYN?') });
  assert.equal(sent.error, undefined);
  const task = sent.result.task;
  assert.equal(task.status.state, A2A_TASK_STATES.completed);
  const resultPart = task.artifacts[0].parts[0];
  assert.deepEqual({ data: resultPart.data, mediaType: resultPart.mediaType }, { data: { answer: 'TRUYN' }, mediaType: 'application/json' });
  assert.deepEqual(resultPart.metadata['io.truyn/integrity'], {
    algorithm: 'sha256',
    digest: 'd717b9f98733985357985fbfd8c7b3c634cc6b6288cc847d68b416a54061e50e',
    sizeBytes: 18,
    encoding: 'truyn-json-c14n-v1',
    verified: true
  });
  assert.equal(task.history[0].role, 'ROLE_USER');
  assert.equal(executions, 1);
  assert.equal(received.a2a.protocolVersion, '1.0');
  assert.equal(received.parts[0].text, 'What is TRUYN?');
  const provenance = task.artifacts[0].metadata['io.truyn/provenance'];
  assert.equal(provenance.providerNodeId, provider.node.identity.nodeId);
  assert.ok(provenance.requestId);
  assert.ok(provenance.trust);
});

test('C3 non-blocking GetTask is scoped to the authenticated A2A principal', async (t) => {
  const h = await harness(t);
  const node = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  await h.provider({
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [node.identity.nodeId] }),
    execute: async ({ input }) => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { output: `private:${input.parts[0].text}` };
    }
  });
  const { url } = await h.facade({
    node,
    agent: agent(),
    skills: [{ id: 'private', name: 'Private reasoning', description: 'Private reasoning', capability: 'reasoning.private', visibility: 'authenticated' }],
    authenticate: principal,
    authorize: ({ principal: caller }) => caller?.sub === 'owner',
    pollIntervalMs: 2
  });
  const sent = await rpc(url, 'SendMessage', { message: message('secret'), configuration: { returnImmediately: true } }, { token: 'owner-token' });
  const taskId = sent.result.task.id;
  assert.equal(sent.result.task.status.state, A2A_TASK_STATES.working);
  const hidden = await rpc(url, 'GetTask', { id: taskId }, { token: 'other-token' });
  assert.equal(hidden.error.code, -32001);
  let completed = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const polled = await rpc(url, 'GetTask', { id: taskId, historyLength: 1 }, { token: 'owner-token' });
    if (polled.result?.status?.state === A2A_TASK_STATES.completed) { completed = polled.result; break; }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(completed);
  assert.equal(completed.artifacts[0].parts[0].text, 'private:secret');
  assert.equal(executions, 1);
});

test('C3 wrong-version, unsupported, raw and unauthorized requests fail before NEED execution', async (t) => {
  const h = await harness(t);
  const node = new TruynNode({ relayUrl: h.relayUrl });
  let executions = 0;
  await h.provider({
    capability: 'reasoning.private',
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [node.identity.nodeId] }),
    execute: async () => { executions += 1; return { output: 'never' }; }
  });
  const { url } = await h.facade({
    node,
    agent: agent(),
    skills: [{ id: 'private', name: 'Private reasoning', description: 'Private reasoning', capability: 'reasoning.private', visibility: 'authenticated' }],
    authenticate: principal,
    authorize: ({ principal: caller }) => caller?.sub === 'owner'
  });
  assert.equal((await rpc(url, 'SendMessage', { message: message('x') }, { token: 'owner-token', version: '0.3' })).error.code, -32009);
  assert.equal((await rpc(url, 'SendMessage', { message: message('x') }, { token: 'owner-token', version: null })).error.code, -32009);
  assert.equal((await rpc(url, 'CancelTask', { id: 'x' }, { token: 'owner-token' })).error.code, -32004);
  const raw = await rpc(url, 'SendMessage', { message: { messageId: 'raw-1', role: 'ROLE_USER', parts: [{ raw: 'AQID', mediaType: 'application/octet-stream' }] } }, { token: 'owner-token' });
  assert.equal(raw.error.code, -32005);
  const anonymous = await rpc(url, 'SendMessage', { message: message('steal owner credits') });
  assert.equal(anonymous.error.code, -32602);
  assert.equal(executions, 0, 'unauthorized A2A requests must cause zero provider execution');
  assert.equal(h.relay.state.requests.size, 0, 'unauthorized A2A requests must create zero TRUYN NEED records');
});
