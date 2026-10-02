import test from 'node:test';
import assert from 'node:assert/strict';
import { MANAGED_SYNC_CONFIG_CONTRACT, validateManagedSyncConfigClient } from '../sdk/js/client/managed-sync-config-contract.js';

test('managed sync/config contract is frozen and fail-closed on client authority', () => {
  assert.equal(MANAGED_SYNC_CONFIG_CONTRACT.contract, 'truyn.managed-sync-config/v1');
  assert.equal(MANAGED_SYNC_CONFIG_CONTRACT.compatibility, 'backward-compatible');
  assert.equal(MANAGED_SYNC_CONFIG_CONTRACT.authority.scope, 'server-derived');
  assert.ok(MANAGED_SYNC_CONFIG_CONTRACT.authority.clientAuthorityFields.includes('tenantId'));
  assert.deepEqual(MANAGED_SYNC_CONFIG_CONTRACT.platforms, ['windows','macos','linux','android']);
});

test('all released client platforms must implement sync and config against exact fixture', () => {
  const implementation = () => ({
    contract: MANAGED_SYNC_CONFIG_CONTRACT.contract,
    sync() {},
    getConfig() {},
  });
  assert.equal(validateManagedSyncConfigClient({
    windows: implementation(), macos: implementation(), linux: implementation(), android: implementation(),
  }), true);
  assert.equal(validateManagedSyncConfigClient({ windows: implementation() }), false);
});
