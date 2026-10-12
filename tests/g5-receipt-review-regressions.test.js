import assert from 'node:assert/strict';
import test from 'node:test';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';
import { withCosmosEffectReceipts, wrapRuntimeG5ReceiptAdapter } from '../runtime/g5-durable-response-receipt.js';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { TruynAdapterHost, validateAdapter } from '../adapters/sdk/index.js';

// Source regressions use the real ledger/receipt/provider/host implementations.
// Cosmos replica lag and Azure responses below are explicit HTTP models, NOT live evidence.
function fixture(settings = {}) {
  const { lag = false, loseProviderReply = false } = settings;
  const responseStatus = Object.hasOwn(settings, 'responseStatus') ? settings.responseStatus : 'completed';
  const rows = new Map(), history = new Map();
  let revision = 0, posts = 0, gets = 0, writes = 0, settlements = 0, terminals = 0;
  const env = { TRUYN_G5_DURABLE_AZURE_RECEIPTS: '1', TRUYN_G5_AZURE_STORE_RESPONSES: '1',
    AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_MODEL: 'fixture-deployment' };
  const reply = (status, value) => new Response(value == null ? null : JSON.stringify(value), {
    status, headers: value?._etag ? { etag: value._etag, 'x-ms-session-token': `0:${value._rev}` } : {}
  });
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).hostname, 'fixture.documents.azure.com');
    const id = JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    const current = rows.get(id);
    if (options.method === 'GET') {
      if (!current) return reply(404, null);
      const watermark = options.headers['x-ms-session-token'];
      const floor = watermark ? Number(watermark.split(':').at(-1)) : revision;
      // A stale session permits an old version; correct write watermark prevents it.
      const returned = lag && history.has(id) ? [...history.get(id)].reverse().find(row => row._rev <= floor) || current : current;
      return reply(200, returned);
    }
    if (options.method === 'POST' && current) return reply(409, current);
    if (options.method === 'PUT') {
      if (!current) return reply(404, null);
      if (options.headers['if-match'] !== current._etag) return reply(412, current);
    } else assert.equal(options.method, 'POST');
    const row = { ...JSON.parse(options.body), _etag: `v${++revision}`, _rev: revision };
    assert.equal(row.id, id);
    rows.set(id, row); history.set(id, [...(history.get(id) || []), structuredClone(row)]); writes++;
    return reply(options.method === 'POST' ? 201 : 200, row);
  };
  const options = { endpoint: 'https://fixture.documents.azure.com', database: 'g5', container: 'effects',
    getAccessToken: async () => 'fixture-entra', fetchImpl };
  const ledger = () => withCosmosEffectReceipts(createCosmosLifecycleLedger(options), options);
  const need = { id: 'review-case', from: 'requester', payload: { capability: { name: 'research' }, input: 'test', policy: {} } };
  const upstream = async (_url, options) => {
    if (options.method === 'POST') {
      posts++;
      if (loseProviderReply) throw new Error('provider_response_lost');
    } else { assert.equal(options.method, 'GET'); gets++; }
    return reply(200, { id: 'resp_review', status: responseStatus, model: 'fixture-model', output_text: 'result',
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } });
  };
  const make = () => {
    const shared = ledger();
    const node = { identity: { nodeId: 'provider' }, result: async () => { terminals++; return { ok: true }; } };
    const adapter = wrapRuntimeG5ReceiptAdapter({ env, ledger: shared, adapter: createAzureOpenAIProvider({
      endpoint: env.AZURE_OPENAI_ENDPOINT, model: env.AZURE_OPENAI_MODEL, persistResponses: true,
      apiKey: null, accessTokenProvider: async () => 'fixture-token', fetchImpl: upstream
    }) });
    const host = new TruynAdapterHost({ node, adapter, effectLedger: shared,
      accessPolicy: { mode: 'owner-only', authorize: n => ({ ok: n.from === need.from }) },
      billingPolicy: { authorize: async () => ({ ok: true, reservedTokens: 5,
        finalize: async () => { settlements++; return { ok: true, status: 'settled' }; } }) }
    });
    return { host, shared, execute: () => host.executeNeed(need, { need, nextSequence: 0, controller: new AbortController() }) };
  };
  return { make, need, options, get posts() { return posts; }, get gets() { return gets; },
    get writes() { return writes; }, get settlements() { return settlements; }, get terminals() { return terminals; } };
}

test('G5 review: receipt claim/capture share Cosmos write session with host completion and recovery', async () => {
  const f = fixture({ lag: true }), a = f.make();
  await a.execute();
  assert.equal(a.host.lastExecutionError, null);
  const row = await a.shared.getEffect(f.need.id);
  assert.equal(row.status, 'completed');
  assert.equal(row.effectReceipt.responseId, 'resp_review');
  assert.equal(f.posts, 1); assert.equal(f.settlements, 1); assert.equal(f.terminals, 1);
  const before = f.writes;
  const recovered = await a.host.recoverStoredEffect({ need: f.need });
  assert.equal(recovered.output, 'result');
  assert.equal(recovered.receiptBoundToEffect, true);
  assert.equal(f.gets, 1); assert.equal(f.writes, before); assert.equal(f.posts, 1);
});

for (const status of ['incomplete', 'failed', 'in_progress', 'queued', 'cancelled', null, undefined]) {
  test(`G5 review: HTTP-success Azure status ${status} cannot complete or settle a receipt`, async () => {
    const f = fixture({ responseStatus: status }), a = f.make();
    await a.execute();
    assert.equal(a.host.lastExecutionError?.publicCode, 'effect_receipt_unverified');
    const row = await a.shared.getEffect(f.need.id);
    assert.equal(row.status, 'unknown'); assert.equal(row.effectReceipt, undefined);
    assert.equal(f.posts, 1); assert.equal(f.settlements, 0); assert.equal(f.terminals, 0);
    const restarted = f.make(); await restarted.execute();
    await assert.rejects(() => restarted.host.recoverStoredEffect({ need: f.need }), e => e.publicCode === 'effect_receipt_unknown');
    assert.equal(f.posts, 1); assert.equal(f.gets, 0);
  });
}

test('G5 review: restarted host retains actual GET-only recovery and enforces original access/task', async () => {
  const f = fixture(), a = f.make(); await a.execute();
  const restarted = f.make(), before = f.writes;
  const recovered = await restarted.host.recoverStoredEffect({ need: f.need });
  assert.equal(recovered.output, 'result');
  assert.equal(recovered.providerInvoiceVerified, false);
  assert.equal(recovered.accountingSettled, false);
  assert.equal(recovered.terminalDelivered, false);
  await assert.rejects(() => restarted.host.recoverStoredEffect({ need: { ...f.need, from: 'foreign' } }), e => e.publicCode === 'provider_access_denied');
  await assert.rejects(() => restarted.host.recoverStoredEffect({ need: { ...f.need, payload: { ...f.need.payload, input: 'changed' } } }), e => e.publicCode === 'effect_identity_conflict');
  assert.equal(f.writes, before); assert.equal(f.gets, 1); assert.equal(f.posts, 1);
  assert.equal(f.terminals, 1); assert.equal(f.settlements, 1);
});

test('G5 review: lost response before durable ID stays UNKNOWN through the real restarted host', async () => {
  const f = fixture({ loseProviderReply: true }), a = f.make(); await a.execute();
  const restarted = f.make(); await restarted.execute();
  await assert.rejects(() => restarted.host.recoverStoredEffect({ need: f.need }), e => e.publicCode === 'effect_receipt_unknown');
  assert.equal(f.posts, 1); assert.equal(f.gets, 0); assert.equal(f.settlements, 0); assert.equal(f.terminals, 0);
});

test('G5 review: receipt writes reject an unshared session or a different Cosmos container', () => {
  const f = fixture(), original = createCosmosLifecycleLedger(f.options);
  assert.throws(() => withCosmosEffectReceipts({ ...original, receiptSession: undefined }, f.options), /shared_session_required/);
  assert.throws(() => withCosmosEffectReceipts(original, { ...f.options, container: 'another' }), /shared_session_required/);
});

test('G5 review: adapter validation preserves only an explicit bound recovery method', async () => {
  const adapter = { name: 'fixture', capabilities: ['research'], execute: async () => null,
    recoverStoredEffect() { return this.name; }, unsafeExtension: () => 'not-copied' };
  const validated = validateAdapter(adapter);
  assert.equal(await validated.recoverStoredEffect(), 'fixture');
  assert.equal(validated.unsafeExtension, undefined);
  assert.throws(() => validateAdapter({ ...adapter, recoverStoredEffect: true }), /must be a function/);
  const plain = new TruynAdapterHost({ node: {}, adapter: { ...adapter, recoverStoredEffect: undefined }, accessPolicy: {} });
  await assert.rejects(() => plain.recoverStoredEffect(), e => e.publicCode === 'provider_recovery_not_supported');
});
