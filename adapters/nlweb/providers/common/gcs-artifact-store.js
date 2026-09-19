import { randomUUID } from 'node:crypto';
import { googleMetadataAccessToken } from './google-auth.js';

function parseGcsRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('gs://')) throw new Error(`Invalid GCS ref: ${ref}`);
  const rest = ref.slice(5);
  const slash = rest.indexOf('/');
  if (slash < 1) throw new Error(`Invalid GCS ref: ${ref}`);
  return { bucket: rest.slice(0, slash), objectName: rest.slice(slash + 1) };
}

export function createGcsArtifactStore({ bucket = process.env.TRUYN_GCS_ARTIFACT_BUCKET, accessTokenProvider = googleMetadataAccessToken, fetchImpl = fetch } = {}) {
  if (!bucket) throw new Error('TRUYN_GCS_ARTIFACT_BUCKET is required');
  return {
    bucket,
    async put(buffer, { mediaType = 'application/octet-stream', prefix = 'media', extension = 'bin', signal } = {}) {
      const objectName = `${prefix}/${Date.now()}-${randomUUID()}.${extension}`;
      const token = await accessTokenProvider({ fetchImpl, signal });
      const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
      url.searchParams.set('uploadType', 'media');
      url.searchParams.set('name', objectName);
      const response = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': mediaType }, body: buffer, signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `GCS upload HTTP ${response.status}`);
      return { ref: `gs://${bucket}/${objectName}`, objectName, bucket, bytes: Number(body.size || buffer.byteLength) };
    },
    async stat(ref, { signal } = {}) {
      const parsed = parseGcsRef(ref);
      const token = await accessTokenProvider({ fetchImpl, signal });
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.objectName)}`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `GCS metadata HTTP ${response.status}`);
      return { ref, bucket: parsed.bucket, objectName: parsed.objectName, bytes: Number(body.size || 0), mediaType: body.contentType || 'application/octet-stream', crc32c: body.crc32c || null, md5Hash: body.md5Hash || null };
    },
    async get(ref, { signal } = {}) {
      const parsed = parseGcsRef(ref);
      const token = await accessTokenProvider({ fetchImpl, signal });
      const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.objectName)}?alt=media`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.error?.message || ''; } catch {}
        throw new Error(detail || `GCS download HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }
  };
}
