import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { withCosmosEffectReceipts, wrapRuntimeG5ReceiptAdapter } from '../runtime/g5-durable-response-receipt.js';

const hash = x => createHash('sha256').update(x).digest('hex');
const need = { id: 'g5-receipt-known', from: 'requester-a', payload: { capability: 'research', input: 'task' } };
const node = { identity: { nodeId: 'provider-a' } };
const binding = { id: need.id, requester: need.from, provider: node.identity.nodeId,
  fingerprint: hash(JSON.stringify([need.id, need.from, need.payload])) };
const env = { TRUYN_G5_DURABLE_AZURE_RECEIPTS: '1', TRUYN_G5_AZURE_STORE_RESPONSES: '1',
  AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_MODEL: 'test-deployment' };
const usage = { input_tokens: 3, output_tokens: 4, total_tokens: 7 };
const request = () => ({ need: structuredClone(need), node, capability: 'research', input: 'task', policy: {} });
const fails = (fn, code) => assert.rejects(fn, e => e.publicCode === code);

// A two-client ETag model, NOT live Cosmos, external invoices or real paid inference.
function fixture() {
  const id = 'effect-' + hash(need.id);
  let row = { ...binding, id, partitionKey: id, logicalId: need.id, kind: 'effect', schemaVersion: 1, ttl: -1,
    status: 'started', version: 1, _etag: 'v1', terminalAt: null };
  let writes = 0, reads = 0, unavailable = false, loseWriteReply = false, beforePut = null;
  const base = { kind: 'cosmos-multi-host-v1', async getEffect(key) {
    reads++; assert.equal(key, need.id); return row ? structuredClone(row) : null;
  } };
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, 'PUT');
    assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).hostname, 'fixture.documents.azure.com');
    if (unavailable) throw Error('simulated-partition');
    if (beforePut) { const once = beforePut; beforePut = null; once(); }
    if (options.headers['if-match'] !== row._etag) return new Response(null, { status: 412 });
    const next = JSON.parse(options.body);
    assert.equal(next.id, id); assert.equal(next.ttl, -1);
    row = { ...next, _etag: 'v' + next.version }; writes++;
    if (loseWriteReply) { loseWriteReply = false; throw Error('lost-after-commit'); }
    return new Response(JSON.stringify(row), { status: 200, headers: { etag: row._etag } });
  };
  const ledger = () => withCosmosEffectReceipts(base, { endpoint: 'https://fixture.documents.azure.com',
    database: 'test', container: 'test', getAccessToken: async () => 'test-entra', fetchImpl });
  let posts = 0, gets = 0, thrown = false, returned = null, onExecute = null;
  const adapter = { name: 'azure-openai-responses', capabilities: ['research'], version: '1',
    async execute() {
      posts++; if (onExecute) onExecute(); if (thrown) throw Error('external-effect-response-lost');
      return { output: 'private output', metadata: { provider: 'azure-openai', model: 'test-model-version',
        providerRequestId: 'resp_known', providerStoredResponse: true, usage: { ...usage } } };
    },
    async retrieveResponseReceipt({ responseId }) {
      gets++; assert.equal(responseId, 'resp_known');
      return returned || { provider: 'azure-openai', providerResponseId: responseId, providerModel: 'test-model-version',
        output: 'private output', usage: { ...usage }, responseRetrievedByGet: true };
    }
  };
  return { adapter, ledger, get row() { return row; }, set row(value) { row = value; },
    get posts() { return posts; }, get gets() { return gets; }, get writes() { return writes; }, get reads() { return reads; },
    set unavailable(value) { unavailable = value; }, set loseWriteReply(value) { loseWriteReply = value; },
    set thrown(value) { thrown = value; }, set returned(value) { returned = value; }, set beforePut(value) { beforePut = value; },
    set onExecute(value) { onExecute = value; },
    wrapped(overrides = {}) { return wrapRuntimeG5ReceiptAdapter({ adapter, ledger: ledger(), env, ...overrides }); }
  };
}

test('G5 receipt: default off and explicit opt-in requires storage, shared fence and Azure scope', () => {
  const f = fixture();
  assert.equal(wrapRuntimeG5ReceiptAdapter({ adapter: f.adapter, env: {} }), f.adapter);
  assert.throws(() => f.wrapped({ env: { ...env, TRUYN_G5_AZURE_STORE_RESPONSES: '0' } }), /configuration_required/);
  assert.throws(() => f.wrapped({ ledger: null }), /configuration_required/);
  assert.throws(() => f.wrapped({ env: { ...env, AZURE_OPENAI_ENDPOINT: 'http://unsafe.example' } }), /endpoint_invalid/);
  assert.equal(f.posts + f.gets + f.writes, 0);
});

test('G5 receipt: two workers claim once, capture bounded binding, restart recovers by GET only', async () => {
  const f = fixture(), a = f.wrapped(), b = f.wrapped();
  const outcomes = await Promise.allSettled([a.execute(request()), b.execute(request())]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(x => x.status === 'rejected').reason.publicCode, 'effect_execution_already_claimed');
  assert.equal(f.posts, 1); assert.equal(f.writes, 2);
  assert.equal(f.row.effectReceipt.responseId, 'resp_known');
  assert.equal(f.row.effectReceipt.outputDigest, hash('private output'));
  assert.doesNotMatch(JSON.stringify(f.row), /private output|test-entra|openai\.azure\.com/);
  const restart = f.wrapped();
  const before = f.writes;
  const result = await restart.recoverStoredEffect({ need, node });
  assert.equal(result.output, 'private output');
  assert.equal(result.receiptBoundToEffect, true);
  assert.equal(result.providerInvoiceVerified, false);
  assert.equal(result.accountingSettled, false);
  assert.equal(result.terminalDelivered, false);
  assert.equal(f.writes, before); assert.equal(f.gets, 1); assert.equal(f.posts, 1);
});

test('G5 receipt: lost paid response before ID persists UNKNOWN, no GET or repeat POST', async () => {
  const f = fixture(); f.thrown = true;
  await assert.rejects(() => f.wrapped().execute(request()), /response-lost/);
  f.row.status = 'unknown'; f.row._etag = 'lost-status';
  await fails(() => f.wrapped().recoverStoredEffect({ need, node }), 'effect_receipt_unknown');
  await fails(() => f.wrapped().execute(request()), 'effect_execution_already_claimed');
  assert.equal(f.posts, 1); assert.equal(f.gets, 0);
  assert.equal(f.row.status, 'unknown'); assert.equal(f.row.effectReceipt, undefined);
});

test('G5 receipt: lost capture reply after committed receipt recovers across worker restart', async () => {
  const f = fixture(); f.onExecute = () => { f.loseWriteReply = true; };
  await fails(() => f.wrapped().execute(request()), 'effect_receipt_store_unavailable');
  assert.equal(f.row.effectReceipt.responseId, 'resp_known');
  f.row.status = 'unknown';
  const result = await f.wrapped().recoverStoredEffect({ need, node });
  assert.equal(result.effectStatus, 'unknown', 'GET must not promote accounting or terminal state');
  assert.equal(f.posts, 1); assert.equal(f.gets, 1);
});

test('G5 receipt: missing intent, changed signer or task blocks before paid invocation', async () => {
  const f = fixture();
  for (const changed of [
    { ...need, from: 'foreign' },
    { ...need, payload: { ...need.payload, input: 'changed' } }
  ]) await fails(() => f.wrapped().execute({ ...request(), need: changed }), 'effect_identity_conflict');
  await fails(() => f.wrapped().execute({ ...request(), node: { identity: { nodeId: 'other-provider' } } }), 'effect_identity_conflict');
  f.row = null;
  await fails(() => f.wrapped().execute(request()), 'effect_intent_required');
  assert.equal(f.posts + f.gets + f.writes, 0);
});

test('G5 receipt: backend partition and ambiguous claim response never permit paid invocation', async () => {
  const f = fixture(); f.unavailable = true;
  await fails(() => f.wrapped().execute(request()), 'effect_receipt_store_unavailable');
  assert.equal(f.posts, 0);
  f.unavailable = false; f.loseWriteReply = true;
  await fails(() => f.wrapped().execute(request()), 'effect_receipt_store_unavailable');
  await fails(() => f.wrapped().execute(request()), 'effect_execution_already_claimed');
  assert.equal(f.posts, 0); assert.equal(f.writes, 1);
});

test('G5 receipt: scoped recovery refuses other identity, endpoint and deployment before GET', async () => {
  const f = fixture(); await f.wrapped().execute(request());
  await fails(() => f.wrapped().recoverStoredEffect({ need: { ...need, from: 'foreign' }, node }), 'effect_identity_conflict');
  for (const different of [
    { ...env, AZURE_OPENAI_ENDPOINT: 'https://other.openai.azure.com' },
    { ...env, AZURE_OPENAI_MODEL: 'other-deployment' }
  ]) await fails(() => f.wrapped({ env: different }).recoverStoredEffect({ need, node }), 'effect_receipt_scope_mismatch');
  assert.equal(f.gets, 0);
});

test('G5 receipt: GET mismatch in ID, model, output or exact usage never becomes reconciled', async () => {
  const f = fixture(); await f.wrapped().execute(request()); const writes = f.writes;
  const good = { provider: 'azure-openai', providerResponseId: 'resp_known', providerModel: 'test-model-version',
    output: 'private output', usage, responseRetrievedByGet: true };
  for (const patch of [
    { providerResponseId: 'resp_other' }, { providerModel: 'other-model' }, { output: 'tampered' },
    { usage: { input_tokens: 2, output_tokens: 5, total_tokens: 7 } }
  ]) { f.returned = { ...good, ...patch }; await fails(() => f.wrapped().recoverStoredEffect({ need, node }), 'effect_receipt_conflict'); }
  for (const invalid of [
    { input_tokens: -1, output_tokens: 8, total_tokens: 7 },
    { input_tokens: 3, output_tokens: 4, total_tokens: 8 },
    { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER },
    { total_tokens: 7 }
  ]) { f.returned = { ...good, usage: invalid }; await fails(() => f.wrapped().recoverStoredEffect({ need, node }), 'effect_receipt_unverified'); }
  assert.equal(f.writes, writes); assert.equal(f.posts, 1);
});

test('G5 receipt: ETag terminal race cannot resurrect completed/failed effect or duplicate execution', async () => {
  const f = fixture();
  f.beforePut = () => { f.row.status = 'failed'; f.row._etag = 'terminal-new'; f.row.version++; };
  await fails(() => f.wrapped().execute(request()), 'effect_execution_already_claimed');
  assert.equal(f.row.status, 'failed'); assert.equal(f.posts, 0); assert.equal(f.writes, 0);
});

test('G5 receipt: immutable receipt capture is idempotent; substitution and wrong token fail', async () => {
  const f = fixture(); await f.wrapped().execute(request());
  const value = structuredClone(f.row.effectReceipt), executionToken = f.row.receiptExecution.token, writes = f.writes;
  const same = await f.ledger().captureEffectReceipt({ ...binding, value, executionToken });
  assert.equal(same.changed, false); assert.equal(f.writes, writes);
  await fails(() => f.ledger().captureEffectReceipt({ ...binding, value: { ...value, responseId: 'resp_swap' }, executionToken }), 'effect_receipt_conflict');
  await fails(() => f.ledger().captureEffectReceipt({ ...binding, value, executionToken: 'wrong' }), 'effect_execution_token_mismatch');
  assert.equal(f.writes, writes);
});

test('G5 receipt: capacity reserves room for receipt before external call; chain and abort fail closed', async () => {
  const f = fixture(); f.row.padding = 'x'.repeat(847_000);
  await fails(() => f.wrapped().execute(request()), 'lifecycle_document_capacity_reached');
  delete f.row.padding;
  await fails(() => f.wrapped().execute({ ...request(), need: { ...need, chain: true } }), 'direct_effect_receipt_identity_required');
  const controller = new AbortController(); controller.abort();
  await fails(() => f.wrapped().execute({ ...request(), signal: controller.signal }), 'effect_execution_cancelled');
  assert.equal(f.posts + f.writes, 0);
});


test('G5 receipt: token, headers and response-body stalls respect a bounded store deadline', async () => {
  for (const phase of ['token', 'headers', 'body']) {
    const f = fixture();
    const never = () => new Promise(() => {});
    const ledger = withCosmosEffectReceipts({ kind: 'cosmos-multi-host-v1', getEffect: async () => structuredClone(f.row) }, {
      endpoint: 'https://fixture.documents.azure.com', database: 'test', container: 'test', requestTimeoutMs: 10,
      getAccessToken: phase === 'token' ? never : async () => 'fixture-token',
      fetchImpl: phase === 'headers' ? never : async () => ({ status: 200, json: never })
    });
    await fails(() => ledger.claimReceiptExecution(binding), 'effect_receipt_store_unavailable');
    assert.equal(f.posts, 0);
  }
});
