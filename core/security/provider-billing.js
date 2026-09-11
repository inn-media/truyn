const LOCAL_MODES = new Set(['byok', 'owner-funded']);
const MANAGED_MODES = new Set(['sponsored', 'prepaid', 'subscription']);
const SUPPORTED_MODES = new Set([...LOCAL_MODES, ...MANAGED_MODES]);

export function managedProviderBillingMode(mode) {
  return MANAGED_MODES.has(String(mode || '').trim().toLowerCase());
}

export function createProviderBillingPolicy({ mode = 'owner-funded' } = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  if (!SUPPORTED_MODES.has(normalizedMode)) throw new Error(`Unsupported provider billing mode: ${mode}`);

  function authorize(need, { accessPolicy } = {}) {
    const requesterId = need?.from || null;
    if (!requesterId) return { ok: false, mode: normalizedMode, reason: 'missing_requester_identity' };
    if (!accessPolicy || typeof accessPolicy.authorize !== 'function') {
      return { ok: false, mode: normalizedMode, reason: 'missing_access_policy' };
    }
    const access = accessPolicy.authorize(need);
    if (!access?.ok) return { ok: false, mode: normalizedMode, reason: 'provider_access_denied' };

    if (managedProviderBillingMode(normalizedMode)) {
      return {
        ok: false,
        mode: normalizedMode,
        managed: true,
        reason: 'managed_billing_requires_platform'
      };
    }

    if (accessPolicy.mode !== 'owner-only') {
      return {
        ok: false,
        mode: normalizedMode,
        reason: normalizedMode === 'byok'
          ? 'byok_provider_must_be_private'
          : 'owner_paid_external_access_disabled'
      };
    }

    return {
      ok: true,
      mode: normalizedMode,
      requesterId,
      billingResponsibility: 'provider-owner'
    };
  }

  return Object.freeze({
    mode: normalizedMode,
    managed: managedProviderBillingMode(normalizedMode),
    sponsoredAccess: false,
    freeDailyRequests: 0,
    freeDailyTokens: 0,
    authorize
  });
}
