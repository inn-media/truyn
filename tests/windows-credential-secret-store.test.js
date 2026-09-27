import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { WindowsCredentialSecretStore, WINDOWS_CREDENTIAL_BACKEND, runWindowsCredentialOperation } from '../runtime/windows-credential-secret-store.js';

function memoryCredentialManager() {
  const values = new Map();
  return async ({ operation, target, value }) => {
    if (operation === 'put') { values.set(target, value); return { ok: true }; }
    if (operation === 'resolve') return values.has(target) ? { found: true, value: values.get(target) } : { found: false };
    if (operation === 'delete') { values.delete(target); return { ok: true }; }
    throw new Error('unexpected operation');
  };
}

test('Windows Credential Manager SecretStore stores, resolves, deletes, then fails closed', async () => {
  const store = new WindowsCredentialSecretStore({ runner: memoryCredentialManager() });
  const reference = createSecretReference({ backend: WINDOWS_CREDENTIAL_BACKEND, key: 'provider/openai/test' });
  const sentinel = 'open1-s123-secret-value';

  await store.put(reference, sentinel);
  assert.equal(await resolveSecret(store, reference), sentinel);
  await store.delete(reference);
  await assert.rejects(() => resolveSecret(store, reference), /could not resolve windows-credential-manager:provider\/openai\/test/);
});

test('Windows store rejects another backend and empty secret', async () => {
  const store = new WindowsCredentialSecretStore({ runner: memoryCredentialManager() });
  const wrong = createSecretReference({ backend: 'env', key: 'OPENAI_API_KEY' });
  const reference = createSecretReference({ backend: WINDOWS_CREDENTIAL_BACKEND, key: 'provider/openai/test' });
  await assert.rejects(() => store.resolve(wrong), /cannot use backend: env/);
  await assert.rejects(() => store.put(reference, ''), /Secret value is required/);
});

test('native Windows operation fails closed off Windows instead of falling back', async () => {
  if (process.platform === 'win32') return;
  await assert.rejects(
    () => runWindowsCredentialOperation({ operation: 'resolve', target: 'TRUYN/test' }),
    /supported only on Windows/
  );
});
