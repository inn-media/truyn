import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';
import { xorDistance } from '../dht/kademlia.js';

const DEFAULT_DISCOVERY_FANOUT = 20;
const LIVE_DISCOVERY_MAX_ROUNDS = 2;

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

export class ExplicitBackpressureQueue extends BoundedAdmissionQueue {
  constructor({ maxInFlight = 64, maxQueued = 256 } = {}) {
    super({ maxInFlight, maxQueued, errorCode: 'TRUYN_BACKPRESSURE', errorMessage: 'p2p_backpressure' });
  }
}

export class DirectFirstP2P {
  constructor({ quicTransport, discovery, relayFallback = null, maxInFlight = 64, maxQueued = 256, faults = null } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!discovery) throw new Error('peer discovery is required');
    this.quic = quicTransport;
    this.discovery = discovery;
    this.relayFallback = relayFallback;
    this.faults = faults;
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

  async #directClient(peerRecord) {
    const selected = selectedQuicEndpoint(peerRecord);
    if (!selected) throw new Error('peer_has_no_quic_endpoint');
    const binding = peerRecordBinding(peerRecord, selected.value);
    const existing = this.connections.get(peerRecord.nodeId);
    if (existing?.binding === binding) return existing.client;
    if (existing) await this.#discardConnection(peerRecord.nodeId);
    const client = await this.quic.connect(selected.endpoint);
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

      const responses = await Promise.all(peers.map(async (peer) => {
        try { return await rpc.findNode(peer, peerNodeId); }
        catch { rpc.forget?.(peer.nodeId); return null; }
      }));
      for (const response of responses) {
        for (const record of response?.records || []) ingest.call(this.discovery, record);
      }
      const recovered = this.discovery.get(peerNodeId);
      if (recovered) return recovered;
    }
    return null;
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
      // sequential stale routing hints. Probe only currently valid signed peer records
      // first, bounded to two parallel k-sized rounds. These are discovery control RPCs,
      // not application-envelope retries; returned records still enter through ingest()
      // and therefore remain signature/TTL validated before the NEED can be sent.
      const recovered = await this.#recoverFromLivePeers(peerNodeId);
      if (recovered) return recovered;
      return this.discovery.findNode(peerNodeId);
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
