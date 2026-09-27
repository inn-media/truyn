import { createSecretReference, resolveSecret } from './secret-store.js';

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
