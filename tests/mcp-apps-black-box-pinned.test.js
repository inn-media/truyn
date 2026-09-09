import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_APPS_RESOURCE_MIME_TYPE, MCP_APPS_UI_TRUST_BOUNDARY } from '../adapters/mcp/apps-resource.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const FIXTURE_URL = new URL('./fixtures/pinned-ext-apps-v2-server.mjs', import.meta.url);
const PROVENANCE_URL = new URL('./fixtures/pinned-ext-apps-v2.provenance.json', import.meta.url);
const PIN = '4cd427394755ee0964172df5760852aa053a5c99';

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    assert.deepEqual({ code: child.exitCode, signal: child.signalCode }, { code: 0, signal: null });
    return;
  }
  child.kill('SIGTERM');
  const status = await Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    delay(2_000).then(() => null)
  ]);
  if (!status) {
    child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    assert.fail('Pinned MCP Apps fixture did not exit after SIGTERM');
  }
  assert.deepEqual(status, { code: 0, signal: null });
}

async function startPinnedAppsFixture(t) {
  const source = await readFile(FIXTURE_URL, 'utf8');
  const provenance = JSON.parse(await readFile(PROVENANCE_URL, 'utf8'));
  assert.equal(provenance.upstream.commit, PIN);
  assert.equal(provenance.upstream.sourceVersion, '2.0.0');
  assert.doesNotMatch(source, /adapters\/mcp|createMcpDiscoveryProvider|validateMcpApps/);

  const child = spawn(process.execPath, [fileURLToPath(FIXTURE_URL)], {
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
    const timer = setTimeout(() => reject(new Error(`Timed out starting pinned Apps fixture: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(
      `Pinned Apps fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`
    )));
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

  return { ...ready, provenance };
}

async function readStats(remote) {
  const response = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  return response.json();
}

test('P3-M3 positive black-box interoperates with the exact pinned independent Apps fixture', { timeout: 20_000 }, async (t) => {
  const remote = await startPinnedAppsFixture(t);
  assert.equal(remote.upstream.package, '@modelcontextprotocol/ext-apps');
  assert.equal(remote.upstream.sourceVersion, '2.0.0');
  assert.equal(remote.upstream.commit, PIN);
  assert.equal(remote.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(remote.protocolVersion, '2026-07-28');
  assert.equal(remote.extensionId, MCP_UI_EXTENSION_ID);
  assert.equal(remote.resourceMime, MCP_APPS_RESOURCE_MIME_TYPE);

  const provider = await createMcpDiscoveryProvider({
    endpoint: remote.endpoint,
    authMode: 'none',
    allowTools: [remote.toolName]
  });

  assert.equal(provider.discovery.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(provider.discovery.providerAuthority, remote.endpoint);
  assert.deepEqual(provider.discovery.selectedTools, [
    { tool: remote.toolName, capability: `mcp.${remote.toolName}` }
  ]);
  assert.deepEqual(provider.discovery.appResources, [{
    tool: remote.toolName,
    providerAuthority: remote.endpoint,
    resourceUri: remote.resourceUri,
    visibility: ['model', 'app']
  }]);
  assert.deepEqual(provider.discovery.appResourceTrust, MCP_APPS_UI_TRUST_BOUNDARY);

  const result = await provider.execute({
    capability: `mcp.${remote.toolName}`,
    input: { city: 'Baku' }
  });
  assert.equal(result.output, 'weather:Baku:sunny');
  assert.deepEqual(result.metadata.usage, { inputTokens: 3, outputTokens: 3 });
  assert.deepEqual(result.metadata.appResource, {
    providerAuthority: remote.endpoint,
    tool: remote.toolName,
    resourceUri: remote.resourceUri
  });

  const ui = await provider.resolveToolResultAppResource(result);
  assert.equal(ui.contents.length, 1);
  assert.equal(ui.contents[0].uri, remote.resourceUri);
  assert.equal(ui.contents[0].mimeType, MCP_APPS_RESOURCE_MIME_TYPE);
  assert.match(ui.contents[0].text, /Pinned Apps fixture/);
  assert.equal(Object.isFrozen(ui), true);
  assert.equal(Object.isFrozen(ui.contents[0]), true);

  const stats = await readStats(remote);
  assert.deepEqual(stats.upstream, {
    package: '@modelcontextprotocol/ext-apps',
    sourceVersion: '2.0.0',
    repository: 'https://github.com/modelcontextprotocol/ext-apps',
    commit: PIN
  });
  assert.equal(stats.toolCalls, 1);
  assert.equal(stats.resourceReads, 1);
  assert.deepEqual(stats.requests.map((entry) => entry.method), [
    'server/discover',
    'tools/list',
    'tools/call',
    'resources/read'
  ]);
  for (const request of stats.requests) {
    assert.equal(request.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
    assert.equal(request.mcpMethod, request.method);
  }
  assert.equal(stats.requests.find((entry) => entry.method === 'tools/call').mcpName, remote.toolName);
  assert.equal(stats.requests.find((entry) => entry.method === 'resources/read').mcpName, remote.resourceUri);
});
