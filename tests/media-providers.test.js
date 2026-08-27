import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexImageProvider } from '../adapters/providers/vertex-image.js';
import { createVertexVeoProvider } from '../adapters/providers/vertex-veo.js';
import { createAzureOpenAIImageProvider } from '../adapters/providers/azure-openai-image.js';
import { createAzureOpenAIVideoProvider } from '../adapters/providers/azure-openai-video.js';

const fakePng = Buffer.from('fake-png-bytes');
const fakeMp4 = Buffer.from('fake-mp4-bytes');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok, status,
    headers: { get: () => null },
    async json() { return body; }
  };
}

test('Vertex image provider stores binary and returns only ArtifactRef metadata', async () => {
  const calls = [];
  const provider = createVertexImageProvider({
    projectId: 'p', location: 'global', model: 'gemini-image-test',
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async (buffer) => ({ ref: 'gs://bucket/image.png', bytes: buffer.byteLength }) },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: fakePng.toString('base64') } }] } }] });
    }
  });
  const result = await provider.execute({ input: 'blue circle', policy: {} });
  assert.equal(result.output.type, 'artifact');
  assert.equal(result.output.artifacts[0].ref, 'gs://bucket/image.png');
  assert.equal(result.output.artifacts[0].bytes, fakePng.byteLength);
  assert.equal(result.output.artifacts[0].data, undefined);
  assert.match(calls[0].url, /:generateContent$/);
});

test('Azure image provider uses low quality by default and stores output', async () => {
  let requestBody;
  const provider = createAzureOpenAIImageProvider({
    endpoint: 'https://example.openai.azure.com', model: 'gpt-image-test',
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async (buffer) => ({ ref: 'azblob://a/c/image.png', bytes: buffer.byteLength }) },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({ data: [{ b64_json: fakePng.toString('base64') }] });
    }
  });
  const result = await provider.execute({ input: 'blue circle', policy: {} });
  assert.equal(requestBody.quality, 'low');
  assert.equal(requestBody.n, 1);
  assert.equal(result.output.artifacts[0].ref, 'azblob://a/c/image.png');
});

test('Vertex Veo provider defaults to 4s 720p one-sample smoke parameters', async () => {
  const bodies = [];
  const provider = createVertexVeoProvider({
    projectId: 'p', location: 'us-central1', model: 'veo-test', pollIntervalMs: 0,
    accessTokenProvider: async () => 'token',
    artifactStore: { bucket: 'bucket', get: async () => fakeMp4 },
    fetchImpl: async (url, options) => {
      bodies.push(options?.body ? JSON.parse(options.body) : null);
      if (String(url).endsWith(':predictLongRunning')) return jsonResponse({ name: 'projects/p/locations/us-central1/publishers/google/models/veo-test/operations/1' });
      return jsonResponse({ done: true, response: { videos: [{ gcsUri: 'gs://bucket/video.mp4', mimeType: 'video/mp4' }] } });
    }
  });
  const result = await provider.execute({ input: 'blue sphere', policy: {} });
  assert.equal(bodies[0].parameters.durationSeconds, 4);
  assert.equal(bodies[0].parameters.resolution, '720p');
  assert.equal(bodies[0].parameters.sampleCount, 1);
  assert.equal(result.output.artifacts[0].bytes, fakeMp4.byteLength);
});

test('Vertex Veo provider supports inline video bytes when no GCS bucket is configured', async () => {
  const bodies = [];
  const provider = createVertexVeoProvider({
    projectId: 'p', location: 'us-central1', model: 'veo-test', pollIntervalMs: 0,
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async (buffer) => ({ ref: 'file:///video.mp4', bytes: buffer.byteLength }) },
    fetchImpl: async (url, options) => {
      bodies.push(options?.body ? JSON.parse(options.body) : null);
      if (String(url).endsWith(':predictLongRunning')) return jsonResponse({ name: 'projects/p/locations/us-central1/publishers/google/models/veo-test/operations/2' });
      return jsonResponse({ done: true, response: { videos: [{ bytesBase64Encoded: fakeMp4.toString('base64'), mimeType: 'video/mp4' }] } });
    }
  });
  const result = await provider.execute({ input: 'blue sphere', policy: { providerOptions: { inlineOutput: true } } });
  assert.equal(bodies[0].parameters.storageUri, undefined);
  assert.equal(result.output.artifacts[0].ref, 'file:///video.mp4');
  assert.equal(result.output.artifacts[0].bytes, fakeMp4.byteLength);
});

test('Azure Sora provider defaults to 480x480 one-second smoke parameters', async () => {
  const bodies = [];
  let call = 0;
  const provider = createAzureOpenAIVideoProvider({
    endpoint: 'https://example.openai.azure.com', model: 'sora-test', pollIntervalMs: 0,
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async (buffer) => ({ ref: 'azblob://a/c/video.mp4', bytes: buffer.byteLength }) },
    fetchImpl: async (_url, options = {}) => {
      call += 1;
      if (options.body) bodies.push(JSON.parse(options.body));
      if (call === 1) return jsonResponse({ id: 'job-1', status: 'queued' });
      if (call === 2) return jsonResponse({ id: 'job-1', status: 'succeeded', generations: [{ id: 'gen-1' }] });
      return { ok: true, status: 200, async arrayBuffer() { return fakeMp4; } };
    }
  });
  const result = await provider.execute({ input: 'blue sphere', policy: {} });
  assert.equal(bodies[0].width, 480);
  assert.equal(bodies[0].height, 480);
  assert.equal(bodies[0].n_seconds, 1);
  assert.equal(result.output.artifacts[0].ref, 'azblob://a/c/video.mp4');
});

test('Azure Sora abort cancels an already-created remote job without reusing the aborted signal', async () => {
  const controller = new AbortController();
  const calls = [];
  const provider = createAzureOpenAIVideoProvider({
    endpoint: 'https://example.openai.azure.com', model: 'sora-test', pollIntervalMs: 10_000,
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async () => { throw new Error('artifact_store_should_not_run'); } },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET', signal: options.signal });
      if (String(url).endsWith('/jobs?api-version=preview')) {
        queueMicrotask(() => controller.abort(new Error('request_cancelled')));
        return jsonResponse({ id: 'job-cancel', status: 'queued' });
      }
      if (options.method === 'DELETE') return jsonResponse({});
      if (options.signal?.aborted) throw options.signal.reason;
      throw new Error('unexpected_azure_video_call');
    }
  });

  await assert.rejects(provider.execute({ input: 'cancel me', policy: {}, signal: controller.signal }), /request_cancelled/);
  const cancellation = calls.find((call) => call.method === 'DELETE');
  assert.ok(cancellation);
  assert.match(cancellation.url, /\/jobs\/job-cancel\?api-version=preview$/);
  assert.equal(cancellation.signal, undefined);
});

test('Vertex Veo abort cancels an already-created long-running operation without reusing the aborted signal', async () => {
  const controller = new AbortController();
  const calls = [];
  const operationName = 'projects/p/locations/us-central1/publishers/google/models/veo-test/operations/cancel-1';
  const provider = createVertexVeoProvider({
    projectId: 'p', location: 'us-central1', model: 'veo-test', pollIntervalMs: 10_000,
    accessTokenProvider: async () => 'token',
    artifactStore: { put: async () => { throw new Error('artifact_store_should_not_run'); } },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET', signal: options.signal });
      if (String(url).endsWith(':predictLongRunning')) {
        queueMicrotask(() => controller.abort(new Error('request_cancelled')));
        return jsonResponse({ name: operationName });
      }
      if (String(url).endsWith(`${operationName}:cancel`)) return jsonResponse({});
      if (options.signal?.aborted) throw options.signal.reason;
      throw new Error('unexpected_vertex_video_call');
    }
  });

  await assert.rejects(provider.execute({ input: 'cancel me', policy: {}, signal: controller.signal }), /request_cancelled/);
  const cancellation = calls.find((call) => call.url.endsWith(`${operationName}:cancel`));
  assert.ok(cancellation);
  assert.equal(cancellation.method, 'POST');
  assert.equal(cancellation.signal, undefined);
});
