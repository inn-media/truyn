import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProductionControlPlane } from './production-control-plane.js';
import {
  materializeProductionControlPlaneSnapshot,
  productionControlPlaneSnapshotCounts,
  productionControlPlaneSnapshotDigest,
  verifyProductionControlPlaneSnapshotDigest
} from './production-control-plane-snapshot.js';
import { validateAuthorityCheckpointDocument } from './cosmos-authority-checkpoint.js';

const MANAGED_ACCOUNTING_MODES = new Set(['sponsored', 'prepaid', 'subscription']);

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sourceSha(value) {
  const normalized = required(value, 'sourceSha').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) throw new Error('sourceSha must be a 40-character Git SHA');
  return normalized;
}

function safeResult(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return structuredClone(value);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== 'function').map(([key, item]) => [key, structuredClone(item)]));
}

function conflict(error) {
  return error?.code === 'authority_checkpoint_conflict' || error?.status === 409 || error?.status === 412;
}

function mutationResult(value, changed = true) {
  return { value, changed };
}

export function createManagedProductionAuthority({
  checkpointStore,
  sourceSha: deployedSourceSha,
  bootstrapSnapshot = null,
  bootstrapDigest = null,
  maxMutationRetries = 4,
  temporaryRoot = tmpdir(),
  now = () => new Date()
} = {}) {
  if (!checkpointStore || typeof checkpointStore.read !== 'function' || typeof checkpointStore.create !== 'function' || typeof checkpointStore.replace !== 'function') {
    throw new Error('managed production authority requires checkpointStore read/create/replace');
  }
  const sha = sourceSha(deployedSourceSha);
  if (!Number.isSafeInteger(maxMutationRetries) || maxMutationRetries < 1 || maxMutationRetries > 20) throw new Error('maxMutationRetries must be 1..20');
  let initialized = false;

  function withControlPlane(document, callback) {
    validateAuthorityCheckpointDocument(document, { maxDocumentBytes: checkpointStore.maxDocumentBytes });
    const stateDir = mkdtempSync(join(temporaryRoot, 'truyn-managed-authority-'));
    try {
      materializeProductionControlPlaneSnapshot({ snapshot: document.state, stateDir });
      const control = createProductionControlPlane({ stateDir, now });
      return callback(control);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  }

  async function initialize() {
    let current = await checkpointStore.read();
    if (!current) {
      if (!bootstrapSnapshot || !bootstrapDigest) throw new Error('production_authority_bootstrap_required');
      verifyProductionControlPlaneSnapshotDigest(bootstrapSnapshot, bootstrapDigest);
      try {
        current = await checkpointStore.create({ sourceSha: sha, state: bootstrapSnapshot, committedAt: now().toISOString() });
      } catch (error) {
        if (!conflict(error)) throw error;
        current = await checkpointStore.read();
      }
    }
    if (!current) throw new Error('production_authority_checkpoint_unavailable');
    validateAuthorityCheckpointDocument(current.document, { maxDocumentBytes: checkpointStore.maxDocumentBytes });
    initialized = true;
    return describe(current.document);
  }

  async function readCheckpoint() {
    if (!initialized) throw new Error('production_authority_not_initialized');
    const current = await checkpointStore.read();
    if (!current) throw new Error('production_authority_checkpoint_unavailable');
    validateAuthorityCheckpointDocument(current.document, { maxDocumentBytes: checkpointStore.maxDocumentBytes });
    return current;
  }

  async function read(callback) {
    const current = await readCheckpoint();
    return withControlPlane(current.document, (control) => callback(control, current.document));
  }

  async function mutate(callback) {
    for (let attempt = 1; attempt <= maxMutationRetries; attempt += 1) {
      const current = await readCheckpoint();
      const operation = withControlPlane(current.document, (control) => {
        const raw = callback(control, current.document);
        const normalized = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'changed') && Object.prototype.hasOwnProperty.call(raw, 'value')
          ? raw
          : mutationResult(raw, true);
        const state = normalized.changed ? control.snapshot() : current.document.state;
        return { ...normalized, state };
      });
      if (!operation.changed) return safeResult(operation.value);
      try {
        const stored = await checkpointStore.replace({
          expectedEtag: current.etag,
          revision: current.document.revision + 1,
          sourceSha: sha,
          state: operation.state,
          committedAt: now().toISOString()
        });
        return {
          ...safeResult(operation.value),
          authorityRevision: stored.document.revision,
          authorityStateDigest: stored.document.stateDigest
        };
      } catch (error) {
        if (!conflict(error) || attempt === maxMutationRetries) throw error;
      }
    }
    throw new Error('production_authority_mutation_retry_exhausted');
  }

  function describe(document) {
    return Object.freeze({
      ready: true,
      revision: document.revision,
      sourceSha: document.sourceSha,
      committedAt: document.committedAt,
      stateDigest: document.stateDigest,
      counts: productionControlPlaneSnapshotCounts(document.state)
    });
  }

  async function checkpoint() {
    const current = await readCheckpoint();
    return {
      revision: current.document.revision,
      sourceSha: current.document.sourceSha,
      committedAt: current.document.committedAt,
      stateDigest: current.document.stateDigest,
      state: structuredClone(current.document.state)
    };
  }

  async function authorizeAccess({ providerNodeId, requesterNodeId, capability = '*' } = {}) {
    return read((control, document) => ({
      ...safeResult(control.providerGrantAuthority.authorize({ providerNodeId, requesterNodeId, capability })),
      authorityRevision: document.revision,
      authorityStateDigest: document.stateDigest
    }));
  }

  async function reserveBilling({ providerNodeId, mode, need, estimatedTokens } = {}) {
    const normalizedMode = String(mode || '').trim().toLowerCase();
    if (!MANAGED_ACCOUNTING_MODES.has(normalizedMode)) {
      return {
        ok: false,
        mode: normalizedMode || null,
        reason: normalizedMode === 'owner-funded' || normalizedMode === 'byok'
          ? 'managed_billing_mode_local_only'
          : 'managed_billing_mode_unsupported'
      };
    }
    return mutate((control) => {
      const capability = need?.payload?.capability?.name || need?.payload?.capability || '*';
      const accessPolicy = {
        mode: 'authority',
        authorize: (request) => control.providerGrantAuthority.authorize({
          providerNodeId,
          requesterNodeId: request?.from,
          capability
        })
      };
      const billing = control.createBillingPolicy({ providerNodeId, mode: normalizedMode });
      const result = billing.authorize(need, { accessPolicy, estimatedTokens });
      return mutationResult(safeResult(result), result?.ok === true);
    });
  }

  async function reconcileBilling({ reservationId, outcome, actualTokens = 0, reason = null } = {}) {
    return mutate((control) => {
      const before = control.accountingAuthority.getReservation(reservationId);
      const result = control.accountingAuthority.reconcile({ reservationId, outcome, actualTokens, reason });
      const after = control.accountingAuthority.getReservation(reservationId);
      return mutationResult(safeResult(result), JSON.stringify(before) !== JSON.stringify(after));
    });
  }

  async function adminMutate({ operation, input = {} } = {}) {
    const op = required(operation, 'authority admin operation');
    return mutate((control) => {
      let result;
      switch (op) {
        case 'account.provision': result = control.accountTenantAuthority.provisionAccount(input); break;
        case 'organization.provision': result = control.accountTenantAuthority.provisionOrganization(input); break;
        case 'tenant.provision': result = control.accountTenantAuthority.provisionTenant(input); break;
        case 'membership.create': result = control.accountTenantAuthority.createMembership(input); break;
        case 'membership.roles': result = control.accountTenantAuthority.setMembershipRoles(input.membershipId, input.roles); break;
        case 'node.bind': result = control.accountTenantAuthority.bindNode(input); break;
        case 'provider.bind': result = control.accountTenantAuthority.bindProvider(input); break;
        case 'authority.suspend': result = control.accountTenantAuthority.suspend(input.kind, input.id); break;
        case 'authority.resume': result = control.accountTenantAuthority.resume(input.kind, input.id); break;
        case 'authority.remove': result = control.accountTenantAuthority.remove(input.kind, input.id); break;
        case 'provider-policy.set': result = control.providerGrantAuthority.setProviderPolicy(input); break;
        case 'provider-policy.suspend': result = control.providerGrantAuthority.suspendProviderPolicy(input.providerNodeId); break;
        case 'provider-policy.resume': result = control.providerGrantAuthority.resumeProviderPolicy(input.providerNodeId); break;
        case 'provider-policy.remove': result = control.providerGrantAuthority.removeProviderPolicy(input.providerNodeId); break;
        case 'grant.create': result = control.providerGrantAuthority.createGrant(input); break;
        case 'grant.suspend': result = control.providerGrantAuthority.suspendGrant(input.grantId); break;
        case 'grant.resume': result = control.providerGrantAuthority.resumeGrant(input.grantId); break;
        case 'grant.revoke': result = control.providerGrantAuthority.revokeGrant(input.grantId, { reason: input.reason }); break;
        case 'entitlement.create': result = control.entitlementAuthority.createEntitlement(input); break;
        case 'entitlement.suspend': result = control.entitlementAuthority.suspendEntitlement(input.entitlementId); break;
        case 'entitlement.resume': result = control.entitlementAuthority.resumeEntitlement(input.entitlementId); break;
        case 'entitlement.revoke': result = control.entitlementAuthority.revokeEntitlement(input.entitlementId, { reason: input.reason }); break;
        case 'revoke': result = control.revocationAuthority.revoke(input.kind, input.id, { reason: input.reason }); break;
        default: throw new Error('unsupported_authority_admin_operation');
      }
      return mutationResult(safeResult(result), true);
    });
  }

  return Object.freeze({
    managed: true,
    sourceSha: sha,
    initialize,
    checkpoint,
    authorizeAccess,
    reserveBilling,
    reconcileBilling,
    adminMutate,
    describe: async () => describe((await readCheckpoint()).document),
    snapshotDigest: async () => productionControlPlaneSnapshotDigest((await readCheckpoint()).document.state)
  });
}
