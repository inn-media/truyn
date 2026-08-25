import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nodeIdFromPublicKey } from '../core/protocol/index.js';
import {
  AGENT_DESCRIPTOR_SCHEMA,
  AGENT_DESCRIPTOR_VERSION,
  agentDescriptorSigningPayload,
  negotiateAgentDescriptor,
  parseAgentDescriptor,
  verifyAgentDescriptorSignature
} from '../sdk/conformance/reference/agent-descriptor.js';

const baseFixtures = JSON.parse(await readFile(new URL('../sdk/conformance/v1/golden-fixtures.json', import.meta.url), 'utf8'));
const runtimeFixtures = JSON.parse(await readFile(new URL('../sdk/conformance/v1/agent-descriptor-runtime-fixtures.json', import.meta.url), 'utf8'));

function runtimeCase(id) {
  return runtimeFixtures.descriptorRuntimeCases.find((entry) => entry.id === id);
}

function caseValue(entry) {
  if (entry.value) return structuredClone(entry.value);
  if (entry.valueFrom) return structuredClone(runtimeCase(entry.valueFrom).value);
  return entry.input;
}

function assertFailure(actual, expected, id) {
  assert.equal(actual.ok, false, `${id} should fail`);
  assert.equal(actual.reason, expected.reason, `${id} reason`);
  assert.equal(actual.error.code, expected.error.code, `${id} error code`);
  assert.equal(actual.error.retryable, expected.error.retryable, `${id} retryable`);
}

test('Agent Descriptor runtime fixtures extend the same shared DX-1 fixture set', () => {
  assert.equal(runtimeFixtures.fixtureSet, baseFixtures.fixtureSet);
  assert.equal(runtimeFixtures.contractVersion, baseFixtures.contractVersion);
  assert.equal(runtimeFixtures.extends, 'golden-fixtures.json');
  assert.equal(runtimeFixtures.signatureContract.algorithm, 'Ed25519');
  assert.equal(runtimeFixtures.signatureContract.encoding, 'base64');
  assert.equal(runtimeFixtures.signatureContract.delegatedDescriptorKeysSupported, false);
});

test('v1 parser accepts the real signed fixture and canonicalization bytes are language-golden', () => {
  const entry = runtimeCase('descriptor.signature-valid');
  const parsed = parseAgentDescriptor(entry.value, { now: entry.now });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptor.schema, AGENT_DESCRIPTOR_SCHEMA);
  assert.equal(parsed.descriptor.descriptorVersion, AGENT_DESCRIPTOR_VERSION);
  assert.equal(agentDescriptorSigningPayload(entry.value), entry.canonicalSigningPayload);
  assert.equal(nodeIdFromPublicKey(entry.identityPublicKey), entry.value.identity);
});

test('identity-bound Ed25519 descriptor signature verifies for signature and signatures forms', () => {
  for (const id of ['descriptor.signature-valid', 'descriptor.signature-array-valid']) {
    const entry = runtimeCase(id);
    const verified = verifyAgentDescriptorSignature(entry.value, {
      publicKeyPem: entry.identityPublicKey,
      now: entry.now
    });
    assert.equal(verified.ok, true, id);
    assert.equal(verified.signer.identity, entry.value.identity);
    assert.equal(verified.signer.keyBinding, entry.expect.keyBinding);
  }
});

test('descriptor tampering and wrong identity key fail closed as unauthenticated', () => {
  for (const id of ['descriptor.signature-tampered', 'descriptor.identity-key-mismatch']) {
    const entry = runtimeCase(id);
    const actual = verifyAgentDescriptorSignature(caseValue(entry), {
      publicKeyPem: entry.identityPublicKey,
      now: entry.now
    });
    assertFailure(actual, entry.expect, id);
  }

  const mismatch = runtimeCase('descriptor.identity-key-mismatch');
  const actual = verifyAgentDescriptorSignature(caseValue(mismatch), {
    publicKeyPem: mismatch.identityPublicKey,
    now: mismatch.now
  });
  assert.equal(actual.error.details.delegatedDescriptorKeysSupported, false);
});

test('parser rejects malformed JSON and expired descriptors by default', () => {
  for (const id of ['descriptor.invalid-json', 'descriptor.expired']) {
    const entry = runtimeCase(id);
    const actual = parseAgentDescriptor(caseValue(entry), { now: entry.now });
    assertFailure(actual, entry.expect, id);
  }

  const expired = runtimeCase('descriptor.expired');
  const offline = parseAgentDescriptor(caseValue(expired), { now: expired.now, allowExpired: true });
  assert.equal(offline.ok, true, 'explicit offline/cache policy may allow expired descriptor');
});

test('existing PR1 descriptor version mismatch fixture is enforced by the real parser', () => {
  const entry = baseFixtures.behaviorCases.find((item) => item.id === 'descriptor.version-mismatch');
  const actual = parseAgentDescriptor(entry.value, { now: '2026-08-25T12:00:00.000Z' });
  assert.equal(actual.ok, false);
  assert.equal(actual.reason, 'unsupported_descriptor_version');
  assert.equal(actual.error.code, entry.expect.error.code);
  assert.deepEqual(actual.error.details, entry.expect.error.details);
});

test('protocol and interface negotiation are deterministic and fail explicitly on no overlap', () => {
  const valid = runtimeCase('descriptor.negotiation-valid');
  const selected = negotiateAgentDescriptor(caseValue(valid), {
    now: valid.now,
    ...valid.client
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.selection.descriptorVersion, valid.expect.descriptorVersion);
  assert.equal(selected.selection.protocol, valid.expect.protocol);
  assert.equal(selected.selection.interface.type, valid.expect.interfaceType);

  for (const id of ['descriptor.protocol-no-overlap', 'descriptor.interface-no-overlap']) {
    const entry = runtimeCase(id);
    const actual = negotiateAgentDescriptor(caseValue(entry), { now: entry.now, ...entry.client });
    assertFailure(actual, entry.expect, id);
  }
});

test('invalid signature encoding is rejected before cryptographic verification', () => {
  const entry = runtimeCase('descriptor.signature-valid');
  const descriptor = structuredClone(entry.value);
  descriptor.signature = 'not-base64';
  const actual = parseAgentDescriptor(descriptor, { now: entry.now });
  assert.equal(actual.ok, false);
  assert.equal(actual.reason, 'invalid_descriptor_signature_encoding');
  assert.equal(actual.error.code, 'validation_error');
});

test('descriptor verification never trusts a key embedded by descriptor content', () => {
  const entry = runtimeCase('descriptor.signature-valid');
  const descriptor = structuredClone(entry.value);
  descriptor.publicKey = entry.identityPublicKey;
  const noResolver = verifyAgentDescriptorSignature(descriptor, { now: entry.now });
  assert.equal(noResolver.ok, false);
  assert.equal(noResolver.reason, 'descriptor_key_unavailable');
  assert.equal(noResolver.error.code, 'unauthenticated');
});
