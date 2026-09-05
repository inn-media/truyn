let configuredAccountTenantAuthority = null;
let configuredProviderGrantAuthority = null;

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function normalizedAccessMode(value) {
  return String(value || 'owner-only').trim().toLowerCase() === 'public' ? 'public' : 'owner-only';
}

export function configureRelayAccountTenantAuthority(authority = null) {
  if (authority != null && (
    typeof authority.resolveRequester !== 'function' ||
    typeof authority.resolveProvider !== 'function'
  )) {
    throw new Error('account tenant authority must expose resolveRequester() and resolveProvider()');
  }
  const previous = configuredAccountTenantAuthority;
  configuredAccountTenantAuthority = authority;
  return previous;
}

export function configureRelayProviderGrantAuthority(authority = null) {
  if (authority != null && (
    authority.durable !== true ||
    typeof authority.authorize !== 'function' ||
    typeof authority.getProviderPolicy !== 'function'
  )) {
    throw new Error('provider grant authority must be durable and expose authorize() / getProviderPolicy()');
  }
  const previous = configuredProviderGrantAuthority;
  configuredProviderGrantAuthority = authority;
  return previous;
}

export function providerPolicyFromOffer(envelope) {
  const providerNodeId = envelope?.from;
  if (typeof providerNodeId !== 'string' || providerNodeId.length === 0) {
    throw new Error('Provider OFFER requires a signed provider identity');
  }

  const metadata = envelope?.payload?.metadata && typeof envelope.payload.metadata === 'object'
    ? envelope.payload.metadata
    : {};
  const capability = envelope?.payload?.capability?.name || envelope?.payload?.capability || '*';
  const durableAuthorityEnabled = Boolean(configuredProviderGrantAuthority);
  const legacyAccessMode = normalizedAccessMode(metadata.accessMode);
  const policy = {
    providerNodeId,
    ownerNodeId: providerNodeId,
    capability,
    accessMode: durableAuthorityEnabled ? 'authority' : legacyAccessMode,
    visibility: durableAuthorityEnabled ? 'authority' : (legacyAccessMode === 'public' ? 'network' : 'private'),
    // Once durable authority is configured, provider-signed allowlists are deliberately ignored.
    allowedRequesterIds: durableAuthorityEnabled ? [] : (legacyAccessMode === 'owner-only' ? normalizeIds(metadata.allowedRequesterIds) : [])
  };
  if (configuredAccountTenantAuthority) {
    Object.defineProperty(policy, 'accountTenantAuthority', {
      value: configuredAccountTenantAuthority,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  if (configuredProviderGrantAuthority) {
    Object.defineProperty(policy, 'providerGrantAuthority', {
      value: configuredProviderGrantAuthority,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return Object.freeze(policy);
}

function authoritativeContexts(policy, requesterNodeId) {
  const authority = policy?.accountTenantAuthority;
  if (!authority) return null;
  let requester;
  let provider;
  try {
    requester = authority.resolveRequester(requesterNodeId);
    provider = authority.resolveProvider(policy.providerNodeId);
  } catch {
    return { ok: false };
  }
  if (!requester?.ok || !provider?.ok) return { ok: false };
  return { ok: true, requester, provider };
}

export function providerPolicyAllowsRequester(policy, requesterNodeId, { trustedRequesterNodeIds = [] } = {}) {
  if (!policy || typeof requesterNodeId !== 'string' || requesterNodeId.length === 0) return false;

  // Production path: all grants come from server-side durable policy state.
  // Provider-signed accessMode/allowedRequesterIds metadata cannot broaden this decision.
  const grantAuthority = policy.providerGrantAuthority;
  if (grantAuthority) {
    try {
      return grantAuthority.authorize({
        providerNodeId: policy.providerNodeId,
        requesterNodeId,
        capability: policy.capability || '*'
      })?.ok === true;
    } catch {
      return false;
    }
  }

  // Compatibility path for deployments that have not enabled durable grant authority yet.
  const authority = authoritativeContexts(policy, requesterNodeId);
  if (authority && !authority.ok) return false;

  if (policy.accessMode === 'public') return true;
  if (policy.accessMode !== 'owner-only') return false;

  const allowed = new Set(normalizeIds(policy.allowedRequesterIds));
  const trusted = new Set(normalizeIds(trustedRequesterNodeIds));
  return allowed.has(requesterNodeId) || trusted.has(requesterNodeId);
}

export function providerPolicyVisibleToRequester(policy, requesterNodeId, options = {}) {
  return providerPolicyAllowsRequester(policy, requesterNodeId, options);
}

export function publicProviderPolicy(policy) {
  if (!policy) return null;
  if (policy.providerGrantAuthority) {
    try {
      const durablePolicy = policy.providerGrantAuthority.getProviderPolicy(policy.providerNodeId);
      if (!durablePolicy) return { accessMode: 'authority', visibility: 'unconfigured' };
      return {
        accessMode: durablePolicy.mode,
        visibility: durablePolicy.mode,
        authorityRevision: policy.providerGrantAuthority.revision
      };
    } catch {
      return { accessMode: 'authority', visibility: 'unavailable' };
    }
  }
  return {
    accessMode: policy.accessMode,
    visibility: policy.visibility
  };
}
