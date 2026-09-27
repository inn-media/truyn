import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../core/identity/index.js';
import { migrateLegacyIdentity, LEGACY_IDENTITY_MIGRATION } from '../core/identity/migration.js';
import { parseDurableIdentity } from '../core/identity/storage.js';

test('legacy identity migrates to durable v1 without changing node id or private key', () => {
  const legacy = createIdentity();
  const migrated = migrateLegacyIdentity({
    identity: legacy,
    session: { network: 'mainnet', profile: 'default' }
  });

  assert.equal(migrated.migration, LEGACY_IDENTITY_MIGRATION);
  assert.equal(migrated.durable.identity.nodeId, legacy.nodeId);
  assert.equal(migrated.durable.identity.privateKeyPem, legacy.privateKeyPem);
  assert.equal(migrated.durable.network, 'mainnet');
  assert.equal(migrated.durable.profile, 'default');

  const reopened = parseDurableIdentity(migrated.serialized);
  assert.equal(reopened.identity.nodeId, legacy.nodeId);
  assert.equal(reopened.identity.privateKeyPem, legacy.privateKeyPem);
});

test('legacy migration rejects incomplete identity instead of creating a duplicate', () => {
  const legacy = createIdentity();
  assert.throws(
    () => migrateLegacyIdentity({ identity: { ...legacy, privateKeyPem: '' } }),
    /privateKeyPem must be a non-empty string/
  );
});
