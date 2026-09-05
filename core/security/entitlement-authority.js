import { createDurableJsonStore } from './durable-json-store.js';

const MODES = new Set(['sponsored', 'prepaid', 'subscription']);
const SUBJECT_TYPES = new Set(['node', 'principal', 'tenant', 'organization', 'account']);
const PERIODS = new Set(['day', 'month', 'lifetime']);
const BILLING_RESPONSIBILITIES = new Set(['requester', 'tenant', 'account', 'provider-owner-sponsored']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function positiveIntegerOrNull(value, label) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer or null`);
  return number;
}

function normalizeCapabilities(value = ['*']) {
  const items = Array.isArray(value) ? value : [value];
  const capabilities = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  if (capabilities.length === 0) capabilities.push('*');
  return capabilities.sort();
}

function subjectMatches(entitlement, requester) {
  if (entitlement.subjectType === 'node') return entitlement.subjectId === requester.nodeId;
  if (entitlement.subjectType === 'principal') return entitlement.subjectId === requester.principalId;
  if (entitlement.subjectType === 'tenant') return entitlement.subjectId === requester.tenantId;
  if (entitlement.subjectType === 'organization') return entitlement.subjectId === requester.organizationId;
  if (entitlement.subjectType === 'account') return entitlement.subjectId === requester.accountId;
  return false;
}

const specificity = Object.freeze({ node: 5, principal: 4, tenant: 3, organization: 2, account: 1 });

function periodKey(period, date) {
  const iso = date.toISOString();
  if (period === 'day') return iso.slice(0, 10);
  if (period === 'month') return iso.slice(0, 7);
  return 'lifetime';
}

export function createEntitlementAuthority({
  filePath,
  accountTenantAuthority,
  revocationAuthority = null,
  now = () => new Date()
} = {}) {
  if (!accountTenantAuthority || typeof accountTenantAuthority.resolveRequester !== 'function' || typeof accountTenantAuthority.resolveProvider !== 'function') {
    throw new Error('entitlement authority requires accountTenantAuthority requester/provider resolution');
  }
  const store = createDurableJsonStore({
    filePath,
    defaultState: { version: 1, revision: 0, entitlements: {} },
    nowMs: () => now().getTime()
  });

  function revoked(kind, id) {
    if (!revocationAuthority || !id) return false;
    try { return revocationAuthority.isRevoked(kind, id); } catch { return true; }
  }

  function createEntitlement(input = {}) {
    const entitlementId = requiredString(input.entitlementId, 'entitlementId');
    const subjectType = requiredString(input.subjectType, 'entitlement subjectType').toLowerCase();
    if (!SUBJECT_TYPES.has(subjectType)) throw new Error(`Unsupported entitlement subject type: ${input.subjectType}`);
    const mode = requiredString(input.mode, 'entitlement mode').toLowerCase();
    if (!MODES.has(mode)) throw new Error(`Unsupported entitlement mode: ${input.mode}`);
    const period = String(input.period || 'month').trim().toLowerCase();
    if (!PERIODS.has(period)) throw new Error(`Unsupported entitlement period: ${input.period}`);
    const billingResponsibility = String(input.billingResponsibility || (mode === 'sponsored' ? 'provider-owner-sponsored' : 'requester')).trim().toLowerCase();
    if (!BILLING_RESPONSIBILITIES.has(billingResponsibility)) throw new Error(`Unsupported billing responsibility: ${billingResponsibility}`);
    const validFrom = input.validFrom || now().toISOString();
    const expiresAt = input.expiresAt || null;
    if (!Number.isFinite(Date.parse(validFrom))) throw new Error('entitlement validFrom must be a valid timestamp');
    if (expiresAt != null && !Number.isFinite(Date.parse(expiresAt))) throw new Error('entitlement expiresAt must be a valid timestamp');

    const record = {
      entitlementId,
      subjectType,
      subjectId: requiredString(input.subjectId, 'entitlement subjectId'),
      providerNodeId: requiredString(input.providerNodeId || '*', 'entitlement providerNodeId'),
      capabilities: normalizeCapabilities(input.capabilities),
      mode,
      period,
      maxRequests: positiveIntegerOrNull(input.maxRequests, 'maxRequests'),
      maxTokens: positiveIntegerOrNull(input.maxTokens, 'maxTokens'),
      billingResponsibility,
      validFrom,
      expiresAt,
      status: 'active',
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    };

    return store.transaction((state) => {
      state.entitlements ||= {};
      if (state.entitlements[entitlementId]) throw new Error(`entitlement already exists: ${entitlementId}`);
      state.entitlements[entitlementId] = record;
      return record;
    }).result;
  }

  function transition(entitlementId, status) {
    const id = requiredString(entitlementId, 'entitlementId');
    if (!['active', 'suspended'].includes(status)) throw new Error(`Unsupported entitlement transition: ${status}`);
    return store.transaction((state) => {
      state.entitlements ||= {};
      const existing = state.entitlements[id];
      if (!existing) throw new Error(`entitlement not found: ${id}`);
      if (existing.status === 'revoked') throw new Error('revoked entitlement cannot transition');
      const record = { ...existing, status, updatedAt: now().toISOString() };
      state.entitlements[id] = record;
      return record;
    }).result;
  }

  function revokeEntitlement(entitlementId, { reason = 'entitlement_revoked' } = {}) {
    const id = requiredString(entitlementId, 'entitlementId');
    const record = store.transaction((state) => {
      state.entitlements ||= {};
      const existing = state.entitlements[id];
      if (!existing) throw new Error(`entitlement not found: ${id}`);
      if (existing.status === 'revoked') return existing;
      const next = { ...existing, status: 'revoked', revokedAt: now().toISOString(), updatedAt: now().toISOString() };
      state.entitlements[id] = next;
      return next;
    }).result;
    if (revocationAuthority && !revocationAuthority.isRevoked('entitlement', id)) {
      revocationAuthority.revoke('entitlement', id, { reason });
    }
    return record;
  }

  function resolve({ requesterNodeId, providerNodeId, capability, mode } = {}) {
    const requesterId = requiredString(requesterNodeId, 'requesterNodeId');
    const providerId = requiredString(providerNodeId, 'providerNodeId');
    const capabilityName = requiredString(capability, 'capability');
    const normalizedMode = requiredString(mode, 'entitlement mode').toLowerCase();
    if (!MODES.has(normalizedMode)) return { ok: false, reason: 'unsupported_entitlement_mode' };

    let requester;
    let provider;
    try {
      requester = accountTenantAuthority.resolveRequester(requesterId);
      provider = accountTenantAuthority.resolveProvider(providerId);
    } catch {
      return { ok: false, reason: 'account_tenant_authority_unavailable' };
    }
    if (!requester?.ok) return { ok: false, reason: requester?.reason || 'requester_authority_denied' };
    if (!provider?.ok) return { ok: false, reason: provider?.reason || 'provider_authority_denied' };

    const checks = [
      ['node', requester.nodeId],
      ['principal', requester.principalId],
      ['tenant', requester.tenantId],
      ['organization', requester.organizationId],
      ['account', requester.accountId],
      ['provider', provider.providerNodeId],
      ['node', provider.providerNodeId],
      ['principal', provider.principalId],
      ['tenant', provider.tenantId],
      ['organization', provider.organizationId],
      ['account', provider.accountId]
    ];
    for (const membershipId of requester.membershipIds || []) checks.push(['membership', membershipId]);
    for (const membershipId of provider.membershipIds || []) checks.push(['membership', membershipId]);
    for (const [kind, id] of checks) {
      if (revoked(kind, id)) return { ok: false, reason: `${kind}_revoked` };
    }

    let state;
    try { state = store.read(); } catch { return { ok: false, reason: 'entitlement_state_unavailable' }; }
    const instant = now();
    const currentMs = instant.getTime();
    const candidates = Object.values(state.entitlements || {})
      .filter((entitlement) =>
        entitlement.status === 'active' &&
        entitlement.mode === normalizedMode &&
        !revoked('entitlement', entitlement.entitlementId) &&
        (entitlement.providerNodeId === '*' || entitlement.providerNodeId === providerId) &&
        (entitlement.capabilities.includes('*') || entitlement.capabilities.includes(capabilityName)) &&
        subjectMatches(entitlement, requester) &&
        Date.parse(entitlement.validFrom) <= currentMs &&
        (!entitlement.expiresAt || Date.parse(entitlement.expiresAt) > currentMs)
      )
      .sort((a, b) => {
        const providerSpecific = Number(b.providerNodeId !== '*') - Number(a.providerNodeId !== '*');
        if (providerSpecific) return providerSpecific;
        const subjectSpecific = specificity[b.subjectType] - specificity[a.subjectType];
        if (subjectSpecific) return subjectSpecific;
        return a.entitlementId.localeCompare(b.entitlementId);
      });
    if (candidates.length === 0) return { ok: false, reason: 'entitlement_not_found' };
    const entitlement = candidates[0];
    return {
      ok: true,
      entitlementId: entitlement.entitlementId,
      requester,
      provider,
      providerNodeId: providerId,
      capability: capabilityName,
      mode: entitlement.mode,
      period: entitlement.period,
      periodKey: periodKey(entitlement.period, instant),
      maxRequests: entitlement.maxRequests,
      maxTokens: entitlement.maxTokens,
      billingResponsibility: entitlement.billingResponsibility
    };
  }

  return Object.freeze({
    durable: true,
    createEntitlement,
    suspendEntitlement: (id) => transition(id, 'suspended'),
    resumeEntitlement: (id) => transition(id, 'active'),
    revokeEntitlement,
    resolve,
    snapshot: () => store.read(),
    get revision() { return store.read().revision || 0; }
  });
}
