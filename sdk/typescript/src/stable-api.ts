export const TRUYN_SDK_STABLE_API_VERSION = '1' as const;

export type TruynCancelCause = 'user' | 'deadline' | 'shutdown';

export interface TruynCancellation {
  readonly signal: AbortSignal;
  readonly cause?: TruynCancelCause;
}

export interface TruynObjectPayload<T = unknown> {
  readonly kind: 'object';
  readonly value: T;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TruynArtifactPayload {
  readonly kind: 'artifact';
  readonly ref: string;
  readonly mediaType: string;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type TruynPortablePayload<T = unknown> = TruynObjectPayload<T> | TruynArtifactPayload;

export interface TruynStreamOptions {
  readonly signal?: AbortSignal;
}

export interface TruynStreamItem<T> {
  readonly sequence: number;
  readonly item: T;
}

function nonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason instanceof Error ? signal.reason : new Error('TRUYN SDK operation cancelled');
  reason.name = 'AbortError';
  throw reason;
}

export function createCancellationController(): AbortController {
  return new AbortController();
}

export function createObjectPayload<T>(
  value: T,
  metadata?: Readonly<Record<string, unknown>>
): TruynObjectPayload<T> {
  return {
    kind: 'object',
    value,
    ...(metadata === undefined ? {} : { metadata })
  };
}

export function createArtifactPayload(input: {
  ref: string;
  mediaType: string;
  bytes?: number;
  sha256?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): TruynArtifactPayload {
  nonEmptyString(input?.ref, 'ref');
  nonEmptyString(input?.mediaType, 'mediaType');
  if (input.bytes !== undefined && (!Number.isSafeInteger(input.bytes) || input.bytes < 0)) {
    throw new TypeError('bytes must be a non-negative safe integer');
  }
  if (input.sha256 !== undefined) {
    nonEmptyString(input.sha256, 'sha256');
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new TypeError('sha256 must be a 64-character hexadecimal digest');
  }
  return {
    kind: 'artifact',
    ref: input.ref,
    mediaType: input.mediaType,
    ...(input.bytes === undefined ? {} : { bytes: input.bytes }),
    ...(input.sha256 === undefined ? {} : { sha256: input.sha256.toLowerCase() }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
  };
}

export async function* streamTruynItems<T>(
  source: AsyncIterable<T>,
  options: TruynStreamOptions = {}
): AsyncGenerator<TruynStreamItem<T>> {
  let sequence = 0;
  throwIfAborted(options.signal);
  for await (const item of source) {
    throwIfAborted(options.signal);
    yield { sequence, item };
    sequence += 1;
  }
  throwIfAborted(options.signal);
}
