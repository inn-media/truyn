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

      await new Promise((resolve) => {
        let done = false;
        let graceTimer = null;
        let deadlineTimer = null;
        let placementTimedOut = false;

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
    const lookup = await this.expandKeyspace(namespace, key, { maxRounds: rounds });
    const byId = new Map(this.recordStore.get(namespace, key).map((record) => [record.recordId, record]));
    const failures = [];
    const peers = this.candidates(namespace, key, fanout);
    const settled = await Promise.all(peers.map(async (peer) => {
      try {
        return { peer, response: await this.rpc.findValue(peer, namespace, key), error: null };
      } catch (error) {
        // QuicDiscoveryRpc owns exact client retirement. Do not globally forget a
        // peer because one concurrent read stream failed.
        return { peer, response: null, error };
      }
    }));

    for (const result of settled) {
      if (result.error) {
        failures.push({ nodeId: result.peer.nodeId, reason: result.error?.message || 'dht_find_value_failed' });
        continue;
      }
      for (const record of result.response?.records || []) {
        if (!verifyDhtRecord(record).ok) continue;
        byId.set(record.recordId, record);
        this.recordStore.put(record);
      }
    }
    const records = [...byId.values()].sort((a, b) => b.sequence - a.sequence || a.publisherNodeId.localeCompare(b.publisherNodeId));
    return { records, failures, lookup };
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
