import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION } from '../adapters/a2a/mapping.js';

function message(text) {
  return {
    messageId: `p3-a1-disconnect-${Math.random().toString(16).slice(2)}`,
    role: 'ROLE_USER',
    parts: [{ text, mediaType: 'text/plain' }]
  };
}

async function until(predicate, { timeoutMs = 2_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('condition_timeout');
}

function connections(server) {
  return new Promise((resolve, reject) => {
    server.getConnections((error, count) => error ? reject(error) : resolve(count));
  });
}

test('P3-A1 streaming disconnect tears down the SSE session and stops stream polling', { timeout: 5_000 }, async (t) => {
  const state = {
    registerCalls: 0,
    compactNeedCalls: 0,
    pollCompactCalls: 0,
    revokeCalls: 0
  };
  const node = {
    identity: { nodeId: 'facade-node' },
    sessionToken: null,
    async register() {
      state.registerCalls += 1;
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
      state.compactNeedCalls += 1;
      return { needId: 'need-disconnect', provider: 'provider-node' };
    },
    async pollCompact() {
      state.pollCompactCalls += 1;
      return { events: [] };
    },
    async revoke() {
      state.revokeCalls += 1;
    }
  };

  const facade = createA2aServer({
    node,
    agent: {
      name: 'TRUYN P3-A1 disconnect proof',
      description: 'SSE disconnect cleanup proof',
      version: '0.1.0-p3-a1'
    },
    skills: [{
      id: 'disconnect',
      name: 'Disconnect',
      description: 'Streaming disconnect cleanup proof',
      capability: 'p3.a1.stream.disconnect',
      visibility: 'public'
    }],
    enableStreaming: true,
    pollIntervalMs: 2,
    maxBlockingWaitMs: 2_000
  });
  const url = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const abortController = new AbortController();
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'a2a-version': A2A_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'disconnect-rpc',
      method: 'SendStreamingMessage',
      params: { message: message('disconnect after first frame') }
    }),
    signal: abortController.signal
  });

  assert.match(response.headers.get('content-type') || '', /^text\/event-stream/);
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes('\n\n')) {
    const { value, done } = await reader.read();
    assert.equal(done, false, 'stream must expose the initial task frame before disconnect');
    received += decoder.decode(value, { stream: true });
  }
  assert.match(received, /"task"/);

  await until(() => state.pollCompactCalls > 0);
  abortController.abort();
  await reader.read().catch(() => {});

  await until(async () => (await connections(facade.server)) === 0);
  const pollsAfterCleanup = state.pollCompactCalls;
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(await connections(facade.server), 0, 'aborted SSE connection must not retain a server connection/session handle');
  assert.equal(state.pollCompactCalls, pollsAfterCleanup, 'stream poll loop must stop after the client disconnects');
  assert.equal(state.compactNeedCalls, 1, 'disconnect must not duplicate the provider dispatch handle');
  assert.equal(state.revokeCalls, 0, 'disconnect is transport cleanup, not semantic task cancellation');
  assert.equal(state.registerCalls, 1, 'disconnect cleanup must not create a replacement TRUYN session');
});
