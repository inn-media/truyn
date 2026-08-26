import { Readable } from 'node:stream';
import { WebSocket } from 'ws';
import { createRelay as createBaseRelay } from './server-base.js';
import { verifyCompactFrame, verifyEnvelope } from '../../core/protocol/index.js';

function json(res, status, body) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

function bearer(req) {
  const value = req.headers?.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function authenticatedNodeId(state, req) {
  const token = bearer(req);
  if (!token) return null;
  const session = state.sessions.get(token);
  if (!session || Date.now() >= session.expiresAt) return null;
  const node = state.nodes.get(session.nodeId);
  if (!node || node.sessionToken !== token) return null;
  return session.nodeId;
}

async function readBody(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('request_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseJson(body) {
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

function replayRequest(req, body) {
  const replay = Readable.from(body.length ? [body] : []);
  replay.method = req.method;
  replay.url = req.url;
  replay.headers = req.headers;
  replay.httpVersion = req.httpVersion;
  replay.httpVersionMajor = req.httpVersionMajor;
  replay.httpVersionMinor = req.httpVersionMinor;
  return replay;
}

function boundedQueue(map, nodeId, event, maxQueuedEventsPerNode) {
  const queue = map.get(nodeId) || [];
  queue.push(event);
  if (queue.length > maxQueuedEventsPerNode) queue.splice(0, queue.length - maxQueuedEventsPerNode);
  map.set(nodeId, queue);
}

function queueLegacy(state, nodeId, event, maxQueuedEventsPerNode) {
  boundedQueue(state.events, nodeId, event, maxQueuedEventsPerNode);
}

function queueFast(state, nodeId, event, maxQueuedEventsPerNode) {
  const socket = state.providerSockets.get(nodeId);
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(event));
      const node = state.nodes.get(nodeId);
      if (node) node.lastSeenAt = new Date().toISOString();
      return 'socket';
    } catch {}
  }
  boundedQueue(state.fastEvents, nodeId, event, maxQueuedEventsPerNode);
  return 'queued';
}

function terminalRequestError(request) {
  if (request?.status === 'cancelled') return 'request_cancelled';
  if (request?.status === 'completed') return 'request_already_completed';
  if (request?.status === 'failed') return 'request_failed';
  return null;
}

function pruneCancelledRequests(requests, maxRequests) {
  if (requests.size < maxRequests) return;
  for (const [id, request] of requests) {
    if (request?.status === 'cancelled') requests.delete(id);
    if (requests.size < maxRequests) break;
  }
}

function cancellationPayload(envelope) {
  const payload = envelope?.payload || {};
  return {
    targetId: payload.targetId,
    targetKind: payload.targetKind || 'auto',
    reason: typeof payload.reason === 'string' && payload.reason ? payload.reason : 'cancelled_by_requester'
  };
}

export function createRelay(options = {}) {
  const relay = createBaseRelay(options);
  const { server, state } = relay;
  const [baseRequestHandler] = server.listeners('request');
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const maxQueuedEventsPerNode = options.maxQueuedEventsPerNode ?? 256;
  const maxRequests = options.maxRequests ?? 8192;

  if (typeof baseRequestHandler !== 'function') throw new Error('relay base request handler is unavailable');
  server.removeListener('request', baseRequestHandler);

  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url, 'http://relay.local');

      if (req.method === 'POST' && (url.pathname === '/v1/needs' || url.pathname === '/v1/fast/needs')) {
        pruneCancelledRequests(state.requests, maxRequests);
        return baseRequestHandler(req, res);
      }

      if (req.method === 'POST' && url.pathname === '/v1/revoke') {
        const body = await readBody(req, maxBodyBytes);
        const parsed = parseJson(body);
        const envelope = parsed.envelope;
        const verification = verifyEnvelope(envelope, { allowedTypes: ['REVOKE'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const authenticated = authenticatedNodeId(state, req);
        if (!authenticated || authenticated !== envelope.from) return json(res, 401, { ok: false, error: 'unauthorized' });

        const { targetId, targetKind, reason } = cancellationPayload(envelope);
        if (!targetId || typeof targetId !== 'string') return json(res, 400, { ok: false, error: 'invalid_target_id' });
        const request = state.requests.get(targetId);
        const targetsNeed = targetKind === 'need' || (targetKind === 'auto' && Boolean(request));
        if (!targetsNeed) return baseRequestHandler(replayRequest(req, body), res);
        if (!request) return json(res, 404, { ok: false, error: 'target_not_found' });
        if (request.mode === 'chain-stage') return json(res, 409, { ok: false, error: 'chain_stage_cancellation_not_supported' });
        if (request.requester !== envelope.from) return json(res, 403, { ok: false, error: 'not_request_owner' });
        if (request.status === 'completed') return json(res, 409, { ok: false, error: 'request_already_completed' });
        if (request.status === 'cancelled') {
          return json(res, 200, { ok: true, targetId, targetKind: 'need', cancelled: true, idempotent: true });
        }

        request.status = 'cancelled';
        request.cancelled = true;
        request.cancelledAt = new Date().toISOString();
        request.cancelReason = reason;
        request.nextPartialSequence ??= 0;
        queueLegacy(state, request.provider, {
          kind: 'REVOKE',
          targetKind: 'need',
          targetId,
          envelope,
          from: envelope.from
        }, maxQueuedEventsPerNode);
        return json(res, 200, {
          ok: true,
          targetId,
          targetKind: 'need',
          cancelled: true,
          provider: request.provider,
          cancelledAt: request.cancelledAt
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/partials') {
        const body = await readBody(req, maxBodyBytes);
        const { frame, payload } = parseJson(body);
        const providerNodeId = authenticatedNodeId(state, req);
        if (!providerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const provider = state.nodes.get(providerNodeId);
        const verification = verifyCompactFrame(frame, payload, provider?.publicKey, { allowedTypes: ['PARTIAL'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const request = state.requests.get(frame.i);
        if (!request) return json(res, 404, { ok: false, error: 'request_not_found' });
        if (request.provider !== providerNodeId) return json(res, 403, { ok: false, error: 'provider_mismatch' });
        const terminalError = terminalRequestError(request);
        if (terminalError) return json(res, 409, { ok: false, error: terminalError });
        if (request.mode !== 'fast') return json(res, 409, { ok: false, error: 'partial_requires_fast_need' });
        if (!Number.isInteger(payload?.sequence) || payload.sequence < 0) {
          return json(res, 400, { ok: false, error: 'invalid_partial_sequence' });
        }
        const expected = request.nextPartialSequence ?? 0;
        if (payload.sequence !== expected) {
          return json(res, 409, { ok: false, error: 'partial_sequence_mismatch', expected, received: payload.sequence });
        }
        request.nextPartialSequence = expected + 1;
        request.partialCount = request.nextPartialSequence;
        request.lastPartialAt = new Date().toISOString();
        const event = {
          kind: 'PARTIAL',
          frame,
          payload,
          from: providerNodeId,
          requestId: frame.i,
          sequence: payload.sequence
        };
        const transport = queueFast(state, request.requester, event, maxQueuedEventsPerNode);
        return json(res, 200, { ok: true, requestId: frame.i, sequence: payload.sequence, transport });
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/results') {
        const body = await readBody(req, maxBodyBytes);
        const parsed = parseJson(body);
        const request = state.requests.get(parsed.frame?.i);
        const terminalError = terminalRequestError(request);
        if (terminalError) return json(res, 409, { ok: false, error: terminalError });
        return baseRequestHandler(replayRequest(req, body), res);
      }

      if (req.method === 'POST' && url.pathname === '/v1/results') {
        const body = await readBody(req, maxBodyBytes);
        const parsed = parseJson(body);
        const requestId = parsed.envelope?.payload?.requestId;
        const request = state.requests.get(requestId);
        const terminalError = terminalRequestError(request);
        if (terminalError) return json(res, 409, { ok: false, error: terminalError });
        return baseRequestHandler(replayRequest(req, body), res);
      }

      if (req.method === 'GET' && url.pathname === '/health' && options.exposeDiagnostics) {
        const terminal = new Set(['completed', 'cancelled', 'failed']);
        return json(res, 200, {
          ok: true,
          protocol: 'TRUYN/1',
          nodes: state.nodes.size,
          offers: state.offers.size,
          pendingRequests: [...state.requests.values()].filter((request) => !terminal.has(request.status)).length,
          cancelledRequests: [...state.requests.values()].filter((request) => request.status === 'cancelled').length,
          pendingChains: [...state.chains.values()].filter((chain) => chain.status === 'running').length,
          contexts: state.contexts.size,
          providerSockets: [...state.providerSockets.values()].filter((socket) => socket.readyState === WebSocket.OPEN).length
        });
      }

      return baseRequestHandler(req, res);
    } catch (error) {
      return json(res, Number.isInteger(error.status) ? error.status : 500, {
        ok: false,
        error: Number.isInteger(error.status) ? error.message : 'internal_error'
      });
    }
  });

  return relay;
}
