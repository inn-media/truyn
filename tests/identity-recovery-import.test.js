import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { nodeIdFromPublicKey } from '../core/protocol/index.js';
import { serializeDurableIdentity, parseDurableIdentity } from '../core/identity/storage.js';
import { exportIdentityRecoveryBundle, importIdentityRecoveryBundle } from '../core/identity/recovery-bundle.js';

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const nodeId = nodeIdFromPublicKey(publicKeyPem);
  return { nodeId, durable: serializeDurableIdentity({ nodeId, algorithm: 'ed25519', publicKeyPem, privateKeyPem }, { network: 'mainnet' }) };
}

test('recovery import restores the same durable node identity after authenticated decryption', () => {
  const { nodeId, durable } = fixture();
  const exported = exportIdentityRecoveryBundle(durable, { passphrase: 'correct horse battery staple' });
  const imported = importIdentityRecoveryBundle(exported.bundle, { passphrase: 'correct horse battery staple' });
  assert.equal(imported.nodeId, nodeId);
  assert.equal(parseDurableIdentity(imported.serializedIdentity).identity.nodeId, nodeId);
});

test('recovery import fails closed on wrong passphrase, tampering, or nodeId mismatch', () => {
  const { durable } = fixture();
  const exported = exportIdentityRecoveryBundle(durable, { passphrase: 'correct horse battery staple' });
  assert.throws(() => importIdentityRecoveryBundle(exported.bundle, { passphrase: 'wrong passphrase value' }), /integrity check failed/);

  const tampered = JSON.parse(exported.bundle);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -4)}AAAA`;
  assert.throws(() => importIdentityRecoveryBundle(JSON.stringify(tampered), { passphrase: 'correct horse battery staple' }), /integrity check failed/);

  const mismatch = JSON.parse(exported.bundle);
  mismatch.nodeId = `replaced-${mismatch.nodeId}`;
  assert.throws(() => importIdentityRecoveryBundle(JSON.stringify(mismatch), { passphrase: 'correct horse battery staple' }), /nodeId mismatch/);
});
