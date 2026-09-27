import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { LinuxSecretServiceSecretStore, LINUX_SECRET_SERVICE_BACKEND, runLinuxSecretServiceOperation } from '../runtime/linux-secret-service-secret-store.js';

function memorySecretService() {
  const values = new Map();
  return async ({ operation, account, value }) => {
    if (operation === 'put') { values.set(account, value); return { ok: true }; }
    if (operation === 'resolve') return values.has(account) ? { found: true, value: values.get(account) } : { found: false };
    if (operation === 'delete') { values.delete(account); return { ok: true }; }
    throw new Error('unexpected operation');
  };
}

test('Linux Secret Service SecretStore stores, resolves, deletes, then fails closed', async () => {
  const store = new LinuxSecretServiceSecretStore({ runner: memorySecretService() });
  const reference = createSecretReference({ backend: LINUX_SECRET_SERVICE_BACKEND, key: 'provider/openai/test' });
  const sentinel = 'open1-s125-secret-value';
  await store.put(reference, sentinel);
  assert.equal(await resolveSecret(store, reference), sentinel);
  await store.delete(reference);
  await assert.rejects(() => resolveSecret(store, reference), /could not resolve linux-secret-service:provider\/openai\/test/);
});

test('Linux store rejects another backend and empty secret', async () => {
  const store = new LinuxSecretServiceSecretStore({ runner: memorySecretService() });
  const wrong = createSecretReference({ backend: 'env', key: 'OPENAI_API_KEY' });
  const reference = createSecretReference({ backend: LINUX_SECRET_SERVICE_BACKEND, key: 'provider/openai/test' });
  await assert.rejects(() => store.resolve(wrong), /cannot use backend: env/);
  await assert.rejects(() => store.put(reference, ''), /Secret value is required/);
});

test('native Linux operation fails closed off Linux instead of falling back', async () => {
  if (process.platform === 'linux') return;
  await assert.rejects(() => runLinuxSecretServiceOperation({ operation: 'resolve', account: 'test' }), /supported only on Linux/);
});
