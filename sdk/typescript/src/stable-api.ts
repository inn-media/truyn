import { TruynError, normalizeError } from './errors.ts';
import type { JsonValue } from './types.ts';

export type ArtifactPayloadKind = 'uri' | 'inline' | 'bytes';
export type StreamEventType = 'started' | 'delta' | 'artifact' | 'result' | 'error' | 'completed' | 'cancelled';

export interface ArtifactPayload {
  kind: ArtifactPayloadKind;
  contentType: string;
  name?: string | null;
  uri?: string;
  data?: string;
  sizeBytes?: number;
  digest?: string;
  metadata?: Record<string, JsonValue>;
}

export interface StableRequestOptions {
  signal?: AbortSignal;
  deadlineMs?: number;
  metadata?: Record<string, JsonValue>;
}

export interface NeedRequest<TInput = JsonValue> {
  capability: string;
  input: TInput | ArtifactPayload;
  artifacts?: ArtifactPayload[];
  metadata?: Record<string, JsonValue>;
}

export interface ResultResponse<TOutput = JsonValue> {
  requestId: string;
  output?: TOutput | ArtifactPayload;
  artifacts?: ArtifactPayload[];
  completedAt?: string;
  metadata?: Record<string, JsonValue>;
}

export interface StreamEvent<TDelta = JsonValue, TResult = JsonValue> {
  type: StreamEventType;
  requestId?: string;
  sequence?: number;
  delta?: TDelta;
  artifact?: ArtifactPayload;
  result?: ResultResponse<TResult>;
  error?: JsonValue;
  metadata?: Record<string, JsonValue>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function assertContentType(contentType: string): void {
  if (!nonEmptyString(contentType) || !contentType.includes('/')) {
    throw new TruynError({ code: 'validation_error', message: 'artifact contentType must be a MIME type', retryable: false });
  }
}

export function artifactFromUri(uri: string, contentType: string, options: Omit<ArtifactPayload, 'kind' | 'uri' | 'contentType'> = {}): ArtifactPayload {
  if (!nonEmptyString(uri)) {
    throw new TruynError({ code: 'validation_error', message: 'artifact uri is required', retryable: false });
  }
  assertContentType(contentType);
  return { kind: 'uri', uri, contentType, ...options };
}

export function artifactFromText(text: string, contentType = 'text/plain', options: Omit<ArtifactPayload, 'kind' | 'data' | 'contentType' | 'sizeBytes'> = {}): ArtifactPayload {
  assertContentType(contentType);
  const data = Buffer.from(text, 'utf8').toString('base64');
  return { kind: 'inline', data, contentType, sizeBytes: Buffer.byteLength(text, 'utf8'), ...options };
}

export function assertNotCancelled(options: StableRequestOptions = {}): void {
  if (options.signal?.aborted) {
    throw new TruynError(normalizeError({ clientKind: 'cancelled', message: options.signal.reason ? String(options.signal.reason) : 'Request cancelled' }));
  }
}

export async function* streamEvents<TDelta = JsonValue, TResult = JsonValue>(
  events: AsyncIterable<StreamEvent<TDelta, TResult>> | Iterable<StreamEvent<TDelta, TResult>>,
  options: StableRequestOptions = {}
): AsyncGenerator<StreamEvent<TDelta, TResult>, void, void> {
  for await (const event of events) {
    assertNotCancelled(options);
    yield event;
    if (event.type === 'cancelled') {
      throw new TruynError(normalizeError({ clientKind: 'cancelled', message: 'Stream cancelled by relay' }));
    }
  }
}
