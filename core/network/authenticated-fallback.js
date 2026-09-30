function isAuthenticated(result) {
  return result?.authenticated === true || result?.session?.authenticated === true;
}

function identityOf(result, peer) {
  return result?.peerId ?? result?.session?.peerId ?? peer?.id ?? peer?.nodeId ?? null;
}

function authorized(result) {
  return result?.authorized === true || result?.session?.authorized === true;
}

export async function selectAuthenticatedFallback({ peer, identity, authorization, connectWebSocket, connectHttps, maxAttempts = 2 } = {}) {
  if (!peer || typeof peer !== 'object') throw new Error('peer is required');
  if (typeof identity !== 'string' || identity.length === 0) throw new Error('identity is required');
  if (typeof authorization !== 'string' || authorization.length === 0) throw new Error('authorization is required');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) throw new Error('maxAttempts must be between 1 and 2');

  const endpoints = Array.isArray(peer.endpoints) ? peer.endpoints : [];
  const candidates = [
    ...endpoints.filter((entry) => entry?.transport === 'websocket' || /^wss:\/\//.test(String(entry?.url || ''))).map((endpoint) => ({ transport: 'websocket', endpoint, connect: connectWebSocket })),
    ...endpoints.filter((entry) => entry?.transport === 'https' || /^https:\/\//.test(String(entry?.url || ''))).map((endpoint) => ({ transport: 'https', endpoint, connect: connectHttps }))
  ].slice(0, maxAttempts);

  if (candidates.length === 0) throw new Error('peer has no authenticated fallback endpoint');

  for (const candidate of candidates) {
    if (typeof candidate.connect !== 'function') continue;
    const result = await candidate.connect({ peer, endpoint: candidate.endpoint, identity, authorization });
    if (!result?.reachable) continue;
    if (!isAuthenticated(result)) throw new Error(`${candidate.transport} fallback authentication failed`);
    if (!authorized(result)) throw new Error(`${candidate.transport} fallback authorization failed`);
    if (identityOf(result, peer) !== identity) throw new Error(`${candidate.transport} fallback identity changed`);
    return Object.freeze({ transport: candidate.transport, endpoint: candidate.endpoint, peerId: identity, authenticated: true, authorized: true, connection: result.connection ?? result.session ?? null });
  }

  throw new Error('no reachable authenticated authorized fallback');
}
