import test from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentSecretStore, SecretStore, createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { providerAdapterOptionsWithSecretStore, providerCredentialReference, removeProviderCredential, replaceProviderCredential } from '../runtime/byok-secret-store.js';

class MemorySecretStore extends SecretStore {
  constructor(values = new Map()) { super(); this.values = values; }
  async resolve(reference) { return this.values.get(`${reference.backend}:${reference.key}`); }
  async put(reference, value) { this.values.set(`${reference.backend}:${reference.key}`, value); }
  async delete(reference) { this.values.delete(`${reference.backend}:${reference.key}`); }
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

test('provider credential replacement activates new SecretStore reference and removes old credential', async () => {
  const oldRef = createSecretReference({ backend: 'test-secure-store', key: 'provider/openai/old' });
  const newRef = createSecretReference({ backend: 'test-secure-store', key: 'provider/openai/new' });
  const store = new MemorySecretStore(new Map([['test-secure-store:provider/openai/old', 'old-secret']]));
  const profile = { provider: 'openai', authMode: 'bearer', credentialRef: oldRef, model: 'test-model' };
  const updated = await replaceProviderCredential(profile, store, { reference: newRef, value: 'new-secret' });
  assert.deepEqual(updated.credentialRef, newRef);
  assert.equal(await resolveProviderCredentialForTest(updated, store), 'new-secret');
  await assert.rejects(() => resolveSecret(store, oldRef), /could not resolve/);
  assert.equal(JSON.stringify(updated).includes('new-secret'), false);
});

test('provider credential removal makes prior reference unresolvable without changing provider identity', async () => {
  const ref = createSecretReference({ backend: 'test-secure-store', key: 'provider/anthropic/default' });
  const store = new MemorySecretStore(new Map([['test-secure-store:provider/anthropic/default', 'remove-me']]));
  const profile = { provider: 'anthropic', authMode: 'bearer', credentialRef: ref, model: 'same-model' };
  const updated = await removeProviderCredential(profile, store);
  assert.equal(updated.provider, profile.provider);
  assert.equal(updated.model, profile.model);
  assert.equal(updated.credentialRef, undefined);
  await assert.rejects(() => resolveSecret(store, ref), /could not resolve/);
  assert.equal(JSON.stringify(updated).includes('remove-me'), false);
});

async function resolveProviderCredentialForTest(profile, store) {
  return resolveSecret(store, providerCredentialReference(profile));
}

test('legacy env metadata becomes a reference, not a persisted raw value', () => {
  const profile = { provider: 'anthropic', authMode: 'bearer', credentialEnv: 'ANTHROPIC_API_KEY' };
  assert.deepEqual(providerCredentialReference(profile), {
    schema: 'truyn.secret-reference/v1', backend: 'env', key: 'ANTHROPIC_API_KEY'
  });
});

test('EnvironmentSecretStore resolves legacy env references without persisting raw values', async () => {
  const environment = { OPENAI_API_KEY: 'env-sentinel-secret' };
  const store = new EnvironmentSecretStore(environment);
  const profile = { provider: 'openai', authMode: 'bearer', credentialEnv: 'OPENAI_API_KEY', model: 'test-model' };
  const options = await providerAdapterOptionsWithSecretStore(profile, store);
  assert.equal(options.apiKey, 'env-sentinel-secret');
  assert.equal(JSON.stringify(profile).includes('env-sentinel-secret'), false);
  await assert.rejects(() => store.put(createSecretReference({ backend: 'env', key: 'OPENAI_API_KEY' }), 'replacement'), /read-only/);
  await assert.rejects(() => store.delete(createSecretReference({ backend: 'env', key: 'OPENAI_API_KEY' })), /read-only/);
});

test('EnvironmentSecretStore rejects non-env references and missing env values fail closed', async () => {
  const store = new EnvironmentSecretStore({});
  await assert.rejects(() => resolveSecret(store, createSecretReference({ backend: 'env', key: 'MISSING_API_KEY' })), /could not resolve/);
  await assert.rejects(() => resolveSecret(store, createSecretReference({ backend: 'keychain', key: 'provider/default' })), /cannot resolve backend/);
});

test('SecretStore fails closed for missing values and unknown reference versions', async () => {
  const store = new MemorySecretStore();
  await assert.rejects(() => resolveSecret(store, createSecretReference({ backend: 'test', key: 'missing' })), /could not resolve/);
  await assert.rejects(() => resolveSecret(store, { schema: 'truyn.secret-reference/v2', backend: 'test', key: 'x' }), /Unsupported secret reference schema/);
});
