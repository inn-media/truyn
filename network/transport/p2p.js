import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';
import { verifyPeerRecord } from '../discovery/peer-discovery.js';

const DEFAULT_DISCOVERY_RECOVERY_TIMEOUT_MS = 9_000;
const DEFAULT_ROUTE_ATTEMPT_TIMEOUT_MS = 12_500;
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

function retryableConnectError(error) {
  if (error?.code === 'TRUYN_P2P_CONNECT_TIMEOUT' || error?.transient === true) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error?.code);
}

function routeDeadlineError(peerNodeId, phase) {
  const error = new Error(`route_deadline_exceeded:${phase}:${peerNodeId}`);
  error.code = 'TRUYN_ROUTE_DEADLINE_EXCEEDED';
  error.phase = phase;
  return error;
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
    // Kept as accepted compatibility options only. The broad fanout recovery path was
    // removed; canonical PeerDiscovery.findNode() owns normal Kademlia traversal.
    discoveryQueryBudget = null,
    discoveryControlAttempts = null,
    routeAttemptTimeoutMs = DEFAULT_ROUTE_ATTEMPT_TIMEOUT_MS,
    directConnectTimeoutMs = DEFAULT_DIRECT_CONNECT_TIMEOUT_MS,
    directConnectAttempts = DEFAULT_DIRECT_CONNECT_ATTEMPTS,
    directConnectionReuseIdleMs = DEFAULT_DIRECT_CONNECTION_REUSE_IDLE_MS
  } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!discovery) throw new Error('peer discovery is required');
    if (!Number.isInteger(discoveryRecoveryTimeoutMs) || discoveryRecoveryTimeoutMs < 10 || discoveryRecoveryTimeoutMs > 120_000) {
      throw new Error('discoveryRecoveryTimeoutMs must be between 10 and 120000');
    }
    if (discoveryQueryBudget != null && (!Number.isInteger(discoveryQueryBudget) || discoveryQueryBudget < 1 || discoveryQueryBudget > 256)) {
      throw new Error('discoveryQueryBudget must be between 1 and 256');
    }
    if (discoveryControlAttempts != null && (!Number.isInteger(discoveryControlAttempts) || discoveryControlAttempts < 1 || discoveryControlAttempts > 4)) {
      throw new Error('discoveryControlAttempts must be between 1 and 4');
    }
    if (!Number.isInteger(routeAttemptTimeoutMs) || routeAttemptTimeoutMs < 100 || routeAttemptTimeoutMs >= 15_000) {
      throw new Error('routeAttemptTimeoutMs must be between 100 and 14999');
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
    this.routeAttemptTimeoutMs = routeAttemptTimeoutMs;
    this.directConnectTimeoutMs = directConnectTimeoutMs;
    this.directConnectAttempts = directConnectAttempts;
    this.directConnectionReuseIdleMs = directConnectionReuseIdleMs;
    this.connections = new Map();
    this.connectingByNodeId = new Map();
    this.discoveryRecoveries = new Map();
    this.queue = new ExplicitBackpressureQueue({ maxInFlight, maxQueued });
  }

  #remainingMs(deadlineAt) {
    return Math.max(0, deadlineAt - Date.now());
  }

  async #boundedPhase(peerNodeId, deadlineAt, phase, operation, phaseLimitMs = null) {
    const remaining = this.#remainingMs(deadlineAt);
    if (remaining <= 0) throw routeDeadlineError(peerNodeId, phase);
    const timeoutMs = Math.max(1, Math.min(remaining, phaseLimitMs ?? remaining));
    let timer = null;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(routeDeadlineError(peerNodeId, phase)), timeoutMs);
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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

  async #disconnectClient(client) {
    if (!client || typeof this.quic.disconnect !== 'function') return;
    try { await this.quic.disconnect(client); } catch { /* stale connection disposal is best-effort */ }
  }

  async #discardConnection(peerNodeId) {
    const pending = this.connectingByNodeId.get(peerNodeId);
    if (pending) {
      pending.discarded = true;
      this.connectingByNodeId.delete(peerNodeId);
    }
    const existing = this.connections.get(peerNodeId);
    this.connections.delete(peerNodeId);
    await this.#disconnectClient(existing?.client);
  }

  async #boundedConnect(peerNodeId, endpoint, deadlineAt) {
    const timeoutMs = Math.min(this.directConnectTimeoutMs, this.#remainingMs(deadlineAt));
    if (timeoutMs <= 0) throw routeDeadlineError(peerNodeId, 'direct-connect');
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
          }, timeoutMs);
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (timedOut) void operation.then((client) => this.#disconnectClient(client)).catch(() => {});
    }
  }

  async #connectWithRetry(peerRecord, selected, binding, deadlineAt, state) {
    let client = null;
    let lastError = null;
    for (let attempt = 0; attempt < this.directConnectAttempts; attempt += 1) {
      if (this.#remainingMs(deadlineAt) <= 0) throw routeDeadlineError(peerRecord.nodeId, 'direct-connect');
      try {
        client = await this.#boundedConnect(peerRecord.nodeId, selected.endpoint, deadlineAt);
        break;
      } catch (error) {
        lastError = error;
        if (!retryableConnectError(error) || attempt + 1 >= this.directConnectAttempts) throw error;
      }
    }
    if (!client) throw lastError || new Error('peer_connection_failed');
    if (state.discarded || this.connectingByNodeId.get(peerRecord.nodeId) !== state) {
      await this.#disconnectClient(client);
      const error = new Error(`p2p_connection_superseded:${peerRecord.nodeId}`);
      error.code = 'TRUYN_P2P_CONNECTION_SUPERSEDED';
      throw error;
    }
    this.connections.set(peerRecord.nodeId, { client, binding, lastUsedAt: Date.now() });
    this.#watchConnection(peerRecord.nodeId, client);
    return client;
  }

  async #directClient(peerRecord, deadlineAt) {
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

    const inFlight = this.connectingByNodeId.get(peerRecord.nodeId);
    if (inFlight?.binding === binding && !inFlight.discarded) {
      return this.#boundedPhase(peerRecord.nodeId, deadlineAt, 'direct-connect-coalesced', () => inFlight.promise);
    }
    if (inFlight) {
      inFlight.discarded = true;
      this.connectingByNodeId.delete(peerRecord.nodeId);
    }

    const state = { binding, promise: null, discarded: false };
    state.promise = this.#connectWithRetry(peerRecord, selected, binding, deadlineAt, state);
    this.connectingByNodeId.set(peerRecord.nodeId, state);
    try {
      return await state.promise;
    } finally {
      if (this.connectingByNodeId.get(peerRecord.nodeId) === state) this.connectingByNodeId.delete(peerRecord.nodeId);
    }
  }

  #exactStaleHint(peerNodeId) {
    if (typeof this.discovery.durableSnapshot !== 'function') return null;
    for (const record of this.discovery.durableSnapshot() || []) {
      if (record?.nodeId !== peerNodeId) continue;
      if (!verifyPeerRecord(record, { allowExpired: true }).ok) return null;
      if (verifyPeerRecord(record).ok) return null;
      return structuredClone(record);
    }
    return null;
  }

  async #withDiscoveryDeadline(deadlineAt, operation) {
    const rpc = this.discovery.rpc;
    if (typeof rpc?.withDeadline === 'function') return rpc.withDeadline(deadlineAt, operation);
    return operation();
  }

  async #refreshExactStaleHint(peerNodeId, deadlineAt) {
    const hint = this.#exactStaleHint(peerNodeId);
    if (!hint || typeof this.discovery.rpc?.findNode !== 'function' || typeof this.discovery.ingest !== 'function') return null;
    try {
      const response = await this.#boundedPhase(
        peerNodeId,
        deadlineAt,
        'stale-hint-refresh',
        () => this.#withDiscoveryDeadline(deadlineAt, () => this.discovery.rpc.findNode(hint, peerNodeId))
      );
      for (const record of response?.records || []) this.discovery.ingest(record);
      return this.discovery.get(peerNodeId);
    } catch {
      this.discovery.rpc?.forget?.(hint.nodeId);
      return null;
    }
  }

  async #discover(peerNodeId, routeDeadlineAt) {
    const local = this.discovery.get(peerNodeId);
    if (local) return local;

    const existing = this.discoveryRecoveries.get(peerNodeId);
    if (existing) {
      try {
        return await this.#boundedPhase(
          peerNodeId,
          routeDeadlineAt,
          'discovery-coalesced',
          () => existing.promise
        );
      } catch (error) {
        if (error?.code === 'TRUYN_ROUTE_DEADLINE_EXCEEDED') return this.discovery.get(peerNodeId);
        throw error;
      }
    }

    const discoveryDeadlineAt = Math.min(routeDeadlineAt, Date.now() + this.discoveryRecoveryTimeoutMs);
    const state = { promise: null };
    state.promise = (async () => {
      const racedLocal = this.discovery.get(peerNodeId);
      if (racedLocal) return racedLocal;

      // Normal-path discovery is deliberately sequential:
      // fresh local record -> exact cryptographically authenticated stale endpoint hint
      // -> canonical Kademlia alpha walk -> fail. The former broad live-peer fanout is
      // intentionally absent so concurrent baseline routes cannot create an RPC storm.
      const refreshed = await this.#refreshExactStaleHint(peerNodeId, discoveryDeadlineAt);
      if (refreshed) return refreshed;
      if (typeof this.discovery.findNode !== 'function') return null;
      try {
        return await this.#boundedPhase(
          peerNodeId,
          discoveryDeadlineAt,
          'kademlia-find-node',
          () => this.#withDiscoveryDeadline(discoveryDeadlineAt, () => this.discovery.findNode(peerNodeId))
        );
      } catch {
        return this.discovery.get(peerNodeId);
      }
    })();

    this.discoveryRecoveries.set(peerNodeId, state);
    try {
      try {
        return await this.#boundedPhase(peerNodeId, routeDeadlineAt, 'discovery', () => state.promise);
      } catch (error) {
        if (error?.code === 'TRUYN_ROUTE_DEADLINE_EXCEEDED') return this.discovery.get(peerNodeId);
        throw error;
      }
    } finally {
      if (this.discoveryRecoveries.get(peerNodeId) === state) this.discoveryRecoveries.delete(peerNodeId);
    }
  }

  async send(peerNodeId, envelope, { allowRelayFallback = true } = {}) {
    return this.queue.run(async () => {
      const routeDeadlineAt = Date.now() + this.routeAttemptTimeoutMs;
      let applicationDispatched = false;
      let directError = null;
      const record = await this.#discover(peerNodeId, routeDeadlineAt);
      if (record) {
        try {
          this.faults?.assertPeer(peerNodeId, 'direct');
          const client = await this.#directClient(record, routeDeadlineAt);
          applicationDispatched = true;
          const result = await this.#boundedPhase(
            peerNodeId,
            routeDeadlineAt,
            'direct-envelope',
            () => this.quic.sendEnvelope(client, envelope)
          );
          return { transport: 'quic-direct', result };
        } catch (error) {
          directError = error;
          await this.#discardConnection(peerNodeId);
        }
      } else {
        directError = new Error('peer_not_discovered');
      }

      // Once the application envelope has entered a transport, delivery may be
      // ambiguous. Never issue a second application dispatch through relay fallback.
      if (applicationDispatched || !allowRelayFallback || typeof this.relayFallback !== 'function') throw directError;
      try {
        await this.faults?.beforeRelay(peerNodeId);
      } catch (error) {
        error.directFailure = directError?.message || 'unknown';
        throw error;
      }
      applicationDispatched = true;
      const result = await this.#boundedPhase(
        peerNodeId,
        routeDeadlineAt,
        'relay-envelope',
        () => this.relayFallback(peerNodeId, envelope)
      );
      return { transport: 'relay-fallback', result, directFailure: directError?.message || 'unknown' };
    });
  }

  async forget(peerNodeId) { await this.#discardConnection(peerNodeId); }
  admissionSnapshot() { return this.queue.snapshot(); }
}

export { parseQuicEndpoint };