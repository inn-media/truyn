import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNlwebAskRequest } from '../adapters/nlweb/ask.js';
import {
  NlwebCompatibilityError,
  normalizeNlwebAskResponse,
  normalizeNlwebCompatibilityError
} from '../adapters/nlweb/response.js';

test('S74 preserves NLWeb text, metadata, and structured resource data', () => {
  const response = {
    _meta: {
      conversation_id: 'conv-1',
      response_type: 'Answer',
      request_id: 'req-1',
      version: '0.5',
      extension: { trace: ['a', 'b'] }
    },
    content: [
      { type: 'text', text: 'Two matching items.' },
      {
        type: 'resource',
        resource: {
          uri: 'ui://results',
          mimeType: 'application/json',
          text: 'render hint',
          data: [
            { '@type': 'NewsArticle', headline: 'One', score: 0.9 },
            { '@type': 'NewsArticle', headline: 'Two', nested: { source: 'example.org' } }
          ]
        }
      }
    ]
  };

  const normalized = normalizeNlwebAskResponse(response);
  assert.equal(normalized.profile, '0.5');
  assert.deepEqual(normalized.meta, response._meta);
  assert.deepEqual(normalized.content, response.content);
  assert.notEqual(normalized.meta, response._meta);
  assert.notEqual(normalized.content[1].resource.data, response.content[1].resource.data);
  assert.equal(typeof normalized.content[1].resource.data, 'object');
});

test('S74 does not flatten resource data into opaque text', () => {
  const normalized = normalizeNlwebAskResponse({
    _meta: { response_type: 'Answer' },
    content: [
      { type: 'text', text: 'answer' },
      { type: 'resource', resource: { data: { '@type': 'Thing', name: 'Structured' } } }
    ]
  });

  assert.deepEqual(normalized.content[1], {
    type: 'resource',
    resource: { data: { '@type': 'Thing', name: 'Structured' } }
  });
  assert.equal(normalized.content[1].text, undefined);
});

test('S74 fails closed on malformed AskResponse structure', () => {
  assert.throws(() => normalizeNlwebAskResponse({}), /response._meta must be an object/);
  assert.throws(() => normalizeNlwebAskResponse({ _meta: {}, content: [] }), /non-empty array/);
  assert.throws(
    () => normalizeNlwebAskResponse({ _meta: {}, content: [{ type: 'resource', resource: { data: { x: 1 } } }] }),
    /at least one text item/
  );
  assert.throws(
    () => normalizeNlwebAskResponse({ _meta: {}, content: [{ type: 'text', text: 'ok' }, { type: 'other' }] }),
    /unsupported/
  );
});

test('S75 maps profile and version failures to bounded deterministic errors', () => {
  const profile = normalizeNlwebCompatibilityError({ code: 'UNSUPPORTED_PROFILE', message: 'provider secret' });
  const version = normalizeNlwebCompatibilityError({ kind: 'unsupported_version', version: '99' });

  assert.ok(profile instanceof NlwebCompatibilityError);
  assert.equal(profile.code, 'NLWEB_UNSUPPORTED_PROFILE');
  assert.equal(profile.message, 'NLWeb profile is unsupported');
  assert.equal(version.code, 'NLWEB_UNSUPPORTED_VERSION');
  assert.equal(version.message, 'NLWeb profile version is unsupported');
});

test('S75 unsupported or unknown required semantics fail closed', () => {
  for (const input of [
    { code: 'UNKNOWN_EXTENSION', authority: { tenant: 'spoofed' } },
    new Error('opaque upstream failure'),
    null
  ]) {
    const normalized = normalizeNlwebCompatibilityError(input);
    assert.ok(normalized instanceof NlwebCompatibilityError);
    assert.equal(normalized.code, 'NLWEB_UNSUPPORTED_REQUIRED_SEMANTICS');
    assert.equal(normalized.message, 'NLWeb required semantics are unsupported');
    assert.equal(normalized.authority, undefined);
  }
});

test('S76 preserves NLWeb correlation across a request-response round trip', () => {
  const request = normalizeNlwebAskRequest({
    query: { text: 'latest local news' },
    meta: { conversation_id: 'conv-roundtrip', request_id: 'req-roundtrip' }
  });
  const response = normalizeNlwebAskResponse({
    _meta: {
      response_type: 'Answer',
      conversation_id: 'conv-roundtrip',
      request_id: 'req-roundtrip'
    },
    content: [{ type: 'text', text: 'answer' }]
  });

  assert.deepEqual(request.correlation, {
    conversationId: 'conv-roundtrip',
    requestId: 'req-roundtrip'
  });
  assert.deepEqual(response.correlation, request.correlation);
  assert.equal(Object.isFrozen(response.correlation), true);
});

test('S76 correlation remains bounded and cannot carry authority', () => {
  const response = normalizeNlwebAskResponse({
    _meta: {
      response_type: 'Answer',
      conversation_id: 'conv-safe',
      request_id: 'req-safe',
      tenant: 'spoofed',
      authorization: { admin: true }
    },
    content: [{ type: 'text', text: 'answer' }]
  });

  assert.deepEqual(response.correlation, {
    conversationId: 'conv-safe',
    requestId: 'req-safe'
  });
  assert.equal(response.correlation.tenant, undefined);
  assert.equal(response.correlation.authorization, undefined);
});
