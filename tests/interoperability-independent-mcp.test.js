import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

const FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-server.mjs', import.meta.url);

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
  assert.match(fixtureSource, /from '@modelcontextprotocol\/server'/, 'black-box fixture must use the official MCP server SDK');
  assert.match(fixtureSource, /from '@modelcontextprotocol\/node'/, 'black-box fixture must use the official MCP Node middleware');
  assert.doesNotMatch(
    fixtureSource,
    /createMcpHttpServer|createMcpHttpClient|adapters\/mcp\//,
    'black-box fixture must not use the TRUYN MCP server/client implementation'
  );

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

async function startA2aFacade(t, { relayUrl, identity = createIdentity(), name, skills }) {
  const node = new TruynNode({ relayUrl, identity });
  const server = createA2aServer({
    node,
    agent: {
      name,
      description: `${name} used by the Sprint D independent MCP interoperability proof`,
      version: '1.0.0'
    },
    skills,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5_000
  });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  return { identity, node, server, url, cardUrl: `${url}/.well-known/agent-card.json` };
}

test('Sprint D A2A -> TRUYN -> independent official MCP SDK black-box round trip', { timeout: 20_000 }, async (t) => {
  const remote = await startIndependentMcpSdkServer(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.nodePackage, '@modelcontextprotocol/node');
  assert.equal(remote.nodeVersion, '2.0.0');
  assert.equal(remote.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(MCP_CURRENT_PROTOCOL_VERSION, '2026-07-28');

  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const mcpAdapter = await createMcpDiscoveryProvider({
    endpoint: remote.endpoint,
    allowTools: ['bridge_lookup']
  });
  assert.equal(mcpAdapter.discovery.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.deepEqual(mcpAdapter.discovery.selectedTools, [{ tool: 'bridge_lookup', capability: 'mcp.bridge_lookup' }]);
  assert.equal(mcpAdapter.discovery.serverInfo?.name, 'Sprint D official MCP SDK black-box server');
  assert.equal(mcpAdapter.discovery.serverInfo?.version, '1.0.0-sprint-d');

  const importedMcpProviderIdentity = createIdentity();
  const importedMcpProviderNode = new TruynNode({ relayUrl, identity: importedMcpProviderIdentity });
  const importedMcpHost = new TruynAdapterHost({
    node: importedMcpProviderNode,
    adapter: mcpAdapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await importedMcpHost.start();
  t.after(() => importedMcpHost.stop());

  const facade = await startA2aFacade(t, {
    relayUrl,
    name: 'Sprint D A2A to independent MCP bridge',
    skills: [{
      id: 'mcp-lookup',
      name: 'MCP lookup',
      description: 'Bridge an A2A request to an imported independent official MCP tool',
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
  assert.deepEqual(artifact.parts[0].data, { answer: 'official-mcp:TRUYN' });
  assert.equal(artifact.parts[0].mediaType, 'application/json');

  const provenance = artifact.metadata?.['io.truyn/provenance'];
  assert.ok(provenance?.requestId, 'A2A Artifact must preserve the TRUYN request correlation id');
  assert.equal(
    provenance.providerNodeId,
    importedMcpProviderIdentity.nodeId,
    'local imported-MCP TRUYN provider identity must remain authoritative'
  );
  assert.equal(artifact.metadata?.['io.truyn/resultMetadata']?.adapter, 'mcp-discovery-import');
  assert.equal(artifact.metadata?.['io.truyn/resultMetadata']?.adapterVersion, '1');

  const statsResponse = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  assert.equal(stats.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(stats.sdkVersion, '2.0.0');
  assert.equal(stats.nodePackage, '@modelcontextprotocol/node');
  assert.equal(stats.nodeVersion, '2.0.0');
  assert.equal(stats.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(stats.executionCount, 1, 'independent MCP SDK tool callback must run exactly once');
  assert.equal(stats.calls.length, 1, 'exactly one independent MCP tool call must reach the external callback');

  const remoteArgs = stats.calls[0];
  assert.deepEqual(remoteArgs.parts[0].data, { query: 'TRUYN' });
  assert.equal(remoteArgs.a2a.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'ownerId'), false, 'A2A descriptive owner metadata must not become MCP arguments');
  assert.equal(Object.prototype.hasOwnProperty.call(remoteArgs, 'billingMode'), false, 'A2A descriptive billing metadata must not become MCP arguments');

  const calls = stats.requests.filter((request) => request.mcpMethod === 'tools/call');
  assert.equal(calls.length, 1, 'TRUYN must make exactly one external MCP tools/call request');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/mcp');
  assert.equal(calls[0].mcpProtocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(calls[0].mcpName, 'bridge_lookup');

  const discoverRequests = stats.requests.filter((request) => request.mcpMethod === 'server/discover');
  assert.equal(discoverRequests.length, 1, 'TRUYN must negotiate the external MCP 2026-07-28 server exactly once');
  assert.equal(discoverRequests[0].mcpProtocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.ok(
    stats.requests.some((request) => request.mcpMethod === 'tools/list' && request.mcpProtocolVersion === MCP_CURRENT_PROTOCOL_VERSION),
    'TRUYN must discover the external SDK tool catalog over MCP 2026-07-28'
  );

  const matchingRequests = [...relay.state.requests.values()].filter((entry) =>
    entry.envelope?.payload?.requestId === provenance.requestId || entry.envelope?.id === provenance.requestId
  );
  assert.equal(matchingRequests.length, 1, 'exactly one signed TRUYN request must back the A2A task');
});
