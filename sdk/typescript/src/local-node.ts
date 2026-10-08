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
type EventWaiter = {
  predicate: (event: RuntimeEvent) => boolean;
  resolve: (event: RuntimeEvent) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  signal?: AbortSignal;
  onAbort?: () => void;
};

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
  private readonly eventWaiters = new Set<EventWaiter>();
  private eventPumpPromise: Promise<void> | null = null;
  private closed = false;

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
    // `TruynNode` is a repository-internal JavaScript runtime that is bundled into the
    // published package. Keep its inferred JS-only constructor/register types from
    // leaking into the public .d.ts surface; the wrapper below is the SDK contract.
    const RuntimeTruynNode: any = TruynNode;
    const runtime: any = new RuntimeTruynNode({
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

  private cleanupWaiter(waiter: EventWaiter): void {
    this.eventWaiters.delete(waiter);
    if (waiter.timer) clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
  }

  private dispatchEvent(event: RuntimeEvent): void {
    for (const waiter of this.eventWaiters) {
      if (!waiter.predicate(event)) continue;
      this.cleanupWaiter(waiter);
      waiter.resolve(event);
      return;
    }
    this.pendingEvents.push(event);
  }

  private ensureEventPump(): void {
    if (this.closed || this.eventPumpPromise || this.eventWaiters.size === 0) return;
    this.eventPumpPromise = this.runEventPump().finally(() => {
      this.eventPumpPromise = null;
      if (!this.closed && this.eventWaiters.size > 0) this.ensureEventPump();
    });
  }

  private async runEventPump(): Promise<void> {
    while (!this.closed && this.eventWaiters.size > 0) {
      try {
        if (typeof this.runtime.nextSocketEvent === 'function') {
          try {
            const event = await this.runtime.nextSocketEvent({ timeoutMs: 25_000 });
            if (event) this.dispatchEvent(event);
            continue;
          } catch (error) {
            const message = String((error as any)?.message || error || '');
            if (message === 'fast_socket_event_timeout') continue;
            if (message === 'fast_socket_closed') {
              await new Promise((resolve) => setTimeout(resolve, 25));
              continue;
            }
            // Fall back to one legacy long-poll cycle for compatibility/transient socket failures.
          }
        }

        const polled = await this.runtime.poll({ waitMs: 25_000 });
        const events = Array.isArray(polled?.events) ? polled.events : [];
        for (const event of events) this.dispatchEvent(event);
      } catch (error) {
        const normalized = normalizedRuntimeError(error);
        for (const waiter of [...this.eventWaiters]) {
          this.cleanupWaiter(waiter);
          waiter.reject(normalized);
        }
        return;
      }
    }
  }

  async *streamEvents({ signal }: LocalNodeStreamOptions = {}): AsyncGenerator<RuntimeEvent> {
    for (;;) {
      throwIfAborted(signal);
      try {
        yield await this.waitForEvent(() => true, { timeoutMs: 30_000, signal });
      } catch (error) {
        if (error instanceof TruynError && error.code === 'deadline_exceeded') continue;
        throw error;
      }
    }
  }

  private async waitForEvent(
    predicate: (event: RuntimeEvent) => boolean,
    { timeoutMs = 5_000, signal }: LocalNodeWaitOptions = {}
  ): Promise<RuntimeEvent> {
    const timeout = Math.max(1, Math.floor(timeoutMs));
    throwIfAborted(signal);
    const pending = this.takePending(predicate);
    if (pending) return pending;
    if (this.closed) {
      throw new TruynError({ code: 'cancelled', message: 'TRUYN local-node client is closed', retryable: false });
    }

    return new Promise<RuntimeEvent>((resolve, reject) => {
      const waiter: EventWaiter = {
        predicate,
        resolve,
        reject,
        timer: null,
        signal
      };
      waiter.timer = setTimeout(() => {
        if (!this.eventWaiters.has(waiter)) return;
        this.cleanupWaiter(waiter);
        reject(new TruynError({
          code: 'deadline_exceeded',
          message: 'Timed out waiting for TRUYN local-node event',
          retryable: true
        }));
      }, timeout);
      if (signal) {
        waiter.onAbort = () => {
          if (!this.eventWaiters.has(waiter)) return;
          this.cleanupWaiter(waiter);
          reject(cancelledError(signal));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.eventWaiters.add(waiter);

      const latePending = this.takePending(predicate);
      if (latePending) {
        this.cleanupWaiter(waiter);
        resolve(latePending);
        return;
      }
      this.ensureEventPump();
    });
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
    if (this.closed) return;
    this.closed = true;
    const error = new TruynError({ code: 'cancelled', message: 'TRUYN local-node client is closed', retryable: false });
    for (const waiter of [...this.eventWaiters]) {
      this.cleanupWaiter(waiter);
      waiter.reject(error);
    }
    if (typeof this.runtime.closeFastSocket === 'function') this.runtime.closeFastSocket();
  }
}
