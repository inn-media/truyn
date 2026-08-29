export async function revokeTarget(node, targetId, { targetKind, reason = 'revoked_by_owner' } = {}) {
  if (!node || typeof node.envelope !== 'function' || typeof node.authHeaders !== 'function') throw new Error('node is required');
  if (!['need', 'offer'].includes(targetKind)) throw new Error('targetKind must be need or offer');
  node.requireSession?.('revoking an object');
  const envelope = node.envelope('REVOKE', { targetId, targetKind, reason });
  const response = await fetch(`${node.relayUrl}/v1/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify({ envelope })
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export const cancelNeed = (node, targetId, reason = 'cancelled_by_requester') => revokeTarget(node, targetId, { targetKind: 'need', reason });
export const revokeOffer = (node, targetId, reason = 'revoked_by_owner') => revokeTarget(node, targetId, { targetKind: 'offer', reason });
