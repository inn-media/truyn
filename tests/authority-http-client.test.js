import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorityHttpClient } from '../runtime/authority-client.js';

test('authority HTTP timeout remains active through response body read', async () => {
  const fetchImpl = async (_url, options) => ({
    ok: true,
    status: 200,
    async json() {
      return await new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason);
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  const client = createAuthorityHttpClient({ baseUrl: 'https://authority.internal', token: 'runtime-token', fetchImpl, requestTimeoutMs: 100 });
  await assert.rejects(client.snapshot(), /authority_request_timeout/);
});

test('authority HTTP client exposes only the public remote contract surface', () => {
  const client = createAuthorityHttpClient({
    baseUrl: 'https://authority.internal',
    token: 'runtime-token',
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return {}; } })
  });
  assert.equal(typeof client.snapshot, 'function');
  assert.equal(typeof client.authorizeAccess, 'function');
  assert.equal(typeof client.reserveBilling, 'function');
  assert.equal(typeof client.reconcileBilling, 'function');
  assert.equal(typeof client.adminMutate, 'function');
  assert.equal('createRuntime' in client, false);
  assert.equal('materializeSnapshot' in client, false);
});
