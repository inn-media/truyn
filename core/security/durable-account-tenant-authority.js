import { existsSync } from 'node:fs';
import { createAccountTenantAuthority } from './account-tenant-authority.js';
import { createDurableJsonStore } from './durable-json-store.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function seedSnapshot(seed = {}) {
  return {
    version: 1,
    revision: 0,
    accounts: clone(seed.accounts || []),
    organizations: clone(seed.organizations || []),
    tenants: clone(seed.tenants || []),
    memberships: clone(seed.memberships || []),
    nodeBindings: clone(seed.nodeBindings || []),
    providerBindings: clone(seed.providerBindings || [])
  };
}

export function createDurableAccountTenantAuthority({ filePath, seed = {}, now = () => new Date().toISOString() } = {}) {
  const initialAccountTenant = seedSnapshot(seed);
  const store = createDurableJsonStore({
    filePath,
    defaultState: { version: 1, revision: 0, accountTenant: initialAccountTenant }
  });

  if (!existsSync(store.filePath)) {
    store.transaction((state) => {
      state.accountTenant = clone(initialAccountTenant);
      return { initialized: true };
    });
  }

  function hydrate() {
    const state = store.read();
    return createAccountTenantAuthority({ ...(state.accountTenant || seedSnapshot()), now });
  }

  function mutate(method, ...args) {
    return store.transaction((state) => {
      const authority = createAccountTenantAuthority({ ...(state.accountTenant || seedSnapshot()), now });
      const result = authority[method](...args);
      state.accountTenant = authority.snapshot();
      return result;
    }).result;
  }

  const read = (method, ...args) => hydrate()[method](...args);

  return Object.freeze({
    durable: true,
    provisionAccount: (input) => mutate('provisionAccount', input),
    provisionOrganization: (input) => mutate('provisionOrganization', input),
    provisionTenant: (input) => mutate('provisionTenant', input),
    createMembership: (input) => mutate('createMembership', input),
    bindNode: (input) => mutate('bindNode', input),
    bindProvider: (input) => mutate('bindProvider', input),
    setMembershipRoles: (membershipId, roles) => mutate('setMembershipRoles', membershipId, roles),
    suspend: (kind, id) => mutate('suspend', kind, id),
    resume: (kind, id) => mutate('resume', kind, id),
    remove: (kind, id) => mutate('remove', kind, id),
    resolveTenant: (tenantId) => read('resolveTenant', tenantId),
    resolveNode: (nodeId) => read('resolveNode', nodeId),
    resolveRequester: (nodeId) => read('resolveRequester', nodeId),
    resolveProvider: (nodeId) => read('resolveProvider', nodeId),
    accountForTenant: (tenantId) => read('accountForTenant', tenantId),
    snapshot: () => clone(store.read().accountTenant || seedSnapshot()),
    storageSnapshot: () => store.read(),
    get revision() { return store.read().revision || 0; }
  });
}
