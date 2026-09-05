import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
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
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { createMcpHttpClient, MCP_CLIENT_CAPABILITIES_META_KEY, MCP_CLIENT_INFO_META_KEY, MCP_CURRENT_PROTOCOL_VERSION, MCP_PROTOCOL_VERSION_META_KEY } from '../adapters/mcp/client.js';
import { createMcpHttpServer } from '../adapters/mcp/server.js';
import { encodeMcpHeaderValue } from '../adapters/mcp/http-headers.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';
import {
  A2A_INTEGRITY_METADATA_KEY,
  A2A_SOURCE_URL_METADATA_KEY,
  createA2aArtifactBundle,
  normalizeVerifiedRemotePart
} from '../adapters/a2a/artifact-integrity.js';

const A2A_FIXTURE_URL = new URL('./fixtures/official-a2a-sdk-artifact-server.mjs', import.meta.url);
const MCP_FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-artifact-server.mjs', import.meta.url);
const PACKAGE_URL = new URL('../package.json', import.meta.url);
const EXPECTED_PROOF_SHA256 = '257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae';
const EXPECTED_PROOF_BYTES = 29;
const EXPECTED_FILENAME = 'interop-proof.bin';
const EXPECTED_MEDIA_TYPE = 'application/octet-stream';

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(2_000).then(() => false)
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function startJsonLineFixture(t, fixtureUrl, assertSource) {
  const source = await readFile(fixtureUrl, 'utf8');
  await assertSource(source);
  const child = spawn(process.execPath, [fileURLToPath(fixtureUrl)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => stopChild(child));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`Timed out starting Sprint E fixture: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(`Sprint E fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`)));
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
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

async function startIndependentA2aArtifactServer(t) {
  return startJsonLineFixture(t, A2A_FIXTURE_URL, async (source) => {
    assert.match(source, /from '@a2a-js\/sdk'/, 'Sprint E A2A fixture must use the official A2A SDK');
    assert.doesNotMatch(source, /createA2aServer|adapters\/a2a\/server/, 'Sprint E A2A fixture must not use the TRUYN A2A server');
  });
}

async function startIndependentMcpArtifactServer(t) {
  return startJsonLineFixture(t, MCP_FIXTURE_URL, async (source) => {
    const packageJson = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));
    assert.match(source, /from '@modelcontextprotocol\/server'/, 'Sprint E MCP fixture must use the official MCP server SDK');
    assert.match(source, /registerResource\(/, 'Sprint E MCP fixture must expose a standard MCP resource');
    assert.match(source, /type: 'resource_link'/, 'Sprint E MCP fixture must return a standard MCP resource_link');
    assert.match(source, /handler\.fetch\(request\)/, 'Sprint E MCP fixture must dispatch through the public MCP handler');
    assert.match(source, /await handler\.close\(\)/, 'Sprint E MCP fixture must close the public MCP handler');
    assert.doesNotMatch(source, /adapters\/mcp|createMcpHttpServer|createMcpDiscoveryProvider/, 'Sprint E MCP fixture must not use TRUYN MCP implementations');
    assert.equal(packageJson.devDependencies?.['@modelcontextprotocol/server'], '2.0.0', 'official MCP SDK version must remain exact-pinned');
  });
}

async function readStats(remote) {
  const response = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  return response.json();
}

async function createRelayNetwork(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  return { relay, relayUrl };
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
  throw new Error(`Timed out waiting for Sprint E TRUYN RESULT ${requestId}`);
}

async function startMcpFacade(t, relayUrl) {
  const node = new TruynNode({ relayUrl, identity: createIdentity() });
  const server = createMcpHttpServer({ node });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  const client = createMcpHttpClient({ endpoint: url });
  await client.discover();
  const catalog = await client.listAllTools();
  const needTool = catalog.tools.find((tool) => tool.name === 'truyn_need');
  const pollTool = catalog.tools.find((tool) => tool.name === 'truyn_poll');
  assert.ok(needTool && pollTool);
  return { node, server, url, client, needTool, pollTool };
}

function createExplicitA2aArtifactResolver(remote, counters) {
  return async ({ url, maxBytes }) => {
    counters.calls += 1;
    assert.equal(url, remote.artifactUrl, 'Sprint E resolver must allow only the referenced fixture artifact URL');
    const response = await fetch(url, { headers: { accept: EXPECTED_MEDIA_TYPE }, redirect: 'error' });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length <= maxBytes, 'explicit A2A resolver must respect the byte budget');
    return bytes;
  };
}

async function startImportedA2aArtifactHost(t, { relayUrl, remote, resolveArtifactUrl = null } = {}) {
  const adapter = await createA2aDiscoveryProvider({
    agentCardUrl: remote.cardUrl,
    allowSkills: ['artifact'],
    ...(resolveArtifactUrl ? { resolveArtifactUrl } : {}),
    pollIntervalMs: 2,
    taskTimeoutMs: 5_000,
    maxArtifactBytes: 1_024
  });
  const identity = createIdentity();
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await host.start();
  t.after(() => host.stop());
  return { adapter, identity, node, host };
}

async function submitMcpNeed(facade, capability, input) {
  const submitted = await facade.client.callTool(facade.needTool, { capability, input });
  assert.ok(submitted.output.needId);
  const event = await waitForMcpResult(facade.client, facade.pollTool, submitted.output.needId);
  return { submitted, event };
}

function assertProofIntegrity(part) {
  assert.equal(part.filename, EXPECTED_FILENAME);
  assert.equal(part.mediaType, EXPECTED_MEDIA_TYPE);
  const integrity = part.metadata?.[A2A_INTEGRITY_METADATA_KEY];
  assert.deepEqual(integrity, {
    algorithm: 'sha256',
    digest: EXPECTED_PROOF_SHA256,
    sizeBytes: EXPECTED_PROOF_BYTES,
    encoding: 'raw',
    verified: true
  });
}

async function readMcpResource(remote, uri, counters) {
  counters.calls += 1;
  assert.equal(uri, remote.proofUri, 'Sprint E MCP resolver must read only the resource_link URI');
  const id = `sprint-e-resource-${randomUUID()}`;
  const response = await fetch(remote.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_CURRENT_PROTOCOL_VERSION,
      'mcp-method': 'resources/read',
      'mcp-name': encodeMcpHeaderValue(uri)
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'resources/read',
      params: {
        uri,
        _meta: {
          [MCP_PROTOCOL_VERSION_META_KEY]: MCP_CURRENT_PROTOCOL_VERSION,
          [MCP_CLIENT_INFO_META_KEY]: { name: 'truyn-sprint-e-artifact-resolver', version: '1' },
          [MCP_CLIENT_CAPABILITIES_META_KEY]: {}
        }
      }
    })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, id);
  assert.equal(body.error, undefined);
  assert.equal(body.result?.resultType, 'complete');
  assert.ok(Number.isInteger(body.result?.ttlMs) && body.result.ttlMs >= 0);
  assert.ok(['private', 'public'].includes(body.result?.cacheScope));
  assert.equal(body.result?.contents?.length, 1);
  const content = body.result.contents[0];
  assert.equal(content.uri, uri);
  assert.equal(content.mimeType, EXPECTED_MEDIA_TYPE);
  assert.equal(typeof content.blob, 'string');
  return Buffer.from(content.blob, 'base64');
}

async function mapMcpResourceLinkToVerifiedArtifact(result, { remote, resolverEnabled, counters }) {
  assert.ok(Array.isArray(result.output), 'MCP tool must return content array when using resource_link');
  const links = result.output.filter((item) => item?.type === 'resource_link');
  assert.equal(links.length, 1, 'Sprint E MCP proof requires exactly one resource_link');
  const link = links[0];
  assert.equal(link.uri, remote.proofUri);
  assert.equal(link.name, EXPECTED_FILENAME);
  assert.equal(link.mimeType, EXPECTED_MEDIA_TYPE);
  assert.equal(link.size, EXPECTED_PROOF_BYTES);
  assert.ok(link._meta?.[A2A_INTEGRITY_METADATA_KEY], 'MCP resource_link must carry the bounded integrity claim');

  const verifiedPart = await normalizeVerifiedRemotePart({
    url: link.uri,
    filename: link.name,
    mediaType: link.mimeType,
    metadata: { [A2A_INTEGRITY_METADATA_KEY]: structuredClone(link._meta[A2A_INTEGRITY_METADATA_KEY]) }
  }, {
    maxArtifactBytes: 1_024,
    ...(resolverEnabled ? {
      resolveArtifactUrl: ({ url }) => readMcpResource(remote, url, counters)
    } : {})
  });

  return {
    output: createA2aArtifactBundle([{
      artifactId: 'sprint-e-mcp-referenced-artifact',
      name: EXPECTED_FILENAME,
      metadata: {
        'io.truyn/externalProtocol': 'mcp',
        'io.truyn/mcpResourceUri': link.uri
      },
      parts: [verifiedPart]
    }]),
    metadata: {
      ...(result.metadata || {}),
      interoperability: {
        protocol: 'mcp',
        protocolVersion: MCP_CURRENT_PROTOCOL_VERSION,
        externalArtifactProfile: 'resource_link+resources/read+sha256'
      }
    }
  };
}

async function startImportedMcpArtifactHost(t, { relayUrl, remote, resolverEnabled = true, counters } = {}) {
  const baseAdapter = await createMcpDiscoveryProvider({
    endpoint: remote.endpoint,
    allowTools: ['artifact_lookup']
  });
  const adapter = {
    ...baseAdapter,
    async execute(context) {
      const result = await baseAdapter.execute(context);
      return mapMcpResourceLinkToVerifiedArtifact(result, { remote, resolverEnabled, counters });
    }
  };
  const identity = createIdentity();
  const node = new TruynNode({ relayUrl, identity });
  const host = new TruynAdapterHost({
    node,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await host.start();
  t.after(() => host.stop());
  return { adapter, identity, node, host };
}

async function startA2aArtifactFacade(t, relayUrl) {
  const identity = createIdentity();
  const node = new TruynNode({ relayUrl, identity });
  const server = createA2aServer({
    node,
    agent: {
      name: 'Sprint E A2A artifact facade',
      description: 'TRUYN A2A facade for the independent MCP resource-link proof.',
      version: '1.0.0-sprint-e'
    },
    skills: [{
      id: 'mcp-artifact',
      name: 'Independent MCP artifact',
      description: 'Bridge to the independent MCP resource_link artifact provider.',
      capability: 'mcp.artifact_lookup',
      visibility: 'public',
      inputModes: ['application/json'],
      outputModes: [EXPECTED_MEDIA_TYPE]
    }],
    pollIntervalMs: 2,
    maxBlockingWaitMs: 5_000,
    maxArtifactBytes: 1_024
  });
  const url = await server.listen({ port: 0 });
  t.after(() => server.close());
  const client = createA2aClient({
    agentCardUrl: `${url}/.well-known/agent-card.json`,
    pollIntervalMs: 2,
    taskTimeoutMs: 5_000,
    maxArtifactBytes: 1_024
  });
  await client.discover();
  return { identity, node, server, url, client };
}

async function sendA2aArtifactRequest(facade, mode) {
  return facade.client.sendMessage({
    messageId: randomUUID(),
    role: 'ROLE_USER',
    parts: [{ data: { mode }, mediaType: 'application/json' }],
    metadata: { 'io.truyn/skillId': 'mcp-artifact' }
  }, { returnImmediately: false });
}

test('Sprint E MCP -> TRUYN -> independent official A2A referenced file round trip verifies integrity exactly once', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentA2aArtifactServer(t);
  assert.equal(remote.sdkPackage, '@a2a-js/sdk');
  assert.equal(remote.sdkVersion, '1.0.1');
  assert.equal(remote.protocolVersion, A2A_PROTOCOL_VERSION);
  assert.equal(remote.proofSha256, EXPECTED_PROOF_SHA256);
  assert.equal(remote.proofSizeBytes, EXPECTED_PROOF_BYTES);

  const { relayUrl } = await createRelayNetwork(t);
  const resolver = { calls: 0 };
  const imported = await startImportedA2aArtifactHost(t, {
    relayUrl,
    remote,
    resolveArtifactUrl: createExplicitA2aArtifactResolver(remote, resolver)
  });
  const facade = await startMcpFacade(t, relayUrl);

  const { submitted, event } = await submitMcpNeed(facade, 'a2a.artifact', 'ok');
  assert.equal(submitted.output.provider, imported.identity.nodeId);
  assert.equal(event.verification?.ok, true);
  assert.equal(event.envelope.from, imported.identity.nodeId);
  assert.equal(event.envelope.payload.metadata.failed, undefined);
  const output = event.envelope.payload.output;
  assert.equal(output.raw, Buffer.from('TRUYN Sprint E interop proof\n').toString('base64'));
  assertProofIntegrity(output);
  assert.equal(output.metadata[A2A_SOURCE_URL_METADATA_KEY], remote.artifactUrl);
  assert.equal(resolver.calls, 1, 'explicit A2A URL resolver must run exactly once');

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 1, 'independent A2A executor must execute exactly once');
  assert.equal(stats.artifactFetchCount, 1, 'referenced A2A file must be fetched exactly once through the explicit resolver');
  assert.equal(stats.messageIds.length, 1);
  assert.equal(stats.modes[0], 'ok');
});

test('Sprint E independent A2A referenced file fails closed without resolver and never implicitly fetches the URL', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentA2aArtifactServer(t);
  const { relayUrl } = await createRelayNetwork(t);
  await startImportedA2aArtifactHost(t, { relayUrl, remote, resolveArtifactUrl: null });
  const facade = await startMcpFacade(t, relayUrl);

  const { event } = await submitMcpNeed(facade, 'a2a.artifact', 'ok');
  assert.equal(event.envelope.payload.output, null);
  assert.equal(event.envelope.payload.metadata.failed, true);
  assert.match(event.envelope.payload.metadata.error, /explicit resolveArtifactUrl|requires an explicit/i);

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 1, 'remote A2A execution occurs once before the untrusted reference is rejected');
  assert.equal(stats.artifactFetchCount, 0, 'TRUYN must perform zero implicit referenced-file fetches without an explicit resolver');
});

test('Sprint E independent A2A referenced file rejects corrupted digest and byte size without duplicate execution', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentA2aArtifactServer(t);
  const { relayUrl } = await createRelayNetwork(t);
  const resolver = { calls: 0 };
  await startImportedA2aArtifactHost(t, {
    relayUrl,
    remote,
    resolveArtifactUrl: createExplicitA2aArtifactResolver(remote, resolver)
  });
  const facade = await startMcpFacade(t, relayUrl);

  for (const mode of ['corrupt-digest', 'corrupt-size']) {
    const { event } = await submitMcpNeed(facade, 'a2a.artifact', mode);
    assert.equal(event.envelope.payload.output, null);
    assert.equal(event.envelope.payload.metadata.failed, true);
    assert.match(event.envelope.payload.metadata.error, /integrity/i);
  }

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 2, 'each corrupted request must execute the independent A2A agent exactly once');
  assert.equal(stats.artifactFetchCount, 2, 'each explicit resolver attempt must materialize the referenced file exactly once');
  assert.equal(resolver.calls, 2);
});

test('Sprint E A2A -> TRUYN -> independent official MCP resource_link round trip verifies resources/read and returns an A2A Artifact', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentMcpArtifactServer(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(remote.proofSha256, EXPECTED_PROOF_SHA256);
  assert.equal(remote.proofSizeBytes, EXPECTED_PROOF_BYTES);

  const { relay, relayUrl } = await createRelayNetwork(t);
  const resolver = { calls: 0 };
  const imported = await startImportedMcpArtifactHost(t, { relayUrl, remote, resolverEnabled: true, counters: resolver });
  const facade = await startA2aArtifactFacade(t, relayUrl);

  const response = await sendA2aArtifactRequest(facade, 'ok');
  assert.ok(response.task);
  assert.equal(response.task.status.state, A2A_TASK_STATES.completed);
  assert.equal(response.task.artifacts.length, 1);
  const artifact = response.task.artifacts[0];
  assert.equal(artifact.parts.length, 1);
  assert.equal(artifact.parts[0].raw, Buffer.from('TRUYN Sprint E interop proof\n').toString('base64'));
  assertProofIntegrity(artifact.parts[0]);
  assert.equal(artifact.metadata['io.truyn/mcpResourceUri'], remote.proofUri);
  const provenance = artifact.metadata['io.truyn/provenance'];
  assert.ok(provenance.requestId);
  assert.equal(provenance.providerNodeId, imported.identity.nodeId, 'authoritative TRUYN imported-provider identity must survive the bridge');
  assert.equal(relay.state.requests.size, 1, 'positive Sprint E MCP artifact route must create exactly one TRUYN NEED');
  assert.equal(resolver.calls, 1, 'MCP resources/read resolver must run exactly once');

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 1, 'independent MCP tool must execute exactly once');
  assert.equal(stats.resourceReadCount, 1, 'referenced MCP resource must be materialized exactly once through resources/read');
  const mcpRequests = stats.requests.filter((request) => request.path === '/mcp');
  assert.deepEqual(
    mcpRequests.map((request) => request.jsonRpcMethod),
    ['server/discover', 'tools/list', 'tools/call', 'resources/read'],
    'Sprint E must use the official MCP discovery/tool/resource wire path without duplicate calls'
  );
  assert.equal(mcpRequests.filter((request) => request.jsonRpcMethod === 'tools/call').length, 1);
  assert.equal(mcpRequests.filter((request) => request.jsonRpcMethod === 'resources/read').length, 1);
});

test('Sprint E independent MCP resource_link fails closed without explicit resolver and performs zero resource reads', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentMcpArtifactServer(t);
  const { relayUrl } = await createRelayNetwork(t);
  const resolver = { calls: 0 };
  await startImportedMcpArtifactHost(t, { relayUrl, remote, resolverEnabled: false, counters: resolver });
  const facade = await startA2aArtifactFacade(t, relayUrl);

  const response = await sendA2aArtifactRequest(facade, 'ok');
  assert.ok(response.task);
  assert.equal(response.task.status.state, A2A_TASK_STATES.failed);
  assert.equal(response.task.artifacts, undefined);
  assert.equal(resolver.calls, 0);

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 1, 'remote MCP tool executes exactly once before its untrusted resource_link is rejected');
  assert.equal(stats.resourceReadCount, 0, 'TRUYN must not read or fetch an MCP referenced resource without the explicit resolver');
  assert.equal(stats.requests.filter((request) => request.jsonRpcMethod === 'tools/call').length, 1);
  assert.equal(stats.requests.filter((request) => request.jsonRpcMethod === 'resources/read').length, 0);
});

test('Sprint E independent MCP resource_link rejects corrupted digest and byte size without duplicate execution', { timeout: 25_000 }, async (t) => {
  const remote = await startIndependentMcpArtifactServer(t);
  const { relayUrl } = await createRelayNetwork(t);
  const resolver = { calls: 0 };
  await startImportedMcpArtifactHost(t, { relayUrl, remote, resolverEnabled: true, counters: resolver });
  const facade = await startA2aArtifactFacade(t, relayUrl);

  for (const mode of ['corrupt-digest', 'corrupt-size']) {
    const response = await sendA2aArtifactRequest(facade, mode);
    assert.ok(response.task);
    assert.equal(response.task.status.state, A2A_TASK_STATES.failed);
    assert.equal(response.task.artifacts, undefined);
  }

  const stats = await readStats(remote);
  assert.equal(stats.executionCount, 2, 'each corrupted MCP artifact request must execute exactly once');
  assert.equal(stats.resourceReadCount, 2, 'each explicit resolver attempt must read the MCP resource exactly once');
  assert.equal(resolver.calls, 2);
  assert.equal(stats.requests.filter((request) => request.jsonRpcMethod === 'tools/call').length, 2);
  assert.equal(stats.requests.filter((request) => request.jsonRpcMethod === 'resources/read').length, 2);
});
