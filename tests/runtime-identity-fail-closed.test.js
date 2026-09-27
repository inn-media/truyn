import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../core/identity/index.js';
import { serializeDurableIdentity } from '../core/identity/storage.js';

const SERVICE = fileURLToPath(new URL('../runtime/service.js', import.meta.url));

function runProvider(identityEnv = {}) {
  return spawnSync(process.execPath, [SERVICE], {
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      TRUYN_ROLE: 'provider',
      TRUYN_RELAY: 'http://127.0.0.1:1',
      TRUYN_PROVIDER: 'openai',
      OPENAI_API_KEY: '',
      TRUYN_IDENTITY_JSON: '',
      TRUYN_IDENTITY_B64: '',
      ...identityEnv
    }
  });
}

test('provider runtime fails closed when durable identity is missing', () => {
  const result = runProvider();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Durable TRUYN identity is required/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});

test('provider runtime fails closed when durable identity is corrupt', () => {
  const result = runProvider({ TRUYN_IDENTITY_JSON: '{not-json' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Durable TRUYN identity is unreadable/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});

test('provider runtime fails closed when durable identity key material is mismatched', () => {
  const identity = createIdentity();
  const otherIdentity = createIdentity();
  const record = JSON.parse(serializeDurableIdentity(identity, { network: 'mainnet', profile: 'test' }));
  record.identity.privateKeyPem = otherIdentity.privateKeyPem;
  const result = runProvider({ TRUYN_IDENTITY_JSON: JSON.stringify(record) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Durable TRUYN identity is unreadable/);
  assert.match(result.stderr, /private key does not match public key/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});

test('provider runtime accepts explicit durable identity without replacing it', () => {
  const identity = createIdentity();
  const serialized = serializeDurableIdentity(identity, { network: 'mainnet', profile: 'test' });
  const result = runProvider({ TRUYN_IDENTITY_JSON: serialized });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /Durable TRUYN identity is (required|unreadable)/);
  assert.match(result.stderr, /OPENAI_API_KEY is required/);
});
