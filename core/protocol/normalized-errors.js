// TRUYN/1 bounded public error classification. Native A2A/MCP codes remain unchanged.
// Never infer authority, retry safety, or error class from arbitrary diagnostic text.
export const TRUYN_ERROR_CODES = Object.freeze([
  'version_mismatch', 'unauthenticated', 'permission_denied', 'deadline_exceeded',
  'invalid_argument', 'unimplemented', 'cancelled', 'transport_error',
  'invalid_response', 'not_found', 'conflict', 'resource_exhausted', 'internal_error'
]);

const STABLE = new Set(TRUYN_ERROR_CODES);
const ALIASES = Object.freeze({
  unauthorized: 'unauthenticated',
  authorization_denied: 'permission_denied',
  provider_access_denied: 'permission_denied',
  invalid_request: 'invalid_argument',
  validation_error: 'invalid_argument',
  invalid_capability: 'invalid_argument',
  payload_too_large: 'resource_exhausted',
  request_too_large: 'resource_exhausted',
  offer_capacity_reached: 'resource_exhausted',
  node_capacity_reached: 'resource_exhausted',
  cancellation_backpressure: 'resource_exhausted',
  partial_backpressure: 'resource_exhausted',
  result_wait_timeout: 'deadline_exceeded',
  no_matching_provider: 'not_found',
  duplicate_request: 'conflict',
  unsupported_protocol: 'version_mismatch',
  no_protocol_overlap: 'version_mismatch',
  required_semantic_unavailable: 'version_mismatch'
});

const RETRYABLE_SOURCE = new Set([
  'offer_capacity_reached', 'node_capacity_reached',
  'cancellation_backpressure', 'partial_backpressure', 'result_wait_timeout'
]);

/**
 * Pure semantic classifier shared by TRUYN public interoperability adapters.
 * Retryable is only an advisory; exactly-once/side-effect policy is authoritative.
 * Unknown codes never become new public error classes.
 */
export function classifyTruynError({ sourceCode, status, clientKind } = {}) {
  const raw = typeof sourceCode === 'string' ? sourceCode : '';
  let code;
  if (clientKind === 'transport') code = 'transport_error';
  else if (clientKind === 'invalid_response') code = 'invalid_response';
  else if (clientKind === 'cancelled') code = 'cancelled';
  else if (STABLE.has(raw)) code = raw;
  else if (Object.hasOwn(ALIASES, raw)) code = ALIASES[raw];
  else if (status === 401) code = 'unauthenticated';
  else if (status === 403) code = 'permission_denied';
  else if (status === 404) code = 'not_found';
  else if (status === 408 || status === 504) code = 'deadline_exceeded';
  else if (status === 409) code = 'conflict';
  else if (status === 413 || status === 429) code = 'resource_exhausted';
  else if (status === 501) code = 'unimplemented';
  else if (typeof status === 'number' && status >= 400 && status < 500) code = 'invalid_argument';
  else code = 'internal_error';
  const retryable = code === 'transport_error' ||
    (code === 'deadline_exceeded' && (raw === '' || raw === 'result_wait_timeout')) ||
    RETRYABLE_SOURCE.has(raw);
  return Object.freeze({ code, retryable });
}

/**
 * Only machine-readable source identifiers or exact enumerated legacy tokens
 * can affect classification. Arbitrary provider message text is ignored.
 */
export function classifyTruynException(error) {
  const bodyCode = error?.body?.error;
  const sourceCode =
    (typeof bodyCode === 'string' ? bodyCode : typeof bodyCode?.code === 'string' ? bodyCode.code : null) ||
    (typeof error?.code === 'string' ? error.code : null) ||
    (typeof error?.message === 'string' && (STABLE.has(error.message) || Object.hasOwn(ALIASES, error.message)) ? error.message : '');
  return classifyTruynError({
    sourceCode,
    status: Number.isInteger(error?.status) ? error.status : error?.httpStatus
  });
}
