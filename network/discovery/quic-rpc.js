import { AsyncLocalStorage } from 'node:async_hooks';
import { verifyPeerRecord } from './peer-discovery.js';
import { verifyDhtRecord } from '../dht/kademlia.js';

export const QUIC_DHT_METHOD_PING = 'dht.ping';
export const QUIC_DISCOVERY_METHOD_FIND_NODE = 'dht.find-node';
export const QUIC_DISCOVERY_METHOD_ANNOUNCE = 'peer.announce';
export const QUIC_DHT_METHOD_STORE = 'dht.store';
export const QUIC_DHT_METHOD_FIND_VALUE = 'dht.find-value';

function parseEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return url.hostname && Number.isInteger(port) && port > 0 && port <= 65535
      ? { host: url.hostname.replace(/^\[|\]$/g, ''), port }
      : null;
  } catch { return null; }
}

function selectedEndpoint(peer) {
  for (const value of peer?.endpoints || []) {
    const endpoint = parseEndpoint(value);
    if (endpoint) return { value, endpoint };
  }
  return null;
}

function peerBinding(peer, endpointValue) {
  return `${Number.isInteger(peer?.sequence) ? peer.sequence : 'na'}:${endpointValue}`;
}

function resolveLocalPeerRecord(localPeerRecord) {
  const record = typeof localPeerRecord === 'function' ? localPeerRecord() : localPeerRecord;
  return verifyPeerRecord(record).ok ? structuredClone(record) : null;
}

export class QuicDiscoveryRpc {
  constructor({ quicTransport, timeoutMs = 5_000, faults = null, ingestPeerRecord = null } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('DHT RPC timeoutMs must be between 100 and 120000');
    this.quic = quicTransport;
    this.timeoutMs = timeoutMs;
    this.faults = faults;
    this.ingestPeerRecord = typeof ingestPeerRecord === 'function' ? ingestPeerRecord : null;
    this.clients = new Map();
    this.connectingByNodeId = new Map();
    this.deadlineContext = new AsyncLocalStorage();
  }

  withDeadline(deadlineAt, operation) {
    if (!Number.isFinite(deadlineAt)) return operation();
    const inherited = this.deadlineContext.getStore();
    const effective = Number.isFinite(inherited) ? Math.min(inherited, deadlineAt) : deadlineAt;
    return this.deadlineContext.run(effective, operation);
  }

  #effectiveTimeout(requestedTimeoutMs = null) {
    const requested = Number.isFinite(requestedTimeoutMs) ? Math.max(1, Math.floor(requestedTimeoutMs)) : this.timeoutMs;
    const deadlineAt = this.deadlineContext.getStore();
    if (!Number.isFinite(deadlineAt)) return requested;
    const remaining = deadlineAt - Date.now();
    return remaining <= 0 ? 0 : Math.max(1, Math.min(requested, remaining));
  }

  #watchClient(nodeId, client) {
    const closed = () => {
      const current = this.clients.get(nodeId);
      if (current?.client === client) this.clients.delete(nodeId);
    };
    if (client?.closedP && typeof client.closedP.then === 'function') {
      void client.closedP.then(closed, closed);
    }
  }

  async #disconnect(client) {
    if (!client) return;
    if (typeof this.quic.disconnect === 'function') {
      try { await this.quic.disconnect(client); } catch {}
      return;
    }
    if (typeof client.destroy === 'function') {
      try { await client.destroy({ force: true }); } catch {}
    }
  }

  #forgetClient(nodeId, client) {
    if (!client) return;
    const existing = this.clients.get(nodeId);
    if (existing?.client !== client) return;
    this.clients.delete(nodeId);
    void this.#disconnect(client);
  }

  async client(peer) {
    const selected = selectedEndpoint(peer);
    if (!selected) throw new Error('discovery_peer_has_no_quic_endpoint');
    const binding = peerBinding(peer, selected.value);
    const existing = this.clients.get(peer.nodeId);
    if (existing?.binding === binding) return existing.client;
    if (existing) this.forget(peer.nodeId);

    const currentPending = this.connectingByNodeId.get(peer.nodeId);
    if (currentPending?.binding === binding && !currentPending.discarded) return currentPending.promise;
    if (currentPending) {
      currentPending.discarded = true;
      this.connectingByNodeId.delete(peer.nodeId);
    }

    const state = { binding, promise: null, discarded: false };
    state.promise = (async () => {
      const client = await this.quic.connect(selected.endpoint);
      if (state.discarded || this.connectingByNodeId.get(peer.nodeId) !== state) {
        await this.#disconnect(client);
        const error = new Error(`discovery_connection_superseded:${peer.nodeId}`);
        error.code = 'TRUYN_DISCOVERY_CONNECTION_SUPERSEDED';
        throw error;
      }
      this.clients.set(peer.nodeId, { client, binding });
      this.#watchClient(peer.nodeId, client);
      return client;
    })();
    this.connectingByNodeId.set(peer.nodeId, state);
    try {
      return await state.promise;
    } finally {
      if (this.connectingByNodeId.get(peer.nodeId) === state) this.connectingByNodeId.delete(peer.nodeId);
    }
  }

  async bounded(peer, operation, { timeoutMs = null, state = null } = {}) {
    const effectiveTimeoutMs = this.#effectiveTimeout(timeoutMs);
    if (effectiveTimeoutMs <= 0) {
      const error = new Error(`TRUYN_DHT_RPC_TIMEOUT:${peer.nodeId}`);
      error.code = 'TRUYN_DHT_RPC_TIMEOUT';
      if (state) state.cancelledError = error;
      throw error;
    }
    let timer = null;
    try {
      this.faults?.assertPeer(peer.nodeId, 'dht-rpc');
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`TRUYN_DHT_RPC_TIMEOUT:${peer.nodeId}`);
            error.code = 'TRUYN_DHT_RPC_TIMEOUT';
            if (state) state.cancelledError = error;
            reject(error);
          }, effectiveTimeoutMs);
        })
      ]);
    } catch (error) {
      if (state) this.#forgetClient(peer.nodeId, state.client);
      else this.forget(peer.nodeId);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async ping(peer, options = {}) {
    const state = { client: null, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      state.client = client;
      if (state.cancelledError) throw state.cancelledError;
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_PING, null);
      if (verifyPeerRecord(result?.peerRecord).ok && this.ingestPeerRecord) {
        const record = structuredClone(result.peerRecord);
        // A newer record may invalidate this exact cached RPC client. Do not tear it down
        // re-entrantly while the native QUIC control-response stack is still unwinding.
        setImmediate(() => this.ingestPeerRecord?.(record));
      }
      return Boolean(result?.pong);
    }, { ...options, state });
  }

  async findNode(peer, targetNodeId, options = {}) {
    const state = { client: null, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      state.client = client;
      if (state.cancelledError) throw state.cancelledError;
      const result = await this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_FIND_NODE, { targetNodeId });
      const records = [];
      for (const record of result?.records || []) {
        if (verifyPeerRecord(record).ok) records.push(record);
      }
      return { records };
    }, { ...options, state });
  }

  async announce(peer, record, options = {}) {
    const verification = verifyPeerRecord(record);
    if (!verification.ok) throw new Error(`invalid_peer_record:${verification.reason}`);
    const state = { client: null, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      state.client = client;
      if (state.cancelledError) throw state.cancelledError;
      return this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_ANNOUNCE, { record });
    }, { ...options, state });
  }

  async store(peer, record, options = {}) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    const state = { client: null, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      state.client = client;
      if (state.cancelledError) throw state.cancelledError;
      return this.quic.requestControl(client, QUIC_DHT_METHOD_STORE, { record });
    }, { ...options, state });
  }

  async findValue(peer, namespace, key, options = {}) {
    const state = { client: null, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      state.client = client;
      if (state.cancelledError) throw state.cancelledError;
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_FIND_VALUE, { namespace, key });
      const records = [];
      for (const record of result?.records || []) {
        if (verifyDhtRecord(record).ok) records.push(record);
      }
      return { records };
    }, { ...options, state });
  }

  forget(nodeId) {
    const pending = this.connectingByNodeId.get(nodeId);
    if (pending) {
      pending.discarded = true;
      this.connectingByNodeId.delete(nodeId);
    }
    const existing = this.clients.get(nodeId);
    this.clients.delete(nodeId);
    const client = existing?.client || existing;
    if (!client) return;
    void this.#disconnect(client);
  }
}

export function createQuicDiscoveryControlHandler(discovery, {
  maxRecords = null,
  recordStore = null,
  localPeerRecord = null,
  persistRecordStore = null
} = {}) {
  if (!discovery?.closest || !discovery?.get) throw new Error('peer discovery is required');
  if (persistRecordStore != null && typeof persistRecordStore !== 'function') throw new Error('persistRecordStore must be a function');
  const limit = Number.isInteger(maxRecords) && maxRecords > 0 ? maxRecords : discovery.k;
  return async (method, payload, context) => {
    if (method === QUIC_DHT_METHOD_PING) {
      return {
        pong: true,
        nodeId: discovery.identity.nodeId,
        requesterNodeId: context?.peerNodeId || null,
        peerRecord: resolveLocalPeerRecord(localPeerRecord)
      };
    }

    if (method === QUIC_DISCOVERY_METHOD_FIND_NODE) {
      const targetNodeId = payload?.targetNodeId;
      if (typeof targetNodeId !== 'string' || !targetNodeId) throw new Error('targetNodeId is required');
      if (targetNodeId === discovery.identity.nodeId) {
        const self = resolveLocalPeerRecord(localPeerRecord);
        if (self) return { records: [self] };
      }
      const direct = discovery.get(targetNodeId);
      if (direct) return { records: [direct] };
      const records = [];
      for (const peer of discovery.closest(targetNodeId, limit)) {
        const record = discovery.get(peer.nodeId);
        if (record) records.push(record);
      }
      return { records };
    }

    if (method === QUIC_DISCOVERY_METHOD_ANNOUNCE) {
      const record = payload?.record;
      const verification = verifyPeerRecord(record);
      if (!verification.ok) throw new Error(`invalid_peer_record:${verification.reason}`);
      if (context?.peerNodeId && record.nodeId !== context.peerNodeId) throw new Error('peer_announce_identity_mismatch');
      const accepted = discovery.ingest(record);
      if (!accepted.accepted) throw new Error(accepted.reason || 'peer_announce_rejected');
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    }

    if (method === QUIC_DHT_METHOD_STORE) {
      if (!recordStore?.put) throw new Error('dht_record_store_unavailable');
      const record = payload?.record;
      const verification = verifyDhtRecord(record);
      if (!verification.ok) throw new Error(`invalid_dht_record:${verification.reason}`);
      const stored = recordStore.put(record);
      if (!stored.accepted) throw new Error(stored.reason || 'dht_store_rejected');
      // A dht.store response is a write acknowledgement. When durable state is
      // configured by the runtime, do not emit that ACK until the accepted record
      // has crossed the persistence barrier. A persistence failure therefore
      // fails closed and is not counted toward the writer's quorum.
      if (persistRecordStore) await persistRecordStore();
      return { stored: true, durable: Boolean(persistRecordStore), recordId: record.recordId };
    }

    if (method === QUIC_DHT_METHOD_FIND_VALUE) {
      if (!recordStore?.get) throw new Error('dht_record_store_unavailable');
      if (typeof payload?.namespace !== 'string' || !payload.namespace || typeof payload?.key !== 'string' || !payload.key) {
        throw new Error('dht namespace and key are required');
      }
      return { records: recordStore.get(payload.namespace, payload.key) };
    }

    throw new Error('unsupported_discovery_control_method');
  };
}
