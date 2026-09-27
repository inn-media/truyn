import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { nodeIdFromPublicKey } from '../core/protocol/index.js';
import { serializeDurableIdentity } from '../core/identity/storage.js';
import { exportIdentityRecoveryBundle, IDENTITY_RECOVERY_SCHEMA } from '../core/identity/recovery-bundle.js';

test('identity export produces bounded encrypted recovery bundle without private material in output', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const nodeId = nodeIdFromPublicKey(publicKeyPem);
  const durable = serializeDurableIdentity({ nodeId, algorithm: 'ed25519', publicKeyPem, privateKeyPem }, { network: 'mainnet' });
  const exported = exportIdentityRecoveryBundle(durable, { passphrase: 'correct horse battery staple' });
  const bundle = JSON.parse(exported.bundle);
  assert.equal(bundle.schema, IDENTITY_RECOVERY_SCHEMA);
  assert.equal(bundle.version, 1);
  assert.equal(bundle.nodeId, nodeId);
  assert.equal(bundle.encryption.algorithm, 'aes-256-gcm');
  assert.equal(bundle.encryption.kdf, 'scrypt');
  assert.ok(bundle.ciphertext.length > 0);
  assert.ok(!exported.bundle.includes(privateKeyPem));
  assert.ok(!exported.summary.includes(privateKeyPem));
  assert.match(exported.summary, new RegExp(nodeId));
});

test('identity export rejects weak or absent recovery passphrase', () => {
  assert.throws(() => exportIdentityRecoveryBundle('{}', {}));
});
