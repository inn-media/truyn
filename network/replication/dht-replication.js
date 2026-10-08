import { verifyDhtRecord } from '../dht/kademlia.js';

function uniquePeers(peers = []) {
  const seen = new Set();
  return peers.filter((peer) => peer?.nodeId && !seen.has(peer.nodeId) && seen.add(peer.nodeId));
}

function lookupRounds(value, fallback = 4) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 64) throw new Error('lookupRounds must be between 0 and 64');
  return parsed;
}

function keyspaceTarget(namespace, key) {
  return `${namespace}:${key}`;
}

export class DhtReplicationManager {
  constructor({ discovery, rpc, recordStore, replicationFactor = 3, writeQuorum = 2, writeTimeoutMs = 30_000, quorumGraceMs = 750 } = {}) {
    if (!discovery || !rpc || !recordStore) throw new Error('DHT replication requires discovery, rpc and recordStore');
    if (!Number.isInteger(replicationFactor) || replicationFactor < 1) throw new Error('replicationFactor must be >= 1');
    if (!Number.isInteger(writeQuorum) || writeQuorum < 1 || writeQuorum > replicationFactor) throw new Error('writeQuorum must be within replicationFactor');
    if (!Number.isInteger(writeTimeoutMs) || writeTimeoutMs < 100 || writeTimeoutMs > 120_000) throw new Error('writeTimeoutMs must be between 100 and 120000');
    if (!Number.isInteger(quorumGraceMs) || quorumGraceMs < 0 || quorumGraceMs > 10_000) throw new Error('quorumGraceMs must be between 0 and 10000');
    this.discovery = discovery;
    this.rpc = rpc;
    this.recordStore = recordStore;
    this.replicationFactor = replicationFactor;
    this.writeQuorum = writeQuorum;
    this.writeTimeoutMs = writeTimeoutMs;
    this.quorumGraceMs = quorumGraceMs;
    this.placementByRecordId = new Map();
    this.telemetry = {
      rebalance: {
        runs: 0,
        recordsExamined: 0,
        recordsChangedPlacement: 0,
        storesAttempted: 0,
        storesSucceeded: 0,
        storesFailed: 0,
        lastStartedAt: null,
        lastCompletedAt: null,
        lastResult: null,
        lastError: null
      },
      reads: {
        calls: 0,
        localHits: 0,
        recordsFound: 0,
        iterativeQueries: 0,
        iterativeResponses: 0,
        frontierHints: 0,
        last: null
      }
    };
  }

  telemetrySnapshot() {
    return structuredClone(this.telemetry);
  }

  peerFromNodeId(nodeId) {
    if (!nodeId || nodeId === this.discovery.identity?.nodeId) return null;
    const record = this.discovery.get?.(nodeId) || this.discovery.hint?.(nodeId);
    if (!record?.nodeId || !Array.isArray(record.endpoints) || record.endpoints.length === 0) return null;
    return { nodeId: record.nodeId, endpoints: [...record.endpoints], publicKey: record.publicKey };
  }

  candidates(namespace, key, count = this.replicationFactor + 4) {
    return uniquePeers(this.discovery.closest(keyspaceTarget(namespace, key), Math.max(count, this.replicationFactor)));
  }

  async expandKeyspace(namespace, key, { maxRounds = 4 } = {}) {
    const rounds = lookupRounds(maxRounds);
    if (rounds === 0 || typeof this.discovery.walk !== 'function') {
      return { attempted: false, queried: [], rounds: 0, responses: 0, error: null };
    }
    try {
      const result = await this.discovery.walk(keyspaceTarget(namespace, key), { maxRounds: rounds, stopOnFound: false });
      return {
        attempted: true,
        queried: Array.isArray(result?.queried) ? [...result.queried] : [],
        rounds: Number.isInteger(result?.rounds) ? result.rounds : 0,
        responses: Number.isInteger(result?.responses) ? result.responses : 0,
        error: null
      };
    } catch (error) {
      return {
        attempted: true,
        queried: [],
        rounds: 0,
        responses: 0,
        error: error?.message || 'dht_keyspace_lookup_failed'
      };
    }
  }

  async put(record, { replicationFactor = this.replicationFactor, minAcks = this.writeQuorum, lookupRounds: rounds = 4, timeoutMs = this.writeTimeoutMs } = {}) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    if (!Number.isInteger(replicationFactor) || replicationFactor < 1) throw new Error('replicationFactor must be >= 1');
    if (!Number.isInteger(minAcks) || minAcks < 1 || minAcks > replicationFactor) throw new Error('minAcks must be within replicationFactor');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('timeoutMs must be between 100 and 120000');

    const deadlineAt = Date.now() + timeoutMs;
    const timeoutError = () => {
      const error = new Error(`TRUYN_DHT_WRITE_TIMEOUT:${timeoutMs}`);
      error.code = 'TRUYN_DHT_WRITE_TIMEOUT';
      error.timeoutMs = timeoutMs;
      return error;
    };
    const checkDeadline = () => {
      if (Date.now() >= deadlineAt) throw timeoutError();
    };

    const execute = async () => {
      // Keyspace discovery gets only the first part of the existing whole-write budget;
      // remote STORE placement keeps the remainder. No timeout/acceptance threshold is raised.
      const lookupDeadlineAt = Math.min(deadlineAt, Date.now() + Math.max(100, Math.floor(timeoutMs / 3)));
      const lookup = typeof this.rpc?.withDeadline === 'function'
        ? await this.rpc.withDeadline(lookupDeadlineAt, () => this.expandKeyspace(record.namespace, record.key, { maxRounds: rounds }))
        : await this.expandKeyspace(record.namespace, record.key, { maxRounds: rounds });
      checkDeadline();

      const local = this.recordStore.put(record);
      let acknowledgements = local.accepted ? 1 : 0;
      const storedAt = local.accepted ? [this.discovery.identity.nodeId] : [];
      const failures = [];
      const remoteNeeded = Math.max(0, replicationFactor - acknowledgements);
      const candidates = this.candidates(record.namespace, record.key, replicationFactor + 8)
        .filter((peer) => peer.nodeId !== this.discovery.identity.nodeId);
      let cursor = 0;
      let inFlight = 0;
      // The deadline outcome is consumed after the asynchronous placement promise.
      // Keep it in the enclosing write scope so timeout failures remain fail-closed
      // instead of escaping as ReferenceError.
      let placementTimedOut = false;

      await new Promise((resolve) => {
        let done = false;
        let graceTimer = null;
        let deadlineTimer = null;

        const finish = () => {
          if (done) return;
          done = true;
          if (graceTimer) clearTimeout(graceTimer);
          if (deadlineTimer) clearTimeout(deadlineTimer);
          resolve();
        };

        const pump = () => {
          if (done) return;
          if (storedAt.length >= replicationFactor) { finish(); return; }
          if (acknowledgements >= minAcks && !graceTimer) {
            graceTimer = setTimeout(finish, this.quorumGraceMs);
            graceTimer.unref?.();
          }

          // Maintain only the number of simultaneous placements needed to reach RF.
          // A slow/failed peer immediately opens a slot for the next closest candidate.
          while (!done && inFlight + storedAt.length < replicationFactor && cursor < candidates.length) {
            const peer = candidates[cursor++];
            inFlight += 1;
            this.rpc.store(peer, record)
              .then((value) => {
                if (value?.stored) {
                  acknowledgements += 1;
                  if (!storedAt.includes(peer.nodeId)) storedAt.push(peer.nodeId);
                } else {
                  failures.push({ nodeId: peer.nodeId, reason: 'dht_store_not_stored' });
                }
              }, (error) => {
                failures.push({ nodeId: peer.nodeId, reason: error?.message || 'dht_store_failed' });
              })
              .finally(() => {
                inFlight -= 1;
                pump();
              });
          }
          if (inFlight === 0 && cursor >= candidates.length) finish();
        };

        deadlineTimer = setTimeout(() => {
          if (acknowledgements < minAcks) placementTimedOut = true;
          finish();
        }, Math.max(1, deadlineAt - Date.now()));
        deadlineTimer.unref?.();
        pump();
      });

      if (acknowledgements < minAcks) {
        if (placementTimedOut || Date.now() >= deadlineAt) throw timeoutError();
        const error = new Error(`TRUYN_DHT_WRITE_QUORUM:${acknowledgements}/${minAcks}`);
        error.code = 'TRUYN_DHT_WRITE_QUORUM';
        error.acknowledgements = acknowledgements;
        error.required = minAcks;
        error.failures = failures;
        throw error;
      }

      const remoteStoredAt = storedAt.filter((nodeId) => nodeId !== this.discovery.identity.nodeId);
      this.placementByRecordId.set(record.recordId, [...remoteStoredAt].sort());
      return {
        stored: true,
        recordId: record.recordId,
        acknowledgements,
        replicationFactor,
        remoteNeeded,
        storedAt,
        failures,
        lookup,
        timeoutMs,
        quorumGraceMs: this.quorumGraceMs
      };
    };
    if (typeof this.rpc?.withDeadline === 'function') return this.rpc.withDeadline(deadlineAt, execute);
    return execute();
  }

  async get(namespace, key, { fanout = this.replicationFactor + 4, lookupRounds: rounds = 4 } = {}) {
    const normalizedRounds = lookupRounds(rounds);
    const normalizedFanout = Math.max(this.replicationFactor, Math.min(64, Number.isInteger(Number(fanout)) ? Number(fanout) : this.replicationFactor + 4));
    const localRecords = this.recordStore.get(namespace, key);
    const byId = new Map(localRecords.map((record) => [record.recordId, record]));
    this.telemetry.reads.calls += 1;

    if (localRecords.length > 0) {
      this.telemetry.reads.localHits += 1;
      this.telemetry.reads.recordsFound += localRecords.length;
      const readTelemetry = {
        localRecordCount: localRecords.length,
        lookupAttempted: false,
        lookupRounds: 0,
        lookupQueriedPeers: 0,
        seedPeerCount: 0,
        iterativeQueryBudget: 0,
        iterativeQueries: 0,
        iterativeResponses: 0,
        frontierHintsAccepted: 0,
        foundAtNodeIds: [this.discovery.identity.nodeId]
      };
      this.telemetry.reads.last = { at: new Date().toISOString(), namespace, key, ...readTelemetry };
      return { records: [...byId.values()], failures: [], lookup: { attempted: false, queried: [], rounds: 0, responses: 0, error: null }, readTelemetry };
    }

    const lookup = await this.expandKeyspace(namespace, key, { maxRounds: normalizedRounds });
    const currentPeers = this.candidates(namespace, key, normalizedFanout);
    const walkedPeers = (lookup.queried || []).map((nodeId) => this.peerFromNodeId(nodeId)).filter(Boolean);
    const queue = uniquePeers([...walkedPeers, ...currentPeers]);
    const queued = new Set(queue.map((peer) => peer.nodeId));
    const queried = new Set();
    const failures = [];
    const foundAtNodeIds = [];
    const alpha = Math.max(1, Math.min(8, Number(this.discovery.alpha) || 3));
    const iterativeQueryBudget = Math.max(
      normalizedFanout,
      Math.min(64, normalizedFanout + normalizedRounds * alpha)
    );
    let cursor = 0;
    let iterativeQueries = 0;
    let iterativeResponses = 0;
    let frontierHintsAccepted = 0;

    while (cursor < queue.length && iterativeQueries < iterativeQueryBudget && byId.size === 0) {
      const batch = [];
      while (cursor < queue.length && batch.length < alpha && iterativeQueries + batch.length < iterativeQueryBudget) {
        const peer = queue[cursor++];
        if (!peer?.nodeId || queried.has(peer.nodeId)) continue;
        queried.add(peer.nodeId);
        batch.push(peer);
      }
      if (batch.length === 0) break;
      iterativeQueries += batch.length;

      const settled = await Promise.all(batch.map(async (peer) => {
        try {
          return { peer, response: await this.rpc.findValue(peer, namespace, key), error: null };
        } catch (error) {
          return { peer, response: null, error };
        }
      }));

      for (const result of settled) {
        if (result.error) {
          failures.push({ nodeId: result.peer.nodeId, reason: result.error?.message || 'dht_find_value_failed' });
          continue;
        }
        iterativeResponses += 1;
        let peerFound = false;
        for (const record of result.response?.records || []) {
          if (!verifyDhtRecord(record).ok) continue;
          byId.set(record.recordId, record);
          this.recordStore.put(record);
          peerFound = true;
        }
        if (peerFound) foundAtNodeIds.push(result.peer.nodeId);

        for (const hint of result.response?.hints || []) {
          if (!hint?.nodeId || queried.has(hint.nodeId) || queued.has(hint.nodeId)) continue;
          queued.add(hint.nodeId);
          queue.push(hint);
          frontierHintsAccepted += 1;
        }
      }
    }

    const records = [...byId.values()].sort((a, b) => b.sequence - a.sequence || a.publisherNodeId.localeCompare(b.publisherNodeId));
    this.telemetry.reads.recordsFound += records.length;
    this.telemetry.reads.iterativeQueries += iterativeQueries;
    this.telemetry.reads.iterativeResponses += iterativeResponses;
    this.telemetry.reads.frontierHints += frontierHintsAccepted;
    const readTelemetry = {
      localRecordCount: 0,
      lookupAttempted: Boolean(lookup.attempted),
      lookupRounds: lookup.rounds || 0,
      lookupQueriedPeers: Array.isArray(lookup.queried) ? lookup.queried.length : 0,
      seedPeerCount: uniquePeers([...walkedPeers, ...currentPeers]).length,
      iterativeQueryBudget,
      iterativeQueries,
      iterativeResponses,
      frontierHintsAccepted,
      foundAtNodeIds
    };
    this.telemetry.reads.last = { at: new Date().toISOString(), namespace, key, ...readTelemetry };
    return { records, failures, lookup, readTelemetry };
  }

  async reconcilePublishedRecords({ maxRecords = 32, concurrency = 2, timeoutMs = Math.min(this.writeTimeoutMs, 15_000) } = {}) {
    const limit = Math.max(1, Math.min(256, Number.isInteger(Number(maxRecords)) ? Number(maxRecords) : 32));
    const workers = Math.max(1, Math.min(8, Number.isInteger(Number(concurrency)) ? Number(concurrency) : 2));
    const perRecordTimeoutMs = Math.max(1_000, Math.min(this.writeTimeoutMs, Number.isInteger(Number(timeoutMs)) ? Number(timeoutMs) : 15_000));
    const records = this.recordStore.snapshot()
      .filter((record) => record.publisherNodeId === this.discovery.identity.nodeId)
      .sort((a, b) => a.recordId.localeCompare(b.recordId))
      .slice(0, limit);

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.telemetry.rebalance.runs += 1;
    this.telemetry.rebalance.lastStartedAt = startedAt;

    let cursor = 0;
    let changedPlacement = 0;
    let storesAttempted = 0;
    let storesSucceeded = 0;
    let storesFailed = 0;
    const details = [];

    const worker = async () => {
      while (cursor < records.length) {
        const record = records[cursor++];
        const remoteTargetCount = Math.max(0, this.replicationFactor - 1);
        const desiredPeers = this.candidates(record.namespace, record.key, this.replicationFactor + 8)
          .filter((peer) => peer.nodeId !== this.discovery.identity.nodeId)
          .slice(0, remoteTargetCount);
        const desiredNodeIds = desiredPeers.map((peer) => peer.nodeId);
        const previousNodeIds = this.placementByRecordId.get(record.recordId) || [];
        const previousSet = new Set(previousNodeIds);
        const changed = desiredNodeIds.length !== previousNodeIds.length
          || desiredNodeIds.some((nodeId) => !previousSet.has(nodeId));

        if (!changed) {
          details.push({ recordId: record.recordId, key: record.key, changed: false, desiredNodeIds, succeededNodeIds: [], failedNodeIds: [] });
          continue;
        }

        changedPlacement += 1;
        const recordDeadlineAt = Date.now() + perRecordTimeoutMs;
        storesAttempted += desiredPeers.length;
        const settled = await Promise.all(desiredPeers.map(async (peer) => {
          try {
            const store = () => this.rpc.store(peer, record);
            const result = typeof this.rpc?.withDeadline === 'function'
              ? await this.rpc.withDeadline(recordDeadlineAt, store)
              : await store();
            return { peer, ok: Boolean(result?.stored), error: null };
          } catch (error) {
            return { peer, ok: false, error };
          }
        }));

        const succeededNodeIds = settled.filter((entry) => entry.ok).map((entry) => entry.peer.nodeId);
        const failedNodeIds = settled.filter((entry) => !entry.ok).map((entry) => entry.peer.nodeId);
        storesSucceeded += succeededNodeIds.length;
        storesFailed += failedNodeIds.length;
        if (failedNodeIds.length === 0 && succeededNodeIds.length === desiredNodeIds.length) {
          this.placementByRecordId.set(record.recordId, [...desiredNodeIds].sort());
        }
        details.push({
          recordId: record.recordId,
          key: record.key,
          changed: true,
          previousNodeIds,
          desiredNodeIds,
          succeededNodeIds,
          failedNodeIds
        });
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(workers, Math.max(1, records.length)) }, () => worker()));
      const result = {
        recordsExamined: records.length,
        recordsChangedPlacement: changedPlacement,
        storesAttempted,
        storesSucceeded,
        storesFailed,
        durationMs: Date.now() - startedMs,
        details: details.slice(0, 32)
      };
      this.telemetry.rebalance.recordsExamined += records.length;
      this.telemetry.rebalance.recordsChangedPlacement += changedPlacement;
      this.telemetry.rebalance.storesAttempted += storesAttempted;
      this.telemetry.rebalance.storesSucceeded += storesSucceeded;
      this.telemetry.rebalance.storesFailed += storesFailed;
      this.telemetry.rebalance.lastCompletedAt = new Date().toISOString();
      this.telemetry.rebalance.lastResult = result;
      this.telemetry.rebalance.lastError = null;
      return structuredClone(result);
    } catch (error) {
      this.telemetry.rebalance.lastCompletedAt = new Date().toISOString();
      this.telemetry.rebalance.lastError = { code: error?.code || null, message: error?.message || String(error) };
      throw error;
    }
  }

  async repair(namespace, key, { replicationFactor = this.replicationFactor, minAcks = this.writeQuorum, lookupRounds: rounds = 4 } = {}) {
    const resolved = await this.get(namespace, key, { fanout: replicationFactor + 8, lookupRounds: rounds });
    const repairs = [];
    for (const record of resolved.records) {
      repairs.push(await this.put(record, { replicationFactor, minAcks, lookupRounds: rounds }));
    }
    return { records: resolved.records.length, repairs, readFailures: resolved.failures, lookup: resolved.lookup };
  }
}
