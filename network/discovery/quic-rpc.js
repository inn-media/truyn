import { AsyncLocalStorage } from 'node:async_hooks';
import { verifyPeerRecord } from './peer-discovery.js';
import { verifyDhtRecord } from '../dht/kademlia.js';

export const QUIC_DHT_METHOD_PING = 'dht.ping';
export const QUIC_DISCOVERY_METHOD_FIND_NODE = 'dht.find-node';
export const QUIC_DISCOVERY_METHOD_ANNOUNCE = 'peer.announce';
export const QUIC_DHT_METHOD_STORE = 'dht.store';
export const QUIC_DHT_METHOD_FIND_VALUE = 'dht.find-value';

const DEFAULT_SUPERSEDED_RETRIES = 2;

export const RPC_LANE_CRITICAL = 'critical';
export const RPC_LANE_CONTROL = 'control';
export const RPC_LANE_BACKGROUND = 'background';
export const RPC_LANES = Object.freeze([RPC_LANE_CRITICAL, RPC_LANE_CONTROL, RPC_LANE_BACKGROUND]);
const DEFAULT_LANE_LIMITS = Object.freeze({ critical: 48, control: 24, background: 6 });
const DEFAULT_PER_PEER_IN_FLIGHT = 4;
const DEFAULT_MAX_CLIENTS = 64;
const DEFAULT_CLIENT_IDLE_MS = 20_000;
const CLIENT_SWEEP_INTERVAL_MS = 5_000;

function normalizeLane(lane) {
  return RPC_LANES.includes(lane) ? lane : RPC_LANE_CONTROL;
}

function rpcTimeoutError(peerNodeId) {
  const error = new Error(`TRUYN_DHT_RPC_TIMEOUT:${peerNodeId}`);
  error.code = 'TRUYN_DHT_RPC_TIMEOUT';
  return error;
}

export class RpcLaneScheduler {
  constructor({ laneLimits = DEFAULT_LANE_LIMITS, perPeerInFlight = DEFAULT_PER_PEER_IN_FLIGHT } = {}) {
    this.laneLimits = { ...DEFAULT_LANE_LIMITS, ...(laneLimits || {}) };
    for (const lane of RPC_LANES) {
      if (!Number.isInteger(this.laneLimits[lane]) || this.laneLimits[lane] < 1) throw new Error(`RPC lane limit for ${lane} must be a positive integer`);
    }
    if (!Number.isInteger(perPeerInFlight) || perPeerInFlight < 1) throw new Error('perPeerInFlight must be a positive integer');
    this.perPeerInFlight = perPeerInFlight;
    this.inFlight = Object.fromEntries(RPC_LANES.map((lane) => [lane, 0]));
    this.queues = Object.fromEntries(RPC_LANES.map((lane) => [lane, []]));
    this.peerInFlight = new Map();
    this.stats = Object.fromEntries(RPC_LANES.map((lane) => [lane, { admitted: 0, queued: 0, expiredInQueue: 0, maxQueueDepth: 0 }]));
  }

  #canRun(lane, peerId) {
    return this.inFlight[lane] < this.laneLimits[lane] && (this.peerInFlight.get(peerId) || 0) < this.perPeerInFlight;
  }

  #start(lane, peerId) {
    this.inFlight[lane] += 1;
    this.peerInFlight.set(peerId, (this.peerInFlight.get(peerId) || 0) + 1);
    this.stats[lane].admitted += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight[lane] -= 1;
      const remaining = (this.peerInFlight.get(peerId) || 1) - 1;
      if (remaining <= 0) this.peerInFlight.delete(peerId);
      else this.peerInFlight.set(peerId, remaining);
      this.#pump();
    };
  }

  #pump() {
    for (const lane of RPC_LANES) {
      const queue = this.queues[lane];
      for (let index = 0; index < queue.length && this.inFlight[lane] < this.laneLimits[lane];) {
        const waiter = queue[index];
        if (!this.#canRun(lane, waiter.peerId)) { index += 1; continue; }
        queue.splice(index, 1);
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.resolve(this.#start(lane, waiter.peerId));
      }
    }
  }

  acquire(lane, peerId, deadlineAt) {
    const normalized = normalizeLane(lane);
    const key = String(peerId || 'unknown');
    if (this.queues[normalized].length === 0 && this.#canRun(normalized, key)) return Promise.resolve(this.#start(normalized, key));
    return new Promise((resolve, reject) => {
      const waiter = { peerId: key, resolve, timer: null };
      const remaining = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : null;
      if (remaining != null) {
        if (remaining <= 0) { this.stats[normalized].expiredInQueue += 1; reject(rpcTimeoutError(key)); return; }
        waiter.timer = setTimeout(() => {
          const queue = this.queues[normalized];
          const index = queue.indexOf(waiter);
          if (index >= 0) queue.splice(index, 1);
          this.stats[normalized].expiredInQueue += 1;
          reject(rpcTimeoutError(key));
        }, remaining);
        waiter.timer.unref?.();
      }
      this.queues[normalized].push(waiter);
      this.stats[normalized].queued += 1;
      this.stats[normalized].maxQueueDepth = Math.max(this.stats[normalized].maxQueueDepth, this.queues[normalized].length);
    });
  }

  snapshot() {
    return Object.fromEntries(RPC_LANES.map((lane) => [lane, {
      limit: this.laneLimits[lane],
      inFlight: this.inFlight[lane],
      queued: this.queues[lane].length,
      ...this.stats[lane]
    }]));
  }
}

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
  const epoch = peer?.instanceId || (Number.isInteger(peer?.sequence) ? peer.sequence : 'na');
  return `${epoch}:${endpointValue}`;
}

function peerSequence(peer) {
  return Number.isInteger(peer?.sequence) ? peer.sequence : -1;
}

function sameOrNewerGeneration(candidate, reference) {
  return candidate?.nodeId === reference?.nodeId && peerSequence(candidate) >= peerSequence(reference);
}

function resolveLocalPeerRecord(localPeerRecord) {
  const record = typeof localPeerRecord === 'function' ? localPeerRecord() : localPeerRecord;
  return verifyPeerRecord(record).ok ? structuredClone(record) : null;
}

export class QuicDiscoveryRpc {
  constructor({
    quicTransport,
    timeoutMs = 5_000,
    faults = null,
    ingestPeerRecord = null,
    supersededRetries = DEFAULT_SUPERSEDED_RETRIES,
    laneLimits = DEFAULT_LANE_LIMITS,
    perPeerInFlight = DEFAULT_PER_PEER_IN_FLIGHT,
    maxClients = DEFAULT_MAX_CLIENTS,
    clientIdleMs = DEFAULT_CLIENT_IDLE_MS
  } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('DHT RPC timeoutMs must be between 100 and 120000');
    if (!Number.isInteger(supersededRetries) || supersededRetries < 0 || supersededRetries > 4) throw new Error('supersededRetries must be between 0 and 4');
    if (!Number.isInteger(maxClients) || maxClients < 1) throw new Error('maxClients must be a positive integer');
    if (!Number.isInteger(clientIdleMs) || clientIdleMs < 1_000) throw new Error('clientIdleMs must be >= 1000');
    this.quic = quicTransport;
    this.timeoutMs = timeoutMs;
    this.faults = faults;
    this.ingestPeerRecord = typeof ingestPeerRecord === 'function' ? ingestPeerRecord : null;
    this.supersededRetries = supersededRetries;
    this.clients = new Map();
    this.connectingByNodeId = new Map();
    this.clientUsers = new WeakMap();
    this.retiredClients = new WeakSet();
    this.disconnectingClients = new WeakSet();
    this.deadlineContext = new AsyncLocalStorage();
    this.laneContext = new AsyncLocalStorage();
    this.scheduler = new RpcLaneScheduler({ laneLimits, perPeerInFlight });
    this.maxClients = maxClients;
    this.clientIdleMs = clientIdleMs;
    this.clientSweepTimer = null;
    this.poolStats = { evictedIdle: 0, evictedOverCap: 0 };
  }

  withDeadline(deadlineAt, operation) {
    if (!Number.isFinite(deadlineAt)) return operation();
    const inherited = this.deadlineContext.getStore();
    const effective = Number.isFinite(inherited) ? Math.min(inherited, deadlineAt) : deadlineAt;
    return this.deadlineContext.run(effective, operation);
  }

  withLane(lane, operation) {
    return this.laneContext.run(normalizeLane(lane), operation);
  }

  currentLane() {
    return normalizeLane(this.laneContext.getStore());
  }

  detached(operation) {
    return this.deadlineContext.exit(() => this.laneContext.exit(operation));
  }

  schedulerSnapshot() {
    return {
      lanes: this.scheduler.snapshot(),
      clients: this.clients.size,
      maxClients: this.maxClients,
      clientIdleMs: this.clientIdleMs,
      ...this.poolStats
    };
  }

  close() {
    if (this.clientSweepTimer) clearInterval(this.clientSweepTimer);
    this.clientSweepTimer = null;
  }

  #ensureClientSweep() {
    if (this.clientSweepTimer) return;
    this.clientSweepTimer = setInterval(() => this.sweepClients(), CLIENT_SWEEP_INTERVAL_MS);
    this.clientSweepTimer.unref?.();
  }

  #touchClient(nodeId, client) {
    const entry = this.clients.get(nodeId);
    if (entry?.client === client) entry.lastUsedAt = Date.now();
  }

  sweepClients({ now = Date.now() } = {}) {
    const idle = [];
    for (const [nodeId, entry] of this.clients) {
      if ((this.clientUsers.get(entry.client) || 0) > 0) continue;
      idle.push({ nodeId, entry });
    }
    idle.sort((a, b) => (a.entry.lastUsedAt || 0) - (b.entry.lastUsedAt || 0));
    let overCap = Math.max(0, this.clients.size - this.maxClients);
    for (const { nodeId, entry } of idle) {
      const expired = now - (entry.lastUsedAt || 0) >= this.clientIdleMs;
      if (!expired && overCap <= 0) continue;
      if (expired) this.poolStats.evictedIdle += 1;
      else this.poolStats.evictedOverCap += 1;
      if (overCap > 0) overCap -= 1;
      this.#retireClient(nodeId, entry.client);
    }
    if (this.clients.size === 0 && this.clientSweepTimer) {
      clearInterval(this.clientSweepTimer);
      this.clientSweepTimer = null;
    }
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
    if (!client || this.disconnectingClients.has(client)) return;
    this.disconnectingClients.add(client);
    if (typeof this.quic.disconnect === 'function') {
      try { await this.quic.disconnect(client); } catch {}
      return;
    }
    if (typeof client.destroy === 'function') {
      try { await client.destroy({ force: true }); } catch {}
    }
  }

  #acquireClient(client) {
    if (!client || (typeof client !== 'object' && typeof client !== 'function')) return client;
    this.clientUsers.set(client, (this.clientUsers.get(client) || 0) + 1);
    return client;
  }

  #releaseClient(client, nodeId = null) {
    if (!client || (typeof client !== 'object' && typeof client !== 'function')) return;
    if (nodeId) this.#touchClient(nodeId, client);
    const remaining = Math.max(0, (this.clientUsers.get(client) || 1) - 1);
    if (remaining === 0) {
      this.clientUsers.delete(client);
      if (this.retiredClients.has(client)) void this.#disconnect(client);
      return;
    }
    this.clientUsers.set(client, remaining);
  }

  #retireClient(nodeId, client) {
    if (!client) return;
    const existing = this.clients.get(nodeId);
    if (existing?.client === client) this.clients.delete(nodeId);
    this.retiredClients.add(client);
    if ((this.clientUsers.get(client) || 0) === 0) void this.#disconnect(client);
  }

  #forgetBinding(nodeId, binding) {
    const pending = this.connectingByNodeId.get(nodeId);
    if (pending?.binding === binding) {
      pending.discarded = true;
      this.connectingByNodeId.delete(nodeId);
    }
    const existing = this.clients.get(nodeId);
    if (existing?.binding !== binding) return;
    this.clients.delete(nodeId);
    // A peer generation/end-point change is an explicit topology invalidation.
    // Unlike a single failed control stream, stale-generation teardown is
    // deliberately immediate so no stale session survives the rebinding event.
    void this.#disconnect(existing.client);
  }

  async client(peer) {
    const selected = selectedEndpoint(peer);
    if (!selected) throw new Error('discovery_peer_has_no_quic_endpoint');
    const binding = peerBinding(peer, selected.value);
    const existing = this.clients.get(peer.nodeId);
    if (existing?.binding === binding) { existing.lastUsedAt = Date.now(); return existing.client; }
    if (existing) {
      if (sameOrNewerGeneration(existing.peer, peer)) { existing.lastUsedAt = Date.now(); return existing.client; }
      this.#forgetBinding(peer.nodeId, existing.binding);
    }

    const currentPending = this.connectingByNodeId.get(peer.nodeId);
    if (currentPending?.binding === binding && !currentPending.discarded) return currentPending.promise;
    if (currentPending && !currentPending.discarded && sameOrNewerGeneration(currentPending.peer, peer)) {
      return currentPending.promise;
    }
    if (currentPending) {
      currentPending.discarded = true;
      this.connectingByNodeId.delete(peer.nodeId);
    }

    const state = { binding, peer: structuredClone(peer), promise: null, discarded: false };
    state.promise = (async () => {
      const client = await this.quic.connect(selected.endpoint);
      if (state.discarded || this.connectingByNodeId.get(peer.nodeId) !== state) {
        await this.#disconnect(client);
        const replacement = this.connectingByNodeId.get(peer.nodeId);
        if (replacement && !replacement.discarded && sameOrNewerGeneration(replacement.peer, peer)) return replacement.promise;
        const replacementClient = this.clients.get(peer.nodeId);
        if (replacementClient && sameOrNewerGeneration(replacementClient.peer, peer)) return replacementClient.client;
        const error = new Error(`discovery_connection_superseded:${peer.nodeId}`);
        error.code = 'TRUYN_DISCOVERY_CONNECTION_SUPERSEDED';
        throw error;
      }
      this.clients.set(peer.nodeId, { client, binding, peer: structuredClone(peer), lastUsedAt: Date.now() });
      this.#watchClient(peer.nodeId, client);
      this.#ensureClientSweep();
      if (this.clients.size > this.maxClients) setImmediate(() => this.sweepClients());
      return client;
    })();
    this.connectingByNodeId.set(peer.nodeId, state);
    try {
      return await state.promise;
    } finally {
      if (this.connectingByNodeId.get(peer.nodeId) === state) this.connectingByNodeId.delete(peer.nodeId);
    }
  }

  async bounded(peer, operation, { timeoutMs = null, state = null, lane = null } = {}) {
    const effectiveTimeoutMs = this.#effectiveTimeout(timeoutMs);
    if (effectiveTimeoutMs <= 0) {
      const error = rpcTimeoutError(peer.nodeId);
      if (state) state.cancelledError = error;
      throw error;
    }
    const deadlineAt = Date.now() + effectiveTimeoutMs;
    const effectiveLane = lane ? normalizeLane(lane) : this.currentLane();
    if (state) state.lane = effectiveLane;
    let releaseSlot;
    try {
      releaseSlot = await this.scheduler.acquire(effectiveLane, peer.nodeId, deadlineAt);
    } catch (error) {
      if (state) state.cancelledError = error;
      throw error;
    }
    try {
      return await this.#boundedAttempts(peer, operation, deadlineAt, state);
    } finally {
      releaseSlot();
    }
  }

  async #boundedAttempts(peer, operation, deadlineAt, state) {
    let supersededAttempt = 0;
    while (true) {
      let timer = null;
      if (state) { state.client = null; state.clientLeased = false; state.cancelledError = null; }
      try {
        this.faults?.assertPeer(peer.nodeId, 'dht-rpc');
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) {
          const error = rpcTimeoutError(peer.nodeId);
          if (state) state.cancelledError = error;
          throw error;
        }
        return await Promise.race([
          operation(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              const error = rpcTimeoutError(peer.nodeId);
              if (state) state.cancelledError = error;
              reject(error);
            }, remaining);
            timer.unref?.();
          })
        ]);
      } catch (error) {
        if (state?.client && !error?.remoteRejection) this.#retireClient(peer.nodeId, state.client);
        if (error?.code === 'TRUYN_DISCOVERY_CONNECTION_SUPERSEDED' && supersededAttempt < this.supersededRetries && Date.now() < deadlineAt) {
          supersededAttempt += 1;
          continue;
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        if (state?.clientLeased && state.client) {
          this.#releaseClient(state.client, peer.nodeId);
          state.clientLeased = false;
        }
      }
    }
  }

  async #leasedClient(peer, state) {
    const client = await this.client(peer);
    this.#acquireClient(client);
    state.client = client;
    state.clientLeased = true;
    if (state.cancelledError) throw state.cancelledError;
    return client;
  }

  async ping(peer, options = {}) {
    const state = { client: null, clientLeased: false, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.#leasedClient(peer, state);
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_PING, null, { lane: state.lane });
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
    const state = { client: null, clientLeased: false, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.#leasedClient(peer, state);
      const result = await this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_FIND_NODE, { targetNodeId }, { lane: state.lane });
      const records = [];
      const hints = [];
      for (const record of result?.records || []) {
        if (verifyPeerRecord(record).ok) records.push(record);
        // Signed but lease-expired: a routing contact only, never authoritative state.
        else if (verifyPeerRecord(record, { allowExpired: true }).ok) hints.push(record);
      }
      return { records, hints };
    }, { ...options, state });
  }

  async announce(peer, record, options = {}) {
    const verification = verifyPeerRecord(record);
    if (!verification.ok) throw new Error(`invalid_peer_record:${verification.reason}`);
    const state = { client: null, clientLeased: false, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.#leasedClient(peer, state);
      return this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_ANNOUNCE, { record }, { lane: state.lane });
    }, { ...options, state });
  }

  async store(peer, record, options = {}) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    const state = { client: null, clientLeased: false, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.#leasedClient(peer, state);
      return this.quic.requestControl(client, QUIC_DHT_METHOD_STORE, { record }, { lane: state.lane });
    }, { ...options, state });
  }

  async findValue(peer, namespace, key, options = {}) {
    const state = { client: null, clientLeased: false, cancelledError: null };
    return this.bounded(peer, async () => {
      const client = await this.#leasedClient(peer, state);
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_FIND_VALUE, { namespace, key }, { lane: state.lane });
      const records = [];
      const hints = [];
      for (const record of result?.records || []) {
        if (verifyDhtRecord(record).ok) records.push(record);
      }
      for (const record of result?.hints || []) {
        const verification = verifyPeerRecord(record);
        if (!verification.ok) continue;
        this.ingestPeerRecord?.(record);
        hints.push({ nodeId: record.nodeId, endpoints: [...record.endpoints], publicKey: record.publicKey });
      }
      return { records, hints };
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
    // Explicit forget is used for generation changes and fault/partition control;
    // it must remain destructive rather than waiting for sibling stream leases.
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
      const direct = discovery.get(targetNodeId) || discovery.hint?.(targetNodeId);
      if (direct) return { records: [direct] };
      // Lease-expired signed records are still returned as contacts: after a lease cliff
      // live-only responses dead-end the lookup. Receivers never ingest them as authority.
      const records = [];
      for (const peer of discovery.closest(targetNodeId, limit)) {
        const record = discovery.get(peer.nodeId) || discovery.hint?.(peer.nodeId);
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
      const records = recordStore.get(payload.namespace, payload.key);
      const target = `${payload.namespace}:${payload.key}`;
      const hints = [];
      for (const peer of discovery.closest(target, limit)) {
        const record = discovery.get(peer.nodeId);
        if (record) hints.push(record);
      }
      return { records, hints };
    }

    throw new Error('unsupported_discovery_control_method');
  };
}
