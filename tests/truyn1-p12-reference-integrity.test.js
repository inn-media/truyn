import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  OBJECT_REFERENCE_PROFILE,
  normalizeVerifiedObjectReference,
  verifyImmutableObjectBytes,
  resolveVerifiedObjectReference
} from '../core/object/integrity.js';
import { A2A_INTEGRITY_METADATA_KEY, normalizeVerifiedRemotePart } from '../adapters/a2a/artifact-integrity.js';
import { MVP_TYPES } from '../core/protocol/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const vectors = JSON.parse(read('sdk/conformance/v1/p12-object-reference-vectors.json'));
const bytes = Buffer.from(vectors.sourceBytesUtf8, 'utf8');
const valid = vectors.valid;
const errorCode = (code) => (error) => error?.code === code;

test('P12 normative / proto / SDK reference shapes bind the strict integrity profile without changing wire kinds', () => {
  assert.equal(vectors.fixtureSet, 'truyn.protocol-v1.object-reference-integrity/p12');
  assert.equal(vectors.profile, OBJECT_REFERENCE_PROFILE);
  assert.equal(vectors.protocol, 'TRUYN/1');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), valid.sha256);
  assert.equal(bytes.length, valid.bytes);

  const spec = read('spec/protocol/v1/object.md');
  for (const phrase of [
    'exact byte size', 'SHA-256', 'digest mismatch MUST fail closed',
    'size mismatch MUST fail closed', 'explicit resolver', 'MUST NOT implicitly'
  ]) assert.ok(spec.includes(phrase), `missing normative invariant: ${phrase}`);

  const objectProto = read('proto/v1/object.proto');
  const commonProto = read('proto/v1/common.proto');
  for (const field of [
    'string digest_algorithm = 2;', 'bytes digest = 3;', 'uint64 size_bytes = 5;',
    'bytes inline_data = 6;', 'repeated Reference chunks = 7;'
  ]) assert.ok(objectProto.includes(field), `missing ContentObject wire field: ${field}`);
  for (const field of ['string uri = 3;', 'bytes digest = 4;']) {
    assert.ok(commonProto.includes(field), `missing Reference wire field: ${field}`);
  }

  const schema = JSON.parse(read('sdk/conformance/v1/sdk-contract.schema.json'));
  assert.equal(schema.$defs.ArtifactRef.type, 'string');
  assert.equal(schema.$defs.ArtifactRef.minLength, 1);
  const languages = JSON.parse(read('sdk/conformance/languages.json'));
  assert.deepEqual(languages.requiredFirstPartyLanguages, ['typescript', 'python', 'go', 'java', 'dotnet']);
  for (const src of [
    'sdk/typescript/src/stable-api.ts',
    'sdk/python/src/truyn/stable_api.py',
    'sdk/go/truyn.go',
    'sdk/java/src/main/java/org/truyn/sdk/TruynModels.java',
    'sdk/dotnet/Models.cs'
  ]) {
    const source = read(src);
    for (const field of ['sha256', 'bytes', 'ref']) {
      assert.ok(source.toLowerCase().includes(field.toLowerCase()), `${src} lost ${field} reference projection`);
    }
  }
  assert.deepEqual(MVP_TYPES, ['IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE']);
  assert.equal(MVP_TYPES.includes('OBJECT'), false, 'P12 must not accidentally promote draft OBJECT to a new wire kind');
});

test('P12 exact SHA-256 and exact byte-size verification with bounded inline and ordered chunk bytes', () => {
  const normalized = normalizeVerifiedObjectReference(valid);
  assert.equal(normalized.ref, valid.ref);
  assert.equal(normalized.bytes, 29);
  assert.equal(normalized.sha256, valid.sha256);
  assert.equal(verifyImmutableObjectBytes(valid, bytes).verified, true);
  const chunks = [bytes.subarray(0, 3), bytes.subarray(3, 11), bytes.subarray(11)];
  const reconstructed = verifyImmutableObjectBytes(valid, chunks, { maxBytes: 29 });
  assert.equal(reconstructed.verified, true);
  assert.equal(reconstructed.bytes.toString('utf8'), vectors.sourceBytesUtf8);
  assert.equal(
    verifyImmutableObjectBytes({ ref: valid.ref, sizeBytes: valid.bytes, digest: valid.sha256.toUpperCase() }, bytes).verified,
    true,
    'A2A-style aliases normalize to the same byte integrity'
  );
});

test('P12 negative vector matrix fails closed on absent, conflicting or corrupt integrity metadata', () => {
  const wrongDigest = { ...valid, sha256: '0'.repeat(64), verified: true };
  const wrongSize = { ...valid, bytes: valid.bytes - 1, verified: true };
  for (const [reference, actualBytes, code] of [
    [{ ...valid, sha256: undefined }, bytes, 'OBJECT_INTEGRITY_REQUIRED'],
    [{ ...valid, bytes: undefined }, bytes, 'OBJECT_INTEGRITY_REQUIRED'],
    [wrongDigest, bytes, 'OBJECT_INTEGRITY_MISMATCH'],
    [wrongSize, bytes, 'OBJECT_INTEGRITY_MISMATCH'],
    [{ ...valid, sizeBytes: 41 }, bytes, 'OBJECT_INVALID_REFERENCE'],
    [{ ...valid, digest: 'a'.repeat(64) }, bytes, 'OBJECT_INVALID_REFERENCE'],
    [{ ...valid, algorithm: 'md5' }, bytes, 'OBJECT_INVALID_REFERENCE'],
    [{ ...valid, ref: '' }, bytes, 'OBJECT_INVALID_REFERENCE'],
    [valid, Buffer.concat([bytes, Buffer.from('!')]), 'OBJECT_INTEGRITY_MISMATCH'],
    [valid, [bytes.subarray(0, 15), bytes.subarray(15).map((b, i) => i === 0 ? b ^ 1 : b)], 'OBJECT_INTEGRITY_MISMATCH']
  ]) {
    assert.throws(() => verifyImmutableObjectBytes(reference, actualBytes), errorCode(code), `expected ${code}`);
  }
  assert.throws(() => verifyImmutableObjectBytes(valid, bytes, { maxBytes: 28 }), errorCode('OBJECT_TOO_LARGE'));
  assert.throws(() => verifyImmutableObjectBytes(valid, Buffer.concat([bytes, bytes]), { maxBytes: 40 }), errorCode('OBJECT_TOO_LARGE'));
  assert.throws(() => verifyImmutableObjectBytes(valid, 'not raw bytes'), errorCode('OBJECT_INVALID_BYTES'));
  assert.throws(() => verifyImmutableObjectBytes(valid, bytes, { maxBytes: -1 }), errorCode('OBJECT_INVALID_BOUND'));
});

test('P12 URL/ref is data: no explicit resolver means zero IO and zero successful materialization', async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('implicit network fetch'); };
  try {
    await assert.rejects(resolveVerifiedObjectReference(valid), errorCode('OBJECT_RESOLVER_REQUIRED'));
    await assert.rejects(resolveVerifiedObjectReference({ ...valid, sha256: undefined }, {
      resolve: async () => { fetchCalls += 1; return bytes; }
    }), errorCode('OBJECT_INTEGRITY_REQUIRED'));
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('P12 explicit resolver is called once only after bounded claim preflight; corruption never becomes verified', async () => {
  let calls = 0;
  const resolve = async ({ ref, maxBytes, reference }) => {
    calls += 1;
    assert.equal(ref, valid.ref);
    assert.ok([29, 40].includes(maxBytes), 'resolver receives exact caller-declared bound');
    assert.equal(reference.sha256, valid.sha256);
    return { bytes };
  };
  const verified = await resolveVerifiedObjectReference(valid, { resolve, maxBytes: 29 });
  assert.equal(verified.verified, true);
  assert.equal(calls, 1);

  await assert.rejects(resolveVerifiedObjectReference(valid, { resolve, maxBytes: 28 }), errorCode('OBJECT_TOO_LARGE'));
  assert.equal(calls, 1, 'oversized declared reference must be rejected before resolver');

  await assert.rejects(resolveVerifiedObjectReference({ ...valid, bytes: 30 }, { resolve, maxBytes: 40 }), errorCode('OBJECT_INTEGRITY_MISMATCH'));
  assert.equal(calls, 2);
  await assert.rejects(resolveVerifiedObjectReference({ ...valid, sha256: '0'.repeat(64) }, { resolve: async () => {
    calls += 1;
    return bytes;
  } }), errorCode('OBJECT_INTEGRITY_MISMATCH'));
  assert.equal(calls, 3);
  await assert.rejects(resolveVerifiedObjectReference(valid, { resolve: async () => {
    calls += 1;
    return 'url is not materialized bytes';
  } }), errorCode('OBJECT_INVALID_BYTES'));
  assert.equal(calls, 4);
  await assert.rejects(resolveVerifiedObjectReference(valid, { resolve: async () => {
    calls += 1;
    throw new Error('storage unavailable');
  } }), /storage unavailable/);
  assert.equal(calls, 5, 'resolver failure must not silently retry');
});

test('P12 existing C6 A2A integrity and explicit URL resolution are preserved', async () => {
  let calls = 0;
  const normalized = await normalizeVerifiedRemotePart({
    url: valid.ref,
    filename: 'interop-proof.bin',
    mediaType: valid.mediaType,
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: {
        algorithm: 'sha256', digest: valid.sha256, sizeBytes: valid.bytes, encoding: 'raw'
      }
    }
  }, { maxArtifactBytes: 29, resolveArtifactUrl: async () => { calls += 1; return bytes; } });
  assert.equal(calls, 1);
  assert.equal(normalized.metadata[A2A_INTEGRITY_METADATA_KEY].verified, true);
  assert.equal(normalized.metadata[A2A_INTEGRITY_METADATA_KEY].sizeBytes, 29);
  assert.equal(normalized.metadata[A2A_INTEGRITY_METADATA_KEY].digest, valid.sha256);
  assert.equal(normalized.raw, bytes.toString('base64'));
});

test('P12 signed RESULT can carry an opaque integrity-bound reference with no automatic materialization', { timeout: 20000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const url = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl: url });
  const requester = new TruynNode({ relayUrl: url });
  await provider.register();
  await requester.register();
  await provider.offer('p12.artifact-echo');
  const accepted = await requester.need('p12.artifact-echo', { question: 'return ref only' });
  assert.equal(accepted.provider, provider.identity.nodeId);
  const pending = await provider.poll();
  assert.equal(pending.events.length, 1);
  await provider.result(pending.events[0].envelope.id, valid);
  const reply = await requester.poll();
  assert.equal(reply.events.length, 1);
  assert.equal(reply.events[0].verification.ok, true);
  const received = reply.events[0].envelope.payload.output;
  assert.deepEqual(received, valid, 'signed RESULT only delivers reference metadata; it must not implicitly fetch');
  await assert.rejects(resolveVerifiedObjectReference(received), errorCode('OBJECT_RESOLVER_REQUIRED'));
  let calls = 0;
  const result = await resolveVerifiedObjectReference(received, {
    resolve: async ({ ref }) => {
      calls += 1;
      assert.equal(ref, valid.ref);
      return bytes;
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.verified, true);
});
