import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretStore, createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { providerAdapterOptionsWithSecretStore, providerCredentialReference } from '../runtime/byok-secret-store.js';

class MemorySecretStore extends SecretStore {
  constructor(values = new Map()) { super(); this.values = values; }
  async resolve(reference) { return this.values.get(`${reference.backend}:${reference.key}`); }
}

test('SecretStore resolves a credential by opaque reference without exposing backend to BYOK adapter', async () => {
  const reference = createSecretReference({ backend: 'test-secure-store', key: 'provider/openai/default' });
  const store = new MemorySecretStore(new Map([['test-secure-store:provider/openai/default', 'sentinel-secret']]));
  const profile = {
    provider: 'openai', authMode: 'bearer', credentialRef: reference,
    model: 'test-model', capabilities: ['reasoning.general']
  };
  const options = await providerAdapterOptionsWithSecretStore(profile, store);
  assert.equal(options.apiKey, 'sentinel-secret');
  assert.deepEqual(providerCredentialReference(profile), reference);
  assert.equal(JSON.stringify(profile).includes('sentinel-secret'), false);
});

test('legacy env metadata becomes a reference, not a persisted raw value', () => {
  const profile = { provider: 'anthropic', authMode: 'bearer', credentialEnv: 'ANTHROPIC_API_KEY' };
  assert.deepEqual(providerCredentialReference(profile), {
    schema: 'truyn.secret-reference/v1', backend: 'env', key: 'ANTHROPIC_API_KEY'
  });
});

test('SecretStore fails closed for missing values and unknown reference versions', async () => {
  const store = new MemorySecretStore();
  await assert.rejects(() => resolveSecret(store, createSecretReference({ backend: 'test', key: 'missing' })), /could not resolve/);
  await assert.rejects(() => resolveSecret(store, { schema: 'truyn.secret-reference/v2', backend: 'test', key: 'x' }), /Unsupported secret reference schema/);
});
