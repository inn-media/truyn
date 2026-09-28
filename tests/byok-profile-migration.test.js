import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateByokProfile, validateMigratedByokProfile } from '../runtime/byok-profile-migration.js';

const legacyFixture = Object.freeze({
  schema: 1,
  provider: 'openai',
  adapterProvider: 'openai',
  model: 'fixture-model',
  credentialEnv: 'LEGACY_OPENAI_KEY',
  authMode: 'bearer',
  capabilities: ['reasoning.general'],
  accessMode: 'owner-only',
  billingMode: 'byok',
  requesterNodeId: 'requester-fixture',
  providerNodeId: 'provider-fixture',
  verifiedAt: null
});

test('legacy BYOK profile migrates to a versioned env SecretStore reference without secret material', () => {
  const rawSecret = 'S132_RAW_SECRET_MUST_NOT_PERSIST';
  const migrated = migrateByokProfile(legacyFixture);

  assert.equal(migrated.schema, 2);
  assert.deepEqual(migrated.credentialRef, {
    schema: 'truyn.secret-reference/v1',
    backend: 'env',
    key: 'LEGACY_OPENAI_KEY'
  });
  assert.equal(Object.hasOwn(migrated, 'credentialEnv'), false);
  assert.equal(JSON.stringify(migrated).includes(rawSecret), false);
  assert.equal(validateMigratedByokProfile(migrated), true);
});

test('migration is deterministic and idempotent for schema v2 profiles', () => {
  const first = migrateByokProfile(legacyFixture);
  const second = migrateByokProfile(first);
  assert.deepEqual(second, first);
});

test('migration fails closed for unknown schemas and malformed bearer references', () => {
  assert.throws(() => migrateByokProfile({ ...legacyFixture, schema: 99 }), /Unsupported BYOK profile schema/);
  assert.throws(() => validateMigratedByokProfile({
    ...legacyFixture,
    schema: 2,
    credentialEnv: undefined,
    credentialRef: null
  }), /must not retain legacy credentialEnv|requires a SecretStore credential reference/);
});
