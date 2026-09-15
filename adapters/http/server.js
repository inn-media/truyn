import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createPublicAgentDescriptor } from '../../runtime/agent-descriptor.js';

const require = createRequire(import.meta.url);
const { version: TRUYN_RUNTIME_VERSION } = require('../../package.json');

export const REST_API_PROFILE = 'TRUYN-REST/1';
export const TRUYN_PROTOCOL_PROFILE = 'TRUYN/1';

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

function correlationId(req) {
  const supplied = req.headers['x-correlation-id'];
  if (typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) return supplied;
  return randomUUID();
}

function normalizedError(status, code, message, requestCorrelationId) {
  return {
    ok: false,
    error: { code, message },
    correlationId: requestCorrelationId
  };
}

function errorCodeFor(status, message) {
  if (message === 'invalid_json') return ['invalid_request', 'request body is not valid JSON'];
  if (message === 'request_too_large') return ['payload_too_large', 'request body exceeds the allowed size'];
  if (message === 'capability_required') return ['invalid_request', 'capability is required'];
  if (message === 'requestId_required') return ['invalid_request', 'requestId is required'];
  if (status === 401 || status === 403) return ['authorization_denied', 'request is not authorized'];
  if (status === 404) return ['not_found', 'requested resource was not found'];
  if (status === 409) return ['conflict', 'request conflicts with current TRUYN state'];
  if (status === 413) return ['payload_too_large', 'request body exceeds the allowed size'];
  if (status >= 400 && status < 500) return ['invalid_request', 'request could not be accepted'];
  return ['internal_error', 'TRUYN could not complete the request'];
}

function sendV1Error(res, status, message, requestCorrelationId) {
  const [code, publicMessage] = errorCodeFor(status, message);
  return sendJson(res, status, normalizedError(status, code, publicMessage, requestCorrelationId));
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('request_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

function assertLoopback(host) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The public HTTP adapter is local-only; use an authenticated gateway for remote access');
  }
}

export function createHttpAdapterServer({ node, maxBodyBytes = 256 * 1024, descriptorEnv = process.env }) {
  if (!node) throw new Error('node is required');
  let registered = false;

  async function ensureRegistered() {
    if (!registered || !node.sessionToken) {
      await node.register({ name: 'truyn-http-adapter' });
      registered = true;
    }
  }

  async function discoverAuthorized(url) {
    await ensureRegistered();
    const capability = url.searchParams.get('capability') || '';
    return node.find(capability);
  }

  const server = http.createServer(async (req, res) => {
    const requestCorrelationId = correlationId(req);
    let isV1 = false;
    try {
      const url = new URL(req.url, 'http://adapter.local');
      isV1 = url.pathname === '/v1' || url.pathname.startsWith('/v1/');
      if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/v1/version') {
        return sendJson(res, 200, {
          ok: true,
          api: REST_API_PROFILE,
          runtime: TRUYN_RUNTIME_VERSION,
          protocol: TRUYN_PROTOCOL_PROFILE
        });
      }
      if (req.method === 'GET' && url.pathname === '/v1/agent-descriptor') {
        const descriptor = createPublicAgentDescriptor({
          identity: node.identity,
          capabilities: typeof node.capabilities === 'function' ? await node.capabilities() : [],
          env: descriptorEnv
        });
        if (!descriptor) return sendV1Error(res, 404, 'not_found', requestCorrelationId);
        return sendJson(res, 200, descriptor);
      }
      if (req.method === 'GET' && url.pathname === '/v1/identity') {
        return sendJson(res, 200, { ok: true, nodeId: node.identity.nodeId, algorithm: node.identity.algorithm });
      }
      if (req.method === 'GET' && (url.pathname === '/v1/discovery' || url.pathname === '/v1/offers')) {
        return sendJson(res, 200, await discoverAuthorized(url));
      }
      if (req.method === 'POST' && url.pathname === '/v1/offer') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.capability) return sendV1Error(res, 400, 'capability_required', requestCorrelationId);
        return sendJson(res, 200, await node.offer(body.capability, body.metadata || {}));
      }
      if (req.method === 'POST' && url.pathname === '/v1/need') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.capability) return sendV1Error(res, 400, 'capability_required', requestCorrelationId);
        return sendJson(res, 200, await node.need(body.capability, body.input, body.policy || {}));
      }
      const needStatusRoute = url.pathname.match(/^\/v1\/needs\/([^/]+)$/);
      if (req.method === 'GET' && needStatusRoute) {
        await ensureRegistered();
        const requestId = decodeURIComponent(needStatusRoute[1]);
        return sendJson(res, 200, await node.requestStatus(requestId));
      }
      if (req.method === 'GET' && url.pathname === '/v1/events') {
        await ensureRegistered();
        return sendJson(res, 200, await node.poll());
      }
      if (req.method === 'POST' && url.pathname === '/v1/result') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.requestId) return sendV1Error(res, 400, 'requestId_required', requestCorrelationId);
        return sendJson(res, 200, await node.result(body.requestId, body.output, body.metadata || {}));
      }
      if (isV1) return sendV1Error(res, 404, 'not_found', requestCorrelationId);
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (isV1) return sendV1Error(res, status, error.message, requestCorrelationId);
      return sendJson(res, status, { ok: false, error: status < 500 ? error.message : 'adapter_error' });
    }
  });

  return {
    server,
    async listen({ host = '127.0.0.1', port = 8790 } = {}) {
      assertLoopback(host);
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
