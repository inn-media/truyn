const MANAGED_MODES = new Set(['sponsored', 'prepaid', 'subscription']);

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function managedBillingMode(mode) {
  return MANAGED_MODES.has(String(mode || '').trim().toLowerCase());
}

export function createManagedProviderBillingPolicy({ client, providerNodeId, mode } = {}) {
  if (!client || typeof client.reserveBilling !== 'function' || typeof client.reconcileBilling !== 'function') {
    throw new Error('managed provider billing requires authority reserveBilling/reconcileBilling client');
  }
  const providerId = required(providerNodeId, 'managed providerNodeId');
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!managedBillingMode(normalizedMode)) throw new Error(`Unsupported managed provider billing mode: ${mode}`);

  async function authorize(need, { estimatedTokens = null } = {}) {
    try {
      const reservation = await client.reserveBilling({
        providerNodeId: providerId,
        mode: normalizedMode,
        need,
        estimatedTokens
      });
      if (!reservation?.ok) {
        return {
          ok: false,
          mode: normalizedMode,
          managed: true,
          reason: reservation?.reason || 'managed_billing_not_authorized',
          authorityRevision: reservation?.authorityRevision || null,
          authorityStateDigest: reservation?.authorityStateDigest || null
        };
      }
      const reservationId = reservation.accountingReservationId || need?.id;
      if (typeof reservationId !== 'string' || !reservationId) {
        return { ok: false, mode: normalizedMode, managed: true, reason: 'managed_accounting_reservation_missing' };
      }
      return {
        ...reservation,
        managed: true,
        accountingReservationId: reservationId,
        async finalize({ outcome = 'completed', actualTokens = reservation.reservedTokens || 0, reason = null } = {}) {
          try {
            return await client.reconcileBilling({ reservationId, outcome, actualTokens, reason });
          } catch {
            return { ok: false, reason: 'accounting_reconcile_unavailable' };
          }
        }
      };
    } catch {
      return { ok: false, mode: normalizedMode, managed: true, reason: 'managed_authority_unavailable' };
    }
  }

  return Object.freeze({
    mode: normalizedMode,
    managed: true,
    sponsoredAccess: normalizedMode === 'sponsored',
    authorize
  });
}
