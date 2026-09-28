import { assertSecretReference, createSecretReference } from './secret-store.js';

export const BYOK_PROFILE_SCHEMA = 2;

function cloneWithoutLegacyCredential(profile) {
  const { credentialEnv: _credentialEnv, ...rest } = profile;
  return rest;
}

export function migrateByokProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('BYOK profile must be an object');
  }

  if (profile.schema === BYOK_PROFILE_SCHEMA) {
    validateMigratedByokProfile(profile);
    return profile;
  }

  if (profile.schema !== 1) {
    throw new Error(`Unsupported BYOK profile schema: ${profile.schema ?? 'missing'}`);
  }

  const migrated = {
    ...cloneWithoutLegacyCredential(profile),
    schema: BYOK_PROFILE_SCHEMA,
    credentialRef: profile.credentialEnv
      ? createSecretReference({ backend: 'env', key: profile.credentialEnv })
      : profile.credentialRef || null
  };

  validateMigratedByokProfile(migrated);
  return migrated;
}

export function validateMigratedByokProfile(profile) {
  if (!profile || profile.schema !== BYOK_PROFILE_SCHEMA) {
    throw new Error(`Unsupported migrated BYOK profile schema: ${profile?.schema ?? 'missing'}`);
  }
  if (!profile.provider || !profile.requesterNodeId || !profile.providerNodeId) {
    throw new Error('Migrated BYOK profile is missing provider identity metadata');
  }
  if (profile.requesterNodeId === profile.providerNodeId) {
    throw new Error('BYOK provider identity must be separate from requester identity');
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'credentialEnv')) {
    throw new Error('Migrated BYOK profile must not retain legacy credentialEnv');
  }
  if (profile.credentialRef) assertSecretReference(profile.credentialRef);
  if (profile.authMode === 'bearer' && !profile.credentialRef) {
    throw new Error('Bearer BYOK profile requires a SecretStore credential reference');
  }
  return true;
}
