import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../core/identity/index.js';
import {
  DURABLE_IDENTITY_SCHEMA,
  DURABLE_IDENTITY_VERSION,
  parseDurableIdentity,
  serializeDurableIdentity
} from '../core/identity/storage.js';

test('durable identity v1 reopens the same identity without replacement generation', () => {
  const original = createIdentity();
  const serialized = serializeDurableIdentity(original, { network: 'mainnet', profile: 'default' });
  const stored = JSON.parse(serialized);

  assert.equal(stored.schema, DURABLE_IDENTITY_SCHEMA);
  assert.equal(stored.version, DURABLE_IDENTITY_VERSION);

  const reopened = parseDurableIdentity(serialized);
  assert.equal(reopened.identity.nodeId, original.nodeId);
  assert.equal(reopened.identity.publicKeyPem, original.publicKeyPem);
  assert.equal(reopened.identity.privateKeyPem, original.privateKeyPem);
  assert.equal(reopened.identity.algorithm, original.algorithm);
  assert.equal(reopened.network, 'mainnet');
  assert.equal(reopened.profile, 'default');
});

test('durable identity parsing fails closed for unsupported version and mismatched node id', () => {
  const original = createIdentity();
  const stored = JSON.parse(serializeDurableIdentity(original, { network: 'testnet' }));

  assert.throws(
    () => parseDurableIdentity({ ...stored, version: 2 }),
    /Unsupported durable identity schema\/version/
  );

  assert.throws(
    () => parseDurableIdentity({ ...stored, identity: { ...stored.identity, nodeId: 'truyn:node:not-the-key' } }),
    /nodeId does not match public key/
  );
});
