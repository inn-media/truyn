import { randomBytes, scryptSync, createCipheriv } from 'node:crypto';
import { parseDurableIdentity } from './storage.js';

export const IDENTITY_RECOVERY_SCHEMA = 'truyn.identity-recovery/v1';
export const IDENTITY_RECOVERY_VERSION = 1;

function requirePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new TypeError('Recovery passphrase must be at least 12 characters');
  }
  return passphrase;
}

export function exportIdentityRecoveryBundle(serializedIdentity, { passphrase } = {}) {
  const record = parseDurableIdentity(serializedIdentity);
  const secret = requirePassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const bundle = {
    schema: IDENTITY_RECOVERY_SCHEMA,
    version: IDENTITY_RECOVERY_VERSION,
    nodeId: record.identity.nodeId,
    encryption: {
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    },
    ciphertext: ciphertext.toString('base64')
  };
  return {
    nodeId: record.identity.nodeId,
    bundle: JSON.stringify(bundle),
    summary: `Encrypted identity recovery bundle created for node ${record.identity.nodeId}`
  };
}
