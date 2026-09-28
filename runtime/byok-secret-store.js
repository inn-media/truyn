import { assertSecretReference, createSecretReference, resolveSecret } from './secret-store.js';

export function providerCredentialReference(profile) {
  if (!profile || profile.authMode === 'none' || profile.authMode === 'runtime-identity') return null;
  if (profile.credentialRef) return profile.credentialRef;
  if (profile.credentialEnv) {
    return createSecretReference({ backend: 'env', key: profile.credentialEnv });
  }
  return null;
}

export async function resolveProviderCredential(profile, secretStore) {
  const reference = providerCredentialReference(profile);
  if (!reference) return undefined;
  return resolveSecret(secretStore, reference);
}

export async function replaceProviderCredential(profile, secretStore, { reference, value } = {}) {
  if (!secretStore || typeof secretStore.put !== 'function' || typeof secretStore.delete !== 'function') {
    throw new Error('Writable SecretStore with put/delete is required');
  }
  if (typeof value !== 'string' || value.length === 0) throw new Error('Replacement credential value is required');
  const nextReference = assertSecretReference(reference);
  const previousReference = providerCredentialReference(profile);
  if (previousReference && previousReference.backend === 'env') {
    throw new Error('Environment credential references are read-only; replace with a writable SecretStore reference explicitly');
  }

  await secretStore.put(nextReference, value);
  try {
    const activated = await resolveSecret(secretStore, nextReference);
    if (activated !== value) throw new Error('Replacement credential verification failed');
    if (previousReference && (previousReference.backend !== nextReference.backend || previousReference.key !== nextReference.key)) {
      await secretStore.delete(previousReference);
    }
  } catch (error) {
    await secretStore.delete(nextReference).catch(() => {});
    throw error;
  }

  return { ...profile, credentialRef: nextReference, credentialEnv: undefined };
}

export async function removeProviderCredential(profile, secretStore) {
  if (!secretStore || typeof secretStore.delete !== 'function') throw new Error('Writable SecretStore with delete is required');
  const reference = providerCredentialReference(profile);
  if (!reference) return { ...profile, credentialRef: undefined, credentialEnv: undefined };
  if (reference.backend === 'env') {
    throw new Error('Environment credential references are read-only; remove the environment variable explicitly');
  }
  await secretStore.delete(reference);
  await assertCredentialRemoved(secretStore, reference);
  return { ...profile, credentialRef: undefined, credentialEnv: undefined };
}

async function assertCredentialRemoved(secretStore, reference) {
  try {
    await resolveSecret(secretStore, reference);
  } catch {
    return;
  }
  throw new Error('Removed credential still resolves');
}

export async function providerAdapterOptionsWithSecretStore(profile, secretStore) {
  const apiKey = await resolveProviderCredential(profile, secretStore);
  const capabilities = Array.isArray(profile?.capabilities) ? profile.capabilities : [];
  const common = { capabilities };

  if (profile.provider === 'openai' || profile.provider === 'openai-compatible' || profile.provider === 'local') {
    return { ...common, apiKey, model: profile.model, baseUrl: profile.baseUrl || undefined, allowNoAuth: profile.authMode === 'none' };
  }
  if (profile.provider === 'anthropic') return { ...common, apiKey, model: profile.model, baseUrl: profile.baseUrl || undefined };
  if (profile.provider === 'azure-openai') return { ...common, apiKey, model: profile.model, endpoint: profile.endpoint };
  if (profile.provider === 'vertex-gemini') return { ...common, projectId: profile.projectId, location: profile.location || 'global', model: profile.model || undefined };
  if (profile.provider === 'custom-http') return { ...common, endpoint: profile.endpoint, authMode: profile.authMode, apiKey };
  if (profile.provider === 'custom-mcp') return { ...common, endpoint: profile.endpoint, tool: profile.tool, authMode: profile.authMode, apiKey };
  throw new Error(`Unsupported BYOK profile provider: ${profile?.provider}`);
}
