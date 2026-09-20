import { NLWEB_PROTOCOL_VERSION } from './client.js';

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function cloneStringArray(value) {
  return Array.isArray(value) ? [...value] : undefined;
}

/**
 * Normalize a validated/bounded NLWeb 0.5 AskRequest into TRUYN request input.
 *
 * NLWeb data remains application input only. It cannot select a provider or
 * assert TRUYN identity, tenant, authorization, entitlement or billing state.
 */
export function normalizeNlwebAskRequest(request) {
  const bounded = requireObject(request, 'request');
  const query = requireObject(bounded.query, 'request.query');
  if (typeof query.text !== 'string' || query.text.trim() === '') {
    throw new TypeError('request.query.text must be a non-empty string');
  }

  const input = {
    query: {
      text: query.text
    }
  };

  for (const field of ['location', 'price', 'type']) {
    if (typeof query[field] === 'string') input.query[field] = query[field];
  }
  const site = cloneStringArray(query.site);
  if (site !== undefined) input.query.site = site;

  if (bounded.context && typeof bounded.context === 'object' && !Array.isArray(bounded.context)) {
    const context = {};
    const prev = cloneStringArray(bounded.context.prev);
    const memory = cloneStringArray(bounded.context.memory);
    if (prev !== undefined) context.prev = prev;
    if (typeof bounded.context.text === 'string') context.text = bounded.context.text;
    if (memory !== undefined) context.memory = memory;
    if (Object.keys(context).length) input.context = context;
  }

  if (bounded.return_response && typeof bounded.return_response === 'object' && !Array.isArray(bounded.return_response)) {
    const response = {};
    for (const field of ['streaming', 'format', 'mode', 'lang', 'client_type']) {
      if (bounded.return_response[field] !== undefined) response[field] = bounded.return_response[field];
    }
    if (Object.keys(response).length) input.returnResponse = response;
  }

  const correlation = {};
  if (typeof bounded.meta?.conversation_id === 'string') correlation.conversationId = bounded.meta.conversation_id;
  if (typeof bounded.meta?.request_id === 'string') correlation.requestId = bounded.meta.request_id;

  return Object.freeze({
    capability: 'nlweb.ask',
    input,
    policy: {},
    profile: NLWEB_PROTOCOL_VERSION,
    correlation: Object.freeze(correlation)
  });
}
