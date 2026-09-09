import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';

const FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-server.mjs', import.meta.url);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const status = await Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    delay(2_000).then(() => null)
  ]);
  if (!status) {
    child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    assert.fail('No-Apps official MCP fixture did not exit after SIGTERM');
  }
  assert.deepEqual(status, { code: 0, signal: null });
}

async function startFixture(t) {
  const child = spawn(process.execPath, [fileURLToPath(FIXTURE_URL)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => stopChild(child));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`Timed out starting no-Apps fixture: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(
      `No-Apps fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`
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
}

async function stats(remote) {
  const response = await fetch(remote.statsUrl);
  assert.equal(response.status, 200);
  return response.json();
}

test('P3-M3 no-Apps server stays on ordinary MCP path without capability inflation', { timeout: 20_000 }, async (t) => {
  const remote = await startFixture(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);

  const provider = await createMcpDiscoveryProvider({
    endpoint: remote.endpoint,
    authMode: 'none',
    allowTools: ['bridge_lookup']
  });

  assert.deepEqual(provider.discovery.selectedTools, [
    { tool: 'bridge_lookup', capability: 'mcp.bridge_lookup' }
  ]);
  assert.deepEqual(provider.capabilities.map((entry) => entry.name), ['mcp.bridge_lookup']);
  assert.deepEqual(provider.discovery.appResources, []);
  assert.deepEqual(provider.discovery.appOnlyTools, []);
  assert.equal(provider.discovery.resourcesDeclared, false);
  assert.equal(provider.capabilities[0].metadata.interoperability.protocol, 'mcp');
  assert.equal(provider.capabilities[0].metadata.interoperability.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(provider.capabilities[0].metadata, 'apps'), false);

  const result = await provider.execute({
    capability: 'mcp.bridge_lookup',
    input: { parts: [{ data: { query: 'fallback' } }] }
  });
  assert.deepEqual(result.output, { answer: 'official-mcp:fallback' });
  assert.equal(Object.prototype.hasOwnProperty.call(result.metadata, 'appResource'), false);

  await assert.rejects(
    () => provider.resolveAppResource('ui://not-advertised/view.html'),
    (error) => error?.code === 'MCP_APPS_RESOURCE_UNDECLARED'
      || /requires declared MCP resources capability/.test(error?.message || '')
  );

  const observed = await stats(remote);
  assert.equal(observed.executionCount, 1);
  assert.deepEqual(
    observed.requests.map((entry) => entry.jsonRpcMethod),
    ['server/discover', 'tools/list', 'tools/call']
  );
  assert.equal(observed.requests.some((entry) => entry.jsonRpcMethod === 'resources/read'), false);
});
