import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createRuntimeG5ProviderEffectLedger } from '../runtime/g5-provider-effect-ledger.js';
import { wrapRuntimeG5ReceiptAdapter } from '../runtime/g5-durable-response-receipt.js';

// Real runtime factory/host/adapter, with explicitly simulated Cosmos and Azure HTTP.
// No live cloud, charged provider, or vendor invoice is asserted by these tests.
function setup({ loseProviderReply = false, loseTerminal = false } = {}) {
  const docs = new Map(); let revision = 0, posts = 0, gets = 0, settlements = 0, terminals = 0;
  const env = { TRUYN_G5_PROVIDER_EFFECT_LEDGER: 'cosmos', TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE: '1',
    TRUYN_G5_COSMOS_ENDPOINT: 'https://fixture.documents.azure.com', TRUYN_G5_COSMOS_DATABASE: 'test',
    TRUYN_G5_COSMOS_CONTAINER: 'effects', TRUYN_G5_DURABLE_AZURE_RECEIPTS: '1',
    TRUYN_G5_AZURE_STORE_RESPONSES: '1', AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com',
    AZURE_OPENAI_MODEL: 'gpt-fixture' };
  const reply = (status, value, etag) => new Response(value === null ? null : JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) }
  });
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).hostname, 'fixture.documents.azure.com');
    const id = JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if (options.method === 'POST') {
      if (docs.has(id)) return reply(409, null);
      const row = { ...JSON.parse(options.body), _etag: `e${++revision}` };
      assert.equal(row.id, id); docs.set(id, row); return reply(201, row, row._etag);
    }
    const current = docs.get(id);
    if (!current) return reply(404, null);
    if (options.method === 'GET') return reply(200, current, current._etag);
    assert.equal(options.method, 'PUT');
    if (options.headers['if-match'] !== current._etag) return reply(412, null);
    const row = { ...JSON.parse(options.body), _etag: `e${++revision}` };
    docs.set(id, row); return reply(200, row, row._etag);
  };
  const ledger = () => createRuntimeG5ProviderEffectLedger({ env, tokenProvider: async () => 'fixture-token', fetchImpl });
  const upstream = async (url, options) => {
    assert.equal(new URL(url).hostname, 'fixture.openai.azure.com');
    if (options.method === 'POST') {
      posts++; assert.equal(JSON.parse(options.body).store, true);
      if (loseProviderReply) return { ok: true, json: async () => { throw Error('provider response lost'); } };
    } else { assert.equal(options.method, 'GET'); gets++; }
    return reply(200, { id: 'resp_runtime', status: 'completed', model: 'gpt-fixture-version',
      output_text: 'runtime result', usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } });
  };
  const need = { id: 'runtime-receipt-case', from: 'requester', payload: { capability: { name: 'research' }, input: 'fixture', policy: {} } };
  const make = () => {
    const shared = ledger();
    const node = { identity: { nodeId: 'provider' }, async result(id, output, metadata) {
      terminals++; const row = await shared.getEffect(id);
      assert.equal(row.effectReceipt.responseId, 'resp_runtime');
      assert.equal(row.status, 'completed');
      assert.equal(metadata.providerReceiptDurablyCaptured, true);
      if (loseTerminal) throw Error('terminal response lost');
      return { ok: true };
    } };
    const adapter = wrapRuntimeG5ReceiptAdapter({ env, ledger: shared,
      adapter: createAzureOpenAIProvider({ endpoint: env.AZURE_OPENAI_ENDPOINT, model: env.AZURE_OPENAI_MODEL,
        apiKey: null, accessTokenProvider: async () => 'fixture-token', fetchImpl: upstream, persistResponses: true }) });
    const host = new TruynAdapterHost({ node, adapter, effectLedger: shared,
      accessPolicy: { mode: 'owner-only', authorize: () => ({ ok: true }) },
      billingPolicy: { mode: 'test', authorize: async () => ({ ok: true, reservedTokens: 5, async finalize(input) {
        const row = await shared.getEffect(need.id);
        assert.ok(row.effectReceipt, 'receipt must be durable BEFORE internal settlement');
        assert.equal(input.actualTokens, 5); settlements++;
        return { ok: true, accounted: true, status: 'settled' };
      } }) }
    });
    return { host, adapter, node, shared, execute: () => host.executeNeed(need, { need, nextSequence: 0, controller: new AbortController() }) };
  };
  return { make, need, get posts() { return posts; }, get gets() { return gets; },
    get settlements() { return settlements; }, get terminals() { return terminals; } };
}

test('G5 runtime: real host fences rivals and captures receipt before internal settlement and terminal', async () => {
  const f = setup(), a = f.make(), b = f.make();
  await Promise.all([a.execute(), b.execute()]);
  assert.equal(f.posts, 1); assert.equal(f.settlements, 1); assert.equal(f.terminals, 1);
  const stored = await a.shared.getEffect(f.need.id);
  assert.equal(stored.status, 'completed'); assert.equal(stored.effectReceipt.responseId, 'resp_runtime');
  const restarted = f.make();
  const recovered = await restarted.adapter.recoverStoredEffect({ need: f.need, node: restarted.node });
  assert.equal(recovered.output, 'runtime result');
  assert.equal(recovered.accountingSettled, false); assert.equal(recovered.providerInvoiceVerified, false);
  assert.equal(f.gets, 1); assert.equal(f.posts, 1); assert.equal(f.settlements, 1); assert.equal(f.terminals, 1);
});

test('G5 runtime: failed RESULT transport does not erase captured response or repeat accounting', async () => {
  const f = setup({ loseTerminal: true }), first = f.make();
  await first.execute();
  assert.ok(first.host.lastExecutionError);
  const restarted = f.make(); await restarted.execute();
  const recovered = await restarted.adapter.recoverStoredEffect({ need: f.need, node: restarted.node });
  assert.equal(recovered.effectStatus, 'completed'); assert.equal(recovered.terminalDelivered, false);
  assert.equal(f.posts, 1); assert.equal(f.settlements, 1); assert.equal(f.terminals, 1);
});

test('G5 runtime: lost provider response is UNKNOWN, never refunded, resent or falsely recovered', async () => {
  const f = setup({ loseProviderReply: true }), first = f.make();
  await first.execute();
  const row = await first.shared.getEffect(f.need.id);
  assert.equal(row.status, 'unknown'); assert.equal(row.effectReceipt, undefined);
  const restarted = f.make(); await restarted.execute();
  await assert.rejects(() => restarted.adapter.recoverStoredEffect({ need: f.need, node: restarted.node }), e => e.publicCode === 'effect_receipt_unknown');
  assert.equal(f.posts, 1); assert.equal(f.gets, 0); assert.equal(f.settlements, 0); assert.equal(f.terminals, 0);
});

test('G5 runtime: production entrypoint passes the same effect ledger into the opt-in adapter wrapper', () => {
  const source = readFileSync(new URL('../runtime/service.js', import.meta.url), 'utf8');
  assert.match(source, /wrapRuntimeG5ReceiptAdapter\(\{\s+adapter: createProviderAdapter\(providerName, \{ capabilities \}\),\s+ledger: effectLedger,/);
  assert.match(source, /const adapterHost = new TruynAdapterHost\(\{[\s\S]*?effectLedger,/);
});
