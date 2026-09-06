import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpPromptSelectionClient, validateMcpPromptArguments } from '../adapters/mcp/prompt-selection.js';
import { McpPromptSnapshotStore } from '../adapters/mcp/prompt-runtime.js';

const DESCRIPTOR = Object.freeze({
  name: 'review',
  arguments: Object.freeze([
    Object.freeze({ name: 'language', required: true }),
    Object.freeze({ name: 'tone', required: false })
  ])
});

test('P3-M2 fails closed on missing, undeclared, duplicate, or oversized prompt arguments before remote prompts/get', async () => {
  assert.throws(() => validateMcpPromptArguments(DESCRIPTOR, {}), /required argument is missing: language/);
  assert.throws(() => validateMcpPromptArguments(DESCRIPTOR, { language: 'js', admin: 'true' }), /not declared: admin/);
  assert.throws(() => validateMcpPromptArguments({ name: 'bad', arguments: [{ name: 'x' }, { name: 'x' }] }, { x: '1' }), /duplicate argument name/);
  assert.throws(() => validateMcpPromptArguments(DESCRIPTOR, { language: 'x'.repeat(70 * 1024) }), /bounded string/);

  let remoteCalls = 0;
  const selection = createMcpPromptSelectionClient({
    async getPrompt(name, options) {
      remoteCalls += 1;
      return { name, options };
    }
  });
  await assert.rejects(selection.getPromptFromDescriptor(DESCRIPTOR, { arguments: {} }), /required argument is missing/);
  await assert.rejects(selection.getPromptFromDescriptor(DESCRIPTOR, { arguments: { language: 'js', hidden: '1' } }), /not declared/);
  assert.equal(remoteCalls, 0, 'invalid prompt arguments must be rejected before prompts/get is dispatched');

  const accepted = await selection.getPromptFromDescriptor(DESCRIPTOR, { arguments: { language: 'js', tone: 'strict' } });
  assert.equal(remoteCalls, 1);
  assert.equal(accepted.name, 'review');
  assert.deepEqual(accepted.options.arguments, { language: 'js', tone: 'strict' });
});

test('P3-M2 materializes bounded image/audio content and rejects malformed or oversized base64', () => {
  const store = new McpPromptSnapshotStore({
    providerAuthority: 'https://mcp.example.test/mcp',
    maxPromptBytes: 4096,
    clock: () => 60_000
  });
  const data = Buffer.from('small-media').toString('base64');
  const snapshot = store.materialize('media', {}, {
    resultType: 'complete',
    messages: [
      { role: 'user', content: { type: 'image', data, mimeType: 'image/png' } },
      { role: 'assistant', content: { type: 'audio', data, mimeType: 'audio/wav' } }
    ]
  });
  const payload = JSON.parse(Buffer.from(snapshot.object.inlineDataBase64, 'base64').toString('utf8'));
  assert.equal(payload.messages[0].content.type, 'image');
  assert.equal(payload.messages[1].content.type, 'audio');
  assert.equal(snapshot.object.source.executionAuthority, false);

  assert.throws(() => store.materialize('bad-media', {}, {
    resultType: 'complete',
    messages: [{ role: 'user', content: { type: 'image', data: 'not*base64', mimeType: 'image/png' } }]
  }), /canonical base64/);

  const oversized = Buffer.alloc(5000, 1).toString('base64');
  assert.throws(() => store.materialize('oversized-media', {}, {
    resultType: 'complete',
    messages: [{ role: 'user', content: { type: 'audio', data: oversized, mimeType: 'audio/wav' } }]
  }), /size limit|encoded size limit/);
});
