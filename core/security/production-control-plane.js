import { join } from 'node:path';
import { createDurableAccountTenantAuthority } from './durable-account-tenant-authority.js';
import { createProductionRevocationAuthority } from './production-revocation-authority.js';
import { createProviderGrantAuthority } from './provider-grant-authority.js';
import { createEntitlementAuthority } from './entitlement-authority.js';
import { createDurableAccountingAuthority } from './durable-accounting-authority.js';
import { createProviderBillingPolicy } from './provider-billing.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority
} from './relay-provider-policy.js';

export function createProductionControlPlane({ stateDir, accountTenantSeed = {}, now = () => new Date() } = {}) {
  if (typeof stateDir !== 'string' || !stateDir.trim()) throw new Error('production control plane stateDir is required');

  const accountTenantAuthority = createDurableAccountTenantAuthority({
    filePath: join(stateDir, 'account-tenant.json'),
    seed: accountTenantSeed,
    now: () => now().toISOString()
  });
  const revocationAuthority = createProductionRevocationAuthority({
    filePath: join(stateDir, 'revocations.json'),
    now: () => now().toISOString()
  });
  const providerGrantAuthority = createProviderGrantAuthority({
    filePath: join(stateDir, 'provider-grants.json'),
    accountTenantAuthority,
    revocationAuthority,
    nowMs: () => now().getTime()
  });
  const entitlementAuthority = createEntitlementAuthority({
    filePath: join(stateDir, 'entitlements.json'),
    accountTenantAuthority,
    revocationAuthority,
    now
  });
  const accountingAuthority = createDurableAccountingAuthority({
    filePath: join(stateDir, 'accounting.json'),
    now: () => now().toISOString()
  });

  function configureRelay() {
    const previousAccountTenant = configureRelayAccountTenantAuthority(accountTenantAuthority);
    const previousGrants = configureRelayProviderGrantAuthority(providerGrantAuthority);
    return () => {
      configureRelayProviderGrantAuthority(previousGrants);
      configureRelayAccountTenantAuthority(previousAccountTenant);
    };
  }

  function createBillingPolicy({ providerNodeId, mode, ...options } = {}) {
    return createProviderBillingPolicy({
      ...options,
      providerNodeId,
      mode,
      entitlementAuthority,
      accountingAuthority,
      now
    });
  }

  return Object.freeze({
    durable: true,
    accountTenantAuthority,
    revocationAuthority,
    providerGrantAuthority,
    entitlementAuthority,
    accountingAuthority,
    configureRelay,
    createBillingPolicy,
    snapshot() {
      return {
        accountTenant: accountTenantAuthority.storageSnapshot(),
        revocations: revocationAuthority.snapshot(),
        grants: providerGrantAuthority.snapshot(),
        entitlements: entitlementAuthority.snapshot(),
        accounting: accountingAuthority.snapshot()
      };
    }
  });
}
