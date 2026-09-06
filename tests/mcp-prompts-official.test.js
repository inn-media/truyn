import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpPromptHttpClient } from '../adapters/mcp/prompts-client.js';
import { createMcpPromptImporter } from '../adapters/mcp/prompt-runtime.js';

const FIXTURE_URL = new URL('./fixtures/official-mcp-sdk-prompt-server.mjs', import.meta.url);
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
  assert.match(source, /registerPrompt\(/);
  assert.match(source, /handler\.notify\.promptsChanged\(/);
  assert.match(source, /createMcpHandler\(/);
  assert.doesNotMatch(source, /adapters\/mcp|createMcpPromptHttpClient|createMcpPromptImporter/);

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
    const timer = setTimeout(() => reject(new Error(`Timed out starting official MCP prompt fixture: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(`Official MCP prompt fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`)));
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
  throw new Error(`Timed out waiting for official MCP prompt subscription count ${minimumCount}`);
}

async function nextPromptListChange(remote, client, minimumSubscriptionCount) {
  const iterator = client.listenPromptListChanges();
  const nextChange = iterator.next();
  await waitForSubscription(remote, minimumSubscriptionCount);
  await delay(100);
  const updateResponse = await fetch(remote.updateUrl, { method: 'POST' });
  assert.equal(updateResponse.status, 200);
  const notification = await nextChange;
  assert.equal(notification.done, false);
  assert.equal(notification.value.type, 'prompts_list_changed');
  await iterator.return();
  return notification.value;
}

test('P3-M2 official MCP SDK 2.0.0 black-box proves prompt get, invalidation, explicit refresh and relisten', async (t) => {
  const remote = await startOfficialFixture(t);
  assert.equal(remote.sdkPackage, '@modelcontextprotocol/server');
  assert.equal(remote.sdkVersion, '2.0.0');
  assert.equal(remote.protocolVersion, '2026-07-28');

  const client = createMcpPromptHttpClient({ endpoint: remote.endpoint });
  const discovery = await client.discover();
  assert.ok(discovery.capabilities.prompts);
  const catalog = await client.listAllPrompts();
  assert.equal(catalog.prompts.length, 1);
  assert.equal(catalog.prompts[0].name, remote.promptName);

  let now = 50_000;
  const importer = createMcpPromptImporter({
    client,
    providerAuthority: `${remote.sdkPackage}@${remote.sdkVersion}:${remote.endpoint}`,
    clock: () => now
  });

  const initial = await importer.get(remote.promptName);
  assert.equal(initial.status, 'complete');
  assert.equal(initial.snapshot.revision, 1);
  const initialPayload = JSON.parse(Buffer.from(initial.snapshot.object.inlineDataBase64, 'base64').toString('utf8'));
  assert.match(initialPayload.messages[0].content.text, /alpha/);
  assert.equal(initialPayload.messages[1].content.type, 'resource_link');
  assert.equal(initialPayload.messages[1].content.uri, remote.linkedResource);
  assert.equal(initialPayload.messages[2].content.type, 'resource');
  assert.equal(initial.snapshot.object.source.implicitResourceFetch, false);

  now += 1;
  const identical = await importer.get(remote.promptName);
  assert.equal(identical.snapshot.revision, 1);
  assert.equal(identical.snapshot.changed, false);

  const firstNotification = await nextPromptListChange(remote, client, 1);
  importer.noteListChanged(firstNotification);
  assert.equal(importer.store.isCatalogInvalidated(), true);
  assert.equal(importer.store.get(remote.promptName, {}).object.objectId, initial.snapshot.object.objectId, 'list-changed notification cannot replace accepted prompt bytes');

  const refreshedCatalog = await importer.listAll();
  assert.match(refreshedCatalog.prompts[0].title, /generation 2/);
  assert.equal(importer.store.isCatalogInvalidated(), false);

  now += 1;
  const refreshed = await importer.refresh(remote.promptName);
  assert.equal(refreshed.snapshot.revision, 2);
  const refreshedPayload = JSON.parse(Buffer.from(refreshed.snapshot.object.inlineDataBase64, 'base64').toString('utf8'));
  assert.match(refreshedPayload.messages[0].content.text, /beta/);

  const secondNotification = await nextPromptListChange(remote, client, 2);
  importer.noteListChanged(secondNotification);
  assert.equal(importer.store.get(remote.promptName, {}).revision, 2);

  now += 1;
  const refreshedAgain = await importer.refresh(remote.promptName);
  assert.equal(refreshedAgain.snapshot.revision, 3, 'disconnect/re-listen must resume prompt invalidation without duplicating accepted snapshots');
  const thirdPayload = JSON.parse(Buffer.from(refreshedAgain.snapshot.object.inlineDataBase64, 'base64').toString('utf8'));
  assert.match(thirdPayload.messages[0].content.text, /value-3/);

  const stats = await readStats(remote);
  assert.equal(stats.sdkVersion, '2.0.0');
  assert.equal(stats.protocolVersion, '2026-07-28');
  assert.equal(stats.updateCount, 2);
  assert.equal(stats.promptGetCount, 4, 'only explicit prompts/get calls materialize initial, idempotent, first refresh and second refresh snapshots');
  assert.ok(stats.subscriptionListenCount >= 2);
  assert.ok(stats.requests.some((entry) => entry.jsonRpcMethod === 'prompts/list'));
  assert.ok(stats.requests.some((entry) => entry.jsonRpcMethod === 'prompts/get'));
  assert.ok(stats.requests.filter((entry) => entry.jsonRpcMethod === 'subscriptions/listen').length >= 2);
  assert.ok(stats.requests
    .filter((entry) => entry.jsonRpcMethod === 'prompts/get')
    .every((entry) => entry.protocolVersion === '2026-07-28' && entry.mcpName === remote.promptName),
  'modern prompts/get must remain explicitly name-routed');
});
