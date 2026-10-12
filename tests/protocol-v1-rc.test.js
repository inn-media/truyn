import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createIdentity } from '../core/identity/index.js';
import { canonicalize, createEnvelope, nodeIdFromPublicKey, unsignedEnvelope, verifyEnvelope } from '../core/protocol/index.js';

const negativeFixtures = JSON.parse(
  readFileSync(new URL('../sdk/conformance/v1/protocol-envelope-negative-fixtures.json', import.meta.url), 'utf8')
);
const goldenFixtures = JSON.parse(
  readFileSync(new URL('../sdk/conformance/v1/protocol-envelope-golden-fixtures.json', import.meta.url), 'utf8')
);

function validNeedEnvelope() {
  const identity = createIdentity();
  return createEnvelope({
    type: 'NEED',
    from: identity.nodeId,
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem,
    payload: { capability: { name: 'research' }, input: { query: 'open-1.0' } }
  });
}

test('Open 1.0 RC envelope rejects missing or empty required fields', () => {
  const envelope = validNeedEnvelope();
  for (const field of ['id', 'from', 'createdAt', 'publicKey', 'payload', 'signature']) {
    const candidate = structuredClone(envelope);
    candidate[field] = field === 'payload' ? null : '';
    assert.deepEqual(
      verifyEnvelope(candidate),
      { ok: false, reason: 'missing_required_field' },
      `expected ${field} to fail closed`
    );
  }
});

test('Open 1.0 RC envelope requires an object payload and bounded optional destination', () => {
  const envelope = validNeedEnvelope();
  const arrayPayload = { ...envelope, payload: [] };
  assert.deepEqual(verifyEnvelope(arrayPayload), { ok: false, reason: 'missing_required_field' });

  const invalidDestination = { ...envelope, to: '' };
  assert.deepEqual(verifyEnvelope(invalidDestination), { ok: false, reason: 'invalid_optional_field' });
});

test('Open 1.0 RC durable envelope negative fixtures fail with the declared reason', () => {
  assert.equal(negativeFixtures.schemaVersion, 1);
  for (const fixture of negativeFixtures.cases) {
    assert.deepEqual(verifyEnvelope(fixture.envelope), fixture.expected, fixture.id);
  }
});

test('Open 1.0 RC positive golden fixtures verify and bind the declared TCJ1 digest', () => {
  assert.equal(goldenFixtures.schemaVersion, 1);
  for (const fixture of goldenFixtures.cases) {
    assert.deepEqual(verifyEnvelope(fixture.envelope), fixture.expected, fixture.id);
    const canonical = canonicalize(unsignedEnvelope(fixture.envelope));
    const digest = createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
    assert.equal(digest, fixture.canonicalUnsignedSha256, `${fixture.id} TCJ1 digest`);
  }
});

test('joint P1–P5 RC: malformed signed timestamps fail before acceptance', () => {
  const identity = createIdentity();
  const original = createEnvelope({
    type: 'NEED', from: identity.nodeId, privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem, payload: { capability: { name: 'research' } }
  });
  for (const invalid of ['not-a-timestamp', '2026-02-30T00:00:00Z', '2026-10-12 11:00:00Z']) {
    const unsigned = { ...unsignedEnvelope(original), createdAt: invalid };
    const signature = sign(null, Buffer.from(canonicalize(unsigned)), identity.privateKeyPem).toString('base64');
    assert.deepEqual(verifyEnvelope({ ...unsigned, signature }), { ok: false, reason: 'invalid_timestamp' }, invalid);
    assert.throws(() => createEnvelope({
      type: 'NEED', from: identity.nodeId, privateKeyPem: identity.privateKeyPem,
      publicKeyPem: identity.publicKeyPem, createdAt: invalid,
      payload: { capability: { name: 'research' } }
    }), /RFC 3339/, invalid);
  }
});

test('joint P1–P5 RC: TCJ1 rejects non-JSON and invalid Unicode without normalizing signed data', () => {
  for (const value of [{ n: NaN }, { n: Infinity }, { n: -Infinity }, { extra: undefined }, { s: String.fromCharCode(0xd800) }]) {
    assert.throws(() => canonicalize(value), /TCJ1/);
  }
  const original = validNeedEnvelope();
  assert.deepEqual(verifyEnvelope({ ...original, payload: { n: NaN } }), { ok: false, reason: 'invalid_signature' });
  assert.deepEqual(verifyEnvelope({ ...original, ext: undefined }), { ok: false, reason: 'invalid_signature' });
});

test('joint P1–P5 RC: reject noncanonical Base64 and non-Ed25519 key material', () => {
  const original = validNeedEnvelope();
  assert.deepEqual(verifyEnvelope({ ...original, signature: original.signature + '!' }), { ok: false, reason: 'invalid_signature' });
  assert.deepEqual(verifyEnvelope({ ...original, signature: 'AA==' }), { ok: false, reason: 'invalid_signature' });
  assert.deepEqual(verifyEnvelope({ ...original, publicKey: 'not-a-pem' }), { ok: false, reason: 'invalid_signature' });
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => nodeIdFromPublicKey(publicKey.export({ type: 'spki', format: 'pem' })), /Ed25519/);
});
