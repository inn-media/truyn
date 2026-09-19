import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNlwebAskRequest } from '../adapters/nlweb/ask.js';
import { createNlwebAskRequest } from '../adapters/nlweb/client.js';

test('S73 deterministically maps bounded NLWeb ask input into TRUYN request semantics', () => {
  const request = createNlwebAskRequest({
    text: 'Find public Azerbaijani energy news',
    site: ['example.org'],
    location: 'AZ',
    type: 'news',
    context: { prev: ['energy'], text: 'public sources only', memory: ['en'] },
    returnResponse: { streaming: false, mode: 'list', lang: 'en', clientType: 'web' },
    conversationId: 'conv-1',
    requestId: 'req-1'
  });

  const expected = {
    capability: 'nlweb.ask',
    input: {
      query: {
        text: 'Find public Azerbaijani energy news',
        site: ['example.org'],
        location: 'AZ',
        type: 'news'
      },
      context: {
        prev: ['energy'],
        text: 'public sources only',
        memory: ['en']
      },
      returnResponse: {
        streaming: false,
        mode: 'list',
        lang: 'en',
        client_type: 'web'
      }
    },
    policy: {},
    profile: '0.5',
    correlation: { conversationId: 'conv-1', requestId: 'req-1' }
  };

  assert.deepEqual(normalizeNlwebAskRequest(request), expected);
  assert.deepEqual(normalizeNlwebAskRequest(request), expected);
});

test('S73 NLWeb fields cannot derive TRUYN authority', () => {
  const normalized = normalizeNlwebAskRequest({
    query: {
      text: 'answer',
      tenant: 'spoofed-query-tenant',
      provider: 'spoofed-query-provider'
    },
    meta: {
      api_version: '0.5',
      tenant: 'spoofed-meta-tenant',
      provider: 'spoofed-meta-provider',
      billingOwner: 'spoofed-billing-owner'
    },
    tenant: 'spoofed-root-tenant',
    provider: 'spoofed-root-provider',
    authorization: 'spoofed-auth',
    billingOwner: 'spoofed-root-billing'
  });

  assert.equal(normalized.capability, 'nlweb.ask');
  assert.deepEqual(normalized.policy, {});
  assert.deepEqual(normalized.input, { query: { text: 'answer' } });
  assert.deepEqual(normalized.correlation, {});
  assert.equal(normalized.provider, undefined);
  assert.equal(normalized.tenant, undefined);
  assert.equal(normalized.authorization, undefined);
  assert.equal(normalized.billingOwner, undefined);
});

test('S73 rejects missing ask semantics before canonical dispatch', () => {
  assert.throws(() => normalizeNlwebAskRequest({}), /request.query must be an object/);
  assert.throws(() => normalizeNlwebAskRequest({ query: { text: '' } }), /non-empty string/);
});
