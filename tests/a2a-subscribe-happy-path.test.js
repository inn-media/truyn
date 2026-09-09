import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
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

async function openStream(url, body, signal, authorization = null) {
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'a2a-version': A2A_PROTOCOL_VERSION,
      ...(authorization ? { authorization } : {})
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

async function openUnpooledStream(url, body, signal, authorization = null) {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(`${url}/a2a`, {
      method: 'POST',
      agent: false,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'a2a-version': A2A_PROTOCOL_VERSION,
        ...(authorization ? { authorization } : {})
      },
      signal
    }, resolve);
    request.once('error', reject);
    request.end(JSON.stringify(body));
  });
  assert.match(response.headers['content-type'] || '', /^text\/event-stream/);
  assert.ok(response.readable);
  return {
    reader: Readable.toWeb(response).getReader(),
    decoder: new TextDecoder(),
    buffer: { value: '' }
  };
}

async function rpc(url, body, authorization = null) {
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'a2a-version': A2A_PROTOCOL_VERSION,
      ...(authorization ? { authorization } : {})
    },
    body: JSON.stringify(body)
  });
  return response.json();
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

test('P3-A1 reconnect is owner-scoped, resumes future events, and never redispatches TRUYN work', { timeout: 5_000 }, async (t) => {
  const compactEvents = [];
  let dispatches = 0;
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
          payload: { metadata: { accessMode: 'authenticated' } }
        }]
      };
    },
    async compactNeed() {
      dispatches += 1;
      return { needId: 'need-reconnect-owner', provider: 'provider-node' };
    },
    async pollCompact() {
      return { events: compactEvents.splice(0) };
    }
  };

  const facade = createA2aServer({
    node,
    agent: {
      name: 'TRUYN P3-A1 reconnect proof',
      description: 'Owner-scoped reconnect and no-redispatch proof',
      version: '0.1.0-p3-a1'
    },
    skills: [{
      id: 'reconnect',
      name: 'Reconnect',
      description: 'Owner-scoped reconnect proof',
      capability: 'p3.a1.reconnect',
      visibility: 'authenticated'
    }],
    authenticate: async (req) => {
      const header = String(req.headers.authorization || '');
      if (!header.startsWith('Bearer ')) throw new Error('missing bearer');
      return { sub: header.slice('Bearer '.length) };
    },
    authorize: async ({ principal }) => Boolean(principal?.sub),
    enableStreaming: true,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 2_000
  });
  const url = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const originalAbort = new AbortController();
  const original = await openUnpooledStream(url, {
    jsonrpc: '2.0',
    id: 'reconnect-send-rpc',
    method: 'SendStreamingMessage',
    params: { message: message('disconnect then explicitly resubscribe') }
  }, originalAbort.signal, 'Bearer owner-a');

  const created = await readSseResult(original.reader, original.decoder, original.buffer);
  assert.equal(created.result.task.status.state, 'TASK_STATE_WORKING');
  const taskId = created.result.task.id;
  const contextId = created.result.task.contextId;
  assert.equal(dispatches, 1);

  originalAbort.abort();
  await original.reader.cancel().catch(() => {});
  const disconnectDeadline = Date.now() + 2_000;
  while (true) {
    const openConnections = await new Promise((resolve, reject) => {
      facade.server.getConnections((error, count) => error ? reject(error) : resolve(count));
    });
    if (openConnections === 0) break;
    assert.ok(Date.now() < disconnectDeadline, 'aborting the original transport must close its unpooled SSE socket');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const denied = await rpc(url, {
    jsonrpc: '2.0',
    id: 'wrong-owner-subscribe-rpc',
    method: 'SubscribeToTask',
    params: { id: taskId }
  }, 'Bearer owner-b');
  assert.equal(denied.id, 'wrong-owner-subscribe-rpc');
  assert.equal(denied.error?.data?.code, 'TASK_NOT_FOUND');
  assert.equal(dispatches, 1, 'wrong-owner resubscription must never dispatch work');

  const reconnectAbort = new AbortController();
  const reconnected = await openStream(url, {
    jsonrpc: '2.0',
    id: 'owner-reconnect-rpc',
    method: 'SubscribeToTask',
    params: { id: taskId }
  }, reconnectAbort.signal, 'Bearer owner-a');
  t.after(() => reconnectAbort.abort());

  const attached = await readSseResult(reconnected.reader, reconnected.decoder, reconnected.buffer);
  assert.equal(attached.id, 'owner-reconnect-rpc');
  assert.equal(attached.result.task.id, taskId);
  assert.equal(attached.result.task.contextId, contextId);
  assert.equal(attached.result.task.status.state, 'TASK_STATE_WORKING');
  assert.equal(dispatches, 1, 'owner resubscription must attach without a second TRUYN NEED');

  compactEvents.push(
    {
      kind: 'PARTIAL',
      requestId: 'need-reconnect-owner',
      from: 'provider-node',
      verification: { ok: true },
      payload: { sequence: 0, delta: 'after reconnect' }
    },
    {
      kind: 'RESULT',
      requestId: 'need-reconnect-owner',
      from: 'provider-node',
      verification: { ok: true },
      payload: { output: 'complete after reconnect' }
    }
  );

  const partial = await readSseResult(reconnected.reader, reconnected.decoder, reconnected.buffer);
  assert.equal(partial.result.artifactUpdate.taskId, taskId);
  assert.equal(partial.result.artifactUpdate.contextId, contextId);
  assert.equal(partial.result.artifactUpdate.metadata['io.truyn/sequence'], 0);

  const completed = await readSseResult(reconnected.reader, reconnected.decoder, reconnected.buffer);
  assert.equal(completed.result.statusUpdate.taskId, taskId);
  assert.equal(completed.result.statusUpdate.contextId, contextId);
  assert.equal(completed.result.statusUpdate.status.state, 'TASK_STATE_COMPLETED');
  assert.equal(dispatches, 1, 'reconnect lifecycle must preserve exactly one provider dispatch');
});