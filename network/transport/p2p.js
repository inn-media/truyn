import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';
import { xorDistance } from '../dht/kademlia.js';

const DEFAULT_DISCOVERY_FANOUT = 20;
const DEFAULT_DISCOVERY_QUERY_BUDGET = 64;
const DEFAULT_DISCOVERY_RECOVERY_TIMEOUT_MS = 9_000;
const DEFAULT_DISCOVERY_CONTROL_ATTEMPTS = 2;
const DEFAULT_DIRECT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_DIRECT_CONNECT_ATTEMPTS = 3;
const DEFAULT_DIRECT_CONNECTION_REUSE_IDLE_MS = 20_000;

function parseQuicEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
  } catch { return null; }
}

function selectedQuicEndpoint(peerRecord) {
  for (const value of peerRecord?.endpoints || []) {
    const endpoint = parseQuicEndpoint(value);
    if (endpoint) return { value, endpoint };
  }
  return null;
}

function peerRecordBinding(peerRecord, endpointValue) {
  return `${Number.isInteger(peerRecord?.sequence) ? peerRecord.sequence : 'na'}:${endpointValue}`;
}

function distanceOrder(targetNodeId) {
  return (left, right) => {
    const dl = xorDistance(left.nodeId, targetNodeId);
    const dr = xorDistance(right.nodeId, targetNodeId);
    return dl < dr ? -1 : dl > dr ? 1 : left.nodeId.localeCompare(right.nodeId);
  };
}

function retryableConnectError(error) {
  if (error?.code === 'TRUYN_P2P_CONNECT_TIMEOUT' || error?.transient === true) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error?.code);
}

export class ExplicitBackpressureQueue extends BoundedAdmissionQueue {
  constructor({ maxInFlight = 64, maxQueued = 256 } = {}) {
    super({ maxInFlight, maxQueued, errorCode: 'TRUYN_BACKPRESSURE', errorMessage: 'p2p_backpressure' });
  }
}

export class DirectFirstP2P {
  constructor({
    quicTransport,
    discovery,
    relayFallback = null,
    maxInFlight = 64,
    maxQueued = 256,
    faults = null,
    discoveryRecoveryTimeoutMs = DEFAULT_DISCOVERY_RECOVERY_TIMEOUT_MS,
    discoveryQueryBudget = DEFAULT_DISCOVERY_QUERY_BUDGET,
    discoveryControlAttempts = DEFAULT_DISCOVERY_CONTROL_ATTEMPTS,
    directConnectTimeoutMs = DEFAULT_DIRECT_CONNECT_TIMEOUT_MS,
    directConnectAttempts = DEFAULT_DIRECT_CONNECT_ATTEMPTS,
    directConnectionReuseIdleMs = DEFAULT_DIRECT_CONNECTION_REUSE_IDLE_MS
  } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!discovery) throw new Error('peer discovery is required');
    if (!Number.isInteger(discoveryRecoveryTimeoutMs) || discoveryRecoveryTimeoutMs < 10 || discoveryRecoveryTimeoutMs > 120_000) {
      throw new Error('discoveryRecoveryTimeoutMs must be between 10 and 120000');
    }
    if (!Number.isInteger(discoveryQueryBudget) || discoveryQueryBudget < 1 || discoveryQueryBudget > 256) {
      throw new Error('discoveryQueryBudget must be between 1 and 256');
    }
    if (!Number.isInteger(discoveryControlAttempts) || discoveryControlAttempts < 1 || discoveryControlAttempts > 4) {
      throw new Error('discoveryControlAttempts must be between 1 and 4');
    }
    if (!Number.isInteger(directConnectTimeoutMs) || directConnectTimeoutMs < 10 || directConnectTimeoutMs > 120_000) {
      throw new Error('directConnectTimeoutMs must be between 10 and 120000');
    }
    if (!Number.isInteger(directConnectAttempts) || directConnectAttempts < 1 || directConnectAttempts > 4) {
      throw new Error('directConnectAttempts must be between 1 and 4');
    }
    if (!Number.isInteger(directConnectionReuseIdleMs) || directConnectionReuseIdleMs < 10 || directConnectionReuseIdleMs > 120_000) {
      throw new Error('directConnectionReuseIdleMs must be between 10 and 120000');
    }
    this.quic = quicTransport;
    this.discovery = discovery;
    this.relayFallback = relayFallback;
    this.faults = faults;
    this.discoveryRecoveryTimeoutMs = discoveryRecoveryTimeoutMs;
    this.discoveryQueryBudget = discoveryQueryBudget;
    this.discoveryControlAttempts = discoveryControlAttempts;
    this.directConnectTimeoutMs = directConnectTimeoutMs;
    this.directConnectAttempts = directConnectAttempts;
    this.directConnectionReuseIdleMs = directConnectionReuseIdleMs;
    this.connections = new Map();
    this.discoveryRecoveries = new Map();
    this.queue = new ExplicitBackpressureQueue({ maxInFlight, maxQueued });
  }

  #watchConnection(peerNodeId, client) {
    const closed = () => {
      const current = this.connections.get(peerNodeId);
      if (current?.client === client) this.connections.delete(peerNodeId);
    };
    if (client?.closedP && typeof client.closedP.then === 'function') {
      void client.closedP.then(closed, closed);
    }
  }

  async #discardConnection(peerNodeId) {
    const existing = this.connections.get(peerNodeId);
    this.connections.delete(peerNodeId);
    if (!existing?.client || typeof this.quic.disconnect !== 'function') return;
    try { await this.quic.disconnect(existing.client); } catch { /* stale connection disposal is best-effort */ }
  }

  async #boundedConnect(peerNodeId, endpoint) {
    let timer = null;
    let timedOut = false;
    const operation = Promise.resolve().then(() => this.quic.connect(endpoint));
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            const error = new Error(`p2p_connect_timeout:${peerNodeId}`);
            error.code = 'TRUYN_P2P_CONNECT_TIMEOUT';
            reject(error);
          }, this.directConnectTimeoutMs);
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (timedOut && typeof this.quic.disconnect === 'function') {
        void operation.then((client) => this.quic.disconnect(client)).catch(() => {});
      }
    }
  }

  async #directClient(peerRecord) {
    const selected = selectedQuicEndpoint(peerRecord);
    if (!selected) throw new Error('peer_has_no_quic_endpoint');
    const binding = peerRecordBinding(peerRecord, selected.value);
    const existing = this.connections.get(peerRecord.nodeId);
    if (existing?.binding === binding) {
      const lastUsedAt = Number.isFinite(existing.lastUsedAt) ? existing.lastUsedAt : 0;
      if (Date.now() - lastUsedAt < this.directConnectionReuseIdleMs) {
        existing.lastUsedAt = Date.now();
        return existing.client;
      }
      await this.#discardConnection(peerRecord.nodeId);
    } else if (existing) {
      await this.#discardConnection(peerRecord.nodeId);
    }

    let client = null;
    let lastError = null;
    for (let attempt = 0; attempt < this.directConnectAttempts; attempt += 1) {
      try {
        client = await this.#boundedConnect(peerRecord.nodeId, selected.endpoint);
        break;
      } catch (error) {
        lastError = error;
        if (!retryableConnectError(error) || attempt + 1 >= this.directConnectAttempts) throw error;
      }
    }
    if (!client) throw lastError || new Error('peer_connection_failed');

    this.connections.set(peerRecord.nodeId, { client, binding, lastUsedAt: Date.now() });
    this.#watchConnection(peerRecord.nodeId, client);
    return client;
  }

  #recoveryCandidates(peerNodeId, queried) {
    const candidates = new Map();
    const add = (peer) => {
      if (!peer?.nodeId || peer.nodeId === this.discovery.identity?.nodeId || queried.has(peer.nodeId)) return;
      if (!candidates.has(peer.nodeId)) candidates.set(peer.nodeId, peer);
    };

    if (typeof this.discovery.snapshot === 'function') {
      for (const peer of this.discovery.snapshot() || []) add(peer);
    }
    if (typeof this.discovery.closest === 'function') {
      const count = Math.max(
        this.discoveryQueryBudget,
        Number.isInteger(this.discovery.k) ? this.discovery.k : DEFAULT_DISCOVERY_FANOUT
      );
      for (const peer of this.discovery.closest(peerNodeId, count) || []) add(peer);
    }

    return [...candidates.values()].sort(distanceOrder(peerNodeId));
  }

  async #recoverFromLivePeers(peerNodeId) {
    const rpc = this.discovery.rpc;
    const ingest = this.discovery.ingest;
    const canSnapshot = typeof this.discovery.snapshot === 'function';
    const canUseRoutingHints = typeof this.discovery.closest === 'function';
    if ((!canSnapshot && !canUseRoutingHints) || typeof rpc?.findNode !== 'function' || typeof ingest !== 'function') return null;

    const queried = new Set();
    const concurrency = Math.max(1, Math.min(
      this.discoveryQueryBudget,
      64,
      Number.isInteger(this.discovery.k) ? this.discovery.k : DEFAULT_DISCOVERY_FANOUT
    ));

    return new Promise((resolve) => {
      let active = 0;
      let launched = 0;
      let settled = false;
      let timer = null;

      const finish = (record = null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(record || this.discovery.get(peerNodeId));
      };

      const pump = () => {
        if (settled) return;
        const found = this.discovery.get(peerNodeId);
        if (found) {
          finish(found);
          return;
        }

        const candidates = this.#recoveryCandidates(peerNodeId, queried);
        let launchedNow = 0;
        while (active < concurrency && launched < this.discoveryQueryBudget && candidates.length > 0) {
          const peer = candidates.shift();
          if (!peer || queried.has(peer.nodeId)) continue;
          queried.add(peer.nodeId);
          launched += 1;
          launchedNow += 1;
          active += 1;

          void (async () => {
            try {
              let response = null;
              for (let attempt = 0; attempt < this.discoveryControlAttempts; attempt += 1) {
                try {
                  response = await rpc.findNode(peer, peerNodeId);
                  break;
                } catch {
                  rpc.forget?.(peer.nodeId);
                  if (attempt + 1 >= this.discoveryControlAttempts) throw new Error('discovery_control_recovery_exhausted');
                }
              }
              for (const record of response?.records || []) ingest.call(this.discovery, record);
              const recovered = this.discovery.get(peerNodeId);
              if (recovered) finish(recovered);
            } catch {
              rpc.forget?.(peer.nodeId);
            } finally {
              active -= 1;
              if (!settled) pump();
            }
          })();
        }

        if (active === 0 && launchedNow === 0) finish();
      };

      timer = setTimeout(() => finish(), this.discoveryRecoveryTimeoutMs);
      timer.unref?.();
      pump();
    });
  }

  async #boundedDiscovery(peerNodeId, operation) {
    if (!operation) return this.discovery.get(peerNodeId);
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (record = null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(record || this.discovery.get(peerNodeId));
      };
      timer = setTimeout(() => finish(), this.discoveryRecoveryTimeoutMs);
      timer.unref?.();
      void Promise.resolve(operation).then(finish, () => finish());
    });
  }

  async #firstDiscovered(peerNodeId, operations) {
    const pending = operations.filter(Boolean);
    if (pending.length === 0) return this.discovery.get(peerNodeId);
    return new Promise((resolve) => {
      let remaining = pending.length;
      let settled = false;
      const finish = (record) => {
        if (settled) return;
        settled = true;
        resolve(record);
      };
      for (const operation of pending) {
        void Promise.resolve(operation)
          .then((record) => {
            const found = record || this.discovery.get(peerNodeId);
            if (found) finish(found);
          })
          .catch(() => {})
          .finally(() => {
            remaining -= 1;
            if (remaining === 0) finish(this.discovery.get(peerNodeId));
          });
      }
    });
  }

  async #discover(peerNodeId) {
    const local = this.discovery.get(peerNodeId);
    if (local) return local;

    const existing = this.discoveryRecoveries.get(peerNodeId);
    if (existing) return existing;

    const operation = (async () => {
      const racedLocal = this.discovery.get(peerNodeId);
      if (racedLocal) return racedLocal;

      // A missing/expired target after restart or partition healing must be rehydrated
      // on the control plane before any application envelope is dispatched. Use both
      // currently valid peers and previously authenticated routing hints, including an
      // exact stale target hint, and continuously expand the bounded query frontier as
      // fresh signed records arrive. A failed read-only FIND_NODE control exchange gets
      // one bounded fresh-session retry; the application envelope is never retried.
      const liveRecovery = this.#recoverFromLivePeers(peerNodeId);
      const iterativeRecovery = typeof this.discovery.findNode === 'function'
        ? this.#boundedDiscovery(peerNodeId, Promise.resolve().then(() => this.discovery.findNode(peerNodeId)))
        : null;
      return this.#firstDiscovered(peerNodeId, [liveRecovery, iterativeRecovery]);
    })();

    this.discoveryRecoveries.set(peerNodeId, operation);
    try { return await operation; }
    finally {
      if (this.discoveryRecoveries.get(peerNodeId) === operation) this.discoveryRecoveries.delete(peerNodeId);
    }
  }

  async send(peerNodeId, envelope, { allowRelayFallback = true } = {}) {
    return this.queue.run(async () => {
      const record = await this.#discover(peerNodeId);
      let directError = null;
      if (record) {
        try {
          this.faults?.assertPeer(peerNodeId, 'direct');
          const client = await this.#directClient(record);
          const result = await this.quic.sendEnvelope(client, envelope);
          return { transport: 'quic-direct', result };
        } catch (error) {
          directError = error;
          await this.#discardConnection(peerNodeId);
        }
      } else {
        directError = new Error('peer_not_discovered');
      }
      if (!allowRelayFallback || typeof this.relayFallback !== 'function') throw directError;
      try {
        await this.faults?.beforeRelay(peerNodeId);
      } catch (error) {
        error.directFailure = directError?.message || 'unknown';
        throw error;
      }
      const result = await this.relayFallback(peerNodeId, envelope);
      return { transport: 'relay-fallback', result, directFailure: directError?.message || 'unknown' };
    });
  }

  async forget(peerNodeId) { await this.#discardConnection(peerNodeId); }
  admissionSnapshot() { return this.queue.snapshot(); }
}

export { parseQuicEndpoint };
