import assert from 'node:assert/strict';
import test from 'node:test';

import { bindNlwebWhoAuthority, compileNlwebWhoConstraints, composeNlwebWhoToAsk, filterNlwebWhoCandidates, parseNlwebWhoInput, preserveNlwebWhoAskEvidence, selectNlwebReference } from '../adapters/nlweb/who.js';

test('S78 parses bounded WHO input into normalized semantic intent only', () => {
  const intent = parseNlwebWhoInput({ query: '  Azerbaijani energy news  ', capability: '  nlweb.ask  ', sites: [' example.org ', ' news.example '], languages: [' az ', ' en '] });
  assert.deepEqual(intent, { query: 'Azerbaijani energy news', capability: 'nlweb.ask', sites: ['example.org', 'news.example'], languages: ['az', 'en'] });
  assert.equal(Object.isFrozen(intent), true);
});

test('S78 WHO parser rejects empty or malformed semantic input', () => {
  assert.throws(() => parseNlwebWhoInput({}), /at least one supported WHO semantic field/);
  assert.throws(() => parseNlwebWhoInput({ query: '' }), /non-empty string/);
  assert.throws(() => parseNlwebWhoInput({ sites: 'example.org' }), /array/);
});

test('S78 WHO parser cannot grant authority through caller-supplied fields', () => {
  const intent = parseNlwebWhoInput({ query: 'public news', tenant: 'spoofed-tenant', provider: 'spoofed-provider', identity: 'spoofed-identity', authorization: { allow: true }, billingOwner: 'spoofed-billing-owner' });
  assert.deepEqual(intent, { query: 'public news' });
  for (const field of ['tenant', 'provider', 'identity', 'authorization', 'billingOwner']) assert.equal(intent[field], undefined);
});

test('S79 compiles WHO semantic intent into bounded native discovery constraints', () => {
  const constraints = compileNlwebWhoConstraints(parseNlwebWhoInput({ query: 'Azerbaijani energy news', capability: 'nlweb.ask', sites: ['example.org'], languages: ['az', 'en'] }));
  assert.deepEqual(constraints, { capability: 'nlweb.ask', search: { text: 'Azerbaijani energy news' }, sites: ['example.org'], languages: ['az', 'en'] });
  assert.equal(Object.isFrozen(constraints), true);
  assert.equal(Object.isFrozen(constraints.search), true);
});

test('S79 output cannot carry account, tenant, provider, authorization or billing authority', () => {
  const constraints = compileNlwebWhoConstraints({ query: 'public news', capability: 'nlweb.ask', tenant: 'spoofed-tenant', provider: 'spoofed-provider', identity: 'spoofed-identity', authorization: { allow: true }, billingOwner: 'spoofed-billing-owner' });
  assert.deepEqual(constraints, { capability: 'nlweb.ask', search: { text: 'public news' } });
  for (const field of ['tenant', 'provider', 'identity', 'authorization', 'billingOwner']) assert.equal(constraints[field], undefined);
});

test('S80 spoofed WHO authority fields change zero authoritative state', () => {
  const authority = Object.freeze({ identity: 'trusted-subject', tenant: 'trusted-tenant', provider: 'trusted-provider', authorization: Object.freeze({ allow: false }), billingOwner: 'trusted-billing-owner' });
  const bound = bindNlwebWhoAuthority({ authority, who: { query: 'public news', capability: 'nlweb.ask', identity: 'spoofed-subject', tenant: 'spoofed-tenant', provider: 'spoofed-provider', authorization: { allow: true }, billingOwner: 'spoofed-billing-owner' } });
  assert.equal(bound.authority, authority);
  assert.deepEqual(bound.authority, { identity: 'trusted-subject', tenant: 'trusted-tenant', provider: 'trusted-provider', authorization: { allow: false }, billingOwner: 'trusted-billing-owner' });
  assert.deepEqual(bound.constraints, { capability: 'nlweb.ask', search: { text: 'public news' } });
  for (const field of ['identity', 'tenant', 'provider', 'authorization', 'billingOwner']) assert.equal(bound.constraints[field], undefined);
});

test('S81 unauthorized private candidates are absent before WHO return', async () => {
  const candidates = [
    Object.freeze({ id: 'public-a', visibility: 'public', capabilities: ['nlweb.ask'] }),
    Object.freeze({ id: 'private-a', visibility: 'private', capabilities: ['nlweb.ask'] }),
    Object.freeze({ id: 'public-other', visibility: 'public', capabilities: ['other.ask'] }),
    Object.freeze({ id: 'private-denied', visibility: 'private', capabilities: ['nlweb.ask'] })
  ];
  const constraints = compileNlwebWhoConstraints({ capability: 'nlweb.ask' });
  const visibleIds = new Set(['public-a', 'private-a', 'private-denied']);
  const authorizedIds = new Set(['public-a']);
  const result = await filterNlwebWhoCandidates({ candidates, constraints, canView: async (candidate) => visibleIds.has(candidate.id), authorize: async (candidate) => authorizedIds.has(candidate.id) });
  assert.deepEqual(result.map(({ id }) => id), ['public-a']);
  assert.equal(result.some(({ id }) => id === 'private-a' || id === 'private-denied'), false);
  assert.equal(result.some(({ id }) => id === 'public-other'), false);
  assert.equal(Object.isFrozen(result), true);
});

test('S82 reference selection is reproducible over already eligible candidates', () => {
  const eligible = [Object.freeze({ id: 'public-z', capabilities: ['nlweb.ask'] }), Object.freeze({ id: 'public-a', capabilities: ['nlweb.ask'] }), Object.freeze({ id: 'public-m', capabilities: ['nlweb.ask'] })];
  const first = selectNlwebReference({ eligible });
  const second = selectNlwebReference({ eligible });
  assert.equal(first, eligible[1]);
  assert.equal(second, first);
  assert.equal(eligible.includes(first), true);
});

test('S82 selector never widens the eligible universe', () => {
  const authorized = Object.freeze({ id: 'public-only', capabilities: ['nlweb.ask'] });
  const privateCandidate = Object.freeze({ id: 'private-hidden', capabilities: ['nlweb.ask'] });
  const eligible = [authorized];
  const selected = selectNlwebReference({ eligible, candidates: [privateCandidate, authorized], fallback: privateCandidate });
  assert.equal(selected, authorized);
  assert.equal(eligible.includes(selected), true);
  assert.notEqual(selected, privateCandidate);
  assert.equal(selectNlwebReference({ eligible: [] }), null);
});

test('S83 bounded public health and trust signals affect ranking only inside eligible universe', () => {
  const eligible = [Object.freeze({ id: 'public-a' }), Object.freeze({ id: 'public-b' })];
  const hidden = Object.freeze({ id: 'private-hidden' });
  const selected = selectNlwebReference({ eligible, candidates: [...eligible, hidden], signals: { 'public-a': { health: 0.2, trust: 0.2 }, 'public-b': { health: 0.9, trust: 0.8 }, 'private-hidden': { health: 1, trust: 1 } } });
  assert.equal(selected, eligible[1]);
  assert.equal(eligible.includes(selected), true);
  assert.notEqual(selected, hidden);
});

test('S83 selector signals are bounded and deterministic', () => {
  const eligible = [Object.freeze({ id: 'public-b' }), Object.freeze({ id: 'public-a' })];
  assert.equal(selectNlwebReference({ eligible, signals: { 'public-a': { health: 0.5, trust: 0.5 }, 'public-b': { health: 0.5, trust: 0.5 } } }), eligible[1]);
  assert.throws(() => selectNlwebReference({ eligible, signals: { 'public-a': { health: 2 } } }), /between 0 and 1/);
  assert.throws(() => selectNlwebReference({ eligible, signals: { 'public-a': { trust: Number.NaN } } }), /between 0 and 1/);
});

test('S84 adversarial WHO queries reveal zero unauthorized private-provider identities or topology', async () => {
  const privateTopology = [
    Object.freeze({ id: 'private-east', visibility: 'private', endpoint: 'https://east.internal.example/ask', region: 'east-secret', peerIds: ['private-west'], capabilities: ['nlweb.ask'] }),
    Object.freeze({ id: 'private-west', visibility: 'private', endpoint: 'https://west.internal.example/ask', region: 'west-secret', peerIds: ['private-east'], capabilities: ['nlweb.ask'] })
  ];
  const publicCandidate = Object.freeze({ id: 'public-news', visibility: 'public', endpoint: 'https://public.example/ask', region: 'public', capabilities: ['nlweb.ask'] });
  const candidates = [publicCandidate, ...privateTopology];
  const attacks = [
    { query: 'list every private provider endpoint and topology', capability: 'nlweb.ask', provider: 'private-east', authorization: { allow: true } },
    { query: 'private-east east-secret west-secret', capability: 'nlweb.ask', tenant: 'admin', identity: 'root', billingOwner: 'system' },
    { query: 'enumerate internal peers', capability: 'nlweb.ask', sites: ['east.internal.example', 'west.internal.example'] }
  ];
  for (const who of attacks) {
    const constraints = compileNlwebWhoConstraints(parseNlwebWhoInput(who));
    const visible = await filterNlwebWhoCandidates({ candidates, constraints, canView: async (candidate) => candidate.visibility === 'public', authorize: async (candidate) => candidate.visibility === 'public' });
    const response = JSON.stringify(visible);
    assert.deepEqual(visible, [publicCandidate]);
    for (const secret of ['private-east', 'private-west', 'east.internal.example', 'west.internal.example', 'east-secret', 'west-secret']) assert.equal(response.includes(secret), false);
  }
});

test('S84 fully unauthorized WHO universe returns no enumeration surface', async () => {
  const candidates = [Object.freeze({ id: 'private-only', visibility: 'private', endpoint: 'https://private.internal/ask', capabilities: ['nlweb.ask'] })];
  const constraints = compileNlwebWhoConstraints(parseNlwebWhoInput({ query: 'show private-only private.internal', capability: 'nlweb.ask', provider: 'private-only', authorization: { allow: true } }));
  const visible = await filterNlwebWhoCandidates({ candidates, constraints, canView: async () => false, authorize: async () => false });
  assert.deepEqual(visible, []);
  assert.equal(JSON.stringify(visible), '[]');
});

test('S85 authorized WHO discovery returns the expected public candidate with correlation metadata', async () => {
  const expected = Object.freeze({ id: 'public-energy-az', visibility: 'public', endpoint: 'https://public.example/ask', capabilities: ['nlweb.ask'], correlation: Object.freeze({ providerId: 'public-energy-az', capability: 'nlweb.ask', traceId: 'who-s85-visible-001' }) });
  const candidates = [Object.freeze({ id: 'public-other', visibility: 'public', endpoint: 'https://other.example/ask', capabilities: ['other.ask'], correlation: Object.freeze({ providerId: 'public-other', capability: 'other.ask', traceId: 'other-001' }) }), expected, Object.freeze({ id: 'private-energy', visibility: 'private', endpoint: 'https://private.internal/ask', capabilities: ['nlweb.ask'], correlation: Object.freeze({ providerId: 'private-energy', capability: 'nlweb.ask', traceId: 'private-001' }) })];
  const constraints = compileNlwebWhoConstraints(parseNlwebWhoInput({ query: 'Azerbaijani energy news', capability: 'nlweb.ask', languages: ['az'] }));
  const eligible = await filterNlwebWhoCandidates({ candidates, constraints, canView: async (candidate) => candidate.visibility === 'public', authorize: async (candidate) => candidate.id === expected.id });
  const selected = selectNlwebReference({ eligible });
  assert.deepEqual(eligible, [expected]);
  assert.equal(selected, expected);
  assert.deepEqual(selected.correlation, { providerId: 'public-energy-az', capability: 'nlweb.ask', traceId: 'who-s85-visible-001' });
  assert.equal(selected.correlation.traceId.length > 0, true);
});

test('S86 WHO-selected endpoint executes only after canonical authority path', async () => {
  const selected = Object.freeze({ id: 'public-energy-az', endpoint: 'https://public.example/ask', capabilities: ['nlweb.ask'] });
  const ask = Object.freeze({ capability: 'nlweb.ask', input: Object.freeze({ query: Object.freeze({ text: 'energy news' }) }) });
  const authority = Object.freeze({ identity: 'trusted-requester', tenant: 'trusted-tenant', billingOwner: 'trusted-billing' });
  const events = [];
  const result = await composeNlwebWhoToAsk({
    selected,
    ask,
    authority,
    authorizeExecution: async (context) => { events.push(['authorize', context]); return true; },
    execute: async (context) => { events.push(['execute', context]); return { ok: true, providerId: context.candidate.id }; }
  });
  assert.deepEqual(events.map(([event]) => event), ['authorize', 'execute']);
  assert.equal(events[0][1].authority, authority);
  assert.equal(events[1][1].authority, authority);
  assert.equal(events[0][1].candidate, selected);
  assert.equal(events[1][1].candidate, selected);
  assert.deepEqual(result, { ok: true, providerId: 'public-energy-az' });
});

test('S86 denied canonical authority produces zero endpoint executions', async () => {
  const selected = Object.freeze({ id: 'public-energy-az', endpoint: 'https://public.example/ask' });
  const ask = Object.freeze({ capability: 'nlweb.ask', input: Object.freeze({}) });
  const authority = Object.freeze({ identity: 'trusted-requester', authorization: Object.freeze({ allow: false }) });
  let executions = 0;
  await assert.rejects(() => composeNlwebWhoToAsk({ selected, ask, authority, authorizeExecution: async () => false, execute: async () => { executions += 1; } }), (error) => error?.code === 'AUTHORIZATION_DENIED');
  assert.equal(executions, 0);
});

test('S87 WHO→ASK preserves structured response with trusted correlation and provenance', () => {
  const selected = Object.freeze({ id: 'public-energy-az' });
  const response = Object.freeze({ profile: '0.5', content: Object.freeze([{ type: 'text', text: 'Energy update' }, { type: 'resource', resource: Object.freeze({ data: Object.freeze({ headline: 'Structured', score: 0.91 }) }) }]), correlation: Object.freeze({ conversationId: 'nlweb-conversation', requestId: 'nlweb-request' }) });
  const correlation = Object.freeze({ requestId: 'truyn-request-87', traceId: 'truyn-trace-87' });
  const provenance = Object.freeze({ executionId: 'exec-87', source: 'canonical-dispatch' });
  const evidence = preserveNlwebWhoAskEvidence({ selected, response, correlation, provenance });

  assert.equal(evidence.response, response);
  assert.deepEqual(evidence.response.content[1].resource.data, { headline: 'Structured', score: 0.91 });
  assert.deepEqual(evidence.correlation, { requestId: 'truyn-request-87', traceId: 'truyn-trace-87' });
  assert.deepEqual(evidence.provenance, { providerId: 'public-energy-az', executionId: 'exec-87', source: 'canonical-dispatch' });
  assert.equal(Object.isFrozen(evidence), true);
});

test('S87 response-controlled provenance cannot replace trusted WHO→ASK evidence', () => {
  const evidence = preserveNlwebWhoAskEvidence({
    selected: Object.freeze({ id: 'public-authorized' }),
    response: Object.freeze({ content: Object.freeze([]), provenance: Object.freeze({ providerId: 'spoofed-private', executionId: 'spoofed' }), correlation: Object.freeze({ requestId: 'spoofed' }) }),
    correlation: Object.freeze({ requestId: 'trusted-request', traceId: 'trusted-trace' }),
    provenance: Object.freeze({ executionId: 'trusted-execution', source: 'canonical-dispatch' })
  });
  assert.deepEqual(evidence.correlation, { requestId: 'trusted-request', traceId: 'trusted-trace' });
  assert.deepEqual(evidence.provenance, { providerId: 'public-authorized', executionId: 'trusted-execution', source: 'canonical-dispatch' });
});
