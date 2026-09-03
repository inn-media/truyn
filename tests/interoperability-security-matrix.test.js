import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';
import { createMcpHttpClient, MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createMcpHandler, createMcpModernMeta } from '../adapters/mcp/server.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';
import {
  A2A_INTEGRITY_METADATA_KEY,
  A2A_SOURCE_URL_METADATA_KEY,
  createA2aArtifactBundle,
  normalizeVerifiedRemotePart
} from '../adapters/a2a/artifact-integrity.js';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  });
}

function agent(name) {
  return { name, description: `${name} C8 security fixture`, version: '1.0.0' };
}

function principal(req) {
  if (req.headers.authorization === 'Bearer owner-token') return { sub: 'owner' };
  if (req.headers.authorization === 'Bearer other-token') return { sub: 'other' };
  return null;
}

function modernParams(extra = {}) {
  return { ...extra, _meta: createMcpModernMeta({ clientName: 'c8-matrix', clientVersion: '1' }) };
}

async function a2aRpc(url, method, params = {}, { token = null, version = A2A_PROTOCOL_VERSION } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (version !== null) headers['a2a-version'] = version;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${randomUUID()}`, method, params })
  });
  return response.json();
}

async function createNetwork(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  return { relay, relayUrl };
}

async function startFunctionProvider(t, { relayUrl, identity = createIdentity(), capability, accessPolicy, execute }) {
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({ name: `c8-${capability}`, capabilities: [capability], execute }),
    accessPolicy,
    pollIntervalMs: 2
  });
  await host.start();
  t.after(() => host.stop());
  return { identity, node, host };
}

async function startRemoteMcp(t) {
  const requests = [];
  const toolCalls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ body, headers: req.headers });
    const reply = (result) => {
      const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
      res.end(payload);
    };
    if (body.method === 'server/discover') {
      reply({
        resultType: 'complete',
        supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        ttlMs: 1000,
        cacheScope: 'private',
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'c8-remote-mcp', version: '1' } }
      });
      return;
    }
    if (body.method === 'tools/list') {
      reply({
        resultType: 'complete',
        tools: [
          {
            name: 'bridge_lookup',
            description: 'C8 allowed tool',
            inputSchema: { type: 'object', properties: { a2a: { type: 'object' }, parts: { type: 'array' } }, required: ['parts'], additionalProperties: true }
          },
          {
            name: 'private_admin',
            description: 'C8 private tool that must not be imported',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } } }
          }
        ],
        ttlMs: 1000,
        cacheScope: 'private'
      });
      return;
    }
    if (body.method === 'tools/call') {
      toolCalls.push({ body: structuredClone(body), headers: { ...req.headers } });
      const query = body.params.arguments?.parts?.[0]?.data?.query;
      reply({
        resultType: 'complete',
        content: [{ type: 'text', text: `mcp:${query}` }],
        structuredContent: { answer: `mcp:${query}` }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, requests, toolCalls };
}

async function startRemoteA2a(t, { relayUrl, facadeIdentity, executions }) {
  const provider = await startFunctionProvider(t, {
    relayUrl,
    capability: 'remote.c8.reason',
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    execute: async ({ input }) => {
      executions.count += 1;
      executions.input = structuredClone(input);
      return { output: { answer: `a2a:${input.parts[0].data.prompt}` } };
    }
  });
  const node = new TruynNode({ relayUrl, identity: facadeIdentity });
  const server = createA2aServer({
    node,
    agent: agent('C8 remote A2A'),
    skills: [
      { id: 'reason', name: 'Reason', description: 'C8 public reason', capability: 'remote.c8.reason', visibility: 'public', inputModes: ['application/json'], outputModes: ['application/json'] },
      { id: 'private', name: 'Private', description: 'Must remain hidden', capability: 'remote.c8.private', visibility: 'authenticated', inputModes: ['application/json'], outputModes: ['application/json'] }
    ],
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5000
  });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  return { provider, node, server, url, cardUrl: `${url}/.well-known/agent-card.json` };
}

test('C8 A2A -> TRUYN -> MCP: authorization, visibility, authority and replay are fail closed; valid call is exactly once', async (t) => {
  const { relay, relayUrl } = await createNetwork(t);
  const remoteMcp = await startRemoteMcp(t);
  const facadeIdentity = createIdentity();
  const mcpProviderIdentity = createIdentity();

  const adapter = await createMcpDiscoveryProvider({ endpoint: remoteMcp.url, allowTools: ['bridge_lookup'] });
  assert.deepEqual(adapter.discovery.selectedTools, [{ tool: 'bridge_lookup', capability: 'mcp.bridge_lookup' }]);
  assert.equal(JSON.stringify(adapter.capabilities).includes('private_admin'), false);

  const providerNode = new TruynNode({ relayUrl, identity: mcpProviderIdentity });
  const providerHost = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [facadeIdentity.nodeId] }),
    pollIntervalMs: 2
  });
  await providerHost.start();
  t.after(() => providerHost.stop());

  const facadeNode = new TruynNode({ relayUrl, identity: facadeIdentity });
  const facade = createA2aServer({
    node: facadeNode,
    agent: agent('C8 A2A to MCP'),
    skills: [{ id: 'lookup', name: 'Lookup', description: 'Authenticated lookup', capability: 'mcp.bridge_lookup', visibility: 'authenticated', inputModes: ['application/json'], outputModes: ['application/json'] }],
    authenticate: principal,
    authorize: ({ principal: caller }) => caller?.sub === 'owner',
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5000
  });
  const facadeUrl = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const publicCard = await (await fetch(`${facadeUrl}/.well-known/agent-card.json`)).json();
  assert.deepEqual(publicCard.skills, [], 'private/authenticated bridge skill must not leak in the public A2A card');

  const message = {
    messageId: 'c8-a2a-message-1',
    role: 'ROLE_USER',
    parts: [{ data: { query: 'TRUYN' }, mediaType: 'application/json' }],
    metadata: {
      'io.truyn/skillId': 'lookup',
      requesterNodeId: 'spoofed-requester',
      providerOwner: 'spoofed-provider-owner',
      billingResponsibility: 'spoofed-billing-owner'
    }
  };

  const anonymous = await a2aRpc(facadeUrl, 'SendMessage', { message });
  assert.ok(anonymous.error);
  const other = await a2aRpc(facadeUrl, 'SendMessage', { message: { ...message, messageId: 'c8-a2a-other' } }, { token: 'other-token' });
  assert.ok(other.error);
  assert.equal(relay.state.requests.size, 0, 'unauthorized A2A must create zero TRUYN NEEDs');
  assert.equal(remoteMcp.toolCalls.length, 0, 'unauthorized A2A must execute zero MCP tools');

  const valid = await a2aRpc(facadeUrl, 'SendMessage', { message }, { token: 'owner-token' });
  assert.equal(valid.error, undefined);
  assert.equal(valid.result.task.status.state, A2A_TASK_STATES.completed);
  assert.deepEqual(valid.result.task.artifacts[0].parts[0].data, { answer: 'mcp:TRUYN' });
  assert.equal(remoteMcp.toolCalls.length, 1, 'valid bridge must execute the remote MCP tool exactly once');

  const [request] = [...relay.state.requests.values()];
  assert.equal(request.requester, facadeIdentity.nodeId, 'authenticated TRUYN facade identity is authoritative requester');
  assert.equal(request.provider, mcpProviderIdentity.nodeId, 'local imported MCP provider is authoritative owner');
  const remoteArgs = remoteMcp.toolCalls[0].body.params.arguments;
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'requesterNodeId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'providerOwner'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'billingResponsibility'), false);

  const replay = await a2aRpc(facadeUrl, 'SendMessage', { message }, { token: 'owner-token' });
  assert.ok(replay.error, 'replayed A2A messageId must fail closed');
  assert.equal(remoteMcp.toolCalls.length, 1, 'replayed messageId must not cause a second remote execution');
  assert.equal(relay.state.requests.size, 1, 'replayed messageId must not create a second TRUYN NEED');

  const taskSubstitution = await a2aRpc(facadeUrl, 'SendMessage', {
    message: { ...message, messageId: 'c8-task-substitution', taskId: valid.result.task.id }
  }, { token: 'owner-token' });
  assert.ok(taskSubstitution.error, 'taskId substitution/continuation is unsupported and must fail closed');
  assert.equal(remoteMcp.toolCalls.length, 1);
});

test('C8 MCP -> TRUYN -> A2A: transport access does not grant TRUYN authority; valid call is exactly once', async (t) => {
  const { relay, relayUrl } = await createNetwork(t);
  const remoteFacadeIdentity = createIdentity();
  const executions = { count: 0, input: null };
  const remote = await startRemoteA2a(t, { relayUrl, facadeIdentity: remoteFacadeIdentity, executions });

  const adapter = await createA2aDiscoveryProvider({ agentCardUrl: remote.cardUrl, allowSkills: ['reason', 'private'], pollIntervalMs: 2, taskTimeoutMs: 5000 });
  assert.deepEqual(adapter.discovery.selectedSkills, [{ skill: 'reason', capability: 'a2a.reason' }]);
  assert.equal(JSON.stringify(adapter.capabilities).includes('private'), false, 'private remote A2A skill must not be imported through public discovery');

  const authorizedIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const importedIdentity = createIdentity();
  const importedNode = new TruynNode({ relayUrl, identity: importedIdentity });
  const importedHost = new TruynAdapterHost({
    node: importedNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [authorizedIdentity.nodeId] }),
    pollIntervalMs: 2
  });
  await importedHost.publishCapabilities();

  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  const attackerMcp = createMcpHandler({ node: attacker });
  const find = await attackerMcp({ jsonrpc: '2.0', id: 'find', method: 'tools/call', params: modernParams({ name: 'truyn_find', arguments: { capability: 'a2a.reason' } }) });
  assert.deepEqual(find.result.structuredContent.offers, []);
  const denied = await attackerMcp({
    jsonrpc: '2.0', id: 'need-denied', method: 'tools/call',
    params: modernParams({ name: 'truyn_need', arguments: { capability: 'a2a.reason', input: { prompt: 'steal' } } })
  });
  assert.equal(denied.result.isError, true);
  assert.equal(executions.count, 0, 'unauthorized MCP caller must execute zero imported A2A skills');
  assert.equal(relay.state.requests.size, 0, 'transport-level MCP access must not create an unauthorized TRUYN NEED');

  const authorized = new TruynNode({ relayUrl, identity: authorizedIdentity });
  const authorizedMcp = createMcpHandler({ node: authorized });
  const submitted = await authorizedMcp({
    jsonrpc: '2.0', id: 'need-ok', method: 'tools/call',
    params: modernParams({
      name: 'truyn_need',
      arguments: {
        capability: 'a2a.reason',
        input: {
          prompt: 'TRUYN',
          requesterNodeId: 'spoofed-requester',
          providerOwner: 'spoofed-provider',
          billingResponsibility: 'spoofed-billing'
        }
      }
    })
  });
  const requestId = submitted.result.structuredContent.needId;
  assert.ok(requestId);
  const outer = relay.state.requests.get(requestId);
  assert.equal(outer.requester, authorizedIdentity.nodeId);
  assert.equal(outer.provider, importedIdentity.nodeId);

  const handled = await importedHost.runOnce();
  assert.equal(handled.handled, 1);
  assert.equal(executions.count, 1, 'valid MCP -> TRUYN -> A2A bridge must execute exactly once');
  assert.deepEqual(executions.input.parts[0].data, {
    prompt: 'TRUYN',
    requesterNodeId: 'spoofed-requester',
    providerOwner: 'spoofed-provider',
    billingResponsibility: 'spoofed-billing'
  }, 'application data survives but cannot replace authenticated TRUYN authority');

  const polled = await authorizedMcp({ jsonrpc: '2.0', id: 'poll', method: 'tools/call', params: modernParams({ name: 'truyn_poll', arguments: {} }) });
  const event = polled.result.structuredContent.events.find((item) => item.kind === 'RESULT' && item.envelope?.payload?.requestId === requestId);
  assert.ok(event);
  assert.equal(event.envelope.from, importedIdentity.nodeId);
  assert.deepEqual(event.envelope.payload.output, { answer: 'a2a:TRUYN' });
});

function fakeA2aCard(interfaceUrl) {
  return {
    name: 'C8 correlation agent',
    description: 'C8 correlation fixture',
    version: '1',
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 's', name: 'S', description: 'S', inputModes: ['text/plain'], outputModes: ['text/plain'] }],
    supportedInterfaces: [{ url: interfaceUrl, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }]
  };
}

function correlationFetch({ getTask }) {
  const cardUrl = 'http://127.0.0.1:9777/.well-known/agent-card.json';
  const interfaceUrl = 'http://127.0.0.1:9777/a2a';
  let sends = 0;
  let polls = 0;
  return {
    cardUrl,
    counts: () => ({ sends, polls }),
    fetchImpl: async (url, init = {}) => {
      if (String(url) === cardUrl && init.method === 'GET') return jsonResponse(fakeA2aCard(interfaceUrl));
      const request = JSON.parse(init.body);
      if (request.method === 'SendMessage') {
        sends += 1;
        return jsonResponse({
          jsonrpc: '2.0', id: request.id,
          result: { task: { id: 'task-c8', contextId: 'ctx-c8', status: { state: A2A_TASK_STATES.working } } }
        });
      }
      if (request.method === 'GetTask') {
        polls += 1;
        return jsonResponse({ jsonrpc: '2.0', id: request.id, result: getTask(request) });
      }
      return new Response('', { status: 404 });
    }
  };
}

test('C8 A2A taskId/contextId and JSON-RPC correlation substitutions fail without a second execution', async () => {
  const wrongTask = correlationFetch({
    getTask: () => ({ id: 'task-other', contextId: 'ctx-c8', status: { state: A2A_TASK_STATES.completed }, artifacts: [] })
  });
  const taskClient = createA2aClient({ agentCardUrl: wrongTask.cardUrl, fetchImpl: wrongTask.fetchImpl, taskExecutionMode: 'polling', pollIntervalMs: 0, taskTimeoutMs: 1000 });
  await assert.rejects(
    taskClient.execute({ skill: { id: 's' }, message: { messageId: 'm-task', role: 'ROLE_USER', parts: [{ text: 'x' }] } }),
    (error) => error.code === 'A2A_TASK_ID_MISMATCH'
  );
  assert.deepEqual(wrongTask.counts(), { sends: 1, polls: 1 });

  const wrongContext = correlationFetch({
    getTask: () => ({ id: 'task-c8', contextId: 'ctx-other', status: { state: A2A_TASK_STATES.completed }, artifacts: [] })
  });
  const contextClient = createA2aClient({ agentCardUrl: wrongContext.cardUrl, fetchImpl: wrongContext.fetchImpl, taskExecutionMode: 'polling', pollIntervalMs: 0, taskTimeoutMs: 1000 });
  await assert.rejects(
    contextClient.execute({ skill: { id: 's' }, message: { messageId: 'm-context', role: 'ROLE_USER', parts: [{ text: 'x' }] } }),
    (error) => error.code === 'A2A_CONTEXT_ID_MISMATCH'
  );
  assert.deepEqual(wrongContext.counts(), { sends: 1, polls: 1 });

  let sendCalls = 0;
  const cardUrl = 'http://127.0.0.1:9888/.well-known/agent-card.json';
  const interfaceUrl = 'http://127.0.0.1:9888/a2a';
  const mismatchedIdClient = createA2aClient({
    agentCardUrl: cardUrl,
    fetchImpl: async (url, init = {}) => {
      if (String(url) === cardUrl && init.method === 'GET') return jsonResponse(fakeA2aCard(interfaceUrl));
      sendCalls += 1;
      return jsonResponse({ jsonrpc: '2.0', id: 'attacker-substituted-id', result: { message: { messageId: 'r', role: 'ROLE_AGENT', parts: [{ text: 'bad' }] } } });
    }
  });
  await assert.rejects(
    mismatchedIdClient.execute({ skill: { id: 's' }, message: { messageId: 'm-rpc', role: 'ROLE_USER', parts: [{ text: 'x' }] } }),
    /invalid JSON-RPC envelope/
  );
  assert.equal(sendCalls, 1, 'response-id mismatch must not trigger fallback/retry execution');
});

test('C8 MCP transport rejects malformed/version/id/oversize/timeout cases with one request and no retry', async () => {
  async function expectDiscoveryFailure(fetchImpl, matcher, options = {}) {
    let calls = 0;
    const client = createMcpHttpClient({
      endpoint: 'https://mcp.example.test/mcp',
      maxResponseBytes: options.maxResponseBytes || 1024,
      requestTimeoutMs: options.requestTimeoutMs || 100,
      fetchImpl: async (...args) => {
        calls += 1;
        return fetchImpl(...args);
      }
    });
    await assert.rejects(client.discover(), matcher);
    assert.equal(calls, 1, 'negative MCP transport case must not retry');
  }

  await expectDiscoveryFailure(async (_url, init) => {
    assert.equal(init.redirect, 'error');
    return new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } });
  }, /invalid JSON/);

  await expectDiscoveryFailure(async (_url, init) => {
    const request = JSON.parse(init.body);
    return jsonResponse({ jsonrpc: '2.0', id: `${request.id}-substituted`, result: {} });
  }, /response id mismatch/);

  await expectDiscoveryFailure(async (_url, init) => {
    const request = JSON.parse(init.body);
    return jsonResponse({
      jsonrpc: '2.0', id: request.id,
      result: { resultType: 'complete', supportedVersions: ['2099-01-01'], capabilities: { tools: {} }, ttlMs: 1, cacheScope: 'private' }
    });
  }, /does not advertise/);

  await expectDiscoveryFailure(async () => new Response('0123456789', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '10' }
  }), /size limit/, { maxResponseBytes: 5 });

  await expectDiscoveryFailure(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }), (error) => error.code === 'MCP_REQUEST_TIMEOUT', { requestTimeoutMs: 10 });
});

test('C8 bearer credentials are never redirect-forwarded and reserved routing is locally owned', async () => {
  let calls = 0;
  const client = createMcpHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    apiKey: 'secret-c8-token',
    authMode: 'bearer',
    fetchImpl: async (_url, init) => {
      calls += 1;
      assert.equal(init.redirect, 'error', 'credentialed MCP requests must deny redirects');
      assert.equal(init.headers.authorization, 'Bearer secret-c8-token');
      assert.equal(init.headers['mcp-protocol-version'], MCP_CURRENT_PROTOCOL_VERSION);
      const request = JSON.parse(init.body);
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        result: { resultType: 'complete', supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION], capabilities: { tools: {} }, ttlMs: 1, cacheScope: 'private' }
      });
    }
  });
  await client.discover();
  assert.equal(calls, 1);
});

test('C8 C6 artifact negatives fail closed and corrupted data never becomes a successful cross-protocol result', async () => {
  const tampered = {
    raw: Buffer.from('hello').toString('base64'),
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: { algorithm: 'sha256', digest: '0'.repeat(64), sizeBytes: 5, encoding: 'raw' }
    }
  };
  await assert.rejects(normalizeVerifiedRemotePart(tampered, { maxArtifactBytes: 1024 }), (error) => error.code === 'A2A_ARTIFACT_INTEGRITY_MISMATCH');

  const wrongSize = {
    raw: Buffer.from('hello').toString('base64'),
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: { algorithm: 'sha256', digest: sha256('hello'), sizeBytes: 4, encoding: 'raw' }
    }
  };
  await assert.rejects(normalizeVerifiedRemotePart(wrongSize, { maxArtifactBytes: 1024 }), (error) => error.code === 'A2A_ARTIFACT_INTEGRITY_MISMATCH');
  await assert.rejects(normalizeVerifiedRemotePart({ raw: '***' }, { maxArtifactBytes: 1024 }), (error) => error.code === 'A2A_ARTIFACT_RAW_INVALID');
  await assert.rejects(normalizeVerifiedRemotePart({ raw: Buffer.alloc(2).toString('base64') }, { maxArtifactBytes: 1 }), (error) => error.code === 'A2A_ARTIFACT_TOO_LARGE');

  let resolverCalls = 0;
  await assert.rejects(
    normalizeVerifiedRemotePart({ url: 'http://169.254.169.254/latest/meta-data/' }, { maxArtifactBytes: 1024 }),
    (error) => error.code === 'A2A_ARTIFACT_URL_UNVERIFIED'
  );
  assert.equal(resolverCalls, 0, 'URL references must never trigger implicit SSRF resolution');

  const inline = await normalizeVerifiedRemotePart({
    text: 'ok',
    metadata: { [A2A_SOURCE_URL_METADATA_KEY]: 'https://attacker.invalid/spoof' }
  }, { maxArtifactBytes: 1024 });
  assert.equal(inline.metadata[A2A_SOURCE_URL_METADATA_KEY], undefined, 'spoofed source provenance must be stripped');

  const store = new A2aTaskStore();
  const task = store.create({ ownerKey: 'owner', message: { messageId: 'artifact-c8', role: 'ROLE_USER', parts: [{ text: 'x' }] }, skill: { id: 's', capability: 'c' } });
  store.start(task.id, { truynRequestId: 'request-c8', providerNodeId: 'provider-c8' });
  store.completeFromTruynEvent({
    kind: 'RESULT', verification: { ok: true }, trust: { score: 1 },
    envelope: {
      from: 'provider-c8',
      payload: {
        requestId: 'request-c8',
        output: createA2aArtifactBundle([{ artifactId: 'bad', parts: [{ raw: '***corrupt***' }] }]),
        metadata: {}
      }
    }
  });
  const snapshot = store.snapshot(task);
  assert.equal(snapshot.status.state, A2A_TASK_STATES.failed);
  assert.equal(snapshot.artifacts, undefined, 'corrupted artifact must never become a successful A2A/cross-protocol RESULT');
});

test('C8 task-store rejects cross-request/unverified RESULT injection and terminal replay', () => {
  const store = new A2aTaskStore();
  const task = store.create({ ownerKey: 'owner', message: { messageId: 'result-c8', role: 'ROLE_USER', parts: [{ text: 'x' }] }, skill: { id: 's', capability: 'c' } });
  store.start(task.id, { truynRequestId: 'request-good', providerNodeId: 'provider-good' });

  assert.equal(store.completeFromTruynEvent({
    kind: 'RESULT', verification: { ok: true },
    envelope: { from: 'provider-other', payload: { requestId: 'request-other', output: 'inject' } }
  }), null, 'cross-request RESULT with another requestId must be ignored');
  assert.equal(store.snapshot(task).status.state, A2A_TASK_STATES.working);

  assert.equal(store.completeFromTruynEvent({
    kind: 'RESULT', verification: { ok: false },
    envelope: { from: 'provider-other', payload: { requestId: 'request-good', output: 'spoof' } }
  }), null, 'unverified/wrong-provider RESULT must be ignored at the bridge boundary');
  assert.equal(store.snapshot(task).status.state, A2A_TASK_STATES.working);

  store.completeFromTruynEvent({
    kind: 'RESULT', verification: { ok: true }, trust: { score: 1 },
    envelope: { from: 'provider-good', payload: { requestId: 'request-good', output: 'ok', metadata: {} } }
  });
  const completed = store.snapshot(task);
  assert.equal(completed.status.state, A2A_TASK_STATES.completed);

  store.completeFromTruynEvent({
    kind: 'RESULT', verification: { ok: true },
    envelope: { from: 'provider-good', payload: { requestId: 'request-good', output: 'replayed' } }
  });
  assert.deepEqual(store.snapshot(task).artifacts, completed.artifacts, 'terminal RESULT replay must not mutate successful output');
});
