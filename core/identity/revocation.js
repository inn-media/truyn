export const IDENTITY_REVOCATION_SCHEMA = 'truyn.identity-revocation/v1';

function requireNodeId(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Identity revocation requires ${field}`);
  }
  return value;
}

/**
 * Create a deterministic, key-free revocation record for an identity that was
 * intentionally replaced. The record can be persisted locally and propagated
 * by callers over an existing network-control surface without carrying secret
 * material.
 */
export function createIdentityRevocation(rotationAudit, { now = () => new Date() } = {}) {
  if (!rotationAudit || rotationAudit.explicit !== true) {
    throw new Error('Identity revocation requires an explicit rotation audit');
  }
  const revokedNodeId = requireNodeId(rotationAudit.oldNodeId, 'oldNodeId');
  const replacementNodeId = requireNodeId(rotationAudit.newNodeId, 'newNodeId');
  if (revokedNodeId === replacementNodeId) {
    throw new Error('Identity revocation requires distinct old/new node IDs');
  }
  const revokedAt = now().toISOString();
  return Object.freeze({
    schema: IDENTITY_REVOCATION_SCHEMA,
    status: 'revoked',
    revokedNodeId,
    replacementNodeId,
    revokedAt,
    reason: 'identity-replaced'
  });
}

export function parseIdentityRevocation(value) {
  const record = typeof value === 'string' ? JSON.parse(value) : value;
  if (!record || record.schema !== IDENTITY_REVOCATION_SCHEMA || record.status !== 'revoked') {
    throw new Error('Invalid identity revocation record');
  }
  const revokedNodeId = requireNodeId(record.revokedNodeId, 'revokedNodeId');
  const replacementNodeId = requireNodeId(record.replacementNodeId, 'replacementNodeId');
  if (revokedNodeId === replacementNodeId || typeof record.revokedAt !== 'string') {
    throw new Error('Invalid identity revocation boundary');
  }
  return Object.freeze({ ...record });
}

/** Fail closed before a durable identity is allowed to resume normal use. */
export function assertIdentityNotRevoked(nodeId, revocations = []) {
  requireNodeId(nodeId, 'nodeId');
  for (const candidate of revocations) {
    const record = parseIdentityRevocation(candidate);
    if (record.revokedNodeId === nodeId) {
      const error = new Error(`Node identity ${nodeId} is revoked and was replaced by ${record.replacementNodeId}`);
      error.code = 'TRUYN_IDENTITY_REVOKED';
      throw error;
    }
  }
  return true;
}

/** Stable representation suitable for local persistence/network publication. */
export function serializeIdentityRevocation(record) {
  const parsed = parseIdentityRevocation(record);
  return JSON.stringify({
    schema: parsed.schema,
    status: parsed.status,
    revokedNodeId: parsed.revokedNodeId,
    replacementNodeId: parsed.replacementNodeId,
    revokedAt: parsed.revokedAt,
    reason: parsed.reason
  });
}
