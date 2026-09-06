import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpResourceHttpClient } from '../adapters/mcp/resources-client.js';
import { createMcpResourceImporter } from '../adapters/mcp/resource-runtime.js';

const FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-resource-server.mjs', import.meta.url);
const PACKAGE_URL = new URL('../package.json', import.meta.url);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(2_500).then(() => false)
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function startOfficialFixture(t) {
  const [source, packageSource] = await Promise.all([
    readFile(FIXTURE_URL, 'utf8'),
    readFile(PACKAGE_URL, 'utf8')
  ]);
  const packageJson = JSON.parse(packageSource);
  assert.equal(packageJson.devDependencies?.['@modelcontextprotocol/server'], '2.0.0');
  assert.match(source, /from '@modelcontextprotocol\/server'/);
  assert.match(source, /registerResource\(/);
  assert.match(source, /handler\.notify\.resourceUpdated\(/);
  assert.match(source, /createMcpHandler\(/);
  assert.doesNotMatch(source, /adapters\/mcp|createMcpResourceHttpClient|createMcpResourceImporter/);

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
    const timer = setTimeout(() => reject(new Error(`Timed out starting official MCP resource fixture: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(`Official MCP resource fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`)));
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message?.type === 'ready') {
          clearTimeout(timer);
          resolve({ child, ...message });
          return;
        }
      }
    });
  });
}

async function readStats(remote) {
  const response = await fetch(remote.statsUrl, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForSubscription(remote, minimumCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const stats = await readStats(remote);
    if (stats.subscriptionListenCount >= minimumCount) return stats;
    await delay(10);
  }
  throw new Error(`Timed out waiting for official MCP subscriptions/listen count ${minimumCount}`);
}

async function nextOfficialUpdate(remote, client, minimumSubscriptionCount) {
  const iterator = client.listenResourceUpdates([remote.resourceUri]);
  const nextUpdate = iterator.next();
  await waitForSubscription(remote, minimumSubscriptionCount);
  await delay(100);
  const updateResponse = await fetch(remote.updateUrl, { method: 'POST' });
  assert.equal(updateResponse.status, 200);
  const notification = await nextUpdate;
  assert.equal(notification.done, false);
  assert.equal(notification.value.uri, remote.resourceUri);
  await iterator.return();
  return notification.value;
}

test('P3-M1 official MCP SDK 2.0.0 black-box proves list/read -> OBJECT/STATE and disconnect/relisten -> explicit reread', async (t) => {
  const remote = await startOfficialFixture(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.protocolVersion, '2026-07-28');

  const client = createMcpResourceHttpClient({ endpoint: remote.endpoint });
  const discovery = await client.discover();
  assert.ok(discovery.capabilities.resources);
  const catalog = await client.listAllResources();
  assert.equal(catalog.resources.length, 1);
  assert.equal(catalog.resources[0].uri, remote.resourceUri);
  const templates = await client.listResourceTemplates();
  assert.deepEqual(templates.resourceTemplates, []);

  let now = 10_000;
  const importer = createMcpResourceImporter({
    client,
    providerAuthority: `${remote.sdkPackage}@${remote.sdkVersion}:${remote.endpoint}`,
    clock: () => now
  });
  const initial = await importer.read(remote.resourceUri);
  assert.equal(initial.state.version, 1);
  assert.equal(Buffer.from(initial.rootObject.inlineDataBase64, 'base64').toString('utf8'), 'alpha');
  assert.equal(initial.state.objectRef.objectId, initial.rootObject.objectId);

  now += 1;
  const identical = await importer.read(remote.resourceUri);
  assert.equal(identical.state.version, 1, 'same official resource bytes must not create a new STATE version');
  assert.equal(identical.changed, false);

  const firstNotification = await nextOfficialUpdate(remote, client, 1);
  importer.noteUpdate(firstNotification.uri);
  assert.equal(importer.store.isInvalidated(remote.resourceUri), true);
  assert.equal(importer.store.get(remote.resourceUri).state.version, 1, 'notification cannot advance authoritative STATE');

  now += 1;
  const refreshed = await importer.refresh(remote.resourceUri);
  assert.equal(refreshed.state.version, 2);
  assert.equal(refreshed.invalidatedBeforeRead, true);
  assert.equal(Buffer.from(refreshed.rootObject.inlineDataBase64, 'base64').toString('utf8'), 'beta');

  const secondNotification = await nextOfficialUpdate(remote, client, 2);
  importer.noteUpdate(secondNotification.uri);
  assert.equal(importer.store.get(remote.resourceUri).state.version, 2, 're-listen notification still cannot mutate STATE');

  now += 1;
  const refreshedAgain = await importer.refresh(remote.resourceUri);
  assert.equal(refreshedAgain.state.version, 3, 'disconnect and re-listen must resume updates without duplicating prior state');
  assert.equal(Buffer.from(refreshedAgain.rootObject.inlineDataBase64, 'base64').toString('utf8'), 'value-3');

  const stats = await readStats(remote);
  assert.equal(stats.sdkVersion, '2.0.0');
  assert.equal(stats.protocolVersion, '2026-07-28');
  assert.equal(stats.updateCount, 2);
  assert.equal(stats.resourceReadCount, 4, 'only explicit reads materialize initial, idempotent, first refresh, and second refresh snapshots');
  assert.ok(stats.subscriptionListenCount >= 2, 'disconnect/re-listen must establish a second independent official subscription');
  assert.ok(stats.requests.some((entry) => entry.jsonRpcMethod === 'resources/list'));
  assert.ok(stats.requests.some((entry) => entry.jsonRpcMethod === 'resources/read'));
  assert.ok(stats.requests.filter((entry) => entry.jsonRpcMethod === 'subscriptions/listen').length >= 2);
  assert.ok(stats.requests
    .filter((entry) => entry.jsonRpcMethod === 'resources/read')
    .every((entry) => entry.protocolVersion === '2026-07-28' && entry.mcpName),
  'modern resources/read must remain explicitly routed through the MCP endpoint');
});
