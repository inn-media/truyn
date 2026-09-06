import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpPromptHttpClient } from '../adapters/mcp/prompts-client.js';
import { createMcpPromptImporter, McpPromptSnapshotStore } from '../adapters/mcp/prompt-runtime.js';

function responseBody(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    async *[Symbol.asyncIterator]() { yield bytes; },
    async cancel() {}
  };
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return 'application/json';
        if (key === 'content-length') return String(Buffer.byteLength(JSON.stringify(value)));
        return null;
      }
    },
    body: responseBody(value)
  };
}

function rpc(request, result) {
  return jsonResponse({ jsonrpc: '2.0', id: request.id, result });
}

function completePrompt(text = 'Review this carefully.') {
  return {
    resultType: 'complete',
    description: 'Bounded review prompt',
    messages: [
      { role: 'user', content: { type: 'text', text } },
      {
        role: 'assistant',
        content: {
          type: 'resource_link',
          uri: 'https://untrusted.example.invalid/context.txt',
          name: 'optional context',
          mimeType: 'text/plain'
        }
      }
    ]
  };
}

test('P3-M2 lists and explicitly gets prompts without fetching prompt-linked URIs', async () => {
  const methods = [];
  const requestedUrls = [];
  const client = createMcpPromptHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (url, options) => {
      requestedUrls.push(String(url));
      const request = JSON.parse(options.body);
      methods.push(request.method);
      if (request.method === 'server/discover') {
        return rpc(request, {
          resultType: 'complete',
          supportedVersions: ['2026-07-28'],
          capabilities: { prompts: { listChanged: true } },
          ttlMs: 1000,
          cacheScope: 'private'
        });
      }
      if (request.method === 'prompts/list') {
        return rpc(request, {
          resultType: 'complete',
          ttlMs: 500,
          cacheScope: 'private',
          prompts: [{
            name: 'review-code',
            title: 'Review code',
            description: 'Review code safely',
            arguments: [{ name: 'language', required: true }]
          }]
        });
      }
      if (request.method === 'prompts/get') {
        assert.equal(options.headers['mcp-name'], 'review-code');
        assert.equal(request.params.name, 'review-code');
        assert.deepEqual(request.params.arguments, { language: 'js' });
        return rpc(request, completePrompt('Review the supplied JavaScript.'));
      }
      throw new Error(`unexpected method ${request.method}`);
    }
  });

  const discovery = await client.discover();
  assert.equal(discovery.capabilities.prompts.listChanged, true);
  const catalog = await client.listAllPrompts();
  assert.equal(catalog.prompts.length, 1);
  assert.equal(catalog.prompts[0].name, 'review-code');

  let now = 10_000;
  const importer = createMcpPromptImporter({
    client,
    providerAuthority: 'https://mcp.example.test/mcp',
    clock: () => now
  });
  const materialized = await importer.get('review-code', { language: 'js' });
  assert.equal(materialized.status, 'complete');
  const snapshot = materialized.snapshot;
  assert.equal(snapshot.object.type, 'OBJECT');
  assert.equal(snapshot.object.source.executionAuthority, false);
  assert.equal(snapshot.object.source.implicitResourceFetch, false);
  const payload = JSON.parse(Buffer.from(snapshot.object.inlineDataBase64, 'base64').toString('utf8'));
  assert.equal(payload.messages[1].content.type, 'resource_link');
  assert.equal(payload.messages[1].content.uri, 'https://untrusted.example.invalid/context.txt');
  assert.deepEqual(methods, ['server/discover', 'prompts/list', 'prompts/get']);
  assert.deepEqual(requestedUrls, Array(3).fill('https://mcp.example.test/mcp'), 'resource links inside a prompt must never trigger implicit network fetches');

  now += 1;
  const same = importer.store.materialize('review-code', { language: 'js' }, completePrompt('Review the supplied JavaScript.'));
  assert.equal(same.changed, false);
  assert.equal(same.revision, 1);
  assert.equal(same.object.objectId, snapshot.object.objectId);
});

test('P3-M2 prompt snapshots are content-addressed and deterministic across argument key order', () => {
  let now = 20_000;
  const store = new McpPromptSnapshotStore({ providerAuthority: 'https://mcp.example.test/mcp', clock: () => now });
  const first = store.materialize('compose', { tone: 'formal', topic: 'TRUYN' }, completePrompt('alpha'));
  now += 1;
  const same = store.materialize('compose', { topic: 'TRUYN', tone: 'formal' }, completePrompt('alpha'));
  assert.equal(same.object.objectId, first.object.objectId);
  assert.equal(same.revision, 1);
  assert.equal(same.changed, false);

  now += 1;
  const changed = store.materialize('compose', { topic: 'TRUYN', tone: 'formal' }, completePrompt('beta'));
  assert.notEqual(changed.object.objectId, first.object.objectId);
  assert.equal(changed.revision, 2);
  assert.equal(changed.changed, true);
});

test('P3-M2 input_required never causes automatic MRTR or model-side action', async () => {
  let requests = 0;
  const client = createMcpPromptHttpClient({
    endpoint: 'https://mcp.example.test/mcp',
    fetchImpl: async (_url, options) => {
      requests += 1;
      const request = JSON.parse(options.body);
      if (requests === 1) {
        assert.equal(request.method, 'prompts/get');
        assert.equal(request.params.inputResponses, undefined);
        return rpc(request, {
          resultType: 'input_required',
          inputRequests: {
            approval: {
              method: 'elicitation/create',
              params: { mode: 'form', message: 'Approve?', requestedSchema: { type: 'object' } }
            }
          },
          requestState: 'opaque-state'
        });
      }
      assert.deepEqual(request.params.inputResponses, { approval: { action: 'accept', content: {} } });
      assert.equal(request.params.requestState, 'opaque-state');
      return rpc(request, { resultType: 'complete', messages: [{ role: 'user', content: { type: 'text', text: 'approved' } }] });
    }
  });
  const importer = createMcpPromptImporter({ client, providerAuthority: 'https://mcp.example.test/mcp' });

  const pending = await importer.get('approval-prompt');
  assert.equal(pending.status, 'input_required');
  assert.equal(pending.materialized, false);
  assert.equal(requests, 1, 'input_required must return control to the caller without an automatic retry');
  assert.equal(importer.store.get('approval-prompt', {}), null);

  await assert.rejects(importer.continuePrompt('approval-prompt', {}, { requestState: 'opaque-state' }), /explicit inputResponses/);
  assert.equal(requests, 1);

  const completed = await importer.continuePrompt('approval-prompt', {}, {
    inputResponses: { approval: { action: 'accept', content: {} } },
    requestState: 'opaque-state'
  });
  assert.equal(completed.status, 'complete');
  assert.equal(completed.snapshot.object.source.executionAuthority, false);
  assert.equal(requests, 2);
});
