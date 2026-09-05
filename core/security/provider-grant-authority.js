import { createDurableJsonStore } from './durable-json-store.js';

const MODES = new Set(['self', 'private', 'shared', 'network']);
const SUBJECT_TYPES = new Set(['node', 'principal', 'tenant', 'organization', 'account']);
const STATUSES = new Set(['active', 'suspended', 'removed']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizedMode(value) {
  const mode = requiredString(value, 'provider access mode').toLowerCase();
  if (!MODES.has(mode)) throw new Error(`Unsupported provider access mode: ${value}`);
  return mode;
}

function normalizedStatus(value = 'active') {
  const status = String(value || 'active').trim().toLowerCase();
  if (!STATUSES.has(status)) throw new Error(`Unsupported provider policy status: ${value}`);
  return status;
}

function normalizeCapabilities(value = ['*']) {
  const items = Array.isArray(value) ? value : [value];
  const capabilities = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  if (capabilities.length === 0) capabilities.push('*');
  return capabilities.sort();
}

function capabilityMatches(grant, capability) {
  return grant.capabilities.includes('*') || grant.capabilities.includes(capability);
}

function subjectMatches(grant, requester) {
  if (grant.subjectType === 'node') return grant.subjectId === requester.nodeId;
  if (grant.subjectType === 'principal') return grant.subjectId === requester.principalId;
  if (grant.subjectType === 'tenant') return grant.subjectId === requester.tenantId;
  if (grant.subjectType === 'organization') return grant.subjectId === requester.organizationId;
  if (grant.subjectType === 'account') return grant.subjectId === requester.accountId;
  return false;
}

export function createProviderGrantAuthority({
  filePath,
  accountTenantAuthority,
  revocationAuthority = null,
  nowMs = () => Date.now()
} = {}) {
  if (!accountTenantAuthority || typeof accountTenantAuthority.resolveRequester !== 'function' || typeof accountTenantAuthority.resolveProvider !== 'function') {
    throw new Error('provider grant authority requires accountTenantAuthority');
  }
  const store = createDurableJsonStore({
    filePath,
    defaultState: { version: 1, revision: 0, providerPolicies: {}, grants: {} },
    nowMs
  });

  function revoked(kind, id) {
    if (!revocationAuthority || !id) return false;
    try { return revocationAuthority.isRevoked(kind, id); } catch { return true; }
  }

  function authorityContext(providerNodeId, requesterNodeId) {
    let provider;
    let requester;
    try {
      provider = accountTenantAuthority.resolveProvider(providerNodeId);
      requester = accountTenantAuthority.resolveRequester(requesterNodeId);
    } catch {
      return { ok: false, reason: 'account_tenant_authority_unavailable' };
    }
    if (!provider?.ok) return { ok: false, reason: provider?.reason || 'provider_authority_denied' };
    if (!requester?.ok) return { ok: false, reason: requester?.reason || 'requester_authority_denied' };

    const checks = [
      ['provider', provider.providerNodeId],
      ['node', provider.providerNodeId],
      ['principal', provider.principalId],
      ['tenant', provider.tenantId],
      ['organization', provider.organizationId],
      ['account', provider.accountId],
      ['node', requester.nodeId],
      ['principal', requester.principalId],
      ['tenant', requester.tenantId],
      ['organization', requester.organizationId],
      ['account', requester.accountId]
    ];
    for (const [kind, id] of checks) {
      if (revoked(kind, id)) return { ok: false, reason: `${kind}_revoked` };
    }
    return { ok: true, provider, requester };
  }

  function setProviderPolicy({ providerNodeId, mode, status = 'active' } = {}) {
    const nodeId = requiredString(providerNodeId, 'providerNodeId');
    const nextMode = normalizedMode(mode);
    const nextStatus = normalizedStatus(status);
    return store.transaction((state) => {
      state.providerPolicies ||= {};
      const existing = state.providerPolicies[nodeId];
      if (existing?.status === 'removed') throw new Error('removed provider policy cannot be reused');
      const record = {
        providerNodeId: nodeId,
        mode: nextMode,
        status: nextStatus,
        updatedAt: new Date(nowMs()).toISOString()
      };
      state.providerPolicies[nodeId] = record;
      return record;
    }).result;
  }

  function transitionProviderPolicy(providerNodeId, status) {
    const nodeId = requiredString(providerNodeId, 'providerNodeId');
    const nextStatus = normalizedStatus(status);
    return store.transaction((state) => {
      state.providerPolicies ||= {};
      const existing = state.providerPolicies[nodeId];
      if (!existing) throw new Error(`provider policy not found: ${nodeId}`);
      if (existing.status === 'removed') throw new Error('removed provider policy cannot transition');
      const record = { ...existing, status: nextStatus, updatedAt: new Date(nowMs()).toISOString() };
      state.providerPolicies[nodeId] = record;
      return record;
    }).result;
  }

  function createGrant({ grantId, providerNodeId, subjectType, subjectId, capabilities = ['*'], expiresAt = null } = {}) {
    const id = requiredString(grantId, 'grantId');
    const provider = requiredString(providerNodeId, 'providerNodeId');
    const type = requiredString(subjectType, 'grant subjectType').toLowerCase();
    if (!SUBJECT_TYPES.has(type)) throw new Error(`Unsupported grant subject type: ${subjectType}`);
    const subject = requiredString(subjectId, 'grant subjectId');
    const capabilityList = normalizeCapabilities(capabilities);
    if (expiresAt != null && !Number.isFinite(Date.parse(expiresAt))) throw new Error('grant expiresAt must be a valid timestamp');
    return store.transaction((state) => {
      state.grants ||= {};
      if (state.grants[id]) throw new Error(`grant already exists: ${id}`);
      const record = {
        grantId: id,
        providerNodeId: provider,
        subjectType: type,
        subjectId: subject,
        capabilities: capabilityList,
        expiresAt,
        status: 'active',
        createdAt: new Date(nowMs()).toISOString(),
        updatedAt: new Date(nowMs()).toISOString()
      };
      state.grants[id] = record;
      return record;
    }).result;
  }

  function transitionGrant(grantId, status) {
    const id = requiredString(grantId, 'grantId');
    if (!['active', 'suspended'].includes(status)) throw new Error(`Unsupported grant transition: ${status}`);
    return store.transaction((state) => {
      state.grants ||= {};
      const existing = state.grants[id];
      if (!existing) throw new Error(`grant not found: ${id}`);
      if (existing.status === 'revoked') throw new Error('revoked grant cannot transition');
      const record = { ...existing, status, updatedAt: new Date(nowMs()).toISOString() };
      state.grants[id] = record;
      return record;
    }).result;
  }

  function revokeGrant(grantId, { reason = 'grant_revoked' } = {}) {
    const id = requiredString(grantId, 'grantId');
    const record = store.transaction((state) => {
      state.grants ||= {};
      const existing = state.grants[id];
      if (!existing) throw new Error(`grant not found: ${id}`);
      if (existing.status === 'revoked') return existing;
      const next = { ...existing, status: 'revoked', revokedAt: new Date(nowMs()).toISOString(), updatedAt: new Date(nowMs()).toISOString() };
      state.grants[id] = next;
      return next;
    }).result;
    if (revocationAuthority && !revocationAuthority.isRevoked('grant', id)) {
      revocationAuthority.revoke('grant', id, { reason });
    }
    return record;
  }

  function getProviderPolicy(providerNodeId) {
    const id = requiredString(providerNodeId, 'providerNodeId');
    return structuredClone(store.read().providerPolicies?.[id] || null);
  }

  function authorize({ providerNodeId, requesterNodeId, capability = '*' } = {}) {
    const provider = requiredString(providerNodeId, 'providerNodeId');
    const requester = requiredString(requesterNodeId, 'requesterNodeId');
    const capabilityName = requiredString(capability, 'capability');
    const context = authorityContext(provider, requester);
    if (!context.ok) return context;

    let state;
    try { state = store.read(); } catch { return { ok: false, reason: 'provider_grant_state_unavailable' }; }
    const policy = state.providerPolicies?.[provider];
    if (!policy) return { ok: false, reason: 'provider_policy_not_found' };
    if (policy.status !== 'active') return { ok: false, reason: `provider_policy_${policy.status}` };

    if (policy.mode === 'self') {
      return context.provider.principalId === context.requester.principalId
        ? { ok: true, mode: 'self', provider: context.provider, requester: context.requester }
        : { ok: false, reason: 'self_scope_required' };
    }
    if (policy.mode === 'private') {
      return context.provider.tenantId === context.requester.tenantId
        ? { ok: true, mode: 'private', provider: context.provider, requester: context.requester }
        : { ok: false, reason: 'private_tenant_scope_required' };
    }
    if (policy.mode === 'network') {
      return { ok: true, mode: 'network', provider: context.provider, requester: context.requester };
    }
    if (policy.mode !== 'shared') return { ok: false, reason: 'unsupported_provider_policy_mode' };

    const now = nowMs();
    const candidates = Object.values(state.grants || {})
      .filter((grant) =>
        grant.providerNodeId === provider &&
        grant.status === 'active' &&
        !revoked('grant', grant.grantId) &&
        (!grant.expiresAt || Date.parse(grant.expiresAt) > now) &&
        capabilityMatches(grant, capabilityName) &&
        subjectMatches(grant, context.requester)
      )
      .sort((a, b) => a.grantId.localeCompare(b.grantId));
    if (candidates.length === 0) return { ok: false, reason: 'shared_grant_required' };
    return {
      ok: true,
      mode: 'shared',
      grantId: candidates[0].grantId,
      provider: context.provider,
      requester: context.requester
    };
  }

  return Object.freeze({
    durable: true,
    setProviderPolicy,
    suspendProviderPolicy: (providerNodeId) => transitionProviderPolicy(providerNodeId, 'suspended'),
    resumeProviderPolicy: (providerNodeId) => transitionProviderPolicy(providerNodeId, 'active'),
    removeProviderPolicy: (providerNodeId) => transitionProviderPolicy(providerNodeId, 'removed'),
    createGrant,
    suspendGrant: (grantId) => transitionGrant(grantId, 'suspended'),
    resumeGrant: (grantId) => transitionGrant(grantId, 'active'),
    revokeGrant,
    getProviderPolicy,
    authorize,
    visibleToRequester: (input) => authorize(input),
    snapshot: () => store.read(),
    get revision() { return store.read().revision || 0; }
  });
}
