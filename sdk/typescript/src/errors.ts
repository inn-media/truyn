import type {
  JsonValue,
  NormalizedError,
  NormalizedErrorCode,
  NormalizedErrorSource
} from './types.ts';

export interface ErrorNormalizationInput {
  httpStatus?: number;
  relayCode?: string;
  protocolReason?: string;
  clientKind?: 'transport' | 'invalid_response' | 'cancelled';
  message?: string;
  details?: JsonValue;
}

const relayMappings: Record<string, { code: NormalizedErrorCode; retryable: boolean }> = {
  unauthorized: { code: 'unauthenticated', retryable: false },
  provider_access_denied: { code: 'permission_denied', retryable: false },
  no_matching_provider: { code: 'not_found', retryable: false },
  duplicate_request: { code: 'conflict', retryable: false },
  offer_capacity_reached: { code: 'resource_exhausted', retryable: true },
  result_wait_timeout: { code: 'deadline_exceeded', retryable: true },
  invalid_capability: { code: 'validation_error', retryable: false },
  internal_error: { code: 'internal_error', retryable: true }
};

function fallbackHttpMapping(status?: number): { code: NormalizedErrorCode; retryable: boolean } {
  if (status === 401) return { code: 'unauthenticated', retryable: false };
  if (status === 403) return { code: 'permission_denied', retryable: false };
  if (status === 404) return { code: 'not_found', retryable: false };
  if (status === 408 || status === 504) return { code: 'deadline_exceeded', retryable: true };
  if (status === 409) return { code: 'conflict', retryable: false };
  if (status === 429) return { code: 'resource_exhausted', retryable: true };
  if (status !== undefined && status >= 500) return { code: 'internal_error', retryable: true };
  if (status !== undefined && status >= 400) return { code: 'validation_error', retryable: false };
  return { code: 'invalid_response', retryable: false };
}

function sourceDetails(input: ErrorNormalizationInput): NormalizedErrorSource | undefined {
  const source: NormalizedErrorSource = {};
  if (input.httpStatus !== undefined) source.httpStatus = input.httpStatus;
  if (input.relayCode) source.relayCode = input.relayCode;
  if (input.protocolReason) source.protocolReason = input.protocolReason;
  return Object.keys(source).length > 0 ? source : undefined;
}

export function normalizeError(input: ErrorNormalizationInput): NormalizedError {
  let mapping: { code: NormalizedErrorCode; retryable: boolean };

  if (input.protocolReason === 'unsupported_protocol') {
    mapping = { code: 'version_mismatch', retryable: false };
  } else if (input.clientKind === 'transport') {
    mapping = { code: 'transport_error', retryable: true };
  } else if (input.clientKind === 'invalid_response') {
    mapping = { code: 'invalid_response', retryable: false };
  } else if (input.clientKind === 'cancelled') {
    mapping = { code: 'cancelled', retryable: false };
  } else if (input.relayCode && relayMappings[input.relayCode]) {
    mapping = relayMappings[input.relayCode];
  } else {
    mapping = fallbackHttpMapping(input.httpStatus);
  }

  const source = sourceDetails(input);
  return {
    code: mapping.code,
    message: input.message || input.relayCode || input.protocolReason || mapping.code,
    retryable: mapping.retryable,
    ...(source ? { source } : {}),
    ...(input.details === undefined ? {} : { details: input.details })
  };
}

export class TruynError extends Error {
  readonly code: NormalizedErrorCode;
  readonly retryable: boolean;
  readonly source?: NormalizedErrorSource;
  readonly details?: JsonValue;

  constructor(error: NormalizedError) {
    super(error.message);
    this.name = 'TruynError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.source = error.source;
    this.details = error.details;
  }

  toJSON(): NormalizedError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.source ? { source: this.source } : {}),
      ...(this.details === undefined ? {} : { details: this.details })
    };
  }
}

export function asTruynError(error: NormalizedError): TruynError {
  return new TruynError(error);
}
