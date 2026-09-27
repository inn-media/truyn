import { parseDurableIdentity, serializeDurableIdentity } from './storage.js';

export const LEGACY_IDENTITY_MIGRATION = 'truyn.legacy-identity/v1-to-durable/v1';

function requiredLegacyIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Legacy identity must be an object');
  }
  for (const field of ['nodeId', 'algorithm', 'publicKeyPem', 'privateKeyPem']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new TypeError(`Legacy identity ${field} must be a non-empty string`);
    }
  }
  return value;
}

function optionalString(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function migrateLegacyIdentity({ identity, session = null, network = null, profile = null } = {}) {
  const legacy = requiredLegacyIdentity(identity);
  const sessionRecord = session && typeof session === 'object' && !Array.isArray(session) ? session : {};
  const resolvedNetwork = optionalString(network, optionalString(sessionRecord.network, 'mainnet'));
  const resolvedProfile = optionalString(profile, optionalString(sessionRecord.profile, null));

  const serialized = serializeDurableIdentity(legacy, {
    network: resolvedNetwork,
    profile: resolvedProfile
  });
  const durable = parseDurableIdentity(serialized);

  if (durable.identity.nodeId !== legacy.nodeId || durable.identity.privateKeyPem !== legacy.privateKeyPem) {
    throw new Error('Legacy identity migration changed identity key material');
  }

  return {
    migration: LEGACY_IDENTITY_MIGRATION,
    durable,
    serialized
  };
}
