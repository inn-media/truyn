const TRANSIENT_REACHABILITY_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN']);

function endpointProtocol(endpoint) {
  try { return new URL(String(endpoint?.url || '')).protocol; } catch { return null; }
}

function isTransientReachabilityError(error) {
  return error?.code === 'OPEN1_FALLBACK_TIMEOUT' || TRANSIENT_REACHABILITY_CODES.has(error?.code) || TRANSIENT_REACHABILITY_CODES.has(error?.message);
}

function validatedConnection(result, transport, identity) {
  const connection = result?.connection ?? result?.session ?? result;
  if (!connection || typeof connection !== 'object') throw new Error(`${transport} fallback connection missing`);
  if (connection.authenticated !== true) throw new Error(`${transport} fallback authentication failed`);
  if (connection.authorized !== true) throw new Error(`${transport} fallback authorization failed`);
  if (typeof connection.peerId !== 'string' || connection.peerId.length === 0) throw new Error(`${transport} fallback identity attestation missing`);
  if (connection.peerId !== identity) throw new Error(`${transport} fallback identity changed`);
  return connection;
}

async function connectWithDeadline(connect, input, attemptTimeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => connect({ ...input, signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error('fallback connection timed out');
          error.code = 'OPEN1_FALLBACK_TIMEOUT';
          reject(error);
        }, attemptTimeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function selectAuthenticatedFallback({ peer, identity, authorization, connectWebSocket, connectHttps, maxAttempts = 2, attemptTimeoutMs = 5000 } = {}) {
  if (!peer || typeof peer !== 'object') throw new Error('peer is required');
  if (typeof identity !== 'string' || identity.length === 0) throw new Error('identity is required');
  if (typeof authorization !== 'string' || authorization.length === 0) throw new Error('authorization is required');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) throw new Error('maxAttempts must be between 1 and 2');
  if (!Number.isInteger(attemptTimeoutMs) || attemptTimeoutMs < 1 || attemptTimeoutMs > 30000) throw new Error('attemptTimeoutMs must be between 1 and 30000');

  const endpoints = Array.isArray(peer.endpoints) ? peer.endpoints : [];
  const websocket = endpoints.find((entry) => endpointProtocol(entry) === 'wss:');
  const https = endpoints.find((entry) => endpointProtocol(entry) === 'https:');
  const candidates = [
    websocket && { transport: 'websocket', endpoint: websocket, connect: connectWebSocket },
    https && { transport: 'https', endpoint: https, connect: connectHttps }
  ].filter(Boolean).slice(0, maxAttempts);

  if (candidates.length === 0) throw new Error('peer has no authenticated fallback endpoint');

  for (const candidate of candidates) {
    if (typeof candidate.connect !== 'function') continue;
    let result;
    try {
      result = await connectWithDeadline(candidate.connect, { peer, endpoint: candidate.endpoint, identity, authorization }, attemptTimeoutMs);
    } catch (error) {
      if (isTransientReachabilityError(error)) continue;
      throw error;
    }
    if (!result?.reachable) continue;
    const connection = validatedConnection(result, candidate.transport, identity);
    return Object.freeze({ transport: candidate.transport, endpoint: candidate.endpoint, peerId: identity, authenticated: true, authorized: true, connection });
  }

  throw new Error('no reachable authenticated authorized fallback');
}
