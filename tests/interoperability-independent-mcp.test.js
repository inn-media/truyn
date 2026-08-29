import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

const FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-server.mjs', import.meta.url);
const PACKAGE_URL = new URL('../package.json', import.meta.url);

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(2_000).then(() => false)
  ]);
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function startIndependentMcpSdkServer(t) {
  const fixtureSource = await readFile(FIXTURE_URL, 'utf8');
  const packageJson = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));
  assert.match(fixtureSource, /from '@modelcontextprotocol\/server'/, 'black-box fixture must use the official external MCP server SDK');
  assert.match(fixtureSource, /handler\.fetch\(request\)/, 'black-box fixture must dispatch through the public MCP HTTP handler');
  assert.match(fixtureSource, /await handler\.close\(\)/, 'black-box fixture must close the public MCP handler deterministically');
  assert.doesNotMatch(fixtureSource, /_registeredTools/, 'black-box fixture must not reach into private MCP SDK tool registries');
  assert.doesNotMatch(fixtureSource, /adapters\/mcp|createMcpHttpServer|createMcpDiscoveryProvider/, 'black-box fixture must not use TRUYN MCP implementations');
  assert.equal(packageJson.devDependencies?.['@modelcontextprotocol/server'], '2.0.0', 'official MCP SDK version must be exact-pinned');

  const child = spawn(process.execPath, [fileURLToPath(FIXTURE_URL)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => stopChild(child));

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out starting official MCP SDK fixture: ${stderr}`));
    }, 10_000);

    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };

    child.once('error', fail);
    child.once('exit', (code, signal) => {
      fail(new Error(`Official MCP SDK fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed?.type === 'ready') {
          clearTimeout(timer);
          resolve(parsed);
          return;
        }
      }
    });
  });

  return { child, ...ready };
}

async function readRemoteStats(remote) {
  const response = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  return response.json();
}

async function startA2aFacade(t, {
  relayUrl,
  identity = createIdentity(),
  skillVisibility = 'public',
  authenticate = null,
  authorize = null
} = {}) {
  const node = new TruynNode({ relayUrl, identity });
  const server = createA2aServer({
    node,
    agent: {
      name: 'Sprint D A2A to independent MCP bridge',
      description: 'TRUYN A2A facade used to drive the independent MCP black-box proof.',
      version: '1.0.0-sprint-d'
    },
    skills: [{
      id: 'mcp-lookup',
      name: 'Independent MCP lookup',
      description: 'Bridge an A2A request to an imported independent MCP tool.',
      capability: 'mcp.bridge_lookup',
      visibility: skillVisibility,
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }],
    authenticate,
    authorize,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5_000
  });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  return { node, identity, server, url, cardUrl: `${url}/.well-known/agent-card.json` };
}

async function createImportedMcpHost(t, {
  relayUrl,
  remote,
  identity = createIdentity(),
  accessPolicy = createProviderAccessPolicy({ mode: 'public' }),
  billingPolicy = null
} = {}) {
  const adapter = await createMcpDiscoveryProvider({
    endpoint: remote.endpoint,
    allowTools: ['bridge_lookup']
  });
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter,
    accessPolicy,
    billingPolicy,
    pollIntervalMs: 2
  });
  await host.start();
  t.after(() => host.stop());
  return { adapter, node, host, identity };
}

function assertOfficialDiscovery(adapter) {
  assert.equal(adapter.discovery.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.deepEqual(adapter.discovery.selectedTools, [{ tool: 'bridge_lookup', capability: 'mcp.bridge_lookup' }]);
  assert.equal(adapter.discovery.serverInfo?.name, 'Sprint D official MCP SDK black-box server');
  assert.equal(adapter.discovery.serverInfo?.version, '1.0.0-sprint-d');
}

test('Sprint D A2A -> TRUYN -> independent official MCP SDK black-box round trip', { timeout: 20_000 }, async (t) => {
  const remote = await startIndependentMcpSdkServer(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(MCP_CURRENT_PROTOCOL_VERSION, '2026-07-28');

  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const imported = await createImportedMcpHost(t, { relayUrl, remote });
  assertOfficialDiscovery(imported.adapter);

  const facade = await startA2aFacade(t, { relayUrl });
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
      billingMode: 'spoofed-a2a-billing',
      billingResponsibility: 'spoofed-a2a-payer'
    }
  }, { returnImmediately: false });

  assert.ok(response.task, 'A2A SendMessage must return the completed Task');
  assert.equal(response.task.status.state, A2A_TASK_STATES.completed);
  assert.equal(response.task.artifacts.length, 1);
  const artifact = response.task.artifacts[0];
  assert.deepEqual(artifact.parts[0].data, { answer: 'official-mcp:TRUYN' });
  assert.equal(artifact.parts[0].mediaType, 'application/json');

  const provenance = artifact.metadata?.['io.truyn/provenance'];
  const resultMetadata = artifact.metadata?.['io.truyn/resultMetadata'];
  assert.ok(provenance?.requestId, 'A2A Artifact must preserve the TRUYN request correlation id');
  assert.equal(provenance.providerNodeId, imported.identity.nodeId, 'TRUYN imported-provider identity must remain authoritative');
  assert.equal(resultMetadata?.adapter, 'mcp-discovery-import');
  assert.equal(resultMetadata?.adapterVersion, '1');
  assert.equal(Object.prototype.hasOwnProperty.call(resultMetadata || {}, 'billingMode'), false, 'unconfigured provider billing must not be invented from A2A metadata');
  assert.equal(Object.prototype.hasOwnProperty.call(resultMetadata || {}, 'billingResponsibility'), false, 'A2A metadata must not assign billing responsibility');

  const backingRequest = relay.state.requests.get(provenance.requestId);
  assert.ok(backingRequest, 'A2A provenance requestId must identify the exact stored TRUYN NEED');
  assert.equal(relay.state.requests.size, 1, 'the positive black-box route must create exactly one TRUYN NEED');
  assert.equal(backingRequest.needId, provenance.requestId, 'artifact correlation must equal the actual TRUYN NEED id');
  assert.equal(backingRequest.requester, facade.identity.nodeId, 'authenticated TRUYN facade identity must be the authoritative requester');
  assert.notEqual(backingRequest.requester, 'spoofed-a2a-owner', 'A2A owner metadata must never become requester authority');
  assert.equal(backingRequest.provider, imported.identity.nodeId, 'matched OFFER owner must be the authoritative provider');
  assert.equal(backingRequest.capability, 'mcp.bridge_lookup');

  const stats = await readRemoteStats(remote);
  assert.equal(stats.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(stats.sdkVersion, '2.0.0');
  assert.equal(stats.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(stats.executionCount, 1, 'independent MCP SDK tool executor must run exactly once');
  assert.equal(stats.toolInputs.length, 1, 'exactly one tool input must reach the independent MCP handler');
  assert.deepEqual(stats.toolInputs[0].parts[0].data, { query: 'TRUYN' });
  assert.equal(stats.toolInputs[0].a2a.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(stats.toolInputs[0].a2a, 'ownerId'), false, 'A2A owner metadata must not cross the TRUYN authority boundary');
  assert.equal(Object.prototype.hasOwnProperty.call(stats.toolInputs[0].a2a, 'billingMode'), false, 'A2A billing metadata must not cross the TRUYN authority boundary');
  assert.equal(Object.prototype.hasOwnProperty.call(stats.toolInputs[0].a2a, 'billingResponsibility'), false, 'A2A payer metadata must not cross the TRUYN authority boundary');

  const mcpRequests = stats.requests.filter((request) => request.path === '/mcp');
  assert.equal(mcpRequests.length, 3, 'black-box route must perform one discover, one tools/list and one tools/call request');
  assert.deepEqual(mcpRequests.map((request) => request.jsonRpcMethod), ['server/discover', 'tools/list', 'tools/call']);
  for (const request of mcpRequests) {
    assert.equal(request.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
    assert.equal(request.mcpMethod, request.jsonRpcMethod);
  }
  const callRequest = mcpRequests.find((request) => request.jsonRpcMethod === 'tools/call');
  assert.equal(callRequest.mcpName, 'bridge_lookup');
});

test('Sprint D spoofed A2A owner cannot unlock an owner-only imported MCP provider', { timeout: 20_000 }, async (t) => {
  const remote = await startIndependentMcpSdkServer(t);
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const spoofedOwner = createIdentity();
  const imported = await createImportedMcpHost(t, {
    relayUrl,
    remote,
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [spoofedOwner.nodeId]
    })
  });
  assertOfficialDiscovery(imported.adapter);

  const facade = await startA2aFacade(t, {
    relayUrl,
    skillVisibility: 'authenticated',
    authenticate: async () => ({ id: 'authenticated-a2a-client' }),
    authorize: async () => true
  });
  assert.notEqual(facade.identity.nodeId, spoofedOwner.nodeId);

  const a2aClient = createA2aClient({ agentCardUrl: facade.cardUrl, pollIntervalMs: 2, taskTimeoutMs: 5_000 });
  const discovered = await a2aClient.discover();
  assert.deepEqual(discovered.card.skills, [], 'owner-only TRUYN provider must not leak into the public A2A card');

  await assert.rejects(
    () => a2aClient.sendMessage({
      messageId: randomUUID(),
      role: 'ROLE_USER',
      parts: [{ data: { query: 'forbidden' }, mediaType: 'application/json' }],
      metadata: {
        'io.truyn/skillId': 'mcp-lookup',
        ownerId: spoofedOwner.nodeId,
        billingMode: 'owner-funded'
      }
    }, { returnImmediately: false }),
    /No authorized A2A skill is available/,
    'spoofed A2A owner metadata must fail closed against the real TRUYN requester identity'
  );

  assert.equal(relay.state.requests.size, 0, 'failed authority spoof must create zero TRUYN NEEDs');
  const stats = await readRemoteStats(remote);
  assert.equal(stats.executionCount, 0, 'failed authority spoof must execute zero external MCP tools');
  assert.deepEqual(stats.requests.map((request) => request.jsonRpcMethod), ['server/discover', 'tools/list']);
});

test('Sprint D spoofed A2A billing cannot override provider billing policy', { timeout: 20_000 }, async (t) => {
  const remote = await startIndependentMcpSdkServer(t);
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const imported = await createImportedMcpHost(t, {
    relayUrl,
    remote,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: createProviderBillingPolicy({ mode: 'prepaid' })
  });
  assertOfficialDiscovery(imported.adapter);

  const facade = await startA2aFacade(t, { relayUrl });
  const a2aClient = createA2aClient({ agentCardUrl: facade.cardUrl, pollIntervalMs: 2, taskTimeoutMs: 5_000 });
  await a2aClient.discover();

  const response = await a2aClient.sendMessage({
    messageId: randomUUID(),
    role: 'ROLE_USER',
    parts: [{ data: { query: 'billing-spoof' }, mediaType: 'application/json' }],
    metadata: {
      'io.truyn/skillId': 'mcp-lookup',
      ownerId: 'spoofed-owner',
      billingMode: 'owner-funded',
      billingResponsibility: 'requester'
    }
  }, { returnImmediately: false });

  assert.equal(response.task.status.state, A2A_TASK_STATES.failed, 'provider-side billing denial must fail the A2A task');
  assert.equal(response.task.status.message?.parts?.[0]?.text, 'PROVIDER_BILLING_DENIED');

  assert.equal(relay.state.requests.size, 1, 'billing denial occurs after exactly one authenticated TRUYN NEED');
  const backingRequest = [...relay.state.requests.values()][0];
  assert.equal(backingRequest.requester, facade.identity.nodeId, 'billing spoof must not replace authenticated requester authority');
  assert.notEqual(backingRequest.requester, 'spoofed-owner');
  assert.equal(backingRequest.provider, imported.identity.nodeId);
  assert.equal(backingRequest.status, 'completed');

  const offer = [...relay.state.offers.values()].find((entry) => entry.envelope?.from === imported.identity.nodeId && entry.capability === 'mcp.bridge_lookup');
  assert.ok(offer, 'imported MCP provider OFFER must exist');
  assert.equal(offer.envelope.payload?.metadata?.billingMode, 'prepaid', 'provider-published billing mode must remain authoritative');

  const stats = await readRemoteStats(remote);
  assert.equal(stats.executionCount, 0, 'provider billing denial must happen before external MCP execution');
  assert.deepEqual(stats.requests.map((request) => request.jsonRpcMethod), ['server/discover', 'tools/list']);
});
