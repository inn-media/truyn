import { nodeIdFromPublicKey } from '../protocol/index.js';

export const DURABLE_IDENTITY_SCHEMA = 'truyn.node-identity/v1';
export const DURABLE_IDENTITY_VERSION = 1;

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Invalid durable identity: ${field} must be a non-empty string`);
  }
  return value;
}

function normalizeProfile(profile) {
  if (profile == null) return null;
  if (typeof profile !== 'string' || profile.length === 0) {
    throw new TypeError('Invalid durable identity: profile must be null or a non-empty string');
  }
  return profile;
}

export function serializeDurableIdentity(identity, { network, profile = null } = {}) {
  if (!identity || typeof identity !== 'object') {
    throw new TypeError('Invalid durable identity: identity is required');
  }

  const publicKeyPem = requireString(identity.publicKeyPem, 'publicKeyPem');
  const privateKeyPem = requireString(identity.privateKeyPem, 'privateKeyPem');
  const nodeId = requireString(identity.nodeId, 'nodeId');
  const algorithm = requireString(identity.algorithm, 'algorithm');
  const normalizedNetwork = requireString(network, 'network');
  const normalizedProfile = normalizeProfile(profile);

  const derivedNodeId = nodeIdFromPublicKey(publicKeyPem);
  if (derivedNodeId !== nodeId) {
    throw new Error('Invalid durable identity: nodeId does not match public key');
  }

  return JSON.stringify({
    schema: DURABLE_IDENTITY_SCHEMA,
    version: DURABLE_IDENTITY_VERSION,
    identity: { nodeId, algorithm, publicKeyPem, privateKeyPem },
    network: normalizedNetwork,
    profile: normalizedProfile
  });
}

export function parseDurableIdentity(serialized) {
  const record = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Invalid durable identity record');
  }
  if (record.schema !== DURABLE_IDENTITY_SCHEMA || record.version !== DURABLE_IDENTITY_VERSION) {
    throw new Error('Unsupported durable identity schema/version');
  }

  const identity = record.identity;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new TypeError('Invalid durable identity: identity object is required');
  }

  const publicKeyPem = requireString(identity.publicKeyPem, 'publicKeyPem');
  const privateKeyPem = requireString(identity.privateKeyPem, 'privateKeyPem');
  const nodeId = requireString(identity.nodeId, 'nodeId');
  const algorithm = requireString(identity.algorithm, 'algorithm');
  const network = requireString(record.network, 'network');
  const profile = normalizeProfile(record.profile);

  if (nodeIdFromPublicKey(publicKeyPem) !== nodeId) {
    throw new Error('Invalid durable identity: nodeId does not match public key');
  }

  return {
    schema: DURABLE_IDENTITY_SCHEMA,
    version: DURABLE_IDENTITY_VERSION,
    identity: { nodeId, algorithm, publicKeyPem, privateKeyPem },
    network,
    profile
  };
}
