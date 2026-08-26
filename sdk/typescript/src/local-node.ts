import { TruynNode } from '../../../node/client.js';
import { TruynError, normalizeError } from './errors.ts';

export interface LocalNodeConnectOptions {
  relayUrl: string;
  name?: string | null;
  protocols?: string[];
  identity?: unknown;
}

export interface LocalNodeWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface LocalNodeStreamOptions {
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface LocalNeedReceipt {
  ok: boolean;
  needId: string;
  provider: string;
  providerTrust?: unknown;
}

export interface LocalNeedEvent {
  needId: string;
  requester: string;
  capability: string;
  input: unknown;
  policy: unknown;
  envelope: Record<string, unknown>;
  verification: { ok: boolean; reason?: string };
}

export interface LocalResultEvent {
  needId: string;
  provider: string;
  output: unknown;
  metadata: unknown;
  trust: unknown;
  envelope: Record<string, unknown>;
  verification: { ok: boolean; reason?: string };
}

type RuntimeEvent = Record<string, any>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function cancelledError(signal?: AbortSignal): TruynError {
  const message = signal?.reason instanceof Error
    ? signal.reason.message
    : typeof signal?.reason === 'string' && signal.reason.length > 0
      ? signal.reason
      : 'TRUYN SDK operation cancelled';
  return new TruynError({ code: 'cancelled', message, retryable: false });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError(signal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(cancelledError(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizedRuntimeError(error: any): TruynError {
  if (error instanceof TruynError) return error;
  const httpStatus = Number.isFinite(error?.status) ? Number(error.status) : undefined;
  const relayCode = nonEmptyString(error?.body?.error) ? error.body.error : undefined;
  return new TruynError(normalizeError({
    ...(httpStatus === undefined ? { clientKind: 'transport' as const } : { httpStatus }),
    ...(relayCode ? { relayCode } : {}),
    message: nonEmptyString(error?.message) ? error.message : 'TRUYN local-node request failed'
  }));
}

export class TruynLocalNodeClient {
  readonly runtime: any;
  private readonly pendingEvents: RuntimeEvent[] = [];

  constructor(runtime: any) {
    if (!runtime || typeof runtime.need !== 'function' || typeof runtime.poll !== 'function') {
      throw new TruynError({
        code: 'validation_error',
        message: 'A compatible local TruynNode runtime is required',
        retryable: false
      });
    }
    this.runtime = runtime;
  }

  static async connect(options: LocalNodeConnectOptions): Promise<TruynLocalNodeClient> {
    if (!options || !nonEmptyString(options.relayUrl)) {
      throw new TruynError({
        code: 'validation_error',
        message: 'relayUrl is required',
        retryable: false
      });
    }
    const runtime = new TruynNode({
      relayUrl: options.relayUrl,
      ...(options.identity ? { identity: options.identity } : {})
    });
    try {
      await runtime.register({
        name: options.name ?? null,
        protocols: options.protocols ?? ['TRUYN/1']
      });
    } catch (error) {
      throw normalizedRuntimeError(error);
    }
    return new TruynLocalNodeClient(runtime);
  }

  get nodeId(): string {
    return this.runtime.identity.nodeId;
  }

  async offer(capabilityId: string, metadata: Record<string, unknown> = {}): Promise<unknown> {
    if (!nonEmptyString(capabilityId)) {
      throw new TruynError({ code: 'validation_error', message: 'capabilityId is required', retryable: false });
    }
    try {
      return await this.runtime.offer(capabilityId, metadata);
    } catch (error) {
      throw normalizedRuntimeError(error);
    }
  }

  async need(
    capabilityId: string,
    input: unknown,
    policy: Record<string, unknown> = {}
  ): Promise<LocalNeedReceipt> {
    if (!nonEmptyString(capabilityId)) {
      throw new TruynError({ code: 'validation_error', message: 'capabilityId is required', retryable: false });
    }
    try {
      const receipt = await this.runtime.need(capabilityId, input, policy);
      if (!receipt?.ok || !nonEmptyString(receipt.needId) || !nonEmptyString(receipt.provider)) {
        throw new TruynError(normalizeError({
          clientKind: 'invalid_response',
          message: 'Relay returned an invalid NEED receipt'
        }));
      }
      return receipt as LocalNeedReceipt;
    } catch (error) {
      throw normalizedRuntimeError(error);
    }
  }

  async result(
    requestId: string,
    output: unknown,
    metadata: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (!nonEmptyString(requestId)) {
      throw new TruynError({ code: 'validation_error', message: 'requestId is required', retryable: false });
    }
    try {
      return await this.runtime.result(requestId, output, metadata);
    } catch (error) {
      throw normalizedRuntimeError(error);
    }
  }

  private takePending(predicate: (event: RuntimeEvent) => boolean): RuntimeEvent | null {
    const index = this.pendingEvents.findIndex(predicate);
    if (index < 0) return null;
    return this.pendingEvents.splice(index, 1)[0] ?? null;
  }

  async *streamEvents({ signal, pollIntervalMs = 20 }: LocalNodeStreamOptions = {}): AsyncGenerator<RuntimeEvent> {
    const interval = Math.max(0, Math.floor(pollIntervalMs));
    for (;;) {
      throwIfAborted(signal);
      const pending = this.pendingEvents.shift();
      if (pending) {
        yield pending;
        continue;
      }
      let polled: any;
      try {
        polled = await this.runtime.poll();
      } catch (error) {
        throw normalizedRuntimeError(error);
      }
      throwIfAborted(signal);
      const events = Array.isArray(polled?.events) ? polled.events : [];
      if (events.length > 0) {
        this.pendingEvents.push(...events);
        continue;
      }
      if (interval > 0) await sleep(interval, signal);
    }
  }

  private async waitForEvent(
    predicate: (event: RuntimeEvent) => boolean,
    { timeoutMs = 5_000, pollIntervalMs = 20, signal }: LocalNodeWaitOptions = {}
  ): Promise<RuntimeEvent> {
    const timeout = Math.max(1, Math.floor(timeoutMs));
    const interval = Math.max(0, Math.floor(pollIntervalMs));
    const deadline = Date.now() + timeout;

    for (;;) {
      throwIfAborted(signal);
      const pending = this.takePending(predicate);
      if (pending) return pending;
      let polled: any;
      try {
        polled = await this.runtime.poll();
      } catch (error) {
        throw normalizedRuntimeError(error);
      }
      throwIfAborted(signal);
      const events = Array.isArray(polled?.events) ? polled.events : [];
      const index = events.findIndex(predicate);
      if (index >= 0) {
        const [match] = events.splice(index, 1);
        this.pendingEvents.push(...events);
        return match;
      }
      this.pendingEvents.push(...events);
      if (Date.now() >= deadline) {
        throw new TruynError({
          code: 'deadline_exceeded',
          message: 'Timed out waiting for TRUYN local-node event',
          retryable: true
        });
      }
      if (interval > 0) await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), signal);
    }
  }

  async nextNeed(options: LocalNodeWaitOptions = {}): Promise<LocalNeedEvent> {
    const event = await this.waitForEvent((candidate) => candidate?.kind === 'NEED', options);
    if (!event?.verification?.ok) {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: `Received NEED failed signature verification${event?.verification?.reason ? `: ${event.verification.reason}` : ''}`
      }));
    }
    const envelope = event.envelope;
    const needId = envelope?.id;
    const requester = envelope?.from;
    const capability = envelope?.payload?.capability?.name || envelope?.payload?.capability;
    if (!nonEmptyString(needId) || !nonEmptyString(requester) || !nonEmptyString(capability)) {
      throw new TruynError(normalizeError({ clientKind: 'invalid_response', message: 'Received invalid NEED event' }));
    }
    return {
      needId,
      requester,
      capability,
      input: envelope.payload?.input,
      policy: envelope.payload?.policy,
      envelope,
      verification: event.verification
    };
  }

  async waitForResult(needId: string, options: LocalNodeWaitOptions = {}): Promise<LocalResultEvent> {
    if (!nonEmptyString(needId)) {
      throw new TruynError({ code: 'validation_error', message: 'needId is required', retryable: false });
    }
    const event = await this.waitForEvent(
      (candidate) => candidate?.kind === 'RESULT' && candidate?.envelope?.payload?.requestId === needId,
      options
    );
    if (!event?.verification?.ok) {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: `Received RESULT failed signature verification${event?.verification?.reason ? `: ${event.verification.reason}` : ''}`
      }));
    }
    const envelope = event.envelope;
    if (!nonEmptyString(envelope?.from)) {
      throw new TruynError(normalizeError({ clientKind: 'invalid_response', message: 'Received invalid RESULT event' }));
    }
    return {
      needId,
      provider: envelope.from,
      output: envelope.payload?.output,
      metadata: envelope.payload?.metadata,
      trust: event.trust ?? null,
      envelope,
      verification: event.verification
    };
  }

  close(): void {
    if (typeof this.runtime.closeFastSocket === 'function') this.runtime.closeFastSocket();
  }
}
