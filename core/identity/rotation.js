import { createIdentity } from './index.js';
import { parseDurableIdentity, serializeDurableIdentity } from './storage.js';

export const IDENTITY_ROTATION_AUDIT_SCHEMA = 'truyn.identity-rotation/v1';
export const IDENTITY_ROTATION_CONFIRMATION = 'ROTATE_NODE_IDENTITY';

/**
 * Rotate a durable node identity only after an explicit user confirmation.
 * The returned audit record intentionally contains no key material.
 */
export function rotateDurableIdentity(serializedIdentity, {
  confirmation,
  reason = null,
  now = () => new Date(),
  createNewIdentity = createIdentity
} = {}) {
  if (confirmation !== IDENTITY_ROTATION_CONFIRMATION) {
    throw new Error(`Identity rotation requires explicit confirmation: ${IDENTITY_ROTATION_CONFIRMATION}`);
  }

  const current = parseDurableIdentity(serializedIdentity);
  const replacement = createNewIdentity();
  if (!replacement || replacement.nodeId === current.identity.nodeId) {
    throw new Error('Identity rotation failed: replacement nodeId must differ from current nodeId');
  }

  const rotatedAt = now().toISOString();
  const rotatedIdentity = serializeDurableIdentity(replacement, {
    network: current.network,
    profile: current.profile
  });

  return {
    serializedIdentity: rotatedIdentity,
    audit: {
      schema: IDENTITY_ROTATION_AUDIT_SCHEMA,
      oldNodeId: current.identity.nodeId,
      newNodeId: replacement.nodeId,
      rotatedAt,
      reason: typeof reason === 'string' && reason.length > 0 ? reason : null,
      explicit: true
    }
  };
}
