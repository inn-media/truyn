import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { DurableAcceptedWorkInbox } from './admission/durable-inbox.js';
import { KademliaRecordStore, createDhtRecord } from './dht/kademlia.js';
import { PeerDiscovery, createPeerRecord, verifyPeerRecord } from './discovery/peer-discovery.js';
import { QuicDiscoveryRpc, createQuicDiscoveryControlHandler } from './discovery/quic-rpc.js';
import { NetworkFaultController } from './faults/controller.js';
import { DhtReplicationManager } from './replication/dht-replication.js';
import { DurableNetworkState } from './state/persistent-state.js';
import { TruynQuicTransport } from './transport/quic.js';
import { DirectFirstP2P } from './transport/p2p.js';

export class TruynNetworkNode {
  constructor({
    identity = createIdentity(), host = '0.0.0.0', port = 0, advertiseHost = null, tls,
    k = 20, alpha = 3, relayFallback = null, nat = null, capabilities = [], peerRecordTtlMs = 300_000,
    maxInFlight = 64, maxQueued = 256, statePath = null, dhtReplicationFactor = 3, dhtWriteQuorum = 2,
    dhtRpcTimeoutMs = 5_000, dhtWriteTimeoutMs = 30_000, faultController = null, workInboxPath = null, workInboxMaxCompleted = 10_000,
    peerRecordAutoRenew = true, peerRecordRenewBeforeMs = null, peerRecordPublishFanout = null,
    discoveryPeriodicRefresh = true, discoveryRefreshIntervalMs = null, discoveryRefreshTargetCount = null,
    discoveryRefreshMaxRounds = 4, discoveryRefreshSeed = 'truyn-periodic-refresh',
    discoveryRefreshTargetConcurrency = 1, discoveryRefreshTimeoutMs = null, discoveryRefreshJitterRatio = 0.2,
    persistenceDebounceMs = 250, persistenceCheckpointMs = 1_000, needRouteBudgetMs = 11_000,
    rpcLaneLimits = null, rpcPerPeerInFlight = null, rpcMaxClients = null, rpcClientIdleMs = null
  } = {}) {
    if (!tls?.key || !tls?.cert) throw new Error('network runtime TLS key/certificate are required');
    if (!Number.isFinite(peerRecordTtlMs) || peerRecordTtlMs <= 0) throw new Error('peerRecordTtlMs must be positive');
    const renewBeforeMs = peerRecordRenewBeforeMs == null
      ? Math.min(60_000, Math.max(50, Math.floor(peerRecordTtlMs / 5)))
      : peerRecordRenewBeforeMs;
    if (peerRecordAutoRenew && (!Number.isFinite(renewBeforeMs) || renewBeforeMs <= 0 || renewBeforeMs >= peerRecordTtlMs)) {
      throw new Error('peerRecordRenewBeforeMs must be positive and less than peerRecordTtlMs');
    }
    const publishFanout = peerRecordPublishFanout == null ? k : peerRecordPublishFanout;
    if (!Number.isInteger(publishFanout) || publishFanout < 0) throw new Error('peerRecordPublishFanout must be a non-negative integer');
    const periodicRefreshTargetCount = discoveryRefreshTargetCount == null ? k : discoveryRefreshTargetCount;
    if (!Number.isInteger(periodicRefreshTargetCount) || periodicRefreshTargetCount < 0) throw new Error('discoveryRefreshTargetCount must be a non-negative integer');
    if (!Number.isInteger(discoveryRefreshMaxRounds) || discoveryRefreshMaxRounds < 0) throw new Error('discoveryRefreshMaxRounds must be a non-negative integer');
    if (!Number.isInteger(discoveryRefreshTargetConcurrency) || discoveryRefreshTargetConcurrency < 1 || discoveryRefreshTargetConcurrency > 16) {
      throw new Error('discoveryRefreshTargetConcurrency must be between 1 and 16');
    }
    if (!Number.isFinite(discoveryRefreshJitterRatio) || discoveryRefreshJitterRatio < 0 || discoveryRefreshJitterRatio > 0.5) {
      throw new Error('discoveryRefreshJitterRatio must be between 0 and 0.5');
    }
    if (!Number.isInteger(dhtWriteTimeoutMs) || dhtWriteTimeoutMs < 100 || dhtWriteTimeoutMs > 120_000) {
      throw new Error('dhtWriteTimeoutMs must be between 100 and 120000');
    }
    const periodicRefreshIntervalMs = discoveryRefreshIntervalMs == null
      ? Math.min(30_000, Math.max(1, Math.floor(peerRecordTtlMs / 4)))
      : discoveryRefreshIntervalMs;
    const periodicRefreshTimeoutMs = discoveryRefreshTimeoutMs == null
      ? Math.max(1_000, Math.min(10_000, Math.floor(periodicRefreshIntervalMs * 0.75)))
      : discoveryRefreshTimeoutMs;
    if (!Number.isInteger(periodicRefreshTimeoutMs) || periodicRefreshTimeoutMs < 100 || periodicRefreshTimeoutMs >= peerRecordTtlMs) {
      throw new Error('discoveryRefreshTimeoutMs must be >=100 and below peerRecordTtlMs');
    }
    if (discoveryPeriodicRefresh && (!Number.isFinite(periodicRefreshIntervalMs) || periodicRefreshIntervalMs <= 0 || periodicRefreshIntervalMs >= peerRecordTtlMs)) {
      throw new Error('discoveryRefreshIntervalMs must be positive and less than peerRecordTtlMs');
    }
    if (!Number.isFinite(persistenceDebounceMs) || persistenceDebounceMs < 0) throw new Error('persistenceDebounceMs must be a non-negative number');
    if (!Number.isFinite(persistenceCheckpointMs) || persistenceCheckpointMs <= 0 || persistenceCheckpointMs < persistenceDebounceMs) {
      throw new Error('persistenceCheckpointMs must be positive and >= persistenceDebounceMs');
    }

    this.identity = identity;
    this.host = host;
    this.port = port;
    this.advertiseHost = advertiseHost;
    this.tls = tls;
    this.k = k;
    this.alpha = alpha;
    this.relayFallback = relayFallback;
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    this.peerRecordTtlMs = peerRecordTtlMs;
    this.peerRecordAutoRenew = Boolean(peerRecordAutoRenew);
    this.peerRecordRenewBeforeMs = renewBeforeMs;
    this.peerRecordPublishFanout = publishFanout;
    this.discoveryPeriodicRefresh = Boolean(discoveryPeriodicRefresh);
    this.discoveryRefreshIntervalMs = periodicRefreshIntervalMs;
    this.discoveryRefreshTargetCount = periodicRefreshTargetCount;
    this.discoveryRefreshMaxRounds = discoveryRefreshMaxRounds;
    this.discoveryRefreshTargetConcurrency = discoveryRefreshTargetConcurrency;
    this.discoveryRefreshTimeoutMs = periodicRefreshTimeoutMs;
    this.discoveryRefreshJitterRatio = discoveryRefreshJitterRatio;
    this.discoveryRefreshSeed = typeof discoveryRefreshSeed === 'string' && discoveryRefreshSeed.trim()
      ? discoveryRefreshSeed.trim()
      : 'truyn-periodic-refresh';
    this.needRouteBudgetMs = Number.isInteger(needRouteBudgetMs) && needRouteBudgetMs >= 1_000 && needRouteBudgetMs < 15_000
      ? needRouteBudgetMs
      : 11_000;
    this.peerRecordRenewTimer = null;
    this.peerRecordRenewalInFlight = null;
    // Lease keeper: a renewal is announced only to closest(owner, fanout), so every other
    // node's copy of that record silently expires at issuedAt + TTL. Records minted together
    // expire together and validPeers collapses network-wide. Re-fetch expiring copies from
    // their owners (PING carries the owner's current signed record) before the cliff.
    this.leaseKeeperTimer = null;
    this.leaseKeeperInFlight = null;
    this.leaseKeeperStats = { ticks: 0, pinged: 0, refreshed: 0, failed: 0 };
    this.peerRecordRecoveryRetryTimer = null;
    this.peerRecordPropagationQueued = false;
    this.peerRecordBackgroundDisseminationQueued = false;
    // ACKs are tied to the immutable local recordId, not to a transient closest()
    // placement set. Preserve them while convergence reshuffles the required peers.
    this.peerRecordAcked = { recordId: null, nodeIds: new Set() };
    // Only one readiness-critical publisher may run at a time. Churn while it is
    // active marks the worker dirty and causes one bounded follow-up pass.
    this.peerRecordPublishInFlight = null;
    this.peerRecordPublishDirty = false;

    // Durable DHT records published by this node are re-placed after routing
    // churn. Keep this background repair debounced and single-flight so a burst
    // of peer-record updates cannot turn into a fleet-wide STORE storm.
    this.dhtRebalanceTimer = null;
    this.dhtRebalanceInFlight = null;
    this.dhtRebalanceDirty = false;
    this.dhtRebalanceRetryAttempt = 0;
    this.dhtRebalanceStats = {
      scheduled: 0,
      runs: 0,
      retries: 0,
      failures: 0,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastResult: null,
      lastError: null
    };
    // Peer-record propagation is control-plane recovery. The complete retry
    // schedule remains comfortably inside the unchanged 120s network recovery
    // contract and never retries an application NEED envelope.
    this.peerRecordRecoveryRetryDelaysMs = [500, 1_500, 5_000, 10_000, 20_000];
    this.peerRecordLifecycle = {
      autoRenew: this.peerRecordAutoRenew,
      ttlMs: this.peerRecordTtlMs,
      renewBeforeMs: this.peerRecordRenewBeforeMs,
      publishFanout: this.peerRecordPublishFanout,
      durableSequence: Boolean(statePath),
      lastRenewedAt: null,
      lastSequence: null,
      lastAnnouncementAt: null,
      lastAnnouncement: null,
      propagation: {
        recordId: null,
        sequence: null,
        targetNodeIds: [],
        acknowledgedNodeIds: [],
        pendingNodeIds: [],
        ready: true,
        lastUpdatedAt: null
      },
      lastError: null
    };
    this.sequence = 0;
    // A process restart must invalidate transport bindings; a lease renewal must not.
    this.instanceId = randomUUID();
    this.started = false;
    this.closing = false;
    this.localPeerRecord = null;
    this.envelopeHandler = null;
    this.stateStore = statePath ? new DurableNetworkState({ filePath: statePath }) : null;
    this.workInbox = workInboxPath ? new DurableAcceptedWorkInbox({ filePath: workInboxPath, maxCompleted: workInboxMaxCompleted }) : null;
    this.stateReady = false;
    this.persistenceDebounceMs = Math.floor(persistenceDebounceMs);
    this.persistenceCheckpointMs = Math.floor(persistenceCheckpointMs);
    this.persistRequestedGeneration = 0;
    this.persistedGeneration = 0;
    this.persistFlushPromise = null;
    this.persistTimer = null;
    this.persistFirstPendingAt = null;
    this.persistMaxQueueDepth = 0;
    this.lastPersistedSnapshot = null;
    this.eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopDelay.enable();
    this.faults = faultController || new NetworkFaultController();
    const onStateChange = () => this.schedulePersist();
    const onDiscoveryChange = () => {
      this.schedulePersist();
      this.#scheduleDhtRecordRebalance();
    };
    const onRecordAccepted = ({ nodeId, previous, record }) => {
      if (previous?.recordId === record.recordId) return;
      const sessionChanged = Boolean(previous) && (
        !previous.instanceId ||
        !record.instanceId ||
        previous.instanceId !== record.instanceId ||
        JSON.stringify(previous.endpoints) !== JSON.stringify(record.endpoints)
      );
      if (sessionChanged) {
        this.rpc?.forget?.(nodeId);
        const forgotten = this.router?.forget?.(nodeId);
        if (forgotten?.catch) void forgotten.catch(() => {});
      }
      // Any first-seen or changed valid peer record can change the Kademlia
      // placement set for our own current record. Reconcile it on the control
      // plane and fail readiness closed until the required placements ACK.
      // Records are often ingested inside a lookup's AsyncLocalStorage deadline; the
      // propagation/retry chain must not inherit it, or every later RPC in that chain
      // times out instantly once the lookup deadline has passed.
      const reconcile = () => {
        this.#schedulePeerRecordPropagation();
        this.#scheduleDhtRecordRebalance();
      };
      if (typeof this.rpc?.detached === 'function') { this.rpc.detached(reconcile); return; }
      const deadlineContext = this.rpc?.deadlineContext;
      if (deadlineContext?.getStore?.() != null && typeof deadlineContext.exit === 'function') deadlineContext.exit(reconcile);
      else reconcile();
    };
    this.recordStore = new KademliaRecordStore({ onChange: onStateChange });
    this.quic = new TruynQuicTransport({ identity, host, port, tls });
    this.discovery = new PeerDiscovery({ identity, k, alpha, onChange: onDiscoveryChange, onRecordAccepted });
    this.rpc = new QuicDiscoveryRpc({
      quicTransport: this.quic,
      timeoutMs: dhtRpcTimeoutMs,
      faults: this.faults,
      ingestPeerRecord: (record) => this.discovery.ingest(record),
      ...(rpcLaneLimits ? { laneLimits: rpcLaneLimits } : {}),
      ...(Number.isInteger(rpcPerPeerInFlight) ? { perPeerInFlight: rpcPerPeerInFlight } : {}),
      ...(Number.isInteger(rpcMaxClients) ? { maxClients: rpcMaxClients } : {}),
      ...(Number.isInteger(rpcClientIdleMs) ? { clientIdleMs: rpcClientIdleMs } : {})
    });
    this.discovery.rpc = this.rpc;
    this.replication = new DhtReplicationManager({
      discovery: this.discovery,
      rpc: this.rpc,
      recordStore: this.recordStore,
      replicationFactor: dhtReplicationFactor,
      writeQuorum: dhtWriteQuorum,
      writeTimeoutMs: dhtWriteTimeoutMs
    });
    this.router = new DirectFirstP2P({
      quicTransport: this.quic,
      discovery: this.discovery,
      relayFallback,
      maxInFlight,
      maxQueued,
      faults: this.faults
    });
    this.quic.onControl(createQuicDiscoveryControlHandler(this.discovery, {
      recordStore: this.recordStore,
      localPeerRecord: () => this.localPeerRecord,
      persistRecordStore: () => this.persistState()
    }));
  }

  snapshotState() {
    return {
      nodeId: this.identity.nodeId,
      sequence: this.sequence,
      savedAt: new Date().toISOString(),
      peerRecords: this.discovery.durableSnapshot(),
      dhtRecords: this.recordStore.snapshot()
    };
  }

  #requestPersist() {
    this.persistRequestedGeneration += 1;
    this.persistMaxQueueDepth = Math.max(this.persistMaxQueueDepth, this.persistRequestedGeneration - this.persistedGeneration);
    return this.persistRequestedGeneration;
  }

  #clearPersistTimer() {
    if (!this.persistTimer) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
  }

  #recordPersistError(error) {
    this.peerRecordLifecycle.lastError = {
      at: new Date().toISOString(),
      code: error?.code || null,
      message: error?.message || String(error)
    };
  }

  #schedulePersistCheckpoint() {
    if (!this.stateStore || !this.stateReady || this.closing || this.persistFlushPromise) return;
    if (this.persistedGeneration >= this.persistRequestedGeneration) {
      this.persistFirstPendingAt = null;
      this.#clearPersistTimer();
      return;
    }
    const now = Date.now();
    if (this.persistFirstPendingAt == null) this.persistFirstPendingAt = now;
    const ageMs = now - this.persistFirstPendingAt;
    const delayMs = Math.max(0, Math.min(this.persistenceDebounceMs, this.persistenceCheckpointMs - ageMs));
    this.#clearPersistTimer();
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.#ensurePersistFlush().catch((error) => this.#recordPersistError(error));
    }, delayMs);
    this.persistTimer.unref?.();
  }

  // Background state churn is debounced and checkpointed. Explicit durability
  // barriers still force an immediate flush and wait until their own generation
  // is durable, so dht.store ACK semantics remain fail-closed.
  #ensurePersistFlush() {
    if (this.persistFlushPromise) return this.persistFlushPromise;
    this.#clearPersistTimer();
    this.persistFlushPromise = new Promise((resolve) => setImmediate(resolve))
      .then(async () => {
        if (this.persistedGeneration >= this.persistRequestedGeneration) return;
        const generation = this.persistRequestedGeneration;
        const snapshot = this.snapshotState();
        await this.stateStore.save(snapshot);
        this.lastPersistedSnapshot = snapshot;
        this.persistedGeneration = generation;
        if (this.persistedGeneration >= this.persistRequestedGeneration) this.persistFirstPendingAt = null;
        else if (this.stateReady && !this.closing) {
          this.persistFirstPendingAt = Date.now();
          this.#schedulePersistCheckpoint();
        }
      })
      .finally(() => {
        this.persistFlushPromise = null;
        if (this.persistedGeneration < this.persistRequestedGeneration && this.stateReady && !this.closing) this.#schedulePersistCheckpoint();
      });
    return this.persistFlushPromise;
  }

  schedulePersist() {
    if (!this.stateStore || !this.stateReady || this.closing) return;
    this.#requestPersist();
    this.#schedulePersistCheckpoint();
  }

  async persistState() {
    if (!this.stateStore) return null;
    const targetGeneration = this.#requestPersist();
    this.#clearPersistTimer();
    while (this.persistedGeneration < targetGeneration) {
      await this.#ensurePersistFlush();
    }
    return this.lastPersistedSnapshot ? structuredClone(this.lastPersistedSnapshot) : this.snapshotState();
  }

  async hydrateState() {
    if (!this.stateStore) { this.stateReady = true; return null; }
    const state = await this.stateStore.load();
    if (state) {
      if (state.nodeId !== this.identity.nodeId) throw new Error('network_state_identity_mismatch');
      this.sequence = Math.max(this.sequence, Number.isInteger(state.sequence) ? state.sequence : 0);
      this.discovery.restore(state.peerRecords || [], { notify: false });
      this.recordStore.restore(state.dhtRecords || [], { notify: false });
    }
    this.stateReady = true;
    return state;
  }

  async #dispatchEnvelope(envelope, context) {
    if (!this.envelopeHandler) {
      const error = new Error('no_envelope_handler');
      error.code = 'TRUYN_NO_ENVELOPE_HANDLER';
      throw error;
    }
    if (!this.workInbox) return this.envelopeHandler(envelope, context);
    return this.workInbox.run(envelope, context, this.envelopeHandler);
  }

  #clearDhtRecordRebalanceTimer() {
    if (!this.dhtRebalanceTimer) return;
    clearTimeout(this.dhtRebalanceTimer);
    this.dhtRebalanceTimer = null;
  }

  #scheduleDhtRecordRebalance(delayMs = 1_500) {
    if (!this.started || this.closing || !this.replication) return;
    if (this.dhtRebalanceInFlight) {
      this.dhtRebalanceDirty = true;
      return;
    }
    this.#clearDhtRecordRebalanceTimer();
    this.dhtRebalanceStats.scheduled += 1;
    const delay = Math.max(250, Math.min(30_000, Number.isFinite(Number(delayMs)) ? Math.floor(Number(delayMs)) : 1_500));
    this.dhtRebalanceTimer = setTimeout(() => {
      this.dhtRebalanceTimer = null;
      void this.#runDhtRecordRebalance();
    }, delay);
    this.dhtRebalanceTimer.unref?.();
  }

  async #runDhtRecordRebalance() {
    if (!this.started || this.closing || !this.replication) return null;
    if (this.dhtRebalanceInFlight) {
      this.dhtRebalanceDirty = true;
      return this.dhtRebalanceInFlight;
    }

    this.dhtRebalanceDirty = false;
    this.dhtRebalanceStats.runs += 1;
    this.dhtRebalanceStats.lastStartedAt = new Date().toISOString();
    let retryDelayMs = null;

    const run = () => this.replication.reconcilePublishedRecords({
      maxRecords: 32,
      concurrency: 2,
      timeoutMs: Math.min(this.replication.writeTimeoutMs, 15_000)
    });
    const background = () => (typeof this.rpc?.withLane === 'function' ? this.rpc.withLane('background', run) : run());
    const operation = Promise.resolve(
      typeof this.rpc?.detached === 'function' ? this.rpc.detached(background) : background()
    )
      .then((result) => {
        this.dhtRebalanceStats.lastCompletedAt = new Date().toISOString();
        this.dhtRebalanceStats.lastResult = result;
        this.dhtRebalanceStats.lastError = null;
        if ((result?.storesFailed || 0) > 0 && this.dhtRebalanceRetryAttempt < 2) {
          this.dhtRebalanceRetryAttempt += 1;
          this.dhtRebalanceStats.retries += 1;
          retryDelayMs = this.dhtRebalanceRetryAttempt === 1 ? 5_000 : 15_000;
        } else if ((result?.storesFailed || 0) === 0) {
          this.dhtRebalanceRetryAttempt = 0;
        }
        return result;
      })
      .catch((error) => {
        this.dhtRebalanceStats.failures += 1;
        this.dhtRebalanceStats.lastCompletedAt = new Date().toISOString();
        this.dhtRebalanceStats.lastError = { code: error?.code || null, message: error?.message || String(error) };
        if (this.dhtRebalanceRetryAttempt < 2) {
          this.dhtRebalanceRetryAttempt += 1;
          this.dhtRebalanceStats.retries += 1;
          retryDelayMs = this.dhtRebalanceRetryAttempt === 1 ? 5_000 : 15_000;
        }
        return null;
      })
      .finally(() => {
        if (this.dhtRebalanceInFlight === operation) this.dhtRebalanceInFlight = null;
        if (!this.started || this.closing) return;
        if (this.dhtRebalanceDirty) {
          this.dhtRebalanceDirty = false;
          this.#scheduleDhtRecordRebalance(1_500);
        } else if (retryDelayMs != null) {
          this.#scheduleDhtRecordRebalance(retryDelayMs);
        }
      });

    this.dhtRebalanceInFlight = operation;
    return operation;
  }

  dhtDurabilitySnapshot() {
    return {
      scheduler: {
        scheduled: Boolean(this.dhtRebalanceTimer),
        inFlight: Boolean(this.dhtRebalanceInFlight),
        dirty: this.dhtRebalanceDirty,
        retryAttempt: this.dhtRebalanceRetryAttempt,
        ...this.dhtRebalanceStats
      },
      replication: typeof this.replication?.telemetrySnapshot === 'function'
        ? this.replication.telemetrySnapshot()
        : null
    };
  }

  #leaseKeeperIntervalMs() {
    return Math.max(250, Math.min(30_000, Math.floor(this.peerRecordTtlMs / 10)));
  }

  async #leaseKeeperTick(options = {}) {
    if (typeof this.rpc?.withLane === 'function') return this.rpc.withLane('background', () => this.#leaseKeeperTickInLane(options));
    return this.#leaseKeeperTickInLane(options);
  }

  async #leaseKeeperTickInLane({ maxPeers = 64, concurrency = 4 } = {}) {
    if (!this.started || this.closing) return;
    const now = Date.now();
    // Never race the control plane: skip owners we are still placing our own record with.
    const placing = new Set(this.peerRecordLifecycle.propagation?.pendingNodeIds || []);
    const horizon = 2 * this.#leaseKeeperIntervalMs() + this.peerRecordRenewBeforeMs;
    const due = [...this.discovery.records.values()]
      .filter((record) => record.nodeId !== this.identity.nodeId && !placing.has(record.nodeId))
      .map((record) => ({ record, expires: Date.parse(record.expiresAt) }))
      .filter(({ expires }) => Number.isFinite(expires) && expires - now <= horizon && now - expires <= horizon)
      .sort((a, b) => a.expires - b.expires)
      .slice(0, maxPeers);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, async () => {
      while (cursor < due.length && this.started && !this.closing) {
        const { record, expires } = due[cursor++];
        this.leaseKeeperStats.pinged += 1;
        try {
          await this.rpc.ping(record);
          await new Promise((resolve) => setImmediate(resolve));
          const current = this.discovery.records.get(record.nodeId);
          if (current && Date.parse(current.expiresAt) > expires) this.leaseKeeperStats.refreshed += 1;
        } catch {
          this.leaseKeeperStats.failed += 1;
        }
      }
    }));
    this.leaseKeeperStats.ticks += 1;
  }


  #scheduleLeaseKeeper(delayMs = this.#leaseKeeperIntervalMs()) {
    if (this.leaseKeeperTimer) clearTimeout(this.leaseKeeperTimer);
    if (!this.started || this.closing) return;
    this.leaseKeeperTimer = setTimeout(() => {
      this.leaseKeeperTimer = null;
      this.leaseKeeperInFlight = this.#leaseKeeperTick()
        .catch(() => {})
        .finally(() => { this.leaseKeeperInFlight = null; this.#scheduleLeaseKeeper(); });
    }, delayMs);
    this.leaseKeeperTimer.unref?.();
  }

  leaseKeeperSnapshot() {
    return { intervalMs: this.#leaseKeeperIntervalMs(), ...this.leaseKeeperStats };
  }

  #clearPeerRecordRenewTimer() {
    if (!this.peerRecordRenewTimer) return;
    clearTimeout(this.peerRecordRenewTimer);
    this.peerRecordRenewTimer = null;
  }

  #peerRecordPropagationPeers(record = this.localPeerRecord) {
    if (!record || this.peerRecordPublishFanout <= 0) return [];
    return this.discovery.closest(record.nodeId, this.peerRecordPublishFanout)
      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId);
  }

  #ackedNodeIdsFor(record) {
    const recordId = record?.recordId || null;
    if (this.peerRecordAcked.recordId !== recordId) this.peerRecordAcked = { recordId, nodeIds: new Set() };
    return this.peerRecordAcked.nodeIds;
  }

  #resetPeerRecordPropagation(record = this.localPeerRecord, peers = null) {
    const candidates = Array.isArray(peers) ? peers : this.#peerRecordPropagationPeers(record);
    const targetNodeIds = [...new Set(candidates.map((peer) => peer?.nodeId).filter(Boolean))].sort();
    const acked = this.#ackedNodeIdsFor(record);
    const acknowledgedNodeIds = targetNodeIds.filter((nodeId) => acked.has(nodeId));
    const pendingNodeIds = targetNodeIds.filter((nodeId) => !acked.has(nodeId));
    this.peerRecordLifecycle.propagation = {
      recordId: record?.recordId || null,
      sequence: record?.sequence ?? null,
      targetNodeIds,
      acknowledgedNodeIds,
      pendingNodeIds,
      ready: pendingNodeIds.length === 0,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  #recordPeerRecordPropagation(record, candidates, settled, { replaceTargets = false } = {}) {
    if (!record || this.localPeerRecord?.recordId !== record.recordId) return;
    const previous = this.peerRecordLifecycle.propagation || {};
    const sameRecord = previous.recordId === record.recordId;
    const candidateIds = candidates.map((peer) => peer?.nodeId).filter(Boolean);
    const targets = new Set(
      replaceTargets
        ? candidateIds
        : (sameRecord ? previous.targetNodeIds || [] : candidateIds)
    );
    const acked = this.#ackedNodeIdsFor(record);
    for (let i = 0; i < candidateIds.length; i += 1) {
      if (settled[i]?.status === 'fulfilled') acked.add(candidateIds[i]);
    }
    const targetNodeIds = [...targets].sort();
    const acknowledgedNodeIds = targetNodeIds.filter((nodeId) => acked.has(nodeId));
    const pendingNodeIds = targetNodeIds.filter((nodeId) => !acked.has(nodeId));
    this.peerRecordLifecycle.propagation = {
      recordId: record.recordId,
      sequence: record.sequence,
      targetNodeIds,
      acknowledgedNodeIds,
      pendingNodeIds,
      ready: pendingNodeIds.length === 0,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  async #settlePeerRecordAnnouncements(candidates, record) {
    const settled = new Array(candidates.length);
    if (candidates.length === 0) return settled;
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(this.alpha, candidates.length));
    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= candidates.length) return;
        try {
          settled[index] = { status: 'fulfilled', value: await this.rpc.announce(candidates[index], record) };
        } catch (reason) {
          settled[index] = { status: 'rejected', reason };
        }
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return settled;
  }

  async #publishCurrentPeerRecord(record = this.localPeerRecord) {
    if (!record || !this.started || this.closing || this.localPeerRecord?.recordId !== record.recordId) {
      return { sequence: record?.sequence ?? null, attempted: 0, delivered: 0, failed: 0, failedNodeIds: [] };
    }
    const peers = this.#peerRecordPropagationPeers(record);
    // Reconcile the full placement set without discarding ACKs for this record, then
    // send only to genuinely pending targets.
    this.#resetPeerRecordPropagation(record, peers);
    const pendingIds = new Set(this.peerRecordLifecycle.propagation.pendingNodeIds || []);
    const pendingPeers = peers.filter((peer) => pendingIds.has(peer.nodeId));
    const announcement = await this.announcePeerRecord(record, {
      peers: pendingPeers,
      fanout: pendingPeers.length,
      replacePropagationTargets: false,
      trackPropagation: true
    });
    if (announcement.failed > 0) {
      this.#schedulePeerRecordRecoveryRetries(record, peers, announcement.failedNodeIds, 0, true);
    } else if (this.peerRecordLifecycle.propagation?.recordId !== record.recordId || this.peerRecordLifecycle.propagation?.ready) {
      this.#clearPeerRecordRecoveryRetryTimer();
      this.peerRecordLifecycle.lastError = null;
    }
    return announcement;
  }

  #runPeerRecordPublish(record) {
    if (this.peerRecordPublishInFlight) {
      this.peerRecordPublishDirty = true;
      return this.peerRecordPublishInFlight;
    }
    const recordId = record.recordId;
    const operation = (async () => {
      do {
        this.peerRecordPublishDirty = false;
        if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
        await this.#publishCurrentPeerRecord(this.localPeerRecord);
      } while (this.peerRecordPublishDirty);
    })()
      .catch((error) => {
        if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
        this.peerRecordLifecycle.lastError = {
          at: new Date().toISOString(),
          code: error?.code || null,
          message: error?.message || String(error)
        };
      })
      .finally(() => {
        if (this.peerRecordPublishInFlight === operation) this.peerRecordPublishInFlight = null;
      });
    this.peerRecordPublishInFlight = operation;
    return operation;
  }

  #stagePeerRecordPropagation(record = this.localPeerRecord) {
    if (!record || !this.started || this.closing || this.localPeerRecord?.recordId !== record.recordId) return false;
    const peers = this.#peerRecordPropagationPeers(record);
    const targetNodeIds = peers.map((peer) => peer.nodeId).sort();
    const propagation = this.peerRecordLifecycle.propagation;
    const currentTargets = propagation?.recordId === record.recordId
      ? [...(propagation.targetNodeIds || [])].sort()
      : [];
    const unchangedTargets = targetNodeIds.length === currentTargets.length &&
      targetNodeIds.every((nodeId, index) => nodeId === currentTargets[index]);
    if (propagation?.recordId === record.recordId && unchangedTargets) return false;
    this.#resetPeerRecordPropagation(record, peers);
    return true;
  }

  #schedulePeerRecordPropagation(record = this.localPeerRecord) {
    if (!this.started || this.closing || !record) return;
    // Readiness must close synchronously when live discovery changes the required
    // placement set; the queued operation below is control-plane dissemination.
    const propagationChanged = this.#stagePeerRecordPropagation(record);
    if (this.peerRecordPropagationQueued) return;
    const recordId = record.recordId;
    this.peerRecordPropagationQueued = true;
    queueMicrotask(() => {
      this.peerRecordPropagationQueued = false;
      if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
      const peers = this.#peerRecordPropagationPeers(record);
      const targets = peers.map((peer) => peer.nodeId).sort();
      const propagation = this.peerRecordLifecycle.propagation;
      const currentTargets = propagation?.recordId === recordId ? [...(propagation.targetNodeIds || [])].sort() : [];
      const unchangedTargets = targets.length === currentTargets.length && targets.every((nodeId, index) => nodeId === currentTargets[index]);
      // Do not let unrelated peer-record churn repeatedly cancel and restart an
      // already scheduled required-placement retry. If the required target set
      // itself changed, publish immediately; otherwise the existing bounded retry
      // owns recovery until it ACKs or the local record generation changes.
      if (!propagationChanged && unchangedTargets && (propagation?.ready || this.peerRecordRecoveryRetryTimer)) return;
      void this.#runPeerRecordPublish(record);
    });
  }

  #scheduleBackgroundPeerRecordDissemination(record, recoveryPeers) {
    if (!record || !this.started || this.closing || this.peerRecordBackgroundDisseminationQueued) return;
    const required = new Set(this.#peerRecordPropagationPeers(record).map((peer) => peer.nodeId));
    // Required placement is already closest(self, publishFanout). Broadcasting a
    // restarted node's new generation to every restored peer turns a mass restart
    // into O(restartedNodes * peerCount) simultaneous QUIC/DHT work. Keep immediate
    // recovery inside the canonical Kademlia k-neighborhood; arbitrary peers can
    // rehydrate the fresh signed generation through normal lookup/lease recovery.
    const recovered = new Map((recoveryPeers || [])
      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId)
      .map((peer) => [peer.nodeId, peer]));
    const backgroundBudget = Math.max(0, this.discovery.k - required.size);
    const backgroundPeers = this.discovery.closest(record.nodeId, this.discovery.k)
      .filter((peer) => recovered.has(peer?.nodeId) && !required.has(peer.nodeId))
      .slice(0, backgroundBudget)
      .map((peer) => recovered.get(peer.nodeId));
    if (backgroundPeers.length === 0) return;
    const recordId = record.recordId;
    this.peerRecordBackgroundDisseminationQueued = true;
    queueMicrotask(() => {
      this.peerRecordBackgroundDisseminationQueued = false;
      if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
      // Best-effort background dissemination is intentionally one-pass. It must
      // never reuse or cancel the readiness-critical retry timer owned by the
      // required Kademlia placement set.
      const disseminate = () => this.announcePeerRecord(record, {
        peers: backgroundPeers,
        fanout: backgroundPeers.length,
        replacePropagationTargets: false,
        trackPropagation: false
      });
      void (typeof this.rpc?.withLane === 'function' ? this.rpc.withLane('background', disseminate) : disseminate()).catch((error) => {
        if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
        this.peerRecordLifecycle.lastError = {
          at: new Date().toISOString(),
          code: error?.code || null,
          message: error?.message || String(error)
        };
      });
    });
  }

  #clearPeerRecordRecoveryRetryTimer() {
    if (!this.peerRecordRecoveryRetryTimer) return;
    clearTimeout(this.peerRecordRecoveryRetryTimer);
    this.peerRecordRecoveryRetryTimer = null;
  }

  #schedulePeerRecordRecoveryRetries(record, recoveryPeers, failedNodeIds, attempt = 0, trackPropagation = true) {
    this.#clearPeerRecordRecoveryRetryTimer();
    if (!this.started || this.closing || this.localPeerRecord?.recordId !== record?.recordId) return;
    if (attempt >= this.peerRecordRecoveryRetryDelaysMs.length) {
      if (!trackPropagation) return;
      // Required placement peers keep retrying until they ACK or the local record changes.
      const propagation = this.peerRecordLifecycle.propagation;
      const pending = new Set(propagation?.recordId === record.recordId ? propagation.pendingNodeIds || [] : []);
      failedNodeIds = (failedNodeIds || []).filter((nodeId) => pending.has(nodeId));
      if (failedNodeIds.length === 0) return;
      attempt = this.peerRecordRecoveryRetryDelaysMs.length - 1;
    }

    const pendingNodeIds = new Set(failedNodeIds || []);
    const peers = recoveryPeers
      .filter((peer) => pendingNodeIds.has(peer?.nodeId))
      .map((peer) => this.discovery.get(peer.nodeId) || peer);
    if (peers.length === 0) return;

    const recordId = record.recordId;
    const delayMs = this.peerRecordRecoveryRetryDelaysMs[attempt];
    this.peerRecordRecoveryRetryTimer = setTimeout(() => {
      this.peerRecordRecoveryRetryTimer = null;
      if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
      void this.announcePeerRecord(record, {
        peers,
        fanout: peers.length,
        replacePropagationTargets: false,
        trackPropagation
      })
        .then((result) => {
          if (result.failed === 0) {
            if (trackPropagation) this.peerRecordLifecycle.lastError = null;
            return;
          }
          this.#schedulePeerRecordRecoveryRetries(record, recoveryPeers, result.failedNodeIds, attempt + 1, trackPropagation);
        })
        .catch((error) => {
          if (!this.started || this.closing || this.localPeerRecord?.recordId !== recordId) return;
          this.peerRecordLifecycle.lastError = {
            at: new Date().toISOString(),
            code: error?.code || null,
            message: error?.message || String(error)
          };
          this.#schedulePeerRecordRecoveryRetries(record, recoveryPeers, peers.map((peer) => peer.nodeId), attempt + 1, trackPropagation);
        });
    }, delayMs);
    this.peerRecordRecoveryRetryTimer.unref?.();
  }

  #schedulePeerRecordRenewal() {
    this.#clearPeerRecordRenewTimer();
    if (!this.started || this.closing || !this.peerRecordAutoRenew || !this.localPeerRecord) return;
    const expiresAt = Date.parse(this.localPeerRecord.expiresAt);
    const minimumDelay = Math.min(1_000, Math.max(25, Math.floor(this.peerRecordTtlMs / 20)));
    const jitterMs = Math.floor(Math.random() * Math.min(Math.floor(this.peerRecordTtlMs / 4), 300_000));
    const delayMs = Math.max(minimumDelay, expiresAt - Date.now() - this.peerRecordRenewBeforeMs - jitterMs);
    this.peerRecordRenewTimer = setTimeout(() => {
      this.peerRecordRenewTimer = null;
      void this.renewPeerRecord().catch((error) => {
        this.peerRecordLifecycle.lastError = {
          at: new Date().toISOString(),
          code: error?.code || null,
          message: error?.message || String(error)
        };
      });
    }, delayMs);
    this.peerRecordRenewTimer.unref?.();
  }

  onEnvelope(handler) {
    this.envelopeHandler = typeof handler === 'function' ? handler : null;
    this.quic.onEnvelope(this.envelopeHandler ? (envelope, context) => this.#dispatchEnvelope(envelope, context) : null);
    return this;
  }

  async recoverAcceptedWork() {
    if (!this.workInbox || !this.envelopeHandler) return [];
    return this.workInbox.recover(this.envelopeHandler);
  }

  acceptedWorkSnapshot() {
    return this.workInbox?.snapshot() || null;
  }

  peerRecordLifecycleSnapshot() {
    return structuredClone(this.peerRecordLifecycle);
  }

  peerRecordPropagationReady() {
    const propagation = this.peerRecordLifecycle.propagation;
    return Boolean(
      this.started &&
      this.localPeerRecord &&
      propagation?.recordId === this.localPeerRecord.recordId &&
      propagation.ready === true
    );
  }

  discoveryPeriodicRefreshSnapshot() {
    return this.discovery.periodicRefreshSnapshot();
  }

  envelope(type, payload, { to = null, id, time, trace, deadline, priority } = {}) {
    return createEnvelope({ type, from: this.identity.nodeId, to, payload, id, time, trace, deadline, priority,
      privateKeyPem: this.identity.privateKeyPem, publicKeyPem: this.identity.publicKeyPem });
  }

  async start() {
    if (this.started) return this.localPeerRecord;
    this.closing = false;
    await this.hydrateState();
    await this.workInbox?.load();
    const recoveryPeers = this.discovery.snapshot();
    const endpoint = await this.quic.start();
    const advertisedHost = this.advertiseHost || (endpoint.host === '0.0.0.0' ? '127.0.0.1' : endpoint.host);
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({ identity: this.identity, endpoints: [`quic://${advertisedHost}:${endpoint.port}`],
      sequence: this.sequence, ttlMs: this.peerRecordTtlMs, capabilities: this.capabilities, nat: this.nat, instanceId: this.instanceId });
    this.started = true;
    await this.persistState();
    await this.recoverAcceptedWork();
    this.peerRecordLifecycle.lastSequence = this.localPeerRecord.sequence;

    // Restart readiness is determined only by the required Kademlia placement set.
    // Publish that set first with bounded concurrency. Best-effort recovery peers use
    // a separate background lane and never expand the readiness pending set.
    this.#resetPeerRecordPropagation(this.localPeerRecord);
    await this.#publishCurrentPeerRecord(this.localPeerRecord);
    this.#scheduleBackgroundPeerRecordDissemination(this.localPeerRecord, recoveryPeers);

    if (this.discoveryPeriodicRefresh) {
      this.discovery.startPeriodicRefresh({
        intervalMs: this.discoveryRefreshIntervalMs,
        targetCount: this.discoveryRefreshTargetCount,
        maxRounds: this.discoveryRefreshMaxRounds,
        targetConcurrency: this.discoveryRefreshTargetConcurrency,
        timeoutMs: this.discoveryRefreshTimeoutMs,
        jitterRatio: this.discoveryRefreshJitterRatio,
        seed: this.discoveryRefreshSeed
      });
    }
    this.#schedulePeerRecordRenewal();
    this.#scheduleLeaseKeeper();
    // A restarted publisher may have durable DHT records whose former placement
    // no longer matches the recovered topology. Reconcile them after startup;
    // later peer-record churn re-arms the same debounced single-flight path.
    this.#scheduleDhtRecordRebalance(1_000);
    return structuredClone(this.localPeerRecord);
  }

  refreshPeerRecord({ nat = this.nat, capabilities = this.capabilities, persist = true } = {}) {
    if (!this.started) throw new Error('network node is not started');
    this.#clearPeerRecordRecoveryRetryTimer();
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    const endpoint = this.localPeerRecord.endpoints[0];
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({ identity: this.identity, endpoints: [endpoint], sequence: this.sequence,
      ttlMs: this.peerRecordTtlMs, capabilities: this.capabilities, nat: this.nat, instanceId: this.instanceId });
    this.#resetPeerRecordPropagation(this.localPeerRecord);
    if (persist) this.schedulePersist();
    return structuredClone(this.localPeerRecord);
  }

  async announcePeerRecord(record = this.localPeerRecord, {
    fanout = this.peerRecordPublishFanout,
    peers = null,
    replacePropagationTargets = true,
    trackPropagation = true
  } = {}) {
    if (!this.started) throw new Error('network node is not started');
    const verification = verifyPeerRecord(record);
    if (!verification.ok || record.nodeId !== this.identity.nodeId) throw new Error(`invalid_local_peer_record:${verification.reason || 'identity_mismatch'}`);

    // Kademlia peer records are located by nodeId, so renewal must be placed near
    // that key instead of repeatedly publishing every node into the same
    // lexicographically-first fanout set. The default path intentionally uses the
    // routing table (including cryptographically verified durable recovery hints)
    // so a restarted node can repair placement before every cached lease is live.
    const source = Array.isArray(peers)
      ? peers.filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId).sort((a, b) => a.nodeId.localeCompare(b.nodeId))
      : this.discovery.closest(record.nodeId, fanout);
    const candidates = source
      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId)
      .slice(0, fanout);
    const settled = await this.#settlePeerRecordAnnouncements(candidates, record);
    const failedNodeIds = [];
    let delivered = 0;
    for (let i = 0; i < settled.length; i += 1) {
      if (settled[i].status === 'fulfilled') delivered += 1;
      else failedNodeIds.push(candidates[i].nodeId);
    }
    const result = {
      sequence: record.sequence,
      attempted: candidates.length,
      delivered,
      failed: failedNodeIds.length,
      failedNodeIds
    };
    if (trackPropagation) this.#recordPeerRecordPropagation(record, candidates, settled, { replaceTargets: replacePropagationTargets });
    this.peerRecordLifecycle.lastAnnouncementAt = new Date().toISOString();
    this.peerRecordLifecycle.lastAnnouncement = result;
    return structuredClone(result);
  }

  async renewPeerRecord({ nat = this.nat, capabilities = this.capabilities, announce = true } = {}) {
    if (!this.started || this.closing) throw new Error('network node is not available for peer-record renewal');
    if (this.peerRecordRenewalInFlight) return this.peerRecordRenewalInFlight;
    const operation = (async () => {
      const previous = this.localPeerRecord;
      const record = this.refreshPeerRecord({ nat, capabilities, persist: false });

      // Durability precedes dissemination. Otherwise a crash after publish could restart from
      // the old persisted sequence and mint a different record with the already-seen sequence.
      await this.persistState();

      const announcement = announce
        ? await this.#publishCurrentPeerRecord(record)
        : { sequence: record.sequence, attempted: 0, delivered: 0, failed: 0, failedNodeIds: [] };
      if (!announce) this.#resetPeerRecordPropagation(record, []);
      this.peerRecordLifecycle.lastRenewedAt = new Date().toISOString();
      this.peerRecordLifecycle.lastSequence = record.sequence;
      this.peerRecordLifecycle.lastError = null;
      return { previousSequence: previous?.sequence || null, record, announcement };
    })();
    this.peerRecordRenewalInFlight = operation;
    try {
      return await operation;
    } catch (error) {
      this.peerRecordLifecycle.lastError = {
        at: new Date().toISOString(),
        code: error?.code || null,
        message: error?.message || String(error)
      };
      throw error;
    } finally {
      if (this.peerRecordRenewalInFlight === operation) this.peerRecordRenewalInFlight = null;
      this.#schedulePeerRecordRenewal();
    }
  }

  bootstrap(records = []) {
    const results = [];
    for (const record of records) {
      const verification = verifyPeerRecord(record);
      if (!verification.ok) { results.push({ accepted: false, reason: verification.reason }); continue; }
      results.push(this.discovery.ingest(record));
    }
    if (results.some((result) => result.accepted)) this.#schedulePeerRecordPropagation();
    return results;
  }

  async findPeer(nodeId) { return this.discovery.get(nodeId) || this.discovery.findNode(nodeId); }
  async pingPeer(nodeId) { const peer = await this.findPeer(nodeId); return peer ? this.rpc.ping(peer) : false; }
  async send(nodeId, envelope, options = {}) { if (!this.started) throw new Error('network node is not started'); return this.router.send(nodeId, envelope, options); }

  async need(nodeId, capability, input, policy = {}, options = {}) {
    const routeDeadlineAt = Date.now() + this.needRouteBudgetMs;
    const run = async () => {
      if (!this.discovery.get(nodeId)) {
        // Leave a fixed tail for connect + envelope dispatch; lookup and dispatch
        // never receive two independent full budgets.
        const lookupDeadlineAt = routeDeadlineAt - Math.min(4_000, Math.floor(this.needRouteBudgetMs / 3));
        let timer = null;
        const lookup = typeof this.rpc?.withDeadline === 'function'
          ? this.rpc.withDeadline(lookupDeadlineAt, () => this.findPeer(nodeId))
          : this.findPeer(nodeId);
        const peer = await Promise.race([
          Promise.resolve(lookup).catch(() => null),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), Math.max(1, lookupDeadlineAt - Date.now()));
            timer.unref?.();
          })
        ]).finally(() => { if (timer) clearTimeout(timer); });
        const relayAllowed = options.allowRelayFallback !== false && typeof this.relayFallback === 'function';
        if (!peer && !relayAllowed) {
          const error = new Error('peer_not_discovered');
          error.code = 'TRUYN_PEER_NOT_FOUND';
          throw error;
        }
      }
      return this.send(
        nodeId,
        this.envelope('NEED', { capability: { name: capability }, input, policy }, { to: nodeId }),
        { ...options, deadlineAt: routeDeadlineAt }
      );
    };
    return typeof this.rpc?.withLane === 'function' ? this.rpc.withLane('critical', run) : run();
  }

  createRecord(namespace, key, value, options = {}) { return createDhtRecord({ identity: this.identity, namespace, key, value, ...options }); }
  #critical(operation) { return typeof this.rpc?.withLane === 'function' ? this.rpc.withLane('critical', operation) : operation(); }
  async storeAt(nodeId, record) { return this.#critical(async () => { const peer = await this.findPeer(nodeId); if (!peer) throw new Error('DHT peer not found'); return this.rpc.store(peer, record); }); }
  async findValueAt(nodeId, namespace, key) { return this.#critical(async () => { const peer = await this.findPeer(nodeId); if (!peer) throw new Error('DHT peer not found'); return this.rpc.findValue(peer, namespace, key); }); }
  async replicateRecord(record, options = {}) { return this.#critical(() => this.replication.put(record, options)); }
  async findReplicatedValue(namespace, key, options = {}) { return this.#critical(() => this.replication.get(namespace, key, options)); }
  async repairRecord(namespace, key, options = {}) { return this.#critical(() => this.replication.repair(namespace, key, options)); }

  rpcSchedulerSnapshot() {
    return {
      ...(typeof this.rpc?.schedulerSnapshot === 'function' ? this.rpc.schedulerSnapshot() : {}),
      server: typeof this.quic?.controlAdmissionSnapshot === 'function' ? this.quic.controlAdmissionSnapshot() : null,
      envelopes: typeof this.quic?.admissionSnapshot === 'function' ? this.quic.admissionSnapshot() : null,
      router: typeof this.router?.admissionSnapshot === 'function' ? this.router.admissionSnapshot() : null
    };
  }

  runtimePressureSnapshot() {
    const nsToMs = (value) => Number.isFinite(Number(value)) ? Number(value) / 1e6 : null;
    const eventLoopLag = {
      meanMs: nsToMs(this.eventLoopDelay.mean),
      p95Ms: nsToMs(this.eventLoopDelay.percentile(95)),
      maxMs: nsToMs(this.eventLoopDelay.max)
    };
    return {
      persistence: {
        debounceMs: this.persistenceDebounceMs,
        checkpointMs: this.persistenceCheckpointMs,
        requestedGeneration: this.persistRequestedGeneration,
        persistedGeneration: this.persistedGeneration,
        queueDepth: Math.max(0, this.persistRequestedGeneration - this.persistedGeneration),
        maxQueueDepth: this.persistMaxQueueDepth,
        flushInFlight: Boolean(this.persistFlushPromise),
        checkpointScheduled: Boolean(this.persistTimer),
        store: this.stateStore?.metricsSnapshot?.() || null
      },
      dhtDurability: this.dhtDurabilitySnapshot(),
      eventLoopLag
    };
  }

  partitionPeers(nodeIds) {
    for (const nodeId of Array.isArray(nodeIds) ? nodeIds : [nodeIds]) {
      this.router.forget(nodeId);
      this.rpc.forget(nodeId);
    }
    return this.faults.partition(nodeIds);
  }

  healPeers(nodeIds = null) { return this.faults.heal(nodeIds); }
  setRelayFault(config = {}) { return this.faults.setRelay(config); }
  faultSnapshot() { return this.faults.snapshot(); }

  async close() {
    if (!this.started && !this.closing) return;
    this.closing = true;
    this.#clearPeerRecordRenewTimer();
    this.#clearPeerRecordRecoveryRetryTimer();
    this.#clearDhtRecordRebalanceTimer();
    this.peerRecordPropagationQueued = false;
    this.peerRecordBackgroundDisseminationQueued = false;
    this.discovery.close();
    if (this.leaseKeeperTimer) { clearTimeout(this.leaseKeeperTimer); this.leaseKeeperTimer = null; }
    if (this.leaseKeeperInFlight) { try { await this.leaseKeeperInFlight; } catch { /* shutdown */ } }
    if (this.peerRecordRenewalInFlight) {
      try { await this.peerRecordRenewalInFlight; } catch { /* renewal failure must not prevent shutdown */ }
    }
    if (this.dhtRebalanceInFlight) {
      try { await this.dhtRebalanceInFlight; } catch { /* background durability repair must not prevent shutdown */ }
    }
    if (this.stateReady) await this.persistState();
    this.#clearPersistTimer();
    this.eventLoopDelay.disable();
    this.started = false;
    this.rpc?.close?.();
    this.router?.close?.();
    await this.quic.close();
  }
}
