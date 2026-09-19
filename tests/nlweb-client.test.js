import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NLWEB_PINNED_SOURCE,
  NLWEB_PROTOCOL_VERSION,
  createNlwebAskRequest,
  createNlwebClient,
  negotiateNlwebProfileVersion
} from '../adapters/nlweb/client.js';

test('S71 constructs a schema-valid bounded NLWeb 0.5 AskRequest', () => {
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

  assert.deepEqual(request, {
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
    return_response: {
      streaming: false,
      mode: 'list',
      lang: 'en',
      client_type: 'web'
    },
    meta: {
      api_version: '0.5',
      conversation_id: 'conv-1',
      request_id: 'req-1'
    }
  });
});

test('S71 client exposes only the pinned profile coordinate and request constructor', () => {
  const client = createNlwebClient({ endpoint: 'https://nlweb.example/ask', fetchImpl: async () => new Response() });
  assert.equal(client.profile, NLWEB_PROTOCOL_VERSION);
  assert.equal(client.profile, '0.5');
  assert.equal(client.pinnedSource, NLWEB_PINNED_SOURCE);
  assert.equal(client.pinnedSource, 'nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197');
  assert.equal(typeof client.createAskRequest, 'function');
});

test('S71 rejects malformed bounded request fields before dispatch', () => {
  assert.throws(() => createNlwebAskRequest({ text: '' }), /non-empty string/);
  assert.throws(() => createNlwebAskRequest({ text: 'ok', site: 'example.org' }), /array of strings/);
  assert.throws(() => createNlwebAskRequest({ text: 'ok', returnResponse: { clientType: 'watch' } }), /unsupported/);
});

test('S71 request surface cannot derive TRUYN authority from caller fields', () => {
  const request = createNlwebAskRequest({
    text: 'answer',
    tenant: 'spoofed-tenant',
    provider: 'spoofed-provider',
    billingOwner: 'spoofed-billing-owner'
  });
  assert.deepEqual(Object.keys(request).sort(), ['meta', 'query']);
  assert.equal(request.tenant, undefined);
  assert.equal(request.provider, undefined);
  assert.equal(request.billingOwner, undefined);
});

test('S77 accepts only the exact pinned NLWeb profile version', () => {
  assert.equal(negotiateNlwebProfileVersion('0.5'), '0.5');
  assert.throws(
    () => negotiateNlwebProfileVersion('0.4'),
    (error) => error?.code === 'UNSUPPORTED_VERSION' && error?.kind === 'unsupported_version'
  );
  assert.throws(() => createNlwebClient({ endpoint: 'https://nlweb.example/ask', profileVersion: '1.0' }), /unsupported/);
});

test('S77 rejects wrong request profile before request construction or dispatch', () => {
  let dispatchCount = 0;
  const fetchImpl = async () => {
    dispatchCount += 1;
    return new Response();
  };

  assert.throws(
    () => createNlwebAskRequest({ text: 'must not dispatch', profileVersion: '0.6' }),
    (error) => error?.code === 'UNSUPPORTED_VERSION'
  );
  assert.throws(
    () => createNlwebClient({ endpoint: 'https://nlweb.example/ask', fetchImpl, profileVersion: '0.6' }),
    (error) => error?.code === 'UNSUPPORTED_VERSION'
  );
  assert.equal(dispatchCount, 0);
});
