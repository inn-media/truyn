import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION } from '../adapters/a2a/mapping.js';

function message(text) {
  return {
    messageId: `p3-a1-subscribe-${Math.random().toString(16).slice(2)}`,
    role: 'ROLE_USER',
    parts: [{ text, mediaType: 'text/plain' }]
  };
}

async function readSseResult(reader, decoder, bufferRef) {
  while (true) {
    const boundary = bufferRef.value.indexOf('\n\n');
    if (boundary >= 0) {
      const frame = bufferRef.value.slice(0, boundary);
      bufferRef.value = bufferRef.value.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      return JSON.parse(data);
    }

    const { value, done } = await reader.read();
    if (done) throw new Error('SSE stream ended before the expected lifecycle event');
    bufferRef.value += decoder.decode(value, { stream: true });
  }
}

async function openStream(url, body, signal) {
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'a2a-version': A2A_PROTOCOL_VERSION
    },
    body: JSON.stringify(body),
    signal
  });
  assert.match(response.headers.get('content-type') || '', /^text\/event-stream/);
  assert.ok(response.body);
  return {
    reader: response.body.getReader(),
    decoder: new TextDecoder(),
    buffer: { value: '' }
  };
}

test('P3-A1 SubscribeToTask attaches to a running task and receives subsequent lifecycle events', { timeout: 5_000 }, async (t) => {
  const compactEvents = [];
  const node = {
    identity: { nodeId: 'facade-node' },
    sessionToken: null,
    async register() {
      this.sessionToken = 'session-token';
      return { ok: true };
    },
    async find() {
      return {
        offers: [{
          from: 'provider-node',
          payload: { metadata: { accessMode: 'public' } }
        }]
      };
    },
    async compactNeed() {
      return { needId: 'need-subscribe-happy', provider: 'provider-node' };
    },
    async pollCompact() {
      return { events: compactEvents.splice(0) };
    }
  };

  const facade = createA2aServer({
    node,
    agent: {
      name: 'TRUYN P3-A1 subscribe proof',
      description: 'SubscribeToTask happy-path proof',
      version: '0.1.0-p3-a1'
    },
    skills: [{
      id: 'subscribe',
      name: 'Subscribe',
      description: 'SubscribeToTask happy-path proof',
      capability: 'p3.a1.subscribe',
      visibility: 'public'
    }],
    allowAnonymousTaskAccess: true,
    enableStreaming: true,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 2_000
  });
  const url = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const originalAbort = new AbortController();
  const original = await openStream(url, {
    jsonrpc: '2.0',
    id: 'send-streaming-rpc',
    method: 'SendStreamingMessage',
    params: { message: message('keep this task running while a second client subscribes') }
  }, originalAbort.signal);
  t.after(() => originalAbort.abort());

  const created = await readSseResult(original.reader, original.decoder, original.buffer);
  assert.equal(created.id, 'send-streaming-rpc');
  assert.equal(created.result.task.status.state, 'TASK_STATE_WORKING');
  const taskId = created.result.task.id;
  const contextId = created.result.task.contextId;

  const subscriberAbort = new AbortController();
  const subscriber = await openStream(url, {
    jsonrpc: '2.0',
    id: 'subscribe-rpc',
    method: 'SubscribeToTask',
    params: { id: taskId }
  }, subscriberAbort.signal);
  t.after(() => subscriberAbort.abort());

  const attached = await readSseResult(subscriber.reader, subscriber.decoder, subscriber.buffer);
  assert.equal(attached.id, 'subscribe-rpc');
  assert.equal(attached.result.task.id, taskId);
  assert.equal(attached.result.task.contextId, contextId);
  assert.equal(attached.result.task.status.state, 'TASK_STATE_WORKING');

  compactEvents.push(
    {
      kind: 'PARTIAL',
      requestId: 'need-subscribe-happy',
      from: 'provider-node',
      verification: { ok: true },
      payload: { sequence: 0, delta: 'subscriber partial' }
    },
    {
      kind: 'RESULT',
      requestId: 'need-subscribe-happy',
      from: 'provider-node',
      verification: { ok: true },
      payload: { output: 'subscriber complete' }
    }
  );

  const partial = await readSseResult(subscriber.reader, subscriber.decoder, subscriber.buffer);
  assert.equal(partial.id, 'subscribe-rpc');
  assert.equal(partial.result.artifactUpdate.taskId, taskId);
  assert.equal(partial.result.artifactUpdate.contextId, contextId);
  assert.equal(partial.result.artifactUpdate.metadata['io.truyn/sequence'], 0);
  assert.equal(partial.result.artifactUpdate.lastChunk, false);

  const completed = await readSseResult(subscriber.reader, subscriber.decoder, subscriber.buffer);
  assert.equal(completed.id, 'subscribe-rpc');
  assert.equal(completed.result.statusUpdate.taskId, taskId);
  assert.equal(completed.result.statusUpdate.contextId, contextId);
  assert.equal(completed.result.statusUpdate.status.state, 'TASK_STATE_COMPLETED');
});