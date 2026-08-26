import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  A2A_INTEGRITY_METADATA_KEY,
  createA2aArtifactBundle,
  normalizeOutboundA2aArtifactBundle,
  normalizeVerifiedRemoteArtifact
} from '../adapters/a2a/artifact-integrity.js';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function urlPart(url, bytes) {
  return {
    url,
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: {
        algorithm: 'sha256',
        digest: digest(bytes),
        sizeBytes: Buffer.byteLength(bytes),
        encoding: 'raw',
        verified: true
      }
    }
  };
}

test('C6 passes the remaining aggregate byte budget to URL resolvers', async () => {
  let resolverCalls = 0;
  const normalized = await normalizeVerifiedRemoteArtifact({
    artifactId: 'budgeted',
    parts: [
      { raw: Buffer.from('x').toString('base64') },
      urlPart('https://files.example.test/four.bin', 'test')
    ]
  }, {
    maxArtifactBytes: 5,
    resolveArtifactUrl: async ({ maxBytes, url }) => {
      resolverCalls += 1;
      assert.equal(maxBytes, 4);
      assert.equal(url, 'https://files.example.test/four.bin');
      return Buffer.from('test');
    }
  });

  assert.equal(resolverCalls, 1);
  assert.equal(normalized.parts[1].raw, Buffer.from('test').toString('base64'));
});

test('C6 rejects an oversized declared URL before invoking the resolver', async () => {
  let resolverCalls = 0;
  await assert.rejects(
    normalizeVerifiedRemoteArtifact({
      artifactId: 'preflight',
      parts: [
        { raw: Buffer.from('xx').toString('base64') },
        urlPart('https://files.example.test/four.bin', 'test')
      ]
    }, {
      maxArtifactBytes: 5,
      resolveArtifactUrl: async () => {
        resolverCalls += 1;
        return Buffer.from('test');
      }
    }),
    (error) => error.code === 'A2A_ARTIFACT_TOO_LARGE'
  );
  assert.equal(resolverCalls, 0);
});

test('C6 outbound artifact bundles reject more than 64 total parts before normalization', () => {
  const bundle = createA2aArtifactBundle(Array.from({ length: 65 }, (_, index) => ({
    artifactId: `artifact-${index}`,
    parts: [{ raw: '' }]
  })));
  assert.throws(
    () => normalizeOutboundA2aArtifactBundle(bundle, { maxArtifactBytes: 1024 }),
    (error) => error.code === 'A2A_ARTIFACT_COLLECTION_TOO_LARGE'
  );
});

test('C6 allows a zero-byte trailing part after the aggregate byte budget is exactly consumed', async () => {
  const normalized = await normalizeVerifiedRemoteArtifact({
    artifactId: 'zero-tail',
    parts: [
      { raw: Buffer.from('x').toString('base64') },
      { raw: '' }
    ]
  }, { maxArtifactBytes: 1 });

  assert.equal(normalized.parts.length, 2);
  assert.equal(normalized.parts[1].raw, '');
  assert.equal(normalized.parts[1].metadata[A2A_INTEGRITY_METADATA_KEY].sizeBytes, 0);
});

test('C6 outbound bundles keep zero-byte tails but reject positive bytes after exhaustion', () => {
  const valid = createA2aArtifactBundle([{
    artifactId: 'valid',
    parts: [
      { raw: Buffer.from('x').toString('base64') },
      { raw: '' }
    ]
  }]);
  const normalized = normalizeOutboundA2aArtifactBundle(valid, { maxArtifactBytes: 1 });
  assert.equal(normalized.artifacts[0].parts[1].raw, '');

  const invalid = createA2aArtifactBundle([{
    artifactId: 'invalid',
    parts: [
      { raw: Buffer.from('x').toString('base64') },
      { raw: Buffer.from('y').toString('base64') }
    ]
  }]);
  assert.throws(
    () => normalizeOutboundA2aArtifactBundle(invalid, { maxArtifactBytes: 1 }),
    (error) => error.code === 'A2A_ARTIFACT_TOO_LARGE'
  );
});
