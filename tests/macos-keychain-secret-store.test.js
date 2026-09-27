import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { MacOSKeychainSecretStore, MACOS_KEYCHAIN_BACKEND, runMacOSKeychainOperation } from '../runtime/macos-keychain-secret-store.js';

function memoryKeychain() {
  const values = new Map();
  return async ({ operation, account, value }) => {
    if (operation === 'put') { values.set(account, value); return { ok: true }; }
    if (operation === 'resolve') return values.has(account) ? { found: true, value: values.get(account) } : { found: false };
    if (operation === 'delete') { values.delete(account); return { ok: true }; }
    throw new Error('unexpected operation');
  };
}

test('macOS Keychain SecretStore stores, resolves, deletes, then fails closed', async () => {
  const store = new MacOSKeychainSecretStore({ runner: memoryKeychain() });
  const reference = createSecretReference({ backend: MACOS_KEYCHAIN_BACKEND, key: 'provider/openai/test' });
  const sentinel = 'open1-s124-secret-value';
  await store.put(reference, sentinel);
  assert.equal(await resolveSecret(store, reference), sentinel);
  await store.delete(reference);
  await assert.rejects(() => resolveSecret(store, reference), /could not resolve macos-keychain:provider\/openai\/test/);
});

test('macOS store rejects another backend and empty secret', async () => {
  const store = new MacOSKeychainSecretStore({ runner: memoryKeychain() });
  const wrong = createSecretReference({ backend: 'env', key: 'OPENAI_API_KEY' });
  const reference = createSecretReference({ backend: MACOS_KEYCHAIN_BACKEND, key: 'provider/openai/test' });
  await assert.rejects(() => store.resolve(wrong), /cannot use backend: env/);
  await assert.rejects(() => store.put(reference, ''), /Secret value is required/);
});

test('native macOS operation fails closed off macOS instead of falling back', async () => {
  if (process.platform === 'darwin') return;
  await assert.rejects(() => runMacOSKeychainOperation({ operation: 'resolve', account: 'test' }), /supported only on macOS/);
});
