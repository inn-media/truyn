import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRUYN_PLATFORM_CONTRACT_VERSION,
  assertAuthorityHttpClient,
  assertAccountTenantAuthority,
  assertProviderGrantAuthority,
  assertEntitlementAuthority,
  assertAccountingAuthority,
  assertRelayAuthorityRuntime
} from '../core/security/platform-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('../conformance/platform-contract-v1.json', import.meta.url), 'utf8'));

function implementation(spec = {}) {
  const value = {};
  for (const method of spec.requiredMethods || []) value[method] = () => ({ ok: true });
  for (const [key, expected] of Object.entries(spec.requiredProperties || {})) value[key] = expected;
  return value;
}

test('versioned platform contract fixture is synchronized with public validators', () => {
  assert.equal(fixture.schema, 'truyn.platform.contract-fixture');
  assert.equal(fixture.version, TRUYN_PLATFORM_CONTRACT_VERSION);

  const accountTenantAuthority = implementation(fixture.contracts.accountTenantAuthority);
  const providerGrantAuthority = implementation(fixture.contracts.providerGrantAuthority);
  const entitlementAuthority = implementation(fixture.contracts.entitlementAuthority);
  const accountingAuthority = implementation(fixture.contracts.accountingAuthority);
  const authorityHttpClient = implementation(fixture.contracts.authorityHttpClient);

  assert.equal(assertAccountTenantAuthority(accountTenantAuthority), accountTenantAuthority);
  assert.equal(assertProviderGrantAuthority(providerGrantAuthority), providerGrantAuthority);
  assert.equal(assertEntitlementAuthority(entitlementAuthority), entitlementAuthority);
  assert.equal(assertAccountingAuthority(accountingAuthority), accountingAuthority);
  assert.equal(assertAuthorityHttpClient(authorityHttpClient), authorityHttpClient);

  const relayAuthorityRuntime = {
    ...implementation(fixture.contracts.relayAuthorityRuntime),
    accountTenantAuthority,
    providerGrantAuthority
  };
  assert.equal(assertRelayAuthorityRuntime(relayAuthorityRuntime), relayAuthorityRuntime);
});
