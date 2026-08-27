import { verifyEnvelope } from '../../core/protocol/index.js';
import { createProviderAccessPolicy } from '../../core/security/provider-access.js';

const MAX_CANCELLATION_REASON_CHARS = 256;

function normalizeCapabilities(capabilities) {
  const values = typeof capabilities === 'function' ? capabilities() : capabilities;
  if (!Array.isArray(values) || values.length === 0) throw new Error('Adapter must expose at least one capability');
  return values.map((value) => {
    if (typeof value === 'string') return { name: value };
    if (!value || typeof value.name !== 'string' || value.name.length === 0) throw new Error('Invalid adapter capability');
    return value;
  });
}

function materializePrevious(value, previousOutput) {
  if (Array.isArray(value)) return value.map((item) => materializePrevious(item, previousOutput));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.$previous === 'output') return previousOutput;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializePrevious(item, previousOutput)]));
  }
  return value;
}

function billingEstimate(need) {
  const value = need?.payload?.policy?.billing?.maxTokens;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isRecoverableSocketError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message === 'fast_socket_closed'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ETIMEDOUT'
    || message.includes('socket hang up')
    || message.includes('websocket closed');
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function settleWithin(promises, timeoutMs) {
  if (!promises.length) return true;
  if (timeoutMs <= 0) return false;
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = Promise.allSettled(promises).then(() => true);
  const drained = await Promise.race([settled, timeout]);
  if (timer) clearTimeout(timer);
  return drained;
}

function cancellationFromEvent(event) {
  if (event?.kind !== 'REVOKE' || !event.envelope) return null;
  const verification = verifyEnvelope(event.envelope, { allowedTypes: ['REVOKE'] });
  if (!verification.ok) return null;
  const payload = event.envelope.payload || {};
  if (!payload.targetId || (payload.targetKind && payload.targetKind !== 'need')) return null;
  const reason = typeof payload.reason === 'string' && payload.reason
    ? payload.reason.slice(0, MAX_CANCELLATION_REASON_CHARS)
    : 'cancelled_by_requester';
  return { targetId: payload.targetId, reason, from: event.envelope.from, verification };
}

async function responseJson(response) {
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function validateAdapter(adapter) {
  if (!adapter || typeof adapter.execute !== 'function') throw new Error('Adapter execute(request) is required');
  const capabilities = normalizeCapabilities(adapter.capabilities);
  return { name: adapter.name || 'truyn-adapter', version: adapter.version || '0.1.0', capabilities, execute: adapter.execute.bind(adapter) };
}

export function createFunctionAdapter({ name = 'function-adapter', version = '0.1.0', capabilities, execute }) {
  return validateAdapter({ name, version, capabilities, execute });
}

export class TruynAdapterHost {
  constructor({ node, adapter, pollIntervalMs = 500, fastPath = false, longPollMs = 25_000, socketPath = false, socketReconnectDelayMs = 250, cancelPollMs = 50, maxCancellationTombstones = 1024, maxConcurrentExecutions = 1, maxPendingExecutions = 256, executionDrainTimeoutMs = 5_000, accessPolicy, billingPolicy = null } = {}) {
    if (!node) throw new Error('node is required');
    this.node = node;
    this.adapter = validateAdapter(adapter);
    this.pollIntervalMs = pollIntervalMs;
    this.fastPath = fastPath;
    this.longPollMs = longPollMs;
    this.socketPath = socketPath;
    this.socketReconnectDelayMs = socketReconnectDelayMs;
    this.cancelPollMs = Number.isFinite(cancelPollMs) ? Math.max(10, Math.floor(cancelPollMs)) : 50;
    this.maxCancellationTombstones = Number.isInteger(maxCancellationTombstones) && maxCancellationTombstones > 0 ? maxCancellationTombstones : 1024;
    this.maxConcurrentExecutions = Number.isInteger(maxConcurrentExecutions) && maxConcurrentExecutions > 0 ? maxConcurrentExecutions : 1;
    this.maxPendingExecutions = Number.isInteger(maxPendingExecutions) && maxPendingExecutions >= 0 ? maxPendingExecutions : 256;
    this.executionDrainTimeoutMs = Number.isFinite(executionDrainTimeoutMs) ? Math.max(0, Math.min(60_000, Math.floor(executionDrainTimeoutMs))) : 5_000;
    this.accessPolicy = accessPolicy || createProviderAccessPolicy();
    this.billingPolicy = billingPolicy;
    this.running = false;
    this.registered = false;
    this.offerIds = [];
    this.loopPromise = null;
    this.controlLoopPromise = null;
    this.inFlight = new Map();
    this.cancelledNeedIds = new Map();
    this.pendingNeeds = [];
    this.pendingNeedIds = new Set();
    this.lastControlError = null;
    this.lastExecutionError = null;
    this.executionDrainTimedOut = false;
  }

  async ensureRegistered() {
    if (this.registered && this.node.sessionToken) return;
    await this.node.register({ name: this.adapter.name });
    this.registered = true;
  }

  async publishCapabilities() {
    await this.ensureRegistered();
    if (this.offerIds.length > 0) return this.offerIds;
    if (this.fastPath && this.socketPath) await this.node.ensureFastSocket();
    for (const capability of this.adapter.capabilities) {
      const result = await this.node.offer(capability.name, {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        description: capability.description || null,
        fastPath: this.fastPath,
        chainPath: this.fastPath,
        socketPath: this.socketPath,
        accessMode: this.accessPolicy.mode,
        allowedRequesterIds: this.accessPolicy.mode === 'owner-only' ? this.accessPolicy.allowedRequesterIds : [],
        billingMode: this.billingPolicy?.mode || null
      });
      this.offerIds.push(result.offerId);
    }
    return this.offerIds;
  }

  normalizeEvent(event) {
    if (event.kind === 'NEED') {
      if (!event.verification?.ok) return null;
      const compact = Boolean(event.frame);
      return compact ? { id: event.frame.i, from: event.from, payload: event.payload, compact: true } : event.envelope;
    }
    if (event.kind === 'CHAIN_STAGE') {
      if (!event.verification?.ok) return null;
      if (!Number.isInteger(event.stageIndex) || !event.requestId) return null;
      if (event.stageIndex > 0 && event.priorVerification?.ok !== true) return null;
      const stage = event.payload?.stages?.[event.stageIndex];
      if (!stage) return null;
      const previousOutput = event.priorResult?.payload?.output;
      const inputSource = Object.prototype.hasOwnProperty.call(stage, 'inputTemplate') ? stage.inputTemplate : stage.input;
      return { id: event.requestId, from: event.from, compact: true, chain: true, chainId: event.frame.i, stageIndex: event.stageIndex, payload: { capability: stage.capability, input: materializePrevious(inputSource, previousOutput), policy: stage.policy || {} }, chainFrame: event.frame, chainPayload: event.payload, priorResult: event.priorResult || null };
    }
    return null;
  }

  async runOnce() {
    await this.publishCapabilities();
    let polled;
    if (this.fastPath && this.socketPath) polled = { events: [await this.node.nextCompactSocketEvent()] };
    else if (this.fastPath) polled = await this.node.pollCompact({ waitMs: this.longPollMs });
    else polled = await this.node.poll();
    let handled = 0;
    for (const event of polled.events) {
      const need = this.normalizeEvent(event);
      if (!need) continue;
      const compact = Boolean(need.compact);
      const capability = need.payload?.capability?.name || need.payload?.capability;
      if (!this.adapter.capabilities.some((item) => item.name === capability)) continue;
      const access = this.accessPolicy.authorize(need);
      if (!access?.ok) {
        const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: 0, error: 'PROVIDER_ACCESS_DENIED', errorClass: 'authorization', accessDenied: true, accessMode: this.accessPolicy.mode, failed: true };
        if (need.chain) metadata.chainStage = need.stageIndex;
        if (compact) await this.node.compactResult(need.id, null, metadata); else await this.node.result(need.id, null, metadata);
        handled += 1;
        continue;
      }
      let billing = null;
      if (this.billingPolicy) {
        billing = this.billingPolicy.authorize(need, { accessPolicy: this.accessPolicy, estimatedTokens: billingEstimate(need) });
        if (!billing?.ok) {
          const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: 0, error: 'PROVIDER_BILLING_DENIED', errorClass: 'billing', billingDenied: true, billingMode: this.billingPolicy.mode, billingReason: billing?.reason || 'billing_not_authorized', failed: true };
          if (need.chain) metadata.chainStage = need.stageIndex;
          if (compact) await this.node.compactResult(need.id, null, metadata); else await this.node.result(need.id, null, metadata);
          handled += 1;
          continue;
        }
      }
      const startedAt = Date.now();
      try {
        let input = need.payload?.input;
        let contextResolution = null;
        if (typeof this.node.materializeContextRefs === 'function') {
          const resolved = await this.node.materializeContextRefs(input);
          input = resolved.value;
          if ((resolved.stats?.contextRefs || 0) > 0) contextResolution = resolved.stats;
        }
        const execution = await this.adapter.execute({ capability, input, policy: need.payload?.policy || {}, need, node: this.node });
        const normalized = execution && typeof execution === 'object' && 'output' in execution ? execution : { output: execution, metadata: {} };
        const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: Date.now() - startedAt, ...(normalized.metadata || {}) };
        if (billing) { metadata.billingMode = billing.mode; metadata.billingResponsibility = billing.billingResponsibility; }
        if (contextResolution) metadata.contextResolution = contextResolution;
        if (need.chain) metadata.chainStage = need.stageIndex;
        if (compact) await this.node.compactResult(need.id, normalized.output, metadata); else await this.node.result(need.id, normalized.output, metadata);
      } catch (error) {
        const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: Date.now() - startedAt, error: error.message, failed: true };
        if (billing) { metadata.billingMode = billing.mode; metadata.billingResponsibility = billing.billingResponsibility; }
        if (need.chain) metadata.chainStage = need.stageIndex;
        if (compact) await this.node.compactResult(need.id, null, metadata); else await this.node.result(need.id, null, metadata);
      }
      handled += 1;
    }
    return { handled, events: polled.events.length };
  }

  async sendPartial(need, state, delta, metadata = {}) {
    if (!need.compact || need.chain) throw new Error('partial_requires_fast_direct_need');
    if (state.controller.signal.aborted) throw state.controller.signal.reason || new Error('request_cancelled');
    const sequence = state.nextSequence;
    const payload = { sequence, delta, metadata };
    const frame = this.node.compactFrame('PARTIAL', payload, { id: need.id });
    const response = await fetch(`${this.node.relayUrl}/v1/fast/partials`, { method: 'POST', headers: { 'content-type': 'application/json', ...this.node.authHeaders() }, body: JSON.stringify({ frame, payload }), signal: state.controller.signal });
    const result = await responseJson(response);
    state.nextSequence += 1;
    return { ...result, frame, payload };
  }

  async sendTerminal(need, output, metadata) {
    if (need.compact) return this.node.compactResult(need.id, output, metadata);
    return this.node.result(need.id, output, metadata);
  }

  async executeNeed(need, state) {
    const { signal } = state.controller;
    const capability = need.payload?.capability?.name || need.payload?.capability;
    if (!this.adapter.capabilities.some((item) => item.name === capability)) return;
    const access = this.accessPolicy.authorize(need);
    if (!access?.ok) {
      if (signal.aborted) return;
      const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: 0, error: 'PROVIDER_ACCESS_DENIED', errorClass: 'authorization', accessDenied: true, accessMode: this.accessPolicy.mode, failed: true };
      if (need.chain) metadata.chainStage = need.stageIndex;
      await this.sendTerminal(need, null, metadata);
      return;
    }
    let billing = null;
    if (this.billingPolicy) {
      billing = this.billingPolicy.authorize(need, { accessPolicy: this.accessPolicy, estimatedTokens: billingEstimate(need) });
      if (!billing?.ok) {
        if (signal.aborted) return;
        const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: 0, error: 'PROVIDER_BILLING_DENIED', errorClass: 'billing', billingDenied: true, billingMode: this.billingPolicy.mode, billingReason: billing?.reason || 'billing_not_authorized', failed: true };
        if (need.chain) metadata.chainStage = need.stageIndex;
        await this.sendTerminal(need, null, metadata);
        return;
      }
    }
    const startedAt = Date.now();
    try {
      let input = need.payload?.input;
      let contextResolution = null;
      if (typeof this.node.materializeContextRefs === 'function') {
        const resolved = await this.node.materializeContextRefs(input);
        input = resolved.value;
        if ((resolved.stats?.contextRefs || 0) > 0) contextResolution = resolved.stats;
      }
      if (signal.aborted) return;
      const execution = await this.adapter.execute({ capability, input, policy: need.payload?.policy || {}, need, node: this.node, signal, emitPartial: (delta, partialMetadata = {}) => this.sendPartial(need, state, delta, partialMetadata) });
      if (signal.aborted) return;
      const normalized = execution && typeof execution === 'object' && 'output' in execution ? execution : { output: execution, metadata: {} };
      const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: Date.now() - startedAt, ...(normalized.metadata || {}), partialCount: state.nextSequence };
      if (billing) { metadata.billingMode = billing.mode; metadata.billingResponsibility = billing.billingResponsibility; }
      if (contextResolution) metadata.contextResolution = contextResolution;
      if (need.chain) metadata.chainStage = need.stageIndex;
      if (!signal.aborted) await this.sendTerminal(need, normalized.output, metadata);
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError' || error?.message === 'request_cancelled') return;
      const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: Date.now() - startedAt, error: error.message, failed: true };
      if (billing) { metadata.billingMode = billing.mode; metadata.billingResponsibility = billing.billingResponsibility; }
      if (need.chain) metadata.chainStage = need.stageIndex;
      await this.sendTerminal(need, null, metadata);
    }
  }

  rememberCancellation(cancellation) {
    if (this.cancelledNeedIds.has(cancellation.targetId)) this.cancelledNeedIds.delete(cancellation.targetId);
    this.cancelledNeedIds.set(cancellation.targetId, { from: cancellation.from, reason: cancellation.reason.slice(0, MAX_CANCELLATION_REASON_CHARS), receivedAt: Date.now() });
    while (this.cancelledNeedIds.size > this.maxCancellationTombstones) {
      const oldest = this.cancelledNeedIds.keys().next().value;
      this.cancelledNeedIds.delete(oldest);
    }
  }

  startNeed(need) {
    const controller = new AbortController();
    const state = { controller, need, nextSequence: 0, promise: null };
    this.inFlight.set(need.id, state);
    state.promise = Promise.resolve().then(() => this.executeNeed(need, state)).finally(() => {
      if (this.inFlight.get(need.id) === state) this.inFlight.delete(need.id);
      this.drainPendingNeeds();
    });
    return state.promise;
  }

  observeExecutionPromise(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch((error) => { this.lastExecutionError = error; });
    return promise;
  }

  enqueueNeed(need) {
    let resolveQueued;
    let rejectQueued;
    const promise = new Promise((resolve, reject) => { resolveQueued = resolve; rejectQueued = reject; });
    this.pendingNeeds.push({ need, promise, resolve: resolveQueued, reject: rejectQueued });
    this.pendingNeedIds.add(need.id);
    return promise;
  }

  rejectNeedOverCapacity(need) {
    const metadata = { adapter: this.adapter.name, adapterVersion: this.adapter.version, latencyMs: 0, error: 'PROVIDER_BUSY', errorClass: 'capacity', providerBusy: true, failed: true };
    if (need.chain) metadata.chainStage = need.stageIndex;
    return Promise.resolve(this.sendTerminal(need, null, metadata));
  }

  drainPendingNeeds() {
    while (this.running && this.inFlight.size < this.maxConcurrentExecutions && this.pendingNeeds.length > 0) {
      const queued = this.pendingNeeds.shift();
      this.pendingNeedIds.delete(queued.need.id);
      const priorCancellation = this.cancelledNeedIds.get(queued.need.id);
      if (priorCancellation?.from === queued.need.from) { queued.resolve({ cancelled: true }); continue; }
      const execution = this.startNeed(queued.need);
      execution.then(queued.resolve, queued.reject);
    }
  }

  cancelPendingNeed(targetId, requester) {
    const index = this.pendingNeeds.findIndex((entry) => entry.need.id === targetId && entry.need.from === requester);
    if (index < 0) return false;
    const [queued] = this.pendingNeeds.splice(index, 1);
    this.pendingNeedIds.delete(targetId);
    queued.resolve({ cancelled: true });
    return true;
  }

  scheduleNeed(need) {
    if (!need?.id) return null;
    if (this.inFlight.has(need.id)) return this.inFlight.get(need.id)?.promise || null;
    if (this.pendingNeedIds.has(need.id)) return this.pendingNeeds.find((entry) => entry.need.id === need.id)?.promise || null;
    const priorCancellation = this.cancelledNeedIds.get(need.id);
    if (priorCancellation?.from === need.from) return null;
    if (this.inFlight.size < this.maxConcurrentExecutions) return this.startNeed(need);
    if (this.pendingNeeds.length < this.maxPendingExecutions) return this.enqueueNeed(need);
    return this.rejectNeedOverCapacity(need);
  }

  handleLifecycleEvent(event) {
    const cancellation = cancellationFromEvent(event);
    if (cancellation) {
      this.rememberCancellation(cancellation);
      if (this.cancelPendingNeed(cancellation.targetId, cancellation.from)) return { cancelled: true, targetId: cancellation.targetId, pending: true };
      const state = this.inFlight.get(cancellation.targetId);
      if (state && !state.controller.signal.aborted && state.need.from === cancellation.from) {
        state.controller.abort(new Error(cancellation.reason));
        return { cancelled: true, targetId: cancellation.targetId };
      }
      return { cancelled: false, targetId: cancellation.targetId };
    }
    const need = this.normalizeEvent(event);
    if (!need) return null;
    const promise = this.scheduleNeed(need);
    this.observeExecutionPromise(promise);
    return { scheduled: Boolean(promise), need, promise };
  }

  async pollFastWork() {
    if (this.fastPath && this.socketPath) return { events: [await this.node.nextCompactSocketEvent()] };
    return this.node.pollCompact({ waitMs: this.longPollMs });
  }

  async runControlLoop() {
    while (this.running) {
      try {
        const polled = await this.node.poll();
        this.lastControlError = null;
        for (const event of polled.events) this.handleLifecycleEvent(event);
      } catch (error) {
        if (!this.running) break;
        this.lastControlError = error;
      }
      if (this.running) await delay(this.cancelPollMs);
    }
  }

  async start() {
    if (this.running) return;
    await this.publishCapabilities();
    this.running = true;
    this.drainPendingNeeds();
    if (this.fastPath) {
      this.controlLoopPromise = this.runControlLoop();
      this.controlLoopPromise.catch(() => {});
    }
    this.loopPromise = (async () => {
      while (this.running) {
        try {
          const polled = this.fastPath ? await this.pollFastWork() : await this.node.poll();
          for (const event of polled.events) this.handleLifecycleEvent(event);
        } catch (error) {
          if (this.running && this.fastPath && this.socketPath && isRecoverableSocketError(error)) {
            this.node.closeFastSocket?.();
            await delay(this.socketReconnectDelayMs);
            continue;
          }
          if (this.running) throw error;
        }
        if (this.running && !this.fastPath && this.pollIntervalMs > 0) await delay(this.pollIntervalMs);
      }
    })();
    this.loopPromise.catch(() => {});
  }

  async stop({ preserveDequeuedWork = false } = {}) {
    this.running = false;
    const executionStates = [...this.inFlight.values()];
    const interruptedNeeds = executionStates.map((state) => state.need);
    for (const state of executionStates) if (!state.controller.signal.aborted) state.controller.abort(new Error('provider_stopping'));
    if (!preserveDequeuedWork) {
      for (const queued of this.pendingNeeds.splice(0)) queued.resolve({ stopped: true });
      this.pendingNeedIds.clear();
    }
    this.node.closeFastSocket?.();
    const loops = [this.loopPromise, this.controlLoopPromise].filter(Boolean);
    if (loops.length) await Promise.allSettled(loops);
    const executions = executionStates.map((state) => state.promise).filter(Boolean);
    const drained = await settleWithin(executions, this.executionDrainTimeoutMs);
    this.executionDrainTimedOut = !drained && executions.length > 0;
    if (!drained) {
      for (const state of executionStates) {
        if (this.inFlight.get(state.need.id) === state) this.inFlight.delete(state.need.id);
      }
    }
    if (preserveDequeuedWork) {
      for (const need of interruptedNeeds) {
        const cancellation = this.cancelledNeedIds.get(need.id);
        if (cancellation?.from === need.from || this.inFlight.has(need.id) || this.pendingNeedIds.has(need.id)) continue;
        this.observeExecutionPromise(this.enqueueNeed(need));
      }
    }
  }
}
