import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { parseDurableIdentity, serializeDurableIdentity } from '../core/identity/storage.js';
import { exportIdentityRecoveryBundle, importIdentityRecoveryBundle } from '../core/identity/recovery-bundle.js';
import { IDENTITY_ROTATION_CONFIRMATION, rotateDurableIdentity } from '../core/identity/rotation.js';
import { assertIdentityNotRevoked, createIdentityRevocation } from '../core/identity/revocation.js';
import { SecretStore, createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { removeProviderCredential, replaceProviderCredential } from '../runtime/byok-secret-store.js';

function durableFixture() {
  return serializeDurableIdentity(createIdentity(), { network: 'mainnet', profile: 'default' });
}

class MemorySecretStore extends SecretStore {
  constructor() {
    super();
    this.values = new Map();
  }

  async resolve(reference) {
    return this.values.get(`${reference.backend}:${reference.key}`);
  }

  async put(reference, value) {
    this.values.set(`${reference.backend}:${reference.key}`, value);
  }

  async delete(reference) {
    this.values.delete(`${reference.backend}:${reference.key}`);
  }
}

test('S133 matrix: ordinary restart preserves node identity', () => {
  const stored = durableFixture();
  const first = parseDurableIdentity(stored);
  const restarted = parseDurableIdentity(JSON.parse(stored));
  assert.equal(restarted.identity.nodeId, first.identity.nodeId);
  assert.equal(restarted.identity.publicKeyPem, first.identity.publicKeyPem);
});

test('S133 matrix: encrypted recovery restores the same node identity', () => {
  const stored = durableFixture();
  const expected = parseDurableIdentity(stored).identity.nodeId;
  const exported = exportIdentityRecoveryBundle(stored, { passphrase: 'S133-recovery-passphrase' });
  const recovered = importIdentityRecoveryBundle(exported.bundle, { passphrase: 'S133-recovery-passphrase' });
  assert.equal(recovered.nodeId, expected);
});

test('S133 matrix: rotation is explicit and revocation blocks retired identity', () => {
  const stored = durableFixture();
  const oldNodeId = parseDurableIdentity(stored).identity.nodeId;
  assert.throws(() => rotateDurableIdentity(stored), /confirm|explicit/i);
  const rotated = rotateDurableIdentity(stored, { confirmation: IDENTITY_ROTATION_CONFIRMATION, reason: 'S133 matrix' });
  const replacement = parseDurableIdentity(rotated.serializedIdentity).identity.nodeId;
  assert.notEqual(replacement, oldNodeId);
  const revocation = createIdentityRevocation(rotated.audit);
  assert.throws(() => assertIdentityNotRevoked(oldNodeId, [revocation]), /revok/i);
  assert.doesNotThrow(() => assertIdentityNotRevoked(replacement, [revocation]));
});

test('S133 matrix: SecretStore replacement/removal remains reference-only and fails closed after removal', async () => {
  const store = new MemorySecretStore();
  const oldRef = createSecretReference({ backend: 'memory', key: 's133-old' });
  const newRef = createSecretReference({ backend: 'memory', key: 's133-new' });
  await store.put(oldRef, 'S133_OLD_SECRET_SENTINEL');
  const profile = { provider: 'openai', authMode: 'bearer', credentialRef: oldRef };
  const replaced = await replaceProviderCredential(profile, store, { reference: newRef, value: 'S133_NEW_SECRET_SENTINEL' });
  assert.equal(await resolveSecret(store, replaced.credentialRef), 'S133_NEW_SECRET_SENTINEL');
  assert.doesNotMatch(JSON.stringify(replaced), /S133_(OLD|NEW)_SECRET_SENTINEL/);
  await assert.rejects(() => resolveSecret(store, oldRef));
  const removed = await removeProviderCredential(replaced, store);
  assert.equal(removed.credentialRef, undefined);
  await assert.rejects(() => resolveSecret(store, newRef));
});
