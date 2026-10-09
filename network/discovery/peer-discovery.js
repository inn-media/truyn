import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { KademliaRoutingTable, dhtId, xorDistance } from '../dht/kademlia.js';

const BACKGROUND_LANE = 'background';

export const PEER_RECORD_PROTOCOL = 'truyn-peer-record-v1';

function assertIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('peer identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('peer identity mismatch');
}

function uniqueNonEmptyStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function expiryMs(record) {
  const parsed = Date.parse(record?.expiresAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function createPeerRecord({ identity, endpoints, sequence = 1, ttlMs = 300_000, capabilities = [], nat = null, instanceId = null, issuedAt = new Date().toISOString() } = {}) {
  assertIdentity(identity);
  const normalizedEndpoints = [...new Set((endpoints || []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort();
  if (normalizedEndpoints.length === 0) throw new Error('at least one peer endpoint is required');
  const body = {
    protocol: PEER_RECORD_PROTOCOL,
    nodeId: identity.nodeId,
    dhtId: dhtId(identity.nodeId),
    endpoints: normalizedEndpoints,
    capabilities: [...new Set(capabilities.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort(),
    nat,
    ...(typeof instanceId === 'string' && instanceId ? { instanceId } : {}),
    sequence,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + ttlMs).toISOString()
  };
  const recordId = `truyn:peer:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
  const signed = { recordId, ...body };
  return { ...signed, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

const VERIFIED_PEER_SIGNATURE_LIMIT = 8_192;
const verifiedPeerSignatures = new Map();

export function verifyPeerRecord(record, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!record?.recordId || record.protocol !== PEER_RECORD_PROTOCOL || !record.nodeId || !record.publicKey || !record.signature) return { ok: false, reason: 'peer_record_missing' };
    if (nodeIdFromPublicKey(record.publicKey) !== record.nodeId) return { ok: false, reason: 'peer_record_key_mismatch' };
    if (record.dhtId !== dhtId(record.nodeId)) return { ok: false, reason: 'peer_record_dht_id' };
    if (!Array.isArray(record.endpoints) || record.endpoints.length === 0) return { ok: false, reason: 'peer_record_endpoints' };
    const expires = Date.parse(record.expiresAt);
    if (!Number.isFinite(expires) || (!allowExpired && now >= expires)) return { ok: false, reason: 'peer_record_expired' };
    const { publicKey, signature, ...signed } = record;
    const { recordId, ...body } = signed;
    const expectedId = `truyn:peer:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
    if (expectedId !== recordId) return { ok: false, reason: 'peer_record_id' };
    const signatureKey = `${recordId}\n${publicKey}\n${signature}`;
    if (!verifiedPeerSignatures.has(signatureKey)) {
      if (!verifyValue(signed, signature, publicKey)) return { ok: false, reason: 'peer_record_signature' };
      if (verifiedPeerSignatures.size >= VERIFIED_PEER_SIGNATURE_LIMIT) verifiedPeerSignatures.delete(verifiedPeerSignatures.keys().next().value);
      verifiedPeerSignatures.set(signatureKey, true);
    }
    return { ok: true, nodeId: record.nodeId };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

// Every record in PeerDiscovery.records crosses verifyPeerRecord() before insertion.
// Read paths therefore only need to re-check lease freshness instead of repeatedly
// performing signature verification for every snapshot/persistence barrier.
const leaseLive = (record, now) => expiryMs(record) > now;

function sameEndpoints(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((endpoint, index) => endpoint === right[index]);
}

// Signed, previously verified routing contacts are maintained. Opportunistic
// non-routing peer-record copies are held only in a bounded LRU cache.
export const DEFAULT_MAX_CACHED_PEER_RECORDS = 512;
const RECORD_TRIM_SLACK = 32;

export class PeerDiscovery {
  constructor({ identity, k = 20, alpha = 3, rpc = null, onChange = null, onRecordAccepted = null, maxCachedRecords = DEFAULT_MAX_CACHED_PEER_RECORDS } = {}) {
    assertIdentity(identity);
    if (!Number.isInteger(maxCachedRecords) || maxCachedRecords < 0) throw new Error('maxCachedRecords must be a non-negative integer');
    this.identity = identity;
    this.k = k;
    this.alpha = alpha;
    this.routing = new KademliaRoutingTable({ localNodeId: identity.nodeId, k });
    this.records = new Map();
    this.maxCachedRecords = maxCachedRecords;
    this.recordEvictions = 0;
    this.rpc = rpc;
    this.onChange = onChange;
    this.onRecordAccepted = typeof onRecordAccepted === 'function' ? onRecordAccepted : null;
    this.walksInFlight = new Map();
    this.ingestChanges = 0;
    this.periodicRefreshTimer = null;
    this.periodicRefreshTimerApi = { setTimeout, clearTimeout };
    this.periodicRefreshInFlight = null;
    this.periodicRefresh = {
      enabled: false,
      scheduled: false,
      inFlight: false,
      runs: 0,
      failures: 0,
      config: null,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastResult: null,
      lastError: null
    };
  }

  ingest(record, options = {}) {
    const { notify = true, ...verifyOptions } = options;
    const verification = verifyPeerRecord(record, verifyOptions);
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const existing = this.records.get(record.nodeId);
    if (existing && existing.sequence > record.sequence) return { accepted: false, reason: 'peer_record_older_sequence' };
    if (existing && existing.sequence === record.sequence && existing.recordId !== record.recordId) return { accepted: false, reason: 'peer_record_equivocation' };
    const changed = !existing || existing.recordId !== record.recordId;
    // Renewing an unchanged QUIC binding is not a discovery novelty.
    const novel = !existing || existing.instanceId !== record.instanceId || !sameEndpoints(existing.endpoints, record.endpoints);
    if (changed) this.ingestChanges += 1;
    // Map order tracks LRU recency while retaining fresh signed content.
    this.records.delete(record.nodeId);
    this.records.set(record.nodeId, changed ? structuredClone(record) : existing);
    this.routing.upsert({ nodeId: record.nodeId, endpoints: record.endpoints, publicKey: record.publicKey, lastSeenAt: new Date().toISOString() });
    this.#trimRecordCache();
    if (notify && changed) {
      this.onRecordAccepted?.({
        nodeId: record.nodeId,
        previous: existing ? structuredClone(existing) : null,
        record: structuredClone(record)
      });
      this.onChange?.();
    }
    return { accepted: true, nodeId: record.nodeId, updated: Boolean(existing && changed), unchanged: !changed, novel };
  }

  // Keep all signed routing contacts, with at most a bounded number of
  // opportunistic non-routing copies. Oldest excess copies are evicted first.
  #trimRecordCache() {
    const limit = this.routing.size() + this.maxCachedRecords;
    if (this.records.size <= limit + RECORD_TRIM_SLACK) return;
    for (const nodeId of this.records.keys()) {
      if (this.records.size <= limit) break;
      if (this.routing.has(nodeId)) continue;
      this.records.delete(nodeId);
      this.recordEvictions += 1;
    }
  }

  routingRecords() {
    const result = [];
    for (const [nodeId, record] of this.records) {
      if (nodeId !== this.identity.nodeId && this.routing.has(nodeId)) result.push(record);
    }
    return result;
  }

  get(nodeId, { now = Date.now() } = {}) {
    const record = this.records.get(nodeId);
    return record && leaseLive(record, now) ? structuredClone(record) : null;
  }

  // Non-authoritative routing contact: the stored signed record even if its lease expired.
  hint(nodeId) {
    const record = this.records.get(nodeId);
    return record ? structuredClone(record) : null;
  }

  bootstrap(records, options = {}) { return (records || []).map((record) => this.ingest(record, options)); }
  closest(targetNodeId, count = this.k) { return this.routing.closest(targetNodeId, count); }

  snapshot({ now = Date.now() } = {}) {
    return [...this.records.values()].filter((record) => leaseLive(record, now)).map((record) => structuredClone(record));
  }

  leaseSnapshot({ now = Date.now() } = {}) {
    const records = [...this.records.values()];
    let validPeerRecords = 0;
    let expiredPeerRecords = 0;
    let oldestIssuedAt = null;
    let oldestIssuedMs = Number.POSITIVE_INFINITY;
    let nearestExpiryAt = null;
    let nearestExpiry = Number.POSITIVE_INFINITY;

    for (const record of records) {
      if (leaseLive(record, now)) validPeerRecords += 1;
      else expiredPeerRecords += 1;

      const issued = Date.parse(record.issuedAt);
      if (Number.isFinite(issued) && issued < oldestIssuedMs) {
        oldestIssuedMs = issued;
        oldestIssuedAt = record.issuedAt;
      }
      const expires = expiryMs(record);
      if (Number.isFinite(expires) && expires < nearestExpiry) {
        nearestExpiry = expires;
        nearestExpiryAt = record.expiresAt;
      }
    }

    return {
      recordCount: records.length,
      validPeerRecords,
      expiredPeerRecords,
      oldestPeerRecordIssuedAt: oldestIssuedAt,
      nearestPeerRecordExpiryAt: nearestExpiryAt,
      nearestPeerRecordExpiryMs: Number.isFinite(nearestExpiry) ? Math.round(nearestExpiry - now) : null
    };
  }

  routingSnapshot({ now = Date.now() } = {}) {
    const routing = this.routing.routingSnapshot();
    const validPeers = [...this.records.values()].filter((record) => leaseLive(record, now)).length;

    return {
      ...routing,
      validPeers,
      recordCount: this.records.size,
      staleRoutingPeers: Math.max(0, routing.routingSize - validPeers)
    };
  }

  durableSnapshot() {
    // Records are signature/identity/record-id verified at insertion. Expired records
    // are intentionally retained here only as durable non-authoritative routing hints;
    // live get()/snapshot() continue to fail closed on lease expiry.
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  restore(records = [], options = {}) {
    let accepted = 0;
    for (const record of records) {
      if (this.ingest(record, { ...options, notify: false }).accepted) {
        accepted += 1;
        continue;
      }

      // Durable peer state can legitimately outlive the signed lease while a node is
      // offline. Preserve a previously valid signed record only as a non-authoritative
      // routing hint: get()/snapshot() still reject it as expired, but iterative lookup
      // may contact its old endpoint and accept only fresh signed records returned by a
      // live peer. Tampered/unsigned records never become hints because signature,
      // identity, endpoint and record-id validation still run with allowExpired=true.
      const stale = verifyPeerRecord(record, { allowExpired: true });
      if (!stale.ok || stale.reason) continue;
      const current = verifyPeerRecord(record);
      if (current.ok) continue;
      if (current.reason !== 'peer_record_expired') continue;
      this.records.set(record.nodeId, structuredClone(record));
      this.routing.upsert({
        nodeId: record.nodeId,
        endpoints: record.endpoints,
        publicKey: record.publicKey,
        lastSeenAt: record.issuedAt || new Date(0).toISOString()
      });
    }
    this.#trimRecordCache();
    return accepted;
  }

  sweep({ now = Date.now(), notify = true } = {}) {
    let removed = 0;
    for (const [nodeId, record] of this.records) {
      if (!leaseLive(record, now)) {
        this.records.delete(nodeId);
        this.routing.remove(nodeId);
        this.rpc?.forget?.(nodeId);
        removed += 1;
      }
    }
    if (removed && notify) this.onChange?.();
    return removed;
  }

  periodicRefreshSnapshot() {
    return structuredClone(this.periodicRefresh);
  }

  #clearPeriodicRefreshTimer() {
    if (!this.periodicRefreshTimer) return;
    this.periodicRefreshTimerApi.clearTimeout(this.periodicRefreshTimer);
    this.periodicRefreshTimer = null;
    this.periodicRefresh.scheduled = false;
  }

  startPeriodicRefresh({
    intervalMs,
    targetCount = this.k,
    maxRounds = 4,
    targetConcurrency = 1,
    timeoutMs = null,
    jitterRatio = 0.2,
    seed = 'truyn-periodic-refresh',
    timerApi = null
  } = {}) {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval <= 0) throw new Error('periodic refresh intervalMs must be positive');
    const normalizedTimeoutMs = timeoutMs == null
      ? Math.max(1_000, Math.min(10_000, Math.floor(interval * 0.75)))
      : Number(timeoutMs);
    if (!Number.isInteger(normalizedTimeoutMs) || normalizedTimeoutMs < 100 || normalizedTimeoutMs > 120_000) {
      throw new Error('periodic refresh timeoutMs must be between 100 and 120000');
    }
    const normalizedJitterRatio = Number(jitterRatio);
    if (!Number.isFinite(normalizedJitterRatio) || normalizedJitterRatio < 0 || normalizedJitterRatio > 0.5) {
      throw new Error('periodic refresh jitterRatio must be between 0 and 0.5');
    }
    const normalized = {
      intervalMs: Math.floor(interval),
      targetCount: boundedInteger(targetCount, this.k, { min: 0, max: 256 }),
      maxRounds: boundedInteger(maxRounds, 4, { min: 0, max: 64 }),
      targetConcurrency: boundedInteger(targetConcurrency, 1, { min: 1, max: 16 }),
      timeoutMs: normalizedTimeoutMs,
      jitterRatio: normalizedJitterRatio,
      seed: typeof seed === 'string' && seed.trim() ? seed.trim() : 'truyn-periodic-refresh'
    };
    this.stopPeriodicRefresh();
    this.periodicRefreshTimerApi = {
      setTimeout: typeof timerApi?.setTimeout === 'function' ? timerApi.setTimeout.bind(timerApi) : setTimeout,
      clearTimeout: typeof timerApi?.clearTimeout === 'function' ? timerApi.clearTimeout.bind(timerApi) : clearTimeout
    };
    this.periodicRefresh = {
      ...this.periodicRefresh,
      enabled: true,
      scheduled: false,
      inFlight: false,
      config: structuredClone(normalized),
      lastError: null
    };
    this.#schedulePeriodicRefresh();
    return this.periodicRefreshSnapshot();
  }

  stopPeriodicRefresh() {
    this.#clearPeriodicRefreshTimer();
    this.periodicRefresh = {
      ...this.periodicRefresh,
      enabled: false,
      scheduled: false,
      config: this.periodicRefresh.config ? structuredClone(this.periodicRefresh.config) : null
    };
    return this.periodicRefreshSnapshot();
  }

  close() {
    this.stopPeriodicRefresh();
  }

  #schedulePeriodicRefresh() {
    this.#clearPeriodicRefreshTimer();
    if (!this.periodicRefresh.enabled || !this.periodicRefresh.config) return;
    const { intervalMs, jitterRatio, seed } = this.periodicRefresh.config;
    const jitterKey = `${seed}:${this.identity.nodeId}:${this.periodicRefresh.runs}:${this.periodicRefresh.failures}`;
    const digest = createHash('sha256').update(jitterKey).digest();
    const unit = digest.readUInt32BE(0) / 0xffffffff;
    const centered = (unit * 2) - 1;
    const delayMs = Math.max(1, Math.round(intervalMs * (1 + centered * jitterRatio)));
    this.periodicRefreshTimer = this.periodicRefreshTimerApi.setTimeout(() => {
      this.periodicRefreshTimer = null;
      this.periodicRefresh.scheduled = false;
      void this.#runPeriodicRefresh();
    }, delayMs);
    this.periodicRefresh.scheduled = true;
    this.periodicRefreshTimer?.unref?.();
  }

  async #runPeriodicRefresh() {
    if (!this.periodicRefresh.enabled || !this.periodicRefresh.config) return;
    if (this.periodicRefreshInFlight) {
      this.#schedulePeriodicRefresh();
      return;
    }

    const config = structuredClone(this.periodicRefresh.config);
    const run = this.periodicRefresh.runs + 1;
    this.periodicRefresh.inFlight = true;
    this.periodicRefresh.lastStartedAt = new Date().toISOString();
    const refresh = () => this.refreshRoutingTable({
      targetCount: config.targetCount,
      maxRounds: config.maxRounds,
      targetConcurrency: config.targetConcurrency,
      timeoutMs: config.timeoutMs,
      seed: `${config.seed}:${run}`,
      earlyExitIdleWalks: 4,
      nearExpiryHorizonMs: Math.max(120_000, config.intervalMs * 8)
    });
    const operation = typeof this.rpc?.withLane === 'function'
      ? this.rpc.withLane(BACKGROUND_LANE, refresh)
      : refresh();
    this.periodicRefreshInFlight = operation;

    try {
      const result = await operation;
      if (this.periodicRefreshInFlight === operation) {
        this.periodicRefresh = {
          ...this.periodicRefresh,
          inFlight: false,
          runs: this.periodicRefresh.runs + 1,
          lastCompletedAt: new Date().toISOString(),
          lastResult: {
            refreshed: Boolean(result.refreshed),
            reason: result.reason || null,
            targets: Array.isArray(result.targets) ? result.targets.length : 0,
            nearExpiryTargets: result.targetSelection?.nearExpiryTargets || 0,
            xorTargets: result.targetSelection?.xorTargets || 0,
            walks: Array.isArray(result.walks) ? result.walks.length : 0,
            queriedPeers: Array.isArray(result.queriedPeers) ? result.queriedPeers.length : 0,
            responses: result.responses || 0,
            routingSizeDelta: result.routingSizeDelta || 0,
            validPeersDelta: result.validPeersDelta || 0
          },
          lastError: null
        };
      }
    } catch (error) {
      if (this.periodicRefreshInFlight === operation) {
        this.periodicRefresh = {
          ...this.periodicRefresh,
          inFlight: false,
          failures: this.periodicRefresh.failures + 1,
          lastCompletedAt: new Date().toISOString(),
          lastError: {
            at: new Date().toISOString(),
            code: error?.code || null,
            message: error?.message || String(error)
          }
        };
      }
    } finally {
      if (this.periodicRefreshInFlight === operation) this.periodicRefreshInFlight = null;
      this.#schedulePeriodicRefresh();
    }
  }

  refreshTargetPlan({ targetCount = this.k, now = Date.now(), seed = 'truyn-refresh', expiryTargetCount = null } = {}) {
    const limit = Math.max(0, Number.isInteger(targetCount) ? targetCount : this.k);
    if (limit === 0) return { targets: [], nearExpiryTargets: [], xorTargets: [] };

    const liveRecords = this.snapshot({ now }).filter((record) => record.nodeId !== this.identity.nodeId);
    const defaultExpiryBudget = Math.max(1, Math.ceil(limit / 4));
    const expiryBudget = Math.min(limit, boundedInteger(expiryTargetCount, defaultExpiryBudget, { min: 0, max: limit }));
    const nearExpiryTargets = liveRecords
      .filter((record) => this.routing.has(record.nodeId))
      .sort((left, right) => {
        const le = expiryMs(left);
        const re = expiryMs(right);
        if (le !== re) return le - re;
        const ld = xorDistance(left.nodeId, this.identity.nodeId);
        const rd = xorDistance(right.nodeId, this.identity.nodeId);
        return ld < rd ? -1 : ld > rd ? 1 : left.nodeId.localeCompare(right.nodeId);
      })
      .slice(0, expiryBudget)
      .map((record) => record.nodeId);

    const routingSnapshot = this.routing.routingSnapshot();
    const livePeerTargets = liveRecords.map((record) => record.nodeId);
    const routingPeerTargets = this.routing.snapshot().map((peer) => peer.nodeId);
    const bucketTargets = routingSnapshot.bucketOccupancy
      .filter((bucket) => bucket.count > 0)
      .map((bucket) => `${seed}:${this.identity.nodeId}:bucket:${bucket.index}`);
    const selected = new Set(nearExpiryTargets);
    const xorTargets = uniqueNonEmptyStrings([...livePeerTargets, ...routingPeerTargets, ...bucketTargets])
      .filter((targetNodeId) => targetNodeId !== this.identity.nodeId && !selected.has(targetNodeId))
      .sort((left, right) => {
        const dl = xorDistance(left, this.identity.nodeId);
        const dr = xorDistance(right, this.identity.nodeId);
        return dl < dr ? -1 : dl > dr ? 1 : left.localeCompare(right);
      })
      .slice(0, Math.max(0, limit - nearExpiryTargets.length));

    return {
      targets: [...nearExpiryTargets, ...xorTargets],
      nearExpiryTargets,
      xorTargets
    };
  }

  refreshTargets(options = {}) {
    return this.refreshTargetPlan(options).targets;
  }

  async refreshRoutingTable({ targets = null, targetCount = this.k, maxRounds = 4, now = Date.now(), seed = 'truyn-refresh', expiryTargetCount = null, targetConcurrency = 1, timeoutMs = null, earlyExitIdleWalks = null, nearExpiryHorizonMs = null } = {}) {
    const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Math.floor(Number(timeoutMs)) : null;
    const deadlineAt = normalizedTimeoutMs == null ? null : Date.now() + normalizedTimeoutMs;
    const execute = async () => {
      const before = this.routingSnapshot({ now });
    const limit = Math.max(0, Number.isInteger(targetCount) ? targetCount : this.k);
    const targetPlan = Array.isArray(targets)
      ? {
          targets: uniqueNonEmptyStrings(targets),
          nearExpiryTargets: [],
          xorTargets: []
        }
      : this.refreshTargetPlan({ targetCount: limit, now, seed, expiryTargetCount });
    const selectedTargets = uniqueNonEmptyStrings(targetPlan.targets)
      .filter((targetNodeId) => targetNodeId !== this.identity.nodeId)
      .slice(0, limit);
    const targetSelection = {
      manualTargets: Array.isArray(targets) ? selectedTargets.length : 0,
      nearExpiryTargets: Array.isArray(targets) ? 0 : targetPlan.nearExpiryTargets.filter((target) => selectedTargets.includes(target)).length,
      xorTargets: Array.isArray(targets) ? 0 : targetPlan.xorTargets.filter((target) => selectedTargets.includes(target)).length
    };

    if (typeof this.rpc?.findNode !== 'function') {
      return {
        refreshed: false,
        reason: 'rpc_unavailable',
        before,
        after: this.routingSnapshot({ now }),
        targets: selectedTargets,
        targetSelection,
        walks: [],
        queriedPeers: [],
        responses: 0,
        routingSizeDelta: 0,
        validPeersDelta: 0
      };
    }

    const rounds = Math.max(0, Number.isInteger(maxRounds) ? maxRounds : 4);
    const concurrency = Math.max(1, Math.min(selectedTargets.length || 1, boundedInteger(targetConcurrency, 1, { min: 1, max: 16 })));
    const walks = new Array(selectedTargets.length);
    let nextTargetIndex = 0;
    let deadlineExceeded = false;
    const idleLimit = Number.isInteger(earlyExitIdleWalks) && earlyExitIdleWalks > 0 ? earlyExitIdleWalks : null;
    const horizon = Number.isFinite(Number(nearExpiryHorizonMs)) && Number(nearExpiryHorizonMs) > 0 ? Number(nearExpiryHorizonMs) : null;
    let protectedTargets = targetSelection.nearExpiryTargets;
    if (horizon != null) {
      protectedTargets = 0;
      for (const targetNodeId of selectedTargets.slice(0, targetSelection.nearExpiryTargets)) {
        const record = this.records.get(targetNodeId);
        if (!record || expiryMs(record) - now > horizon) break;
        protectedTargets += 1;
      }
    }
    let idleWalks = 0;
    let converged = false;
    let shed = false;
    const worker = async () => {
      while (true) {
        if (deadlineAt != null && Date.now() >= deadlineAt) { deadlineExceeded = true; return; }
        if (converged || shed) return;
        const index = nextTargetIndex++;
        if (index >= selectedTargets.length) return;
        const targetNodeId = selectedTargets[index];
        const result = await this.walk(targetNodeId, { maxRounds: rounds, stopOnFound: false });
        if (result.shed) shed = true;
        if (idleLimit != null) {
          // Unrelated peer renewal cannot extend this walk's refresh budget.
          if ((result.novel || 0) === 0) idleWalks += 1;
          else idleWalks = 0;
          if (index >= protectedTargets && idleWalks >= idleLimit) converged = true;
        }
        walks[index] = {
          targetNodeId,
          found: Boolean(result.found),
          foundNodeId: result.found?.nodeId || null,
          queried: result.queried,
          rounds: result.rounds,
          responses: result.responses
        };
        if (deadlineAt != null && Date.now() >= deadlineAt) deadlineExceeded = true;
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const completedWalks = walks.filter(Boolean);

    const after = this.routingSnapshot({ now });
    const queriedPeers = uniqueNonEmptyStrings(completedWalks.flatMap((walk) => walk.queried));
    const responses = completedWalks.reduce((sum, walk) => sum + walk.responses, 0);

    return {
      // A backpressured pass did NOT complete the requested refresh. Never
      // allow it to satisfy the Class-D fail-closed refresh admission gate.
      refreshed: !deadlineExceeded && !shed,
      reason: deadlineExceeded ? 'refresh_deadline_exceeded' : (shed ? 'refresh_backpressure' : (converged ? 'refresh_converged' : null)),
      before,
      after,
      targets: selectedTargets,
      targetSelection,
      walks: completedWalks,
      queriedPeers,
      responses,
      routingSizeDelta: after.routingSize - before.routingSize,
      validPeersDelta: after.validPeers - before.validPeers
    };
    };

    if (deadlineAt != null && typeof this.rpc?.withDeadline === 'function') return this.rpc.withDeadline(deadlineAt, execute);
    return execute();
  }

  async walk(targetNodeId, { maxRounds = 16, stopOnFound = true } = {}) {
    if (typeof this.rpc?.findNode !== 'function') {
      return { targetNodeId, found: null, queried: [], rounds: 0, responses: 0 };
    }
    const lane = typeof this.rpc.currentLane === 'function' ? this.rpc.currentLane() : 'control';
    const flightKey = `${targetNodeId}\n${maxRounds}\n${stopOnFound}\n${lane}`;
    const existing = this.walksInFlight.get(flightKey);
    if (existing) return existing;
    const operation = this.#walkOnce(targetNodeId, { maxRounds, stopOnFound })
      .finally(() => { if (this.walksInFlight.get(flightKey) === operation) this.walksInFlight.delete(flightKey); });
    this.walksInFlight.set(flightKey, operation);
    return operation;
  }

  #walkOnce(targetNodeId, { maxRounds, stopOnFound }) {
    const alpha = Math.max(1, Number.isInteger(this.alpha) ? this.alpha : 3);
    const budget = Math.max(0, Number.isInteger(maxRounds) ? maxRounds : 16) * alpha;
    const hedgeAfterMs = Math.max(250, Math.min(1_500, Math.floor((Number(this.rpc?.timeoutMs) || 5_000) / 4)));
    // Foreground lookups still hedge/fail over; background refresh must not
    // amplify remote TRUYN_BUSY by speculatively retrying another contact.
    const background = (typeof this.rpc?.currentLane === 'function' ? this.rpc.currentLane() : 'control') === BACKGROUND_LANE;
    const queried = new Set();
    const responded = new Set();
    const order = [];
    const hints = new Map();
    const slow = new Set();
    let responsesReceived = 0;
    let novel = 0;
    let shed = false;
    let inFlight = 0;
    let finished = false;
    let stableAnswers = 0;
    let lastTopKey = '';

    const converged = () => {
      if (stopOnFound) return false;
      const top = this.closest(targetNodeId, alpha);
      const key = top.map((peer) => peer.nodeId).join(',');
      if (key === lastTopKey) stableAnswers += 1;
      else { stableAnswers = 0; lastTopKey = key; }
      return stableAnswers >= alpha && top.length > 0 && top.every((peer) => responded.has(peer.nodeId));
    };
    const candidates = () => {
      const merged = new Map(this.closest(targetNodeId, this.k).map((peer) => [peer.nodeId, peer]));
      for (const [nodeId, peer] of hints) if (!merged.has(nodeId)) merged.set(nodeId, peer);
      return [...merged.values()]
        .filter((peer) => !queried.has(peer.nodeId))
        .sort((a, b) => {
          const da = xorDistance(a.nodeId, targetNodeId);
          const db = xorDistance(b.nodeId, targetNodeId);
          return da < db ? -1 : da > db ? 1 : a.nodeId.localeCompare(b.nodeId);
        });
    };

    return new Promise((resolve) => {
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve({
          targetNodeId,
          found: this.get(targetNodeId),
          queried: [...order],
          rounds: Math.ceil(order.length / alpha),
          responses: responsesReceived,
          novel,
          shed
        });
      };
      const pump = () => {
        if (finished) return;
        if (stopOnFound && order.length > 0 && this.get(targetNodeId)) { finish(); return; }
        if (!shed && order.length < budget && inFlight < alpha + slow.size) {
          for (const peer of candidates()) {
            if (order.length >= budget || inFlight >= alpha + slow.size) break;
            launch(peer);
          }
        }
        if (inFlight === 0) finish();
      };
      const launch = (peer) => {
        queried.add(peer.nodeId);
        order.push(peer.nodeId);
        inFlight += 1;
        let hedgeTimer = background ? null : setTimeout(() => {
          hedgeTimer = null;
          if (finished || slow.size >= alpha) return;
          slow.add(peer.nodeId);
          pump();
        }, hedgeAfterMs);
        hedgeTimer?.unref?.();
        Promise.resolve()
          .then(() => this.rpc.findNode(peer, targetNodeId))
          .then((response) => {
            if (!response) return;
            responsesReceived += 1;
            responded.add(peer.nodeId);
            for (const record of response.records || []) {
              const accepted = this.ingest(record);
              if (accepted.accepted && accepted.novel) novel += 1;
            }
            for (const record of response.hints || []) {
              if (record?.nodeId && record.nodeId !== this.identity.nodeId && !this.get(record.nodeId)) {
                hints.set(record.nodeId, { nodeId: record.nodeId, endpoints: record.endpoints, publicKey: record.publicKey });
              }
            }
          }, (error) => {
            // QuicDiscoveryRpc retires the exact failed transport when required.
            if (background && error?.code === 'TRUYN_BUSY') shed = true;
          })
          .finally(() => {
            if (hedgeTimer) clearTimeout(hedgeTimer);
            slow.delete(peer.nodeId);
            inFlight -= 1;
            if (!finished && converged()) { finish(); return; }
            pump();
          });
      };
      pump();
    });
  }

  async findNode(targetNodeId, { maxRounds = 16 } = {}) {
    if (targetNodeId === this.identity.nodeId) return null;
    const local = this.get(targetNodeId);
    if (local) return local;
    if (typeof this.rpc?.findNode !== 'function') return null;

    const result = await this.walk(targetNodeId, { maxRounds, stopOnFound: true });
    return result.found;
  }
}
