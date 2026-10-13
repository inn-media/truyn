// Public paid-NEED security boundary. This contract carries an authorization
// commitment, NOT a vendor invoice or a claim that an upstream POST is atomic.
const fault = (status, code) => Object.assign(new Error(code), { httpStatus: status, publicCode: code });
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
export const PAID_NEED_CONTRACT = 'truyn.paid.need/1';

// Only a server-injected durable authority can authorize a paid NEED.
// Requester-supplied policy, OFFER metadata and relay trusted-node lists
// are never a grant and never determine the payer.
export function authorizePaidNeedAtRelay({ policy, requesterNodeId, capability } = {}) {
  const providerNodeId = policy?.providerNodeId;
  const authority = policy?.providerGrantAuthority;
  if (!validId(providerNodeId) || !validId(requesterNodeId) || !validId(capability) ||
      authority?.durable !== true || typeof authority.authorize !== 'function' ||
      typeof authority.getProviderPolicy !== 'function') throw fault(403, 'paid_need_authority_required');
  let decision, providerPolicy;
  try {
    decision = authority.authorize({ providerNodeId, requesterNodeId, capability });
    providerPolicy = authority.getProviderPolicy(providerNodeId);
  } catch {
    throw fault(503, 'paid_need_authority_unavailable');
  }
  if (decision?.ok !== true || providerPolicy?.status !== 'active') throw fault(403, 'paid_need_denied');
  if (!Number.isSafeInteger(authority.revision) || authority.revision < 0)
    throw fault(503, 'paid_need_authority_unconfirmed');
  return Object.freeze({
    contract: PAID_NEED_CONTRACT,
    status: 'authorized',
    requesterNodeId,
    providerNodeId,
    capability,
    payerNodeId: providerNodeId,
    billingResponsibility: 'provider-owner',
    authorityRevision: authority.revision,
    grantId: validId(decision.grantId) ? decision.grantId : null
  });
}

// Reads the SAME shared durable record that relay atomically reserved before
// dispatch. A missing, conflicting, expired or unconfirmed record is DENIED.
// Never recover via re-dispatch or a new paid invocation.
export async function verifyPaidNeedAtProvider({
  ledger, need, providerNodeId, maxAgeMs = 15 * 60 * 1000
} = {}) {
  if (ledger?.kind !== 'cosmos-multi-host-v1' ||
      typeof ledger.getNeed !== 'function' ||
      typeof ledger.beginEffect !== 'function' ||
      typeof ledger.finishEffect !== 'function')
    throw fault(503, 'paid_need_shared_ledger_required');
  if (!validId(need?.id) || !validId(need?.from) || !validId(providerNodeId) || need.chain)
    throw fault(403, 'paid_need_unverified');
  const capability = need.payload?.capability?.name || need.payload?.capability;
  let record;
  try { record = await ledger.getNeed(need.id); }
  catch { throw fault(503, 'paid_need_ledger_unavailable'); }
  const authorization = record?.paidAuthorization;
  if (!record || record.status !== 'matched' ||
      record.requester !== need.from || record.provider !== providerNodeId ||
      record.capability !== capability ||
      !/^[a-f0-9]{64}$/.test(need.paidFingerprint || '') ||
      record.fingerprint !== need.paidFingerprint ||
      authorization?.contract !== PAID_NEED_CONTRACT ||
      authorization.status !== 'authorized' ||
      authorization.requesterNodeId !== need.from ||
      authorization.providerNodeId !== providerNodeId ||
      authorization.capability !== capability ||
      authorization.payerNodeId !== providerNodeId ||
      authorization.billingResponsibility !== 'provider-owner' ||
      !Number.isSafeInteger(authorization.authorityRevision) ||
      authorization.authorityRevision < 0)
    throw fault(403, 'paid_need_unverified');
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 ||
      Date.now() < created || Date.now() - created > maxAgeMs)
    throw fault(403, 'paid_need_authorization_expired');
  return authorization;
}
