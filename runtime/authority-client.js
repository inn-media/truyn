import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import {
  materializeProductionControlPlaneSnapshot,
  verifyProductionControlPlaneSnapshotDigest
} from '../core/security/production-control-plane-snapshot.js';

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

async function readJson(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    if (response.ok) throw error;
  }
  if (!response.ok) {
    const error = new Error(body?.error || `authority_http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function createAuthorityHttpClient({ baseUrl, token, adminToken = null, fetchImpl = fetch, requestTimeoutMs = 10_000 } = {}) {
  const base = required(baseUrl, 'authority baseUrl').replace(/\/$/, '');
  const runtimeToken = required(token, 'authority runtime token');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 60_000) throw new Error('authority requestTimeoutMs must be 100..60000');

  async function request(path, { method = 'GET', body = null, admin = false } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('authority_request_timeout')), requestTimeoutMs);
    try {
      const selectedToken = admin ? required(adminToken, 'authority admin token') : runtimeToken;
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${selectedToken}`,
          ...(body == null ? {} : { 'content-type': 'application/json' })
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      return await readJson(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    snapshot: () => request('/v1/authority/snapshot'),
    authorizeAccess: (input) => request('/v1/authority/access/authorize', { method: 'POST', body: input }),
    reserveBilling: (input) => request('/v1/authority/billing/authorize', { method: 'POST', body: input }),
    reconcileBilling: (input) => request('/v1/authority/billing/reconcile', { method: 'POST', body: input }),
    adminMutate: (input) => request('/v1/authority/admin/mutate', { method: 'POST', body: input, admin: true })
  });
}

function validateRemoteCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') throw new Error('authority_snapshot_invalid');
  if (!Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 1) throw new Error('authority_snapshot_revision_invalid');
  if (typeof checkpoint.sourceSha !== 'string' || !/^[a-f0-9]{40}$/i.test(checkpoint.sourceSha)) throw new Error('authority_snapshot_source_sha_invalid');
  if (!Number.isFinite(Date.parse(checkpoint.committedAt || ''))) throw new Error('authority_snapshot_time_invalid');
  verifyProductionControlPlaneSnapshotDigest(checkpoint.state, checkpoint.stateDigest);
  return checkpoint;
}

function validateHighWater(value) {
  if (!value || value.version !== 1) throw new Error('authority_high_water_invalid');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('authority_high_water_invalid');
  if (typeof value.stateDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(value.stateDigest)) throw new Error('authority_high_water_invalid');
  if (typeof value.sourceSha !== 'string' || !/^[a-f0-9]{40}$/i.test(value.sourceSha)) throw new Error('authority_high_water_invalid');
  return value;
}

export function createAuthoritySnapshotCache({
  client,
  stateDir,
  refreshMs = 1_000,
  maxStaleMs = 5_000,
  nowMs = () => Date.now()
} = {}) {
  if (!client || typeof client.snapshot !== 'function') throw new Error('authority snapshot cache requires client.snapshot()');
  const root = resolve(required(stateDir, 'authority cache stateDir'));
  if (!Number.isSafeInteger(refreshMs) || refreshMs < 100 || refreshMs > 60_000) throw new Error('authority refreshMs must be 100..60000');
  if (!Number.isSafeInteger(maxStaleMs) || maxStaleMs < refreshMs || maxStaleMs > 300_000) throw new Error('authority maxStaleMs must be >= refreshMs and <= 300000');
  mkdirSync(root, { recursive: true, mode: 0o700 });

  const highWaterPath = join(root, 'accepted-high-water.json');
  let highWater = null;
  if (existsSync(highWaterPath)) {
    try { highWater = validateHighWater(JSON.parse(readFileSync(highWaterPath, 'utf8'))); }
    catch { throw new Error('authority_high_water_invalid'); }
  }

  let current = null;
  let timer = null;
  let refreshing = null;
  let stopped = false;

  function persistHighWater(checkpoint) {
    const marker = {
      version: 1,
      revision: checkpoint.revision,
      stateDigest: checkpoint.stateDigest,
      sourceSha: checkpoint.sourceSha
    };
    const tempPath = `${highWaterPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, `${JSON.stringify(marker)}\n`, { encoding: 'utf8', mode: 0o600 });
    const fd = openSync(tempPath, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tempPath, highWaterPath);
    highWater = marker;
  }

  function requireFresh() {
    if (!current) throw new Error('authority_snapshot_unavailable');
    if (nowMs() - current.refreshedAt > maxStaleMs) throw new Error('authority_snapshot_stale');
    return current;
  }

  function install(checkpoint) {
    validateRemoteCheckpoint(checkpoint);
    if (highWater && checkpoint.revision < highWater.revision) throw new Error('authority_snapshot_rollback_detected');
    if (highWater && checkpoint.revision === highWater.revision && checkpoint.stateDigest !== highWater.stateDigest) {
      throw new Error('authority_snapshot_same_revision_digest_mismatch');
    }
    if (current && checkpoint.revision < current.revision) throw new Error('authority_snapshot_rollback_detected');
    if (current && checkpoint.revision === current.revision) {
      if (checkpoint.stateDigest !== current.stateDigest) throw new Error('authority_snapshot_same_revision_digest_mismatch');
      current.refreshedAt = nowMs();
      return current;
    }

    const revisionDir = join(root, `revision-${checkpoint.revision}-${checkpoint.stateDigest.slice(0, 12)}`);
    rmSync(revisionDir, { recursive: true, force: true });
    materializeProductionControlPlaneSnapshot({ snapshot: checkpoint.state, stateDir: revisionDir });
    const control = createProductionControlPlane({ stateDir: revisionDir });
    if (!highWater || checkpoint.revision > highWater.revision) persistHighWater(checkpoint);
    const previousDir = current?.stateDir || null;
    current = {
      revision: checkpoint.revision,
      stateDigest: checkpoint.stateDigest,
      sourceSha: checkpoint.sourceSha,
      committedAt: checkpoint.committedAt,
      refreshedAt: nowMs(),
      stateDir: revisionDir,
      control
    };
    if (previousDir && previousDir !== revisionDir) rmSync(previousDir, { recursive: true, force: true });
    return current;
  }

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = Promise.resolve().then(async () => install(await client.snapshot())).finally(() => { refreshing = null; });
    return refreshing;
  }

  async function initialize() {
    stopped = false;
    await refresh();
    return status();
  }

  function start() {
    if (timer) return;
    stopped = false;
    timer = setInterval(() => {
      if (stopped) return;
      refresh().catch(() => {});
    }, refreshMs);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function status() {
    if (!current) return { ready: false, reason: 'authority_snapshot_unavailable', acceptedRevision: highWater?.revision || null };
    const ageMs = nowMs() - current.refreshedAt;
    return {
      ready: ageMs <= maxStaleMs,
      revision: current.revision,
      acceptedRevision: highWater?.revision || current.revision,
      sourceSha: current.sourceSha,
      stateDigest: current.stateDigest,
      committedAt: current.committedAt,
      snapshotAgeMs: ageMs,
      maxStaleMs
    };
  }

  const accountTenantAuthority = Object.freeze({
    resolveRequester(nodeId) { return requireFresh().control.accountTenantAuthority.resolveRequester(nodeId); },
    resolveProvider(nodeId) { return requireFresh().control.accountTenantAuthority.resolveProvider(nodeId); }
  });

  const providerGrantAuthority = Object.freeze({
    durable: true,
    authorize(input) { return requireFresh().control.providerGrantAuthority.authorize(input); },
    visibleToRequester(input) { return requireFresh().control.providerGrantAuthority.visibleToRequester(input); },
    getProviderPolicy(providerNodeId) { return requireFresh().control.providerGrantAuthority.getProviderPolicy(providerNodeId); },
    get revision() { return requireFresh().revision; }
  });

  return Object.freeze({
    initialize,
    refresh,
    start,
    stop,
    status,
    accountTenantAuthority,
    providerGrantAuthority
  });
}
