export const TRUYN_PLATFORM_CONTRACT_VERSION = 1;

function requiredFunction(target, name, label) {
  if (!target || typeof target[name] !== 'function') {
    throw new Error(`${label} requires ${name}()`);
  }
}

function requiredBoolean(value, label) {
  if (value !== true && value !== false) throw new Error(`${label} must be boolean`);
  return value;
}

export function assertAuthorityHttpClient(client, { requireAdmin = false } = {}) {
  for (const name of ['snapshot', 'authorizeAccess', 'reserveBilling', 'reconcileBilling']) {
    requiredFunction(client, name, 'authority client');
  }
  if (requireAdmin) requiredFunction(client, 'adminMutate', 'authority client');
  return client;
}

export function assertAccountTenantAuthority(authority) {
  requiredFunction(authority, 'resolveRequester', 'account/tenant authority');
  requiredFunction(authority, 'resolveProvider', 'account/tenant authority');
  return authority;
}

export function assertProviderGrantAuthority(authority) {
  requiredFunction(authority, 'authorize', 'provider grant authority');
  requiredFunction(authority, 'visibleToRequester', 'provider grant authority');
  requiredFunction(authority, 'getProviderPolicy', 'provider grant authority');
  return authority;
}

export function assertEntitlementAuthority(authority) {
  requiredFunction(authority, 'resolve', 'entitlement authority');
  requiredBoolean(authority.durable, 'entitlement authority durable');
  if (authority.durable !== true) throw new Error('entitlement authority must be durable');
  return authority;
}

export function assertAccountingAuthority(authority) {
  requiredFunction(authority, 'reserve', 'accounting authority');
  requiredFunction(authority, 'reconcile', 'accounting authority');
  requiredBoolean(authority.durable, 'accounting authority durable');
  if (authority.durable !== true) throw new Error('accounting authority must be durable');
  return authority;
}

export function assertRelayAuthorityRuntime(runtime) {
  requiredFunction(runtime, 'status', 'relay authority runtime');
  requiredFunction(runtime, 'stop', 'relay authority runtime');
  assertAccountTenantAuthority(runtime.accountTenantAuthority);
  assertProviderGrantAuthority(runtime.providerGrantAuthority);
  return runtime;
}

export function normalizeAuthorityDecision(value, { defaultReason = 'authority_denied' } = {}) {
  if (!value || typeof value !== 'object') return { ok: false, reason: defaultReason };
  if (value.ok === true) return { ...value, ok: true };
  return {
    ...value,
    ok: false,
    reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason : defaultReason
  };
}

export function createFailClosedAuthorityAdapter({
  accountTenantAuthority,
  providerGrantAuthority,
  status = () => ({ ready: true })
} = {}) {
  assertAccountTenantAuthority(accountTenantAuthority);
  assertProviderGrantAuthority(providerGrantAuthority);
  if (typeof status !== 'function') throw new Error('authority adapter requires status()');

  return Object.freeze({
    accountTenantAuthority,
    providerGrantAuthority,
    status() {
      const current = status();
      if (!current || current.ready !== true) {
        return { ready: false, reason: current?.reason || 'authority_not_ready' };
      }
      return { ...current, ready: true };
    },
    stop() {}
  });
}
