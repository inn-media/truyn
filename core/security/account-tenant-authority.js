const STATUSES = new Set(['active', 'suspended', 'removed']);
const SCOPE_TYPES = new Set(['account', 'organization', 'tenant']);
const ROLES = new Set(['account-owner', 'org-admin', 'tenant-admin', 'member', 'provider-operator', 'auditor']);
const EXECUTION_ROLES = new Set(['account-owner', 'org-admin', 'tenant-admin', 'member', 'provider-operator']);
const PROVIDER_ROLES = new Set(['account-owner', 'org-admin', 'tenant-admin', 'provider-operator']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizedStatus(value = 'active') {
  const status = String(value || 'active').trim().toLowerCase();
  if (!STATUSES.has(status)) throw new Error(`Unsupported lifecycle status: ${value}`);
  return status;
}

function normalizedRoles(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('membership roles are required');
  const roles = [...new Set(value.map((role) => String(role).trim().toLowerCase()).filter(Boolean))];
  for (const role of roles) if (!ROLES.has(role)) throw new Error(`Unsupported membership role: ${role}`);
  return Object.freeze(roles.sort());
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function lifecycleRecord(record, now) {
  const status = normalizedStatus(record.status);
  return Object.freeze({ ...record, status, updatedAt: now() });
}

export function createAccountTenantAuthority({
  accounts = [],
  organizations = [],
  tenants = [],
  memberships = [],
  nodeBindings = [],
  providerBindings = [],
  now = () => new Date().toISOString()
} = {}) {
  const state = {
    accounts: new Map(),
    organizations: new Map(),
    tenants: new Map(),
    memberships: new Map(),
    nodeBindings: new Map(),
    providerBindings: new Map()
  };
  let revision = 0;

  function write(map, id, record, { allowExisting = false } = {}) {
    const existing = map.get(id);
    if (existing && !allowExisting) throw new Error(`authority object already exists: ${id}`);
    if (existing?.status === 'removed') throw new Error(`removed authority object cannot be reused: ${id}`);
    const stored = lifecycleRecord(record, now);
    map.set(id, stored);
    revision += 1;
    return clone(stored);
  }

  function requireActive(map, id, label) {
    const record = map.get(id);
    if (!record) return { ok: false, reason: `${label}_not_found` };
    if (record.status !== 'active') return { ok: false, reason: `${label}_${record.status}` };
    return { ok: true, record };
  }

  function accountForTenant(tenantId) {
    const tenant = state.tenants.get(tenantId);
    if (!tenant) return null;
    const organization = state.organizations.get(tenant.organizationId);
    if (!organization) return null;
    return state.accounts.get(organization.accountId) || null;
  }

  function hierarchyForTenant(tenantId) {
    const tenantResult = requireActive(state.tenants, tenantId, 'tenant');
    if (!tenantResult.ok) return tenantResult;
    const organizationResult = requireActive(state.organizations, tenantResult.record.organizationId, 'organization');
    if (!organizationResult.ok) return organizationResult;
    const accountResult = requireActive(state.accounts, organizationResult.record.accountId, 'account');
    if (!accountResult.ok) return accountResult;
    return {
      ok: true,
      account: accountResult.record,
      organization: organizationResult.record,
      tenant: tenantResult.record
    };
  }

  function provisionAccount(input = {}) {
    const accountId = requiredString(input.accountId, 'accountId');
    return write(state.accounts, accountId, { accountId, status: normalizedStatus(input.status) });
  }

  function provisionOrganization(input = {}) {
    const organizationId = requiredString(input.organizationId, 'organizationId');
    const accountId = requiredString(input.accountId, 'accountId');
    if (!state.accounts.has(accountId)) throw new Error(`account not found: ${accountId}`);
    return write(state.organizations, organizationId, { organizationId, accountId, status: normalizedStatus(input.status) });
  }

  function provisionTenant(input = {}) {
    const tenantId = requiredString(input.tenantId, 'tenantId');
    const organizationId = requiredString(input.organizationId, 'organizationId');
    if (!state.organizations.has(organizationId)) throw new Error(`organization not found: ${organizationId}`);
    return write(state.tenants, tenantId, { tenantId, organizationId, status: normalizedStatus(input.status) });
  }

  function createMembership(input = {}) {
    const membershipId = requiredString(input.membershipId, 'membershipId');
    const principalId = requiredString(input.principalId, 'principalId');
    const scopeType = requiredString(input.scopeType, 'scopeType').toLowerCase();
    const scopeId = requiredString(input.scopeId, 'scopeId');
    if (!SCOPE_TYPES.has(scopeType)) throw new Error(`Unsupported membership scope: ${scopeType}`);
    const scopeMap = scopeType === 'account' ? state.accounts : scopeType === 'organization' ? state.organizations : state.tenants;
    if (!scopeMap.has(scopeId)) throw new Error(`${scopeType} not found: ${scopeId}`);
    return write(state.memberships, membershipId, {
      membershipId,
      principalId,
      scopeType,
      scopeId,
      roles: normalizedRoles(input.roles),
      status: normalizedStatus(input.status)
    });
  }

  function bindNode(input = {}) {
    const nodeId = requiredString(input.nodeId, 'nodeId');
    const principalId = requiredString(input.principalId, 'principalId');
    const tenantId = requiredString(input.tenantId, 'tenantId');
    if (!state.tenants.has(tenantId)) throw new Error(`tenant not found: ${tenantId}`);
    return write(state.nodeBindings, nodeId, { nodeId, principalId, tenantId, status: normalizedStatus(input.status) });
  }

  function bindProvider(input = {}) {
    const providerNodeId = requiredString(input.providerNodeId, 'providerNodeId');
    const providerId = requiredString(input.providerId || providerNodeId, 'providerId');
    const node = state.nodeBindings.get(providerNodeId);
    if (!node) throw new Error(`provider node binding not found: ${providerNodeId}`);
    const principalId = requiredString(input.principalId || node.principalId, 'principalId');
    const tenantId = requiredString(input.tenantId || node.tenantId, 'tenantId');
    if (principalId !== node.principalId || tenantId !== node.tenantId) throw new Error('provider binding must match its node principal and tenant');
    return write(state.providerBindings, providerNodeId, {
      providerNodeId,
      providerId,
      principalId,
      tenantId,
      status: normalizedStatus(input.status)
    });
  }

  function membershipApplies(membership, hierarchy) {
    if (membership.status !== 'active') return false;
    if (membership.scopeType === 'account') return membership.scopeId === hierarchy.account.accountId;
    if (membership.scopeType === 'organization') return membership.scopeId === hierarchy.organization.organizationId;
    return membership.scopeType === 'tenant' && membership.scopeId === hierarchy.tenant.tenantId;
  }

  function rolesForPrincipal(principalId, hierarchy) {
    const roles = new Set();
    const membershipIds = [];
    for (const membership of state.memberships.values()) {
      if (membership.principalId !== principalId || !membershipApplies(membership, hierarchy)) continue;
      membershipIds.push(membership.membershipId);
      for (const role of membership.roles) roles.add(role);
    }
    return { roles: [...roles].sort(), membershipIds: membershipIds.sort() };
  }

  function resolveNode(nodeId) {
    const bindingResult = requireActive(state.nodeBindings, nodeId, 'node_binding');
    if (!bindingResult.ok) return bindingResult;
    const hierarchy = hierarchyForTenant(bindingResult.record.tenantId);
    if (!hierarchy.ok) return hierarchy;
    const membership = rolesForPrincipal(bindingResult.record.principalId, hierarchy);
    if (membership.roles.length === 0) return { ok: false, reason: 'active_membership_required' };
    return {
      ok: true,
      nodeId,
      principalId: bindingResult.record.principalId,
      accountId: hierarchy.account.accountId,
      organizationId: hierarchy.organization.organizationId,
      tenantId: hierarchy.tenant.tenantId,
      roles: membership.roles,
      membershipIds: membership.membershipIds
    };
  }

  function resolveRequester(nodeId) {
    const resolved = resolveNode(nodeId);
    if (!resolved.ok) return resolved;
    if (!resolved.roles.some((role) => EXECUTION_ROLES.has(role))) return { ok: false, reason: 'requester_role_denied' };
    return { ...resolved, canExecute: true };
  }

  function resolveProvider(providerNodeId) {
    const providerResult = requireActive(state.providerBindings, providerNodeId, 'provider_binding');
    if (!providerResult.ok) return providerResult;
    const node = resolveNode(providerNodeId);
    if (!node.ok) return node;
    if (node.principalId !== providerResult.record.principalId || node.tenantId !== providerResult.record.tenantId) {
      return { ok: false, reason: 'provider_binding_mismatch' };
    }
    if (!node.roles.some((role) => PROVIDER_ROLES.has(role))) return { ok: false, reason: 'provider_role_denied' };
    return {
      ...node,
      providerId: providerResult.record.providerId,
      providerNodeId,
      canProvide: true
    };
  }

  function resolveTenant(tenantId) {
    const hierarchy = hierarchyForTenant(tenantId);
    if (!hierarchy.ok) return hierarchy;
    return {
      ok: true,
      accountId: hierarchy.account.accountId,
      organizationId: hierarchy.organization.organizationId,
      tenantId: hierarchy.tenant.tenantId
    };
  }

  function transition(kind, id, status) {
    const maps = {
      account: state.accounts,
      organization: state.organizations,
      tenant: state.tenants,
      membership: state.memberships,
      node: state.nodeBindings,
      provider: state.providerBindings
    };
    const map = maps[kind];
    if (!map) throw new Error(`Unsupported authority object kind: ${kind}`);
    const key = requiredString(id, `${kind} id`);
    const existing = map.get(key);
    if (!existing) throw new Error(`${kind} not found: ${key}`);
    const next = normalizedStatus(status);
    if (existing.status === 'removed') throw new Error(`removed ${kind} cannot transition`);
    if (next === 'removed' || next === 'active' || next === 'suspended') {
      const updated = lifecycleRecord({ ...existing, status: next }, now);
      map.set(key, updated);
      revision += 1;
      return clone(updated);
    }
    throw new Error(`Unsupported lifecycle status: ${status}`);
  }

  function suspend(kind, id) { return transition(kind, id, 'suspended'); }
  function resume(kind, id) { return transition(kind, id, 'active'); }
  function remove(kind, id) { return transition(kind, id, 'removed'); }

  function setMembershipRoles(membershipId, roles) {
    const existing = state.memberships.get(requiredString(membershipId, 'membershipId'));
    if (!existing) throw new Error(`membership not found: ${membershipId}`);
    if (existing.status === 'removed') throw new Error('removed membership cannot be modified');
    return write(state.memberships, membershipId, { ...existing, roles: normalizedRoles(roles) }, { allowExisting: true });
  }

  function snapshot() {
    const values = (map) => [...map.values()].map(clone).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return Object.freeze({
      version: 1,
      revision,
      accounts: values(state.accounts),
      organizations: values(state.organizations),
      tenants: values(state.tenants),
      memberships: values(state.memberships),
      nodeBindings: values(state.nodeBindings),
      providerBindings: values(state.providerBindings)
    });
  }

  for (const account of accounts) provisionAccount(account);
  for (const organization of organizations) provisionOrganization(organization);
  for (const tenant of tenants) provisionTenant(tenant);
  for (const membership of memberships) createMembership(membership);
  for (const binding of nodeBindings) bindNode(binding);
  for (const binding of providerBindings) bindProvider(binding);

  return Object.freeze({
    provisionAccount,
    provisionOrganization,
    provisionTenant,
    createMembership,
    bindNode,
    bindProvider,
    setMembershipRoles,
    suspend,
    resume,
    remove,
    resolveTenant,
    resolveNode,
    resolveRequester,
    resolveProvider,
    accountForTenant: (tenantId) => clone(accountForTenant(tenantId)),
    snapshot,
    get revision() { return revision; }
  });
}
