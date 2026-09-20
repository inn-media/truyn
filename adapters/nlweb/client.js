export const NLWEB_PROTOCOL_VERSION = '0.5';
export const NLWEB_PINNED_SOURCE = 'nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197';

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalStringArray(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${field} must be an array of strings`);
  }
  return [...value];
}

export function negotiateNlwebProfileVersion(version) {
  const requested = requireNonEmptyString(version, 'profileVersion');
  if (requested !== NLWEB_PROTOCOL_VERSION) {
    const error = new Error(`NLWeb profile version ${requested} is unsupported`);
    error.code = 'UNSUPPORTED_VERSION';
    error.kind = 'unsupported_version';
    throw error;
  }
  return NLWEB_PROTOCOL_VERSION;
}

/**
 * Construct the bounded NLWeb 0.5 AskRequest accepted by the pinned TypeSpec.
 *
 * This function deliberately accepts only protocol request data. TRUYN identity,
 * tenant, provider, authorization, entitlement and billing authority are not
 * representable here and remain on the canonical server-side authority path.
 */
export function createNlwebAskRequest({
  text,
  site,
  location,
  price,
  type,
  context,
  returnResponse,
  conversationId,
  requestId,
  profileVersion = NLWEB_PROTOCOL_VERSION
} = {}) {
  const negotiatedVersion = negotiateNlwebProfileVersion(profileVersion);
  const query = { text: requireNonEmptyString(text, 'text') };
  const normalizedSite = optionalStringArray(site, 'site');
  if (normalizedSite !== undefined) query.site = normalizedSite;
  if (location !== undefined) query.location = requireNonEmptyString(location, 'location');
  if (price !== undefined) query.price = requireNonEmptyString(price, 'price');
  if (type !== undefined) query.type = requireNonEmptyString(type, 'type');

  const request = {
    query,
    meta: { api_version: negotiatedVersion }
  };

  if (context !== undefined) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new TypeError('context must be an object');
    }
    const normalized = {};
    if (context.prev !== undefined) normalized.prev = optionalStringArray(context.prev, 'context.prev');
    if (context.text !== undefined) normalized.text = requireNonEmptyString(context.text, 'context.text');
    if (context.memory !== undefined) normalized.memory = optionalStringArray(context.memory, 'context.memory');
    request.context = normalized;
  }

  if (returnResponse !== undefined) {
    if (!returnResponse || typeof returnResponse !== 'object' || Array.isArray(returnResponse)) {
      throw new TypeError('returnResponse must be an object');
    }
    const normalized = {};
    if (returnResponse.streaming !== undefined) {
      if (typeof returnResponse.streaming !== 'boolean') throw new TypeError('returnResponse.streaming must be boolean');
      normalized.streaming = returnResponse.streaming;
    }
    for (const field of ['format', 'mode', 'lang']) {
      if (returnResponse[field] !== undefined) normalized[field] = requireNonEmptyString(returnResponse[field], `returnResponse.${field}`);
    }
    if (returnResponse.clientType !== undefined) {
      if (!['mobile', 'desktop', 'tablet', 'web'].includes(returnResponse.clientType)) {
        throw new TypeError('returnResponse.clientType is unsupported');
      }
      normalized.client_type = returnResponse.clientType;
    }
    request.return_response = normalized;
  }

  if (conversationId !== undefined) request.meta.conversation_id = requireNonEmptyString(conversationId, 'conversationId');
  if (requestId !== undefined) request.meta.request_id = requireNonEmptyString(requestId, 'requestId');
  return request;
}

export function createNlwebClient({ endpoint, fetchImpl = globalThis.fetch, profileVersion = NLWEB_PROTOCOL_VERSION } = {}) {
  const url = new URL(requireNonEmptyString(endpoint, 'endpoint'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('endpoint must use http or https');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const negotiatedVersion = negotiateNlwebProfileVersion(profileVersion);

  return Object.freeze({
    profile: negotiatedVersion,
    pinnedSource: NLWEB_PINNED_SOURCE,
    createAskRequest: (options = {}) => createNlwebAskRequest({ ...options, profileVersion: negotiatedVersion })
  });
}
