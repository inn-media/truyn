const SUPPORTED_MODES = new Set(['byok', 'owner-funded', 'sponsored', 'prepaid', 'subscription']);

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createProviderBillingPolicy({
  mode = 'owner-funded',
  providerNodeId = null,
  sponsoredAccess = false,
  freeDailyRequests = 0,
  freeDailyTokens = 0,
  signedEntitlementVerifier = null,
  sponsoredUsageStore = null,
  entitlementAuthority = null,
  accountingAuthority = null,
  now = () => new Date()
} = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  if (!SUPPORTED_MODES.has(normalizedMode)) throw new Error(`Unsupported provider billing mode: ${mode}`);

  const requestLimit = nonNegativeInteger(freeDailyRequests);
  const tokenLimit = nonNegativeInteger(freeDailyTokens);
  const authorityBillingConfigured = Boolean(entitlementAuthority || accountingAuthority);

  if (authorityBillingConfigured) {
    if (!entitlementAuthority || entitlementAuthority.durable !== true || typeof entitlementAuthority.resolve !== 'function') {
      throw new Error('Authority billing requires a durable entitlement authority');
    }
    if (!accountingAuthority || accountingAuthority.durable !== true || typeof accountingAuthority.reserve !== 'function' || typeof accountingAuthority.reconcile !== 'function') {
      throw new Error('Authority billing requires a durable accounting authority');
    }
  }

  if (sponsoredAccess && normalizedMode !== 'sponsored') {
    throw new Error('sponsoredAccess may only be enabled with sponsored billing mode');
  }
  if (normalizedMode === 'sponsored' && sponsoredAccess && !authorityBillingConfigured) {
    if (typeof signedEntitlementVerifier !== 'function') {
      throw new Error('Sponsored access requires a signed entitlement verifier');
    }
    if (!sponsoredUsageStore || sponsoredUsageStore.durable !== true || typeof sponsoredUsageStore.reserve !== 'function') {
      throw new Error('Sponsored access requires an atomic durable usage store');
    }
  }

  function authorityAuthorize(need, requesterId, estimatedTokens) {
    if (!authorityBillingConfigured) return null;
    if (!providerNodeId || typeof providerNodeId !== 'string') {
      return { ok: false, mode: normalizedMode, reason: 'provider_identity_required_for_entitlement' };
    }
    const capability = need?.payload?.capability?.name || need?.payload?.capability;
    if (!capability || typeof capability !== 'string') {
      return { ok: false, mode: normalizedMode, reason: 'billing_capability_required' };
    }
    if (!Number.isInteger(estimatedTokens) || estimatedTokens <= 0) {
      return { ok: false, mode: normalizedMode, reason: 'billing_token_estimate_required' };
    }
    if (!need?.id || typeof need.id !== 'string') {
      return { ok: false, mode: normalizedMode, reason: 'accounting_reservation_id_required' };
    }

    let entitlement;
    try {
      entitlement = entitlementAuthority.resolve({
        requesterNodeId: requesterId,
        providerNodeId,
        capability,
        mode: normalizedMode
      });
    } catch {
      return { ok: false, mode: normalizedMode, reason: 'entitlement_authority_unavailable' };
    }
    if (!entitlement?.ok) {
      return { ok: false, mode: normalizedMode, reason: entitlement?.reason || 'entitlement_not_found' };
    }

    let reservation;
    try {
      reservation = accountingAuthority.reserve({
        reservationId: need.id,
        entitlementId: entitlement.entitlementId,
        actorId: requesterId,
        providerNodeId,
        periodKey: entitlement.periodKey,
        maxRequests: entitlement.maxRequests,
        maxTokens: entitlement.maxTokens,
        estimatedTokens
      });
    } catch {
      return { ok: false, mode: normalizedMode, reason: 'accounting_authority_unavailable' };
    }
    if (!reservation?.ok) {
      return { ok: false, mode: normalizedMode, reason: reservation?.reason || 'accounting_reservation_denied' };
    }

    return {
      ok: true,
      mode: normalizedMode,
      requesterId,
      entitlementId: entitlement.entitlementId,
      accountingReservationId: need.id,
      billingResponsibility: entitlement.billingResponsibility,
      reservedTokens: estimatedTokens,
      remainingRequests: reservation.remainingRequests,
      remainingTokens: reservation.remainingTokens,
      finalize({ outcome = 'completed', actualTokens = estimatedTokens, reason = null } = {}) {
        try {
          return accountingAuthority.reconcile({ reservationId: need.id, outcome, actualTokens, reason });
        } catch {
          return { ok: false, reason: 'accounting_reconcile_unavailable' };
        }
      }
    };
  }

  function authorize(need, { accessPolicy, estimatedTokens = null } = {}) {
    const requesterId = need?.from || null;
    if (!requesterId) return { ok: false, mode: normalizedMode, reason: 'missing_requester_identity' };
    if (!accessPolicy || typeof accessPolicy.authorize !== 'function') {
      return { ok: false, mode: normalizedMode, reason: 'missing_access_policy' };
    }
    const access = accessPolicy.authorize(need);
    if (!access?.ok) return { ok: false, mode: normalizedMode, reason: 'provider_access_denied' };

    if (normalizedMode === 'byok') {
      if (accessPolicy.mode !== 'owner-only') {
        return { ok: false, mode: normalizedMode, reason: 'byok_provider_must_be_private' };
      }
      return {
        ok: true,
        mode: normalizedMode,
        requesterId,
        billingResponsibility: 'provider-owner'
      };
    }

    if (normalizedMode === 'owner-funded') {
      if (accessPolicy.mode !== 'owner-only') {
        return { ok: false, mode: normalizedMode, reason: 'owner_paid_external_access_disabled' };
      }
      return {
        ok: true,
        mode: normalizedMode,
        requesterId,
        billingResponsibility: 'provider-owner'
      };
    }

    if (authorityBillingConfigured) return authorityAuthorize(need, requesterId, estimatedTokens);

    if (normalizedMode === 'prepaid' || normalizedMode === 'subscription') {
      return { ok: false, mode: normalizedMode, reason: 'entitlement_resolver_unavailable' };
    }

    if (!sponsoredAccess) return { ok: false, mode: normalizedMode, reason: 'sponsored_access_disabled' };
    if (requestLimit <= 0 || tokenLimit <= 0) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_quota_zero' };
    }
    if (!Number.isInteger(estimatedTokens) || estimatedTokens <= 0) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_token_estimate_required' };
    }

    const token = need?.payload?.policy?.billing?.entitlement;
    if (typeof token !== 'string' || !token) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_required' };
    }

    let claims = null;
    try {
      claims = signedEntitlementVerifier(token);
    } catch {}
    if (!claims) return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_invalid' };
    if (claims.actorId !== requesterId) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_actor_mismatch' };
    }

    const expiresAtMs = Date.parse(claims.expiresAt || '');
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now().getTime()) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_expired' };
    }
    if (typeof claims.entitlementId !== 'string' || !claims.entitlementId.trim()) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_invalid' };
    }

    const claimRequestLimit = positiveInteger(claims.maxDailyRequests);
    const claimTokenLimit = positiveInteger(claims.maxDailyTokens);
    if (!claimRequestLimit || !claimTokenLimit) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_entitlement_invalid' };
    }

    const effectiveRequestLimit = Math.min(requestLimit, claimRequestLimit);
    const effectiveTokenLimit = Math.min(tokenLimit, claimTokenLimit);
    let reservation;
    try {
      reservation = sponsoredUsageStore.reserve({
        actorId: requesterId,
        entitlementId: claims.entitlementId,
        day: utcDayKey(now()),
        requestLimit: effectiveRequestLimit,
        tokenLimit: effectiveTokenLimit,
        estimatedTokens
      });
    } catch {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_usage_store_unavailable' };
    }
    if (!reservation?.ok) {
      return {
        ok: false,
        mode: normalizedMode,
        reason: reservation?.reason || 'sponsored_quota_exhausted'
      };
    }

    return {
      ok: true,
      mode: normalizedMode,
      requesterId,
      entitlementId: claims.entitlementId,
      billingResponsibility: 'provider-owner-sponsored',
      reservedTokens: estimatedTokens,
      remainingRequests: nonNegativeInteger(reservation.remainingRequests),
      remainingTokens: nonNegativeInteger(reservation.remainingTokens)
    };
  }

  return {
    mode: normalizedMode,
    sponsoredAccess: Boolean(sponsoredAccess),
    freeDailyRequests: requestLimit,
    freeDailyTokens: tokenLimit,
    authorize
  };
}
