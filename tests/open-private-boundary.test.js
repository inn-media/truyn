import test from 'node:test';
import assert from 'node:assert/strict';

import { violationsFor } from '../scripts/check-open-private-boundary.mjs';

function reader(files) {
  return (path) => {
    if (!(path in files)) throw new Error(`unexpected read: ${path}`);
    return files[path];
  };
}

test('rejects reintroduction of classified managed/private implementation paths', () => {
  const path = 'core/security/account-tenant-authority.js';
  const violations = violationsFor([path], reader({ [path]: 'export const placeholder = true;' }));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /classified managed\/private implementation must remain outside the public repository/);
});

test('rejects public source coupling to the private platform repository', () => {
  const path = 'runtime/service.js';
  const files = {
    [path]: "export const privateSource = 'https://github.com/inn-media/truyn-platform.git';"
  };
  const violations = violationsFor([path], reader(files));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /forbidden public -> private\/raw-source coupling/);
});

test('rejects raw private source fetches from public code', () => {
  const path = 'scripts/example.mjs';
  const files = {
    [path]: "const url = 'https://raw.githubusercontent.com/inn-media/truyn-platform/main/internal.js';"
  };
  const violations = violationsFor([path], reader(files));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /forbidden public -> private\/raw-source coupling/);
});

test('rejects managed commercial modes leaking back into a public split billing surface', () => {
  const path = 'core/security/provider-billing.js';
  const files = {
    [path]: "export const mode = 'subscription';"
  };
  const violations = violationsFor([path], reader(files));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /managed implementation leaked back into a public SPLIT surface/);
});

test('allows open-edge and public-contract behavior with no private coupling', () => {
  const path = 'runtime/relay-authority-runtime.js';
  const files = {
    [path]: "export function connectAuthority(client) { return client.snapshot(); }"
  };

  assert.deepEqual(violationsFor([path], reader(files)), []);
});
