import { join } from 'node:path';
import { createDurableAccountTenantAuthority } from './durable-account-tenant-authority.js';
import { createProductionRevocationAuthority } from './production-revocation-authority.js';
import { createProviderGrantAuthority } from './provider-grant-authority.js';
import { createEntitlementAuthority } from './entitlement-authority.js';
import { createDurableAccountingAuthority } from './durable-accounting-authority.js';
import { createProviderBillingPolicy } from './provider-billing.js';
import { createProductionTrustAuthority } from '../trust/authority-registry.js';
import {
  assessActiveTrustWithOperationalRevocation,
  createOperationalRevocationController
} from './operational-revocation.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority
} from './relay-provider-policy.js';

function findAuthorityKey(snapshot, nodeId) {
  for (const root of Object.values(snapshot?.roots || {})) {
    for (const version of Object.values(root?.versions || {})) {
      if (version?.nodeId === nodeId) return true;
    }
  }
  for (const record of Object.values(snapshot?.certificates || {})) {
    if (record?.certificate?.body?.subjectNodeId === nodeId) return true;
  }
  return false;
}

export function createProductionControlPlane({
  stateDir,
  accountTenantSeed = {},
  now = () => new Date(),
  revocationAuthorityOverride = null,
  operationalRevocationAuthorize = null,
  operationalRevocationTargetValidator = null
} = {}) {
  if (typeof stateDir !== 'string' || !stateDir.trim()) throw new Error('production control plane stateDir is required');

  const accountTenantAuthority = createDurableAccountTenantAuthority({
    filePath: join(stateDir, 'account-tenant.json'),
    seed: accountTenantSeed,
    now: () => now().toISOString()
  });
  const revocationAuthority = revocationAuthorityOverride || createProductionRevocationAuthority({
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
  const trustAuthority = createProductionTrustAuthority({
    filePath: join(stateDir, 'trust-authority.json'),
    anchorFilePath: join(stateDir, 'trust-authority.anchor.json'),
    revocationAuthority,
    now
  });

  function builtInTargetValidator(input) {
    try {
      if (input.kind === 'membership') {
        const exists = (accountTenantAuthority.snapshot().memberships || []).some((record) => record.membershipId === input.targetId);
        return exists ? { ok: true } : { ok: false, reason: 'membership_not_found' };
      }
      if (input.kind === 'provider-grant') {
        return providerGrantAuthority.snapshot().grants?.[input.targetId]
          ? { ok: true }
          : { ok: false, reason: 'provider_grant_not_found' };
      }
      if (input.kind === 'entitlement') {
        return entitlementAuthority.snapshot().entitlements?.[input.targetId]
          ? { ok: true }
          : { ok: false, reason: 'entitlement_not_found' };
      }
      if (input.kind === 'provider') {
        if (providerGrantAuthority.getProviderPolicy(input.targetId)) return { ok: true };
        const provider = accountTenantAuthority.resolveProvider(input.targetId);
        return provider?.ok ? { ok: true } : { ok: false, reason: provider?.reason || 'provider_not_found' };
      }
      if (input.kind === 'delegation') {
        return trustAuthority.snapshot().certificates?.[input.targetId]
          ? { ok: true }
          : { ok: false, reason: 'authority_delegation_not_found' };
      }
      if (input.kind === 'authority') {
        const snapshot = trustAuthority.snapshot();
        if (input.targetKind === 'authority-root') return snapshot.roots?.[input.targetId] ? { ok: true } : { ok: false, reason: 'authority_root_not_found' };
        if (input.targetKind === 'authority-key') return findAuthorityKey(snapshot, input.targetId) ? { ok: true } : { ok: false, reason: 'authority_key_not_found' };
        return { ok: false, reason: 'authority_target_kind_invalid' };
      }
      if (input.kind === 'trust-evidence') {
        if (typeof operationalRevocationTargetValidator !== 'function') return { ok: false, reason: 'trust_evidence_target_registry_required' };
        return operationalRevocationTargetValidator(input);
      }
      return { ok: false, reason: 'operational_revocation_kind_unsupported' };
    } catch {
      return { ok: false, reason: 'operational_revocation_target_state_unavailable' };
    }
  }

  function validateOperationalTarget(input) {
    const builtIn = builtInTargetValidator(input);
    if (!builtIn?.ok) return builtIn;
    if (input.kind === 'trust-evidence' || typeof operationalRevocationTargetValidator !== 'function') return builtIn;
    const external = operationalRevocationTargetValidator(input);
    return external?.ok === true ? { ok: true } : { ok: false, reason: external?.reason || 'operational_revocation_target_policy_denied' };
  }

  const operationalRevocation = revocationAuthority.replicaMode
    ? null
    : createOperationalRevocationController({
        revocationAuthority,
        authorize: operationalRevocationAuthorize,
        validateTarget: validateOperationalTarget
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

  function assessTrust(input = {}) {
    return assessActiveTrustWithOperationalRevocation({
      ...input,
      authorityRegistry: input.authorityRegistry || trustAuthority,
      revocationAuthority
    });
  }

  return Object.freeze({
    durable: true,
    accountTenantAuthority,
    revocationAuthority,
    operationalRevocation,
    providerGrantAuthority,
    entitlementAuthority,
    accountingAuthority,
    trustAuthority,
    configureRelay,
    createBillingPolicy,
    assessTrust,
    snapshot() {
      return {
        accountTenant: accountTenantAuthority.storageSnapshot(),
        revocations: revocationAuthority.snapshot(),
        operationalRevocationHead: { revision: revocationAuthority.revision, ...revocationAuthority.head() },
        grants: providerGrantAuthority.snapshot(),
        entitlements: entitlementAuthority.snapshot(),
        accounting: accountingAuthority.snapshot(),
        trustAuthority: trustAuthority.snapshot(),
        trustAuthorityAnchor: trustAuthority.anchorSnapshot()
      };
    }
  });
}
