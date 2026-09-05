import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';
import { xorDistance } from '../dht/kademlia.js';

const DEFAULT_DISCOVERY_FANOUT = 20;
const LIVE_DISCOVERY_MAX_ROUNDS = 2;
const DEFAULT_DIRECT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_DIRECT_CONNECT_ATTEMPTS = 2;

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
    directConnectTimeoutMs = DEFAULT_DIRECT_CONNECT_TIMEOUT_MS,
    directConnectAttempts = DEFAULT_DIRECT_CONNECT_ATTEMPTS
  } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!discovery) throw new Error('peer discovery is required');
    if (!Number.isInteger(directConnectTimeoutMs) || directConnectTimeoutMs < 10 || directConnectTimeoutMs > 120_000) {
      throw new Error('directConnectTimeoutMs must be between 10 and 120000');
    }
    if (!Number.isInteger(directConnectAttempts) || directConnectAttempts < 1 || directConnectAttempts > 4) {
      throw new Error('directConnectAttempts must be between 1 and 4');
    }
    this.quic = quicTransport;
    this.discovery = discovery;
    this.relayFallback = relayFallback;
    this.faults = faults;
    this.directConnectTimeoutMs = directConnectTimeoutMs;
    this.directConnectAttempts = directConnectAttempts;
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
    if (existing?.binding === binding) return existing.client;
    if (existing) await this.#discardConnection(peerRecord.nodeId);

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

    this.connections.set(peerRecord.nodeId, { client, binding });
    this.#watchConnection(peerRecord.nodeId, client);
    return client;
  }

  async #recoverFromLivePeers(peerNodeId) {
    const snapshot = this.discovery.snapshot;
    const rpc = this.discovery.rpc;
    const ingest = this.discovery.ingest;
    if (typeof snapshot !== 'function' || typeof rpc?.findNode !== 'function' || typeof ingest !== 'function') return null;

    const queried = new Set();
    const fanout = Math.max(1, Math.min(64, Number.isInteger(this.discovery.k) ? this.discovery.k : DEFAULT_DISCOVERY_FANOUT));
    for (let round = 0; round < LIVE_DISCOVERY_MAX_ROUNDS; round += 1) {
      const peers = snapshot.call(this.discovery)
        .filter((peer) => peer?.nodeId && peer.nodeId !== peerNodeId && !queried.has(peer.nodeId))
        .sort(distanceOrder(peerNodeId))
        .slice(0, fanout);
      if (peers.length === 0) break;
      for (const peer of peers) queried.add(peer.nodeId);

      const recovered = await new Promise((resolve) => {
        let remaining = peers.length;
        let settled = false;
        const finish = (record) => {
          if (settled) return;
          settled = true;
          resolve(record);
        };
        for (const peer of peers) {
          void (async () => {
            try {
              const response = await rpc.findNode(peer, peerNodeId);
              for (const record of response?.records || []) ingest.call(this.discovery, record);
              const found = this.discovery.get(peerNodeId);
              if (found) finish(found);
            } catch {
              rpc.forget?.(peer.nodeId);
            } finally {
              remaining -= 1;
              if (remaining === 0) finish(this.discovery.get(peerNodeId));
            }
          })();
        }
      });
      if (recovered) return recovered;
    }
    return this.discovery.get(peerNodeId);
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

      // A missing/expired target record must not force the application envelope through
      // sequential stale routing hints or wait for the slowest control RPC in a fanout.
      // Race the broad live-peer recovery with the normal iterative Kademlia walk and
      // return as soon as either control-plane path ingests a valid signed target record.
      // No application envelope is created or retried by this recovery path.
      const liveRecovery = this.#recoverFromLivePeers(peerNodeId);
      const iterativeRecovery = typeof this.discovery.findNode === 'function'
        ? Promise.resolve().then(() => this.discovery.findNode(peerNodeId))
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
