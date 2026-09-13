const PUBLIC_MODES = new Set(['byok', 'owner-funded']);

export function createProviderBillingPolicy({ mode = 'owner-funded' } = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  if (!PUBLIC_MODES.has(normalizedMode)) {
    throw new Error(`Unsupported public provider billing mode: ${mode}; non-public commercial modes require a compatible managed platform`);
  }

  function authorize(need, { accessPolicy } = {}) {
    const requesterId = need?.from || null;
    if (!requesterId) return { ok: false, mode: normalizedMode, reason: 'missing_requester_identity' };
    if (!accessPolicy || typeof accessPolicy.authorize !== 'function') {
      return { ok: false, mode: normalizedMode, reason: 'missing_access_policy' };
    }
    const access = accessPolicy.authorize(need);
    if (!access?.ok) return { ok: false, mode: normalizedMode, reason: 'provider_access_denied' };

    if (normalizedMode === 'byok' && accessPolicy.mode !== 'owner-only') {
      return { ok: false, mode: normalizedMode, reason: 'byok_provider_must_be_private' };
    }
    if (normalizedMode === 'owner-funded' && accessPolicy.mode !== 'owner-only') {
      return { ok: false, mode: normalizedMode, reason: 'owner_paid_external_access_disabled' };
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
    sponsoredAccess: false,
    freeDailyRequests: 0,
    freeDailyTokens: 0,
    authorize
  });
}
