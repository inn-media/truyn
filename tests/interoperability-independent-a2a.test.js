import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';
import { A2A_PROTOCOL_VERSION } from '../adapters/a2a/mapping.js';
import { createMcpHttpClient, MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createMcpHttpServer } from '../adapters/mcp/server.js';

const FIXTURE_URL = new URL('./fixtures/official-a2a-sdk-server.mjs', import.meta.url);

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

async function startIndependentA2aSdkServer(t) {
  const fixtureSource = await readFile(FIXTURE_URL, 'utf8');
  assert.match(fixtureSource, /from '@a2a-js\/sdk'/, 'black-box fixture must use the official external A2A SDK');
  assert.doesNotMatch(fixtureSource, /createA2aServer|adapters\/a2a\/server/, 'black-box fixture must not use the TRUYN A2A server');

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
      reject(new Error(`Timed out starting official A2A SDK fixture: ${stderr}`));
    }, 10_000);

    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };

    child.once('error', fail);
    child.once('exit', (code, signal) => {
      fail(new Error(`Official A2A SDK fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`));
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

test('Sprint C MCP -> TRUYN -> independent official A2A SDK black-box round trip', { timeout: 20_000 }, async (t) => {
  const remote = await startIndependentA2aSdkServer(t);
  assert.equal(remote.sdkPackage, '@a2a-js/sdk');
  assert.equal(remote.sdkVersion, '1.0.1');
  assert.equal(remote.protocolVersion, A2A_PROTOCOL_VERSION);

  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const a2aAdapter = await createA2aDiscoveryProvider({
    agentCardUrl: remote.cardUrl,
    allowSkills: ['reason'],
    pollIntervalMs: 2,
    taskTimeoutMs: 5_000
  });
  assert.equal(a2aAdapter.discovery.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(a2aAdapter.discovery.interface.protocolBinding, 'JSONRPC');
  assert.equal(a2aAdapter.discovery.interface.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.deepEqual(a2aAdapter.discovery.selectedSkills, [{ skill: 'reason', capability: 'a2a.reason' }]);
  assert.equal(a2aAdapter.discovery.remoteAgent.name, 'Sprint C official A2A SDK black-box agent');

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

  const mcpFacadeNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const mcpFacade = createMcpHttpServer({ node: mcpFacadeNode });
  const mcpUrl = await mcpFacade.listen({ port: 0 });
  t.after(() => mcpFacade.close());

  const mcpClient = createMcpHttpClient({ endpoint: mcpUrl });
  const discovery = await mcpClient.discover();
  assert.equal(mcpClient.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(MCP_CURRENT_PROTOCOL_VERSION, '2026-07-28');
  assert.ok(discovery.supportedVersions.includes(MCP_CURRENT_PROTOCOL_VERSION));

  const catalog = await mcpClient.listAllTools();
  const needTool = catalog.tools.find((tool) => tool.name === 'truyn_need');
  const pollTool = catalog.tools.find((tool) => tool.name === 'truyn_poll');
  assert.ok(needTool && pollTool, 'MCP facade must expose truyn_need and truyn_poll');

  const submitted = await mcpClient.callTool(needTool, {
    capability: 'a2a.reason',
    input: 'TRUYN'
  });
  const requestId = submitted.output.needId;
  assert.ok(requestId, 'MCP truyn_need must expose the TRUYN request id');
  assert.equal(submitted.output.provider, importedA2aProviderIdentity.nodeId, 'TRUYN imported-provider identity must remain authoritative');

  const resultEvent = await waitForMcpResult(mcpClient, pollTool, requestId);
  assert.equal(resultEvent.verification?.ok, true);
  assert.equal(resultEvent.envelope.from, importedA2aProviderIdentity.nodeId);
  assert.equal(resultEvent.envelope.payload.output, 'official-a2a:TRUYN');

  const interoperability = resultEvent.envelope.payload.metadata.interoperability;
  assert.equal(interoperability.protocol, 'a2a');
  assert.equal(interoperability.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(interoperability.remoteAgent, 'Sprint C official A2A SDK black-box agent');
  assert.equal(interoperability.remoteSkillId, 'reason');
  assert.ok(interoperability.remoteTaskId, 'independent SDK Task id must survive as correlation metadata');
  assert.ok(interoperability.remoteContextId, 'independent SDK context id must survive as correlation metadata');
  assert.equal(interoperability.artifactCount, 1);
  assert.equal(interoperability.taskExecutionMode, 'blocking');
  assert.equal(interoperability.taskPollCount, 0, 'blocking independent SDK route must not trigger a second remote request through polling');

  const statsResponse = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  assert.equal(stats.sdkPackage, '@a2a-js/sdk');
  assert.equal(stats.sdkVersion, '1.0.1');
  assert.equal(stats.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(stats.executionCount, 1, 'independent A2A executor must run exactly once');
  assert.equal(stats.messageIds.length, 1, 'exactly one independent A2A message must reach the executor');

  const rpcRequests = stats.requests.filter((request) => request.path === '/a2a/jsonrpc');
  assert.equal(rpcRequests.length, 1, 'TRUYN must make exactly one A2A JSON-RPC execution request');
  assert.equal(rpcRequests[0].method, 'POST');
  assert.equal(rpcRequests[0].a2aVersion, A2A_PROTOCOL_VERSION);
  assert.ok(stats.requests.some((request) => request.path.includes('.well-known') && request.a2aVersion === A2A_PROTOCOL_VERSION), 'Agent Card discovery must negotiate A2A 1.0');
});
