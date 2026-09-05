import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createCosmosAuthorityCheckpointStore } from '../core/security/cosmos-authority-checkpoint.js';
import { createManagedProductionAuthority } from '../core/security/managed-production-authority.js';

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function integer(value, fallback, min, max, label) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}..${max}`);
  return number;
}

function bearer(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function writeJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

async function readJson(req, maxBytes = 1_048_576) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('request_body_invalid_json'); }
}

function bootstrapFromEnv(env) {
  if (!env.TRUYN_AUTHORITY_BOOTSTRAP_B64) return { bootstrapSnapshot: null, bootstrapDigest: null };
  if (!env.TRUYN_AUTHORITY_BOOTSTRAP_DIGEST) throw new Error('TRUYN_AUTHORITY_BOOTSTRAP_DIGEST is required with bootstrap snapshot');
  let bootstrapSnapshot;
  try { bootstrapSnapshot = JSON.parse(Buffer.from(env.TRUYN_AUTHORITY_BOOTSTRAP_B64, 'base64').toString('utf8')); } catch { throw new Error('TRUYN_AUTHORITY_BOOTSTRAP_B64 is invalid'); }
  return { bootstrapSnapshot, bootstrapDigest: env.TRUYN_AUTHORITY_BOOTSTRAP_DIGEST };
}

export function createManagedAuthorityFromEnv(env = process.env, dependencies = {}) {
  const runtimeToken = required(env.TRUYN_AUTHORITY_RUNTIME_TOKEN, 'TRUYN_AUTHORITY_RUNTIME_TOKEN');
  const adminToken = required(env.TRUYN_AUTHORITY_ADMIN_TOKEN, 'TRUYN_AUTHORITY_ADMIN_TOKEN');
  if (sameSecret(runtimeToken, adminToken)) throw new Error('authority runtime/admin tokens must be distinct');
  const checkpointStore = dependencies.checkpointStore || createCosmosAuthorityCheckpointStore({
    endpoint: env.TRUYN_COSMOS_ENDPOINT,
    database: env.TRUYN_COSMOS_DATABASE,
    container: env.TRUYN_COSMOS_CONTAINER,
    checkpointId: env.TRUYN_COSMOS_CHECKPOINT_ID || 'production-authority',
    partitionKey: env.TRUYN_COSMOS_PARTITION_KEY || 'production-authority',
    maxDocumentBytes: integer(env.TRUYN_AUTHORITY_MAX_CHECKPOINT_BYTES, 1_750_000, 100_000, 1_900_000, 'TRUYN_AUTHORITY_MAX_CHECKPOINT_BYTES'),
    fetchImpl: dependencies.fetchImpl || fetch,
    accessTokenProvider: dependencies.accessTokenProvider
  });
  const bootstrap = bootstrapFromEnv(env);
  const authority = createManagedProductionAuthority({
    checkpointStore,
    sourceSha: env.TRUYN_SOURCE_SHA,
    ...bootstrap,
    maxMutationRetries: integer(env.TRUYN_AUTHORITY_MUTATION_RETRIES, 4, 1, 20, 'TRUYN_AUTHORITY_MUTATION_RETRIES'),
    temporaryRoot: dependencies.temporaryRoot,
    now: dependencies.now
  });
  return { authority, runtimeToken, adminToken };
}

export function createAuthorityService({ authority, runtimeToken, adminToken, maxRequestBytes = 1_048_576 } = {}) {
  if (!authority || typeof authority.initialize !== 'function') throw new Error('authority service requires managed authority');
  required(runtimeToken, 'authority runtime token');
  required(adminToken, 'authority admin token');
  if (sameSecret(runtimeToken, adminToken)) throw new Error('authority runtime/admin tokens must be distinct');
  let ready = false;
  let initialization = null;

  function authorized(req, expected) {
    return sameSecret(bearer(req), expected);
  }

  async function checkReady() {
    if (!initialization) return false;
    try {
      await authority.checkpoint();
      ready = true;
      return true;
    } catch {
      ready = false;
      return false;
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') return writeJson(res, 200, { ok: true, role: 'authority' });
      if (req.method === 'GET' && req.url === '/ready') {
        const available = await checkReady();
        return writeJson(res, available ? 200 : 503, { ok: available });
      }
      if (!ready) return writeJson(res, 503, { ok: false, error: 'authority_not_ready' });

      const admin = req.url === '/v1/authority/admin/mutate';
      if (!authorized(req, admin ? adminToken : runtimeToken)) return writeJson(res, 401, { ok: false, error: 'unauthorized' });

      if (req.method === 'GET' && req.url === '/v1/authority/snapshot') {
        return writeJson(res, 200, await authority.checkpoint());
      }
      if (req.method !== 'POST') return writeJson(res, 404, { ok: false, error: 'not_found' });
      const body = await readJson(req, maxRequestBytes);
      if (req.url === '/v1/authority/access/authorize') return writeJson(res, 200, await authority.authorizeAccess(body));
      if (req.url === '/v1/authority/billing/authorize') return writeJson(res, 200, await authority.reserveBilling(body));
      if (req.url === '/v1/authority/billing/reconcile') return writeJson(res, 200, await authority.reconcileBilling(body));
      if (req.url === '/v1/authority/admin/mutate') return writeJson(res, 200, await authority.adminMutate(body));
      return writeJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      const status = error?.message === 'request_body_too_large' ? 413 : error?.message === 'request_body_invalid_json' ? 400 : 503;
      if (status === 503) ready = false;
      return writeJson(res, status, { ok: false, error: status === 400 || status === 413 ? error.message : 'authority_operation_failed' });
    }
  });

  async function initialize() {
    if (!initialization) {
      initialization = authority.initialize().then((result) => { ready = true; return result; }).catch((error) => { initialization = null; ready = false; throw error; });
    }
    return initialization;
  }

  async function listen({ host = '0.0.0.0', port = 8080 } = {}) {
    await initialize();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    return `http://${host}:${typeof address === 'object' ? address.port : port}`;
  }

  async function close() {
    ready = false;
    if (!server.listening) return;
    await new Promise((resolve) => server.close(resolve));
  }

  return Object.freeze({ server, initialize, listen, close, checkReady, get ready() { return ready; } });
}

export function createAuthorityServiceFromEnv(env = process.env, dependencies = {}) {
  const configured = createManagedAuthorityFromEnv(env, dependencies);
  return createAuthorityService({
    ...configured,
    maxRequestBytes: integer(env.TRUYN_AUTHORITY_MAX_REQUEST_BYTES, 1_048_576, 1024, 2_000_000, 'TRUYN_AUTHORITY_MAX_REQUEST_BYTES')
  });
}
