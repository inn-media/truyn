import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/protocol/index.js';
import { assertNeedAdmissionWindow } from '../../core/protocol/need-admission.js';

function fault(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.publicCode = code;
  return error;
}

// Call only AFTER envelope verification and authenticated session binding.
// A reservation is never released on handler failure: its effect may be unknown.
// A handler's return value is not a signed RESULT or an accounting commitment.
export function createNeedReplayGuard({ provider, lifecycleLedger = null, maxSeenNeedIds = 262144 } = {}) {
  if (typeof provider !== 'string' || !provider) throw new Error('need replay provider is required');
  if (!Number.isSafeInteger(maxSeenNeedIds) || maxSeenNeedIds < 1)
    throw new Error('maxSeenNeedIds must be a positive safe integer');
  if (lifecycleLedger && (typeof lifecycleLedger.getNeed !== 'function' || typeof lifecycleLedger.reserveNeed !== 'function'))
    throw new Error('lifecycleLedger must implement getNeed and reserveNeed');
  const seen = new Set();
  const digest = value => createHash('sha256').update(canonicalize(value)).digest('hex');
  return Object.freeze({
    async admit(envelope) {
      if (envelope.type !== 'NEED') return;
      if (envelope.to != null && envelope.to !== provider) throw fault(403, 'need_recipient_mismatch');
      const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
      if (typeof capability !== 'string' || !capability.trim()) throw fault(400, 'invalid_capability');
      if (lifecycleLedger ? await lifecycleLedger.getNeed(envelope.id) : seen.has(envelope.id))
        throw fault(409, 'duplicate_request');
      assertNeedAdmissionWindow(envelope);
      if (lifecycleLedger) {
        // The same namespace/adapter as HTTP + compact. Atomic create arbitrates
        // simultaneous streams, processes and replicas, including a lost reply.
        await lifecycleLedger.reserveNeed({
          id: envelope.id, requester: envelope.from, provider,
          fingerprint: digest(envelope), capability, mode: 'quic',
          scope: envelope.from, policyDigest: digest(envelope.payload.policy ?? {})
        });
      } else {
        // No await between capacity check and insertion. No TTL/LRU eviction.
        if (seen.size >= maxSeenNeedIds) throw fault(503, 'need_idempotency_capacity_reached');
        seen.add(envelope.id);
      }
    }
  });
}
