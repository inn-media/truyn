import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createAzureOpenAIVideoProvider } from '../adapters/providers/azure-openai-video.js';
import { createVertexVeoProvider } from '../adapters/providers/vertex-veo.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async arrayBuffer() { return new ArrayBuffer(0); }
  };
}

test('waitMs=0 fast NEED expiry is observable only by its requester and releases terminal reservation', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, requestTtlMs: 20, maxQueuedEventsPerNode: 2 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  const attacker = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await attacker.register();
  await provider.offer('expiry.status');

  const matched = await requester.compactNeed('expiry.status', { value: 1 }, {}, { waitMs: 0 });
  const initial = await requester.compactRequestStatus(matched.needId);
  assert.equal(initial.status, 'matched');
  assert.equal(initial.error, null);

  await assert.rejects(() => attacker.compactRequestStatus(matched.needId), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.body.error, 'not_request_owner');
    return true;
  });

  await delay(30);
  const expired = await requester.compactRequestStatus(matched.needId);
  assert.equal(expired.status, 'failed');
  assert.equal(expired.error, 'request_expired');
  assert.equal(expired.requestId, matched.needId);
  assert.equal(typeof expired.failedAt, 'string');
  assert.equal(relay.state.fastTerminalReservations.has(requester.identity.nodeId), false);

  await assert.rejects(() => provider.compactResult(matched.needId, { late: true }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.body.error, 'request_failed');
    return true;
  });
});

test('independent AbortError is reported as failed RESULT when lifecycle signal was not aborted', async () => {
  const terminals = [];
  const node = {
    async result(requestId, output, metadata) {
      terminals.push({ requestId, output, metadata });
      return { ok: true };
    }
  };
  const host = new TruynAdapterHost({
    node,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'independent-abort',
      capabilities: ['abort.independent'],
      execute: async () => {
        const error = new Error('upstream_timeout');
        error.name = 'AbortError';
        throw error;
      }
    })
  });

  const handled = host.handleLifecycleEvent({
    kind: 'NEED',
    verification: { ok: true },
    envelope: { id: 'abort-independent-1', from: 'requester', payload: { capability: { name: 'abort.independent' }, input: {} } }
  });
  assert.equal(handled.scheduled, true);
  await handled.promise;
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].requestId, 'abort-independent-1');
  assert.equal(terminals[0].output, null);
  assert.equal(terminals[0].metadata.failed, true);
  assert.equal(terminals[0].metadata.error, 'upstream_timeout');
});

test('Azure Sora retries a transient remote cancellation failure after lifecycle abort', async () => {
  const controller = new AbortController();
  let cancelCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/jobs?api-version=preview') && options.method === 'POST') {
      queueMicrotask(() => controller.abort(new Error('request_cancelled')));
      return fakeResponse(200, { id: 'azure-job-1', status: 'queued' });
    }
    if (url.includes('/jobs/azure-job-1?api-version=preview') && options.method === 'DELETE') {
      cancelCalls += 1;
      return fakeResponse(cancelCalls === 1 ? 503 : 204);
    }
    throw new Error(`unexpected Azure request: ${options.method || 'GET'} ${url}`);
  };
  const provider = createAzureOpenAIVideoProvider({
    endpoint: 'https://azure.example',
    model: 'sora-test',
    apiKey: 'test-key',
    fetchImpl,
    pollIntervalMs: 10_000,
    artifactStore: { async put() { throw new Error('artifact store must not be reached'); } }
  });

  await assert.rejects(() => provider.execute({ input: { prompt: 'cancel me' }, signal: controller.signal }), /request_cancelled/);
  assert.equal(cancelCalls, 2);
});

test('Vertex Veo retries a transient remote cancellation failure after lifecycle abort', async () => {
  const controller = new AbortController();
  let cancelCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith(':predictLongRunning')) {
      queueMicrotask(() => controller.abort(new Error('request_cancelled')));
      return fakeResponse(200, { name: 'projects/p/locations/us-central1/operations/veo-1' });
    }
    if (url.endsWith(':cancel')) {
      cancelCalls += 1;
      return fakeResponse(cancelCalls === 1 ? 503 : 200);
    }
    if (url.endsWith(':fetchPredictOperation')) {
      if (options.signal?.aborted) {
        const error = new Error('request_cancelled');
        error.name = 'AbortError';
        throw error;
      }
      return fakeResponse(200, { done: false });
    }
    throw new Error(`unexpected Vertex request: ${options.method || 'GET'} ${url}`);
  };
  const provider = createVertexVeoProvider({
    projectId: 'p',
    location: 'us-central1',
    endpoint: 'https://vertex.example',
    model: 'veo-test',
    accessTokenProvider: async () => 'token',
    fetchImpl,
    pollIntervalMs: 10_000,
    artifactStore: { bucket: null, async put() { throw new Error('artifact store must not be reached'); } }
  });

  await assert.rejects(() => provider.execute({ input: { prompt: 'cancel me' }, signal: controller.signal }), /request_cancelled/);
  assert.equal(cancelCalls, 2);
});
