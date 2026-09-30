function authenticated(result) {
  return result?.authenticated === true || result?.session?.authenticated === true;
}

export async function selectAuthenticatedTransport({ peer, probeQuic } = {}) {
  if (!peer || typeof peer !== 'object') throw new Error('peer is required');
  if (typeof probeQuic !== 'function') throw new Error('probeQuic must be a function');

  const endpoints = Array.isArray(peer.endpoints) ? peer.endpoints : [];
  const quicEndpoints = endpoints.filter((entry) => entry?.transport === 'quic' || String(entry?.url || '').startsWith('quic://'));
  if (quicEndpoints.length === 0) throw new Error('peer has no direct QUIC endpoint');

  for (const endpoint of quicEndpoints) {
    const probe = await probeQuic({ peer, endpoint });
    if (!probe?.reachable) continue;
    if (!authenticated(probe)) throw new Error('direct QUIC authentication failed');
    return Object.freeze({
      transport: 'quic',
      endpoint,
      peerId: peer.id ?? peer.nodeId ?? null,
      authenticated: true,
      connection: probe.connection ?? probe.session ?? null
    });
  }

  throw new Error('no reachable authenticated QUIC endpoint');
}
