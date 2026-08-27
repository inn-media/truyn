import { googleProviderHeaders, googleMetadataAccessToken } from './common/google-auth.js';
import { artifactFromBuffer, artifactResult } from './common/artifacts.js';
import { createGcsArtifactStore } from './common/gcs-artifact-store.js';

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('request_cancelled'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(signal.reason || new Error('request_cancelled')); };
    function cleanup() { signal?.removeEventListener('abort', onAbort); }
    function done() { cleanup(); resolve(); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createVertexVeoProvider({ projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT, location = process.env.GCP_VIDEO_REGION || 'us-central1', model = process.env.VEO_MODEL || 'veo-3.1-fast-generate-001', endpoint, capabilities = ['media.video.generate'], accessTokenProvider = googleMetadataAccessToken, artifactStore, fetchImpl = fetch, pollIntervalMs = Number(process.env.VEO_POLL_MS || 5000), timeoutMs = Number(process.env.VEO_TIMEOUT_MS || 240000) } = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  const apiEndpoint = endpoint || `https://${location}-aiplatform.googleapis.com`;
  const store = artifactStore || createGcsArtifactStore({ accessTokenProvider, fetchImpl });
  return {
    name: 'vertex-veo-predict-long-running', version: '1', capabilities,
    async execute({ input, policy = {}, signal }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const durationSeconds = providerOptions.durationSeconds ?? 4;
      const resolution = providerOptions.resolution || '720p';
      const sampleCount = providerOptions.sampleCount ?? 1;
      const parameters = { sampleCount, durationSeconds, resolution, personGeneration: providerOptions.personGeneration || 'disallow' };
      if (store.bucket && providerOptions.inlineOutput !== true) parameters.storageUri = `gs://${store.bucket}/video/veo/${Date.now()}-/`;
      const requestBody = JSON.stringify({ instances: [{ prompt }], parameters });
      const headers = await googleProviderHeaders({ accessTokenProvider, fetchImpl, signal });
      const modelBase = `${apiEndpoint.replace(/\/$/, '')}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
      const createResponse = await fetchImpl(`${modelBase}:predictLongRunning`, { method: 'POST', headers, body: requestBody, signal });
      const createBody = await createResponse.json();
      if (!createResponse.ok || !createBody.name) throw new Error(createBody?.error?.message || `Vertex Veo HTTP ${createResponse.status}`);

      let remoteTerminal = false;
      let cancelPromise = null;
      const cancelRemote = () => {
        if (remoteTerminal) return Promise.resolve();
        if (!cancelPromise) {
          cancelPromise = (async () => {
            const response = await fetchImpl(`${apiEndpoint.replace(/\/$/, '')}/v1/${createBody.name}:cancel`, { method: 'POST', headers });
            if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 409) throw new Error(`Vertex Veo cancel HTTP ${response.status}`);
          })().catch(() => {});
        }
        return cancelPromise;
      };
      const onAbort = () => { void cancelRemote(); };
      if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });

      try {
        let pollCount = 0;
        let operation = null;
        while (Date.now() - startedAt < timeoutMs) {
          pollCount += 1;
          const pollResponse = await fetchImpl(`${modelBase}:fetchPredictOperation`, { method: 'POST', headers, body: JSON.stringify({ operationName: createBody.name }), signal });
          operation = await pollResponse.json();
          if (!pollResponse.ok) throw new Error(operation?.error?.message || `Vertex Veo poll HTTP ${pollResponse.status}`);
          if (operation.done) break;
          await sleep(pollIntervalMs, signal);
        }
        remoteTerminal = Boolean(operation?.done);
        if (remoteTerminal) signal?.removeEventListener('abort', onAbort);
        if (!operation?.done) throw new Error(`Vertex Veo timed out after ${timeoutMs}ms`);
        if (operation.error) throw new Error(operation.error.message || 'Vertex Veo operation failed');
        const videos = operation?.response?.videos || [];
        if (!videos.length) throw new Error('Vertex Veo response contained no video artifact');
        const video = videos[0];
        let buffer;
        let ref = video.gcsUri || null;
        if (video.bytesBase64Encoded) {
          buffer = Buffer.from(video.bytesBase64Encoded, 'base64');
          const stored = await store.put(buffer, { mediaType: video.mimeType || 'video/mp4', prefix: 'video/veo', extension: 'mp4', signal });
          ref = stored.ref;
        } else if (video.gcsUri && typeof store.get === 'function') buffer = await store.get(video.gcsUri, { signal });
        else throw new Error('Vertex Veo response had neither inline bytes nor a readable GCS artifact');
        const artifact = artifactFromBuffer(buffer, { mediaType: video.mimeType || 'video/mp4', ref, provenance: { cloud: 'gcp', vendor: 'google', family: 'veo', model }, metadata: { durationSeconds, resolution, sampleCount } });
        return artifactResult([artifact], { provider: 'vertex-veo', cloud: 'gcp', vendor: 'google', modelFamily: 'veo', model, modality: 'video', providerRequestId: createBody.name, providerLatencyMs: Date.now() - startedAt, providerRequestBodyBytes: Buffer.byteLength(requestBody), providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(operation)), artifactBytes: artifact.bytes, jobPollCount: pollCount, video: { durationSeconds, resolution, sampleCount } });
      } catch (error) {
        if (signal?.aborted) await cancelRemote();
        throw error;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    }
  };
}
