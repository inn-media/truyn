import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { parseDurableIdentity } from './storage.js';

export const IDENTITY_RECOVERY_SCHEMA = 'truyn.identity-recovery/v1';
export const IDENTITY_RECOVERY_VERSION = 1;

function requirePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new TypeError('Recovery passphrase must be at least 12 characters');
  }
  return passphrase;
}

function parseRecoveryBundle(serialized) {
  const bundle = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new TypeError('Invalid identity recovery bundle');
  if (bundle.schema !== IDENTITY_RECOVERY_SCHEMA || bundle.version !== IDENTITY_RECOVERY_VERSION) throw new Error('Unsupported identity recovery schema/version');
  if (typeof bundle.nodeId !== 'string' || bundle.nodeId.length === 0) throw new TypeError('Invalid identity recovery bundle: nodeId is required');
  if (bundle.encryption?.algorithm !== 'aes-256-gcm' || bundle.encryption?.kdf !== 'scrypt') throw new Error('Unsupported identity recovery encryption');
  for (const field of ['salt', 'iv', 'tag']) {
    if (typeof bundle.encryption[field] !== 'string' || bundle.encryption[field].length === 0) throw new TypeError(`Invalid identity recovery bundle: ${field} is required`);
  }
  if (typeof bundle.ciphertext !== 'string' || bundle.ciphertext.length === 0) throw new TypeError('Invalid identity recovery bundle: ciphertext is required');
  return bundle;
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

export function importIdentityRecoveryBundle(serializedBundle, { passphrase } = {}) {
  const bundle = parseRecoveryBundle(serializedBundle);
  const secret = requirePassphrase(passphrase);
  const key = scryptSync(secret, Buffer.from(bundle.encryption.salt, 'base64'), 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(bundle.encryption.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(bundle.encryption.tag, 'base64'));
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Identity recovery bundle integrity check failed');
  }
  const record = parseDurableIdentity(plaintext);
  if (record.identity.nodeId !== bundle.nodeId) throw new Error('Identity recovery bundle nodeId mismatch');
  return {
    nodeId: record.identity.nodeId,
    serializedIdentity: JSON.stringify(record),
    summary: `Identity recovery bundle validated for node ${record.identity.nodeId}`
  };
}
