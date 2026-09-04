import { createDurableJsonStore } from './durable-json-store.js';

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function limitOrNull(value, label) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer or null`);
  return number;
}

function remaining(limit, committed, reserved) {
  if (limit == null) return null;
  return Math.max(0, limit - committed - reserved);
}

export function createDurableAccountingAuthority({ filePath, now = () => new Date().toISOString() } = {}) {
  const store = createDurableJsonStore({
    filePath,
    defaultState: { version: 1, revision: 0, ledgers: {}, reservations: {} }
  });

  function reserve({
    reservationId,
    entitlementId,
    actorId,
    providerNodeId,
    periodKey,
    maxRequests = null,
    maxTokens = null,
    estimatedTokens
  } = {}) {
    const id = requiredString(reservationId, 'reservationId');
    const entitlement = requiredString(entitlementId, 'entitlementId');
    const actor = requiredString(actorId, 'actorId');
    const provider = requiredString(providerNodeId, 'providerNodeId');
    const period = requiredString(periodKey, 'periodKey');
    const requestLimit = limitOrNull(maxRequests, 'maxRequests');
    const tokenLimit = limitOrNull(maxTokens, 'maxTokens');
    const tokens = nonNegativeInteger(estimatedTokens, 'estimatedTokens');
    const ledgerKey = `${entitlement}:${period}`;

    return store.transaction((state) => {
      state.ledgers ||= {};
      state.reservations ||= {};
      const existing = state.reservations[id];
      if (existing) {
        const same = existing.entitlementId === entitlement && existing.actorId === actor && existing.providerNodeId === provider && existing.periodKey === period && existing.estimatedTokens === tokens;
        if (!same) return { ok: false, reason: 'reservation_id_conflict' };
        const ledger = state.ledgers[ledgerKey] || { committedRequests: 0, committedTokens: 0, reservedRequests: 0, reservedTokens: 0 };
        return {
          ok: existing.status === 'reserved' || existing.status === 'committed',
          idempotent: true,
          status: existing.status,
          quotaOverrun: Boolean(existing.quotaOverrun),
          reservationId: id,
          remainingRequests: remaining(existing.maxRequests, ledger.committedRequests, ledger.reservedRequests),
          remainingTokens: remaining(existing.maxTokens, ledger.committedTokens, ledger.reservedTokens)
        };
      }

      const ledger = state.ledgers[ledgerKey] || {
        entitlementId: entitlement,
        periodKey: period,
        committedRequests: 0,
        committedTokens: 0,
        reservedRequests: 0,
        reservedTokens: 0,
        quotaOverruns: 0
      };
      if (requestLimit != null && ledger.committedRequests + ledger.reservedRequests + 1 > requestLimit) {
        return { ok: false, reason: 'request_quota_exhausted' };
      }
      if (tokenLimit != null && ledger.committedTokens + ledger.reservedTokens + tokens > tokenLimit) {
        return { ok: false, reason: 'token_quota_exhausted' };
      }

      ledger.reservedRequests += 1;
      ledger.reservedTokens += tokens;
      state.ledgers[ledgerKey] = ledger;
      state.reservations[id] = {
        reservationId: id,
        entitlementId: entitlement,
        actorId: actor,
        providerNodeId: provider,
        periodKey: period,
        ledgerKey,
        maxRequests: requestLimit,
        maxTokens: tokenLimit,
        estimatedTokens: tokens,
        status: 'reserved',
        createdAt: now(),
        updatedAt: now()
      };
      return {
        ok: true,
        status: 'reserved',
        reservationId: id,
        remainingRequests: remaining(requestLimit, ledger.committedRequests, ledger.reservedRequests),
        remainingTokens: remaining(tokenLimit, ledger.committedTokens, ledger.reservedTokens)
      };
    }).result;
  }

  function commit({ reservationId, actualTokens } = {}) {
    const id = requiredString(reservationId, 'reservationId');
    const tokens = nonNegativeInteger(actualTokens, 'actualTokens');
    return store.transaction((state) => {
      state.ledgers ||= {};
      state.reservations ||= {};
      const reservation = state.reservations[id];
      if (!reservation) return { ok: false, reason: 'reservation_not_found' };
      if (reservation.status === 'committed') {
        if (reservation.actualTokens !== tokens) return { ok: false, reason: 'commit_idempotency_conflict' };
        return {
          ok: !reservation.quotaOverrun,
          idempotent: true,
          status: 'committed',
          reservationId: id,
          quotaOverrun: Boolean(reservation.quotaOverrun),
          reason: reservation.quotaOverrun ? 'actual_token_quota_exceeded' : undefined
        };
      }
      if (reservation.status !== 'reserved') return { ok: false, reason: `reservation_${reservation.status}` };
      const ledger = state.ledgers[reservation.ledgerKey];
      if (!ledger) return { ok: false, reason: 'ledger_not_found' };

      const otherReservedTokens = Math.max(0, ledger.reservedTokens - reservation.estimatedTokens);
      const quotaOverrun = reservation.maxTokens != null && ledger.committedTokens + otherReservedTokens + tokens > reservation.maxTokens;

      // Actual provider usage is an accounting fact even when it violated the reserved/entitled ceiling.
      // Persist it, mark the safety violation, and let every later reservation see the exhausted ledger.
      ledger.reservedRequests = Math.max(0, ledger.reservedRequests - 1);
      ledger.reservedTokens = Math.max(0, ledger.reservedTokens - reservation.estimatedTokens);
      ledger.committedRequests += 1;
      ledger.committedTokens += tokens;
      if (quotaOverrun) ledger.quotaOverruns = (ledger.quotaOverruns || 0) + 1;
      reservation.status = 'committed';
      reservation.actualTokens = tokens;
      reservation.quotaOverrun = quotaOverrun;
      reservation.committedAt = now();
      reservation.updatedAt = now();
      return {
        ok: !quotaOverrun,
        status: 'committed',
        reservationId: id,
        quotaOverrun,
        accounted: true,
        reason: quotaOverrun ? 'actual_token_quota_exceeded' : undefined,
        remainingRequests: remaining(reservation.maxRequests, ledger.committedRequests, ledger.reservedRequests),
        remainingTokens: remaining(reservation.maxTokens, ledger.committedTokens, ledger.reservedTokens)
      };
    }).result;
  }

  function release(reservationId, { reason = 'execution_not_committed' } = {}) {
    const id = requiredString(reservationId, 'reservationId');
    return store.transaction((state) => {
      state.ledgers ||= {};
      state.reservations ||= {};
      const reservation = state.reservations[id];
      if (!reservation) return { ok: false, reason: 'reservation_not_found' };
      if (reservation.status === 'released') return { ok: true, idempotent: true, status: 'released', reservationId: id };
      if (reservation.status === 'committed') return { ok: false, reason: 'reservation_already_committed', quotaOverrun: Boolean(reservation.quotaOverrun) };
      const ledger = state.ledgers[reservation.ledgerKey];
      if (!ledger) return { ok: false, reason: 'ledger_not_found' };
      ledger.reservedRequests = Math.max(0, ledger.reservedRequests - 1);
      ledger.reservedTokens = Math.max(0, ledger.reservedTokens - reservation.estimatedTokens);
      reservation.status = 'released';
      reservation.releaseReason = String(reason || 'execution_not_committed');
      reservation.releasedAt = now();
      reservation.updatedAt = now();
      return { ok: true, status: 'released', reservationId: id };
    }).result;
  }

  function reconcile({ reservationId, outcome, actualTokens = 0, reason = null } = {}) {
    if (outcome === 'completed') return commit({ reservationId, actualTokens });
    return release(reservationId, { reason: reason || `execution_${String(outcome || 'failed')}` });
  }

  return Object.freeze({
    durable: true,
    reserve,
    commit,
    release,
    reconcile,
    snapshot: () => store.read(),
    getReservation: (reservationId) => structuredClone(store.read().reservations?.[requiredString(reservationId, 'reservationId')] || null),
    get revision() { return store.read().revision || 0; }
  });
}
