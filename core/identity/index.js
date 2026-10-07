import { createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export function createIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  return {
    nodeId: nodeIdFromPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
    algorithm: 'Ed25519'
  };
}

export function signValue(value, privateKeyPem) {
  return cryptoSign(null, Buffer.from(canonicalize(value)), privateKeyPem).toString('base64');
}

const PUBLIC_KEY_OBJECT_CACHE_LIMIT = 8_192;
const publicKeyObjects = new Map();

function publicKeyObject(publicKeyPem) {
  if (typeof publicKeyPem !== 'string') return publicKeyPem;
  const cached = publicKeyObjects.get(publicKeyPem);
  if (cached !== undefined) return cached;
  const keyObject = createPublicKey(publicKeyPem);
  if (publicKeyObjects.size >= PUBLIC_KEY_OBJECT_CACHE_LIMIT) publicKeyObjects.delete(publicKeyObjects.keys().next().value);
  publicKeyObjects.set(publicKeyPem, keyObject);
  return keyObject;
}

export function verifyValue(value, signature, publicKeyPem) {
  return cryptoVerify(
    null,
    Buffer.from(canonicalize(value)),
    publicKeyObject(publicKeyPem),
    Buffer.from(signature, 'base64')
  );
}
