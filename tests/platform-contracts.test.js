import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRUYN_PLATFORM_CONTRACT_VERSION,
  assertAccountingAuthority,
  assertAuthorityHttpClient,
  assertEntitlementAuthority,
  assertRelayAuthorityRuntime,
  createFailClosedAuthorityAdapter,
  normalizeAuthorityDecision
} from '../core/security/platform-contracts.js';

function accountTenantAuthority() {
  return {
    resolveRequester(nodeId) { return { ok: true, nodeId }; },
    resolveProvider(nodeId) { return { ok: true, providerNodeId: nodeId }; }
  };
}

function providerGrantAuthority() {
  return {
    authorize() { return { ok: true }; },
    visibleToRequester() { return { ok: true }; },
    getProviderPolicy() { return { mode: 'private' }; }
  };
}

test('platform contract version is explicit', () => {
  assert.equal(TRUYN_PLATFORM_CONTRACT_VERSION, 1);
});

test('authority HTTP client contract accepts runtime methods and keeps admin optional', () => {
  const client = {
    snapshot() {},
    authorizeAccess() {},
    reserveBilling() {},
    reconcileBilling() {}
  };
  assert.equal(assertAuthorityHttpClient(client), client);
  assert.throws(() => assertAuthorityHttpClient(client, { requireAdmin: true }), /adminMutate/);
  client.adminMutate = () => {};
  assert.equal(assertAuthorityHttpClient(client, { requireAdmin: true }), client);
});

test('durable entitlement/accounting contracts fail closed', () => {
  assert.throws(() => assertEntitlementAuthority({ durable: false, resolve() {} }), /must be durable/);
  assert.throws(() => assertAccountingAuthority({ durable: true, reserve() {} }), /reconcile/);
  assert.doesNotThrow(() => assertEntitlementAuthority({ durable: true, resolve() {} }));
  assert.doesNotThrow(() => assertAccountingAuthority({ durable: true, reserve() {}, reconcile() {} }));
});

test('authority decision normalization never turns malformed data into allow', () => {
  assert.deepEqual(normalizeAuthorityDecision(null), { ok: false, reason: 'authority_denied' });
  assert.deepEqual(normalizeAuthorityDecision({ ok: false }), { ok: false, reason: 'authority_denied' });
  assert.deepEqual(normalizeAuthorityDecision({ ok: true, mode: 'private' }), { ok: true, mode: 'private' });
});

test('relay authority adapter exposes only open contract surfaces and propagates readiness', () => {
  const adapter = createFailClosedAuthorityAdapter({
    accountTenantAuthority: accountTenantAuthority(),
    providerGrantAuthority: providerGrantAuthority(),
    status: () => ({ ready: false, reason: 'snapshot_stale' })
  });
  assert.deepEqual(adapter.status(), { ready: false, reason: 'snapshot_stale' });
  assert.equal(assertRelayAuthorityRuntime(adapter), adapter);
});
