import { NLWEB_PROTOCOL_VERSION } from './client.js';

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function cloneStructured(value) {
  if (Array.isArray(value)) return value.map(cloneStructured);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneStructured(item)]));
  }
  return value;
}

export class NlwebCompatibilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NlwebCompatibilityError';
    this.code = code;
  }
}

const COMPATIBILITY_ERRORS = Object.freeze({
  UNSUPPORTED_PROFILE: 'NLWEB_UNSUPPORTED_PROFILE',
  UNSUPPORTED_VERSION: 'NLWEB_UNSUPPORTED_VERSION',
  UNSUPPORTED_SEMANTICS: 'NLWEB_UNSUPPORTED_REQUIRED_SEMANTICS'
});

/**
 * Map upstream/profile/version compatibility failures into a bounded public
 * error vocabulary. Unknown required semantics fail closed.
 */
export function normalizeNlwebCompatibilityError(error) {
  const source = error && typeof error === 'object' ? error : {};
  const code = typeof source.code === 'string' ? source.code : '';
  const kind = typeof source.kind === 'string' ? source.kind : '';

  if (code === 'UNSUPPORTED_PROFILE' || kind === 'unsupported_profile') {
    return new NlwebCompatibilityError(COMPATIBILITY_ERRORS.UNSUPPORTED_PROFILE, 'NLWeb profile is unsupported');
  }
  if (code === 'UNSUPPORTED_VERSION' || kind === 'unsupported_version') {
    return new NlwebCompatibilityError(COMPATIBILITY_ERRORS.UNSUPPORTED_VERSION, 'NLWeb profile version is unsupported');
  }
  return new NlwebCompatibilityError(
    COMPATIBILITY_ERRORS.UNSUPPORTED_SEMANTICS,
    'NLWeb required semantics are unsupported'
  );
}

/**
 * Normalize a bounded NLWeb 0.5 AskResponse without flattening structured data.
 * Text and resource content remain distinct; resource.data stays structured.
 * Protocol correlation is copied into a bounded TRUYN correlation object so
 * request/response round trips can be verified without granting authority.
 */
export function normalizeNlwebAskResponse(response) {
  const bounded = requireObject(response, 'response');
  const meta = requireObject(bounded._meta, 'response._meta');
  if (!Array.isArray(bounded.content) || bounded.content.length === 0) {
    throw new TypeError('response.content must be a non-empty array');
  }

  let hasText = false;
  const content = bounded.content.map((item, index) => {
    requireObject(item, `response.content[${index}]`);
    if (item.type === 'text') {
      if (typeof item.text !== 'string') throw new TypeError(`response.content[${index}].text must be a string`);
      hasText = true;
      return { type: 'text', text: item.text };
    }
    if (item.type === 'resource') {
      const resource = requireObject(item.resource, `response.content[${index}].resource`);
      if (!Object.hasOwn(resource, 'data') || !resource.data || typeof resource.data !== 'object') {
        throw new TypeError(`response.content[${index}].resource.data must be structured data`);
      }
      const normalized = { data: cloneStructured(resource.data) };
      for (const field of ['uri', 'mimeType', 'text']) {
        if (typeof resource[field] === 'string') normalized[field] = resource[field];
      }
      return { type: 'resource', resource: normalized };
    }
    throw new TypeError(`response.content[${index}].type is unsupported`);
  });

  if (!hasText) throw new TypeError('response.content must contain at least one text item');

  const normalizedMeta = cloneStructured(meta);
  const correlation = {};
  if (typeof meta.conversation_id === 'string') correlation.conversationId = meta.conversation_id;
  if (typeof meta.request_id === 'string') correlation.requestId = meta.request_id;

  return Object.freeze({
    profile: NLWEB_PROTOCOL_VERSION,
    meta: normalizedMeta,
    content,
    correlation: Object.freeze(correlation)
  });
}
