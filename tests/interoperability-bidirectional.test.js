import http from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { createMcpHttpClient, MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createMcpHttpServer } from '../adapters/mcp/server.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function createNetwork(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  return { relay, relayUrl };
}

async function startFunctionProvider(t, { relayUrl, identity = createIdentity(), capability, execute }) {
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({
      name: `c7-provider-${capability}`,
      capabilities: [capability],
      execute
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await host.start();
  t.after(() => host.stop());
  return { identity, node, host };
}

function agent(name) {
  return {
    name,
    description: `${name} used by the C7 bidirectional interoperability proof`,
    version: '1.0.0'
  };
}

async function startA2aFacade(t, { relayUrl, identity = createIdentity(), name, skills }) {
  const node = new TruynNode({ relayUrl, identity });
  const server = createA2aServer({
    node,
    agent: agent(name),
    skills,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5_000
  });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  return { identity, node, server, url, cardUrl: `${url}/.well-known/agent-card.json` };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function createRemoteMcpToolServer(t) {
  const requests = [];
  const toolCalls = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    requests.push({ body, headers: req.headers });

    assert.equal(req.headers['mcp-protocol-version'], MCP_CURRENT_PROTOCOL_VERSION);
    assert.equal(req.headers['mcp-method'], body.method);
    assert.equal(body.params?._meta?.['io.modelcontextprotocol/protocolVersion'], MCP_CURRENT_PROTOCOL_VERSION);

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
        instructions: 'C7 remote MCP fixture',
        ttlMs: 1000,
        cacheScope: 'private',
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'c7-remote-mcp', version: '1.0.0' } }
      });
      return;
    }

    if (body.method === 'tools/list') {
      reply({
        resultType: 'complete',
        tools: [{
          name: 'bridge_lookup',
          description: 'Return a structured answer for the C7 bridge proof',
          inputSchema: {
            type: 'object',
            properties: {
              a2a: { type: 'object' },
              parts: { type: 'array' }
            },
            required: ['parts'],
            additionalProperties: true
          },
          outputSchema: { type: 'object' }
        }],
        ttlMs: 1000,
        cacheScope: 'private'
      });
      return;
    }

    if (body.method === 'tools/call') {
      assert.equal(body.params.name, 'bridge_lookup');
      const args = body.params.arguments;
      const query = args?.parts?.[0]?.data?.query;
      toolCalls.push({ body, headers: req.headers, args: structuredClone(args) });
      reply({
        resultType: 'complete',
        content: [{ type: 'text', text: `mcp:${query}` }],
        structuredContent: { answer: `mcp:${query}` },
        _meta: { usage: { fixture: 'c7' } }
      });
      return;
    }

    const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    requests,
    toolCalls
  };
}

async function waitForMcpResult(client, pollTool, requestId, { timeoutMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const polled = await client.callTool(pollTool, {});
    const events = Array.isArray(polled.output?.events) ? polled.output.events : [];
    const matched = events.find((event) => event.kind === 'RESULT' && event.envelope?.payload?.requestId === requestId);
    if (matched) return matched;
    await delay(5);
  }
  throw new Error(`Timed out waiting for TRUYN RESULT ${requestId} through MCP truyn_poll`);
}

test('C7 A2A -> TRUYN -> MCP completes a real Task/Artifact round trip', async (t) => {
  const { relay, relayUrl } = await createNetwork(t);
  const remoteMcp = await createRemoteMcpToolServer(t);

  const mcpAdapter = await createMcpDiscoveryProvider({
    endpoint: remoteMcp.url,
    allowTools: ['bridge_lookup']
  });
  assert.deepEqual(mcpAdapter.discovery.selectedTools, [{ tool: 'bridge_lookup', capability: 'mcp.bridge_lookup' }]);

  const mcpProviderIdentity = createIdentity();
  const mcpProviderNode = new TruynNode({ relayUrl, identity: mcpProviderIdentity });
  const mcpProviderHost = new TruynAdapterHost({
    node: mcpProviderNode,
    adapter: mcpAdapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await mcpProviderHost.start();
  t.after(() => mcpProviderHost.stop());

  const facade = await startA2aFacade(t, {
    relayUrl,
    name: 'C7 A2A to MCP bridge',
    skills: [{
      id: 'mcp-lookup',
      name: 'MCP lookup',
      description: 'Bridge an A2A request to an imported MCP tool',
      capability: 'mcp.bridge_lookup',
      visibility: 'public',
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }]
  });

  const a2aClient = createA2aClient({
    agentCardUrl: facade.cardUrl,
    pollIntervalMs: 2,
    taskTimeoutMs: 5_000
  });
  const discovered = await a2aClient.discover();
  assert.equal(a2aClient.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.deepEqual(discovered.card.skills.map((skill) => skill.id), ['mcp-lookup']);

  const response = await a2aClient.sendMessage({
    messageId: randomUUID(),
    role: 'ROLE_USER',
    parts: [{ data: { query: 'TRUYN' }, mediaType: 'application/json' }],
    metadata: {
      'io.truyn/skillId': 'mcp-lookup',
      ownerId: 'spoofed-a2a-owner',
      billingMode: 'spoofed-a2a-billing'
    }
  }, { returnImmediately: false });

  assert.ok(response.task, 'A2A SendMessage must return the completed Task');
  assert.equal(response.task.status.state, A2A_TASK_STATES.completed);
  assert.equal(response.task.artifacts.length, 1);
  const artifact = response.task.artifacts[0];
  assert.deepEqual(artifact.parts[0].data, { answer: 'mcp:TRUYN' });
  assert.equal(artifact.parts[0].mediaType, 'application/json');

  const provenance = artifact.metadata?.['io.truyn/provenance'];
  assert.ok(provenance?.requestId, 'A2A Artifact must preserve the TRUYN request correlation id');
  assert.equal(provenance.providerNodeId, mcpProviderIdentity.nodeId, 'TRUYN provider identity must remain authoritative');
  assert.equal(artifact.metadata?.['io.truyn/resultMetadata']?.adapter, 'mcp-discovery-import');
  assert.equal(artifact.metadata?.['io.truyn/resultMetadata']?.adapterVersion, '1');

  assert.equal(remoteMcp.toolCalls.length, 1, 'bridge must execute the remote MCP tool exactly once');
  const remoteArgs = remoteMcp.toolCalls[0].args;
  assert.deepEqual(remoteArgs.parts[0].data, { query: 'TRUYN' });
  assert.equal(remoteArgs.a2a.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'ownerId'), false, 'A2A descriptive owner metadata must not become MCP arguments');
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'billingMode'), false, 'A2A descriptive billing metadata must not become MCP arguments');

  const request = [...relay.state.requests.values()].find((entry) => entry.envelope?.payload?.requestId === provenance.requestId || entry.envelope?.id === provenance.requestId);
  assert.ok(request || relay.state.requests.size === 1, 'exactly one TRUYN request must back the A2A task');
});

test('C7 MCP -> TRUYN -> A2A completes a real NEED -> remote Task/Artifact -> RESULT -> MCP poll round trip', async (t) => {
  const { relayUrl } = await createNetwork(t);
  let remoteExecutions = 0;
  let remoteInput = null;

  await startFunctionProvider(t, {
    relayUrl,
    capability: 'remote.a2a_reason',
    execute: async ({ input }) => {
      remoteExecutions += 1;
      remoteInput = structuredClone(input);
      const prompt = input?.parts?.[0]?.data?.prompt;
      return {
        output: { answer: `a2a:${prompt}` },
        metadata: { source: 'c7-remote-native-provider' }
      };
    }
  });

  const remoteFacade = await startA2aFacade(t, {
    relayUrl,
    name: 'C7 remote A2A agent',
    skills: [{
      id: 'reason',
      name: 'Reason',
      description: 'Remote A2A reasoning skill for C7',
      capability: 'remote.a2a_reason',
      visibility: 'public',
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }]
  });

  const a2aAdapter = await createA2aDiscoveryProvider({
    agentCardUrl: remoteFacade.cardUrl,
    allowSkills: ['reason'],
    pollIntervalMs: 2,
    taskTimeoutMs: 5_000
  });
  assert.deepEqual(a2aAdapter.discovery.selectedSkills, [{ skill: 'reason', capability: 'a2a.reason' }]);

  const importedA2aProviderIdentity = createIdentity();
  const importedA2aProviderNode = new TruynNode({ relayUrl, identity: importedA2aProviderIdentity });
  const importedA2aHost = new TruynAdapterHost({
    node: importedA2aProviderNode,
    adapter: a2aAdapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await importedA2aHost.start();
  t.after(() => importedA2aHost.stop());

  const mcpFacadeIdentity = createIdentity();
  const mcpFacadeNode = new TruynNode({ relayUrl, identity: mcpFacadeIdentity });
  const mcpFacade = createMcpHttpServer({ node: mcpFacadeNode });
  const mcpUrl = await mcpFacade.listen({ port: 0 });
  t.after(() => mcpFacade.close());

  const mcpClient = createMcpHttpClient({ endpoint: mcpUrl });
  const discovery = await mcpClient.discover();
  assert.equal(mcpClient.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.ok(discovery.supportedVersions.includes(MCP_CURRENT_PROTOCOL_VERSION));
  const catalog = await mcpClient.listAllTools();
  const needTool = catalog.tools.find((tool) => tool.name === 'truyn_need');
  const pollTool = catalog.tools.find((tool) => tool.name === 'truyn_poll');
  assert.ok(needTool && pollTool, 'MCP facade must expose truyn_need and truyn_poll');

  const submitted = await mcpClient.callTool(needTool, {
    capability: 'a2a.reason',
    input: { prompt: 'TRUYN', ownerId: 'application-data-only' }
  });
  const requestId = submitted.output.needId;
  assert.ok(requestId, 'MCP truyn_need result must expose the TRUYN request id');
  assert.equal(submitted.output.provider, importedA2aProviderIdentity.nodeId, 'local imported A2A provider identity must remain authoritative');

  const resultEvent = await waitForMcpResult(mcpClient, pollTool, requestId);
  assert.equal(resultEvent.verification?.ok, true);
  assert.equal(resultEvent.envelope.from, importedA2aProviderIdentity.nodeId);
  assert.deepEqual(resultEvent.envelope.payload.output, { answer: 'a2a:TRUYN' });
  assert.equal(resultEvent.envelope.payload.metadata.interoperability.protocol, 'a2a');
  assert.equal(resultEvent.envelope.payload.metadata.interoperability.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(resultEvent.envelope.payload.metadata.interoperability.remoteSkillId, 'reason');
  assert.ok(resultEvent.envelope.payload.metadata.interoperability.remoteTaskId, 'remote A2A Task id must survive as correlation metadata');

  assert.equal(remoteExecutions, 1, 'bridge must execute the remote A2A skill exactly once');
  assert.deepEqual(remoteInput.parts[0].data, { prompt: 'TRUYN', ownerId: 'application-data-only' });
  assert.equal(remoteInput.a2a.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.ok(remoteInput.a2a.messageId, 'remote C3 facade must preserve the A2A message correlation id');
});
