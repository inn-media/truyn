import { verifyEnvelope } from '../../core/protocol/index.js';
import {
  createFunctionAdapter,
  validateAdapter,
  TruynAdapterHost as BaseTruynAdapterHost
} from './base.js';

export { createFunctionAdapter, validateAdapter };

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

function cancellationFromEvent(event) {
  if (event?.kind !== 'REVOKE' || !event.envelope) return null;
  const verification = verifyEnvelope(event.envelope, { allowedTypes: ['REVOKE'] });
  if (!verification.ok) return null;
  const payload = event.envelope.payload || {};
  if (!payload.targetId || (payload.targetKind && payload.targetKind !== 'need')) return null;
  return {
    targetId: payload.targetId,
    reason: payload.reason || 'cancelled_by_requester',
    from: event.envelope.from,
    verification
  };
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

export class TruynAdapterHost extends BaseTruynAdapterHost {
  constructor(options = {}) {
    super(options);
    this.inFlight = new Map();
    this.cancelPollMs = Number.isFinite(options.cancelPollMs) ? Math.max(10, Math.floor(options.cancelPollMs)) : 50;
    this.controlLoopPromise = null;
  }

  async sendPartial(need, state, delta, metadata = {}) {
    if (!need.compact || need.chain) throw new Error('partial_requires_fast_direct_need');
    if (state.controller.signal.aborted) throw state.controller.signal.reason || new Error('request_cancelled');
    const sequence = state.nextSequence;
    const payload = { sequence, delta, metadata };
    const frame = this.node.compactFrame('PARTIAL', payload, { id: need.id });
    const response = await fetch(`${this.node.relayUrl}/v1/fast/partials`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.node.authHeaders()
      },
      body: JSON.stringify({ frame, payload }),
      signal: state.controller.signal
    });
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
      const metadata = {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        latencyMs: 0,
        error: 'PROVIDER_ACCESS_DENIED',
        errorClass: 'authorization',
        accessDenied: true,
        accessMode: this.accessPolicy.mode,
        failed: true
      };
      if (need.chain) metadata.chainStage = need.stageIndex;
      await this.sendTerminal(need, null, metadata);
      return;
    }

    let billing = null;
    if (this.billingPolicy) {
      billing = this.billingPolicy.authorize(need, {
        accessPolicy: this.accessPolicy,
        estimatedTokens: billingEstimate(need)
      });
      if (!billing?.ok) {
        if (signal.aborted) return;
        const metadata = {
          adapter: this.adapter.name,
          adapterVersion: this.adapter.version,
          latencyMs: 0,
          error: 'PROVIDER_BILLING_DENIED',
          errorClass: 'billing',
          billingDenied: true,
          billingMode: this.billingPolicy.mode,
          billingReason: billing?.reason || 'billing_not_authorized',
          failed: true
        };
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

      const execution = await this.adapter.execute({
        capability,
        input,
        policy: need.payload?.policy || {},
        need,
        node: this.node,
        signal,
        emitPartial: (delta, metadata = {}) => this.sendPartial(need, state, delta, metadata)
      });
      if (signal.aborted) return;

      const normalized = execution && typeof execution === 'object' && 'output' in execution
        ? execution
        : { output: execution, metadata: {} };
      const metadata = {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        latencyMs: Date.now() - startedAt,
        partialCount: state.nextSequence,
        ...(normalized.metadata || {})
      };
      if (billing) {
        metadata.billingMode = billing.mode;
        metadata.billingResponsibility = billing.billingResponsibility;
      }
      if (contextResolution) metadata.contextResolution = contextResolution;
      if (need.chain) metadata.chainStage = need.stageIndex;
      if (!signal.aborted) await this.sendTerminal(need, normalized.output, metadata);
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError' || error?.message === 'request_cancelled') return;
      const metadata = {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        latencyMs: Date.now() - startedAt,
        error: error.message,
        failed: true
      };
      if (billing) {
        metadata.billingMode = billing.mode;
        metadata.billingResponsibility = billing.billingResponsibility;
      }
      if (need.chain) metadata.chainStage = need.stageIndex;
      await this.sendTerminal(need, null, metadata);
    }
  }

  scheduleNeed(need) {
    if (!need?.id || this.inFlight.has(need.id)) return this.inFlight.get(need.id)?.promise || null;
    const controller = new AbortController();
    const state = { controller, need, nextSequence: 0, promise: null };
    this.inFlight.set(need.id, state);
    state.promise = Promise.resolve()
      .then(() => this.executeNeed(need, state))
      .finally(() => {
        if (this.inFlight.get(need.id) === state) this.inFlight.delete(need.id);
      });
    return state.promise;
  }

  handleLifecycleEvent(event) {
    const cancellation = cancellationFromEvent(event);
    if (cancellation) {
      const state = this.inFlight.get(cancellation.targetId);
      if (state && !state.controller.signal.aborted && state.need.from === cancellation.from) {
        state.controller.abort(new Error(cancellation.reason));
        return { cancelled: true, targetId: cancellation.targetId };
      }
      return { cancelled: false, targetId: cancellation.targetId };
    }

    const need = super.normalizeEvent(event);
    if (!need) return null;
    const promise = this.scheduleNeed(need);
    return { scheduled: Boolean(promise), need, promise };
  }

  async runOnce() {
    return super.runOnce();
  }

  async pollFastWork() {
    if (this.fastPath && this.socketPath) return { events: [await this.node.nextCompactSocketEvent()] };
    return this.node.pollCompact({ waitMs: this.longPollMs });
  }

  async runControlLoop() {
    while (this.running) {
      const polled = await this.node.poll();
      for (const event of polled.events) this.handleLifecycleEvent(event);
      if (this.running) await delay(this.cancelPollMs);
    }
  }

  async start() {
    if (this.running) return;
    await this.publishCapabilities();
    this.running = true;

    if (this.fastPath) {
      this.controlLoopPromise = this.runControlLoop();
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
  }

  async stop() {
    this.running = false;
    for (const state of this.inFlight.values()) {
      if (!state.controller.signal.aborted) state.controller.abort(new Error('provider_stopping'));
    }
    this.node.closeFastSocket?.();
    const loops = [this.loopPromise, this.controlLoopPromise].filter(Boolean);
    if (loops.length) await Promise.allSettled(loops);
    const executions = [...this.inFlight.values()].map((state) => state.promise).filter(Boolean);
    if (executions.length) await Promise.allSettled(executions);
  }
}
