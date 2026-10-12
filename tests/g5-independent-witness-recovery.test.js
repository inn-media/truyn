import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createIndependentResponseWitnessVerifier, recoverUnknownResponseFromWitness, witnessSigningBytes } from '../runtime/g5-independent-response-witness.js';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { fixture, need, node, binding, env, request, scope, signed, keypair, crash } from './fixtures/g5-witness-model.mjs';
const fails = (op, code) => assert.rejects(op, e => e.publicCode === code);
const recover = f => f.wrapped().recoverUnknownEffect({ need, node });

test('default-off behavior retains the original Azure body and known-ID capture', async () => {
  const f = fixture({ loseReply: false, correlation: false });
  await f.wrapped().execute({ ...request(), g5Correlation: { version: 1, correlationId: 'a'.repeat(64), scopeDigest: 'b'.repeat(64) } });
  assert.equal(f.state.requestBody.metadata, undefined);
  assert.equal(f.state.row.receiptExecution.correlationId, undefined);
  const result = await f.wrapped().recoverStoredEffect({ need, node });
  assert.equal(result.output, 'private result'); assert.equal(f.state.posts, 1);
});
test('correlation mode refuses unconfigured independent witness before any provider call', () => {
  const f = fixture();
  assert.throws(() => f.wrapped({ witnessVerifier: null }), /independent_witness_configuration_required/);
  assert.equal(f.state.posts, 0);
});
test('scope and opaque correlation are committed BEFORE POST and caller cannot replace them', async () => {
  const f = fixture({ loseReply: false });
  await f.wrapped().execute({ ...request(), g5Correlation: { version: 1, correlationId: 'f'.repeat(64), scopeDigest: 'e'.repeat(64) } });
  assert.equal(f.state.row.receiptExecution.scopeDigest, scope);
  assert.equal(f.state.requestBody.metadata.truyn_g5_correlation, f.state.row.receiptExecution.correlationId);
  assert.notEqual(f.state.row.receiptExecution.correlationId, 'f'.repeat(64));
  assert.equal(f.state.row.effectReceipt.responseId, 'resp_effect_1');
});
test('lost response before durable response ID: signed independent witness recovers using GET only', async () => {
  const f = fixture(); await crash(f);
  assert.equal(f.state.row.effectReceipt, undefined);
  const result = await recover(f);
  assert.equal(result.providerResponseId, 'resp_effect_1');
  assert.equal(f.state.row.effectReceipt.responseId, 'resp_effect_1');
  assert.equal(f.state.posts, 1); assert.equal(f.state.gets, 1);
  assert.equal(f.state.row.status, 'unknown');
  assert.equal(result.providerInvoiceVerified, false); assert.equal(result.accountingSettled, false);
  assert.equal(result.terminalDelivered, false); assert.equal(result.automaticallyRetryAllowed, false);
  await fails(() => f.wrapped().execute(request()), 'effect_execution_already_claimed');
  assert.equal(f.state.posts, 1);
  assert.doesNotMatch(JSON.stringify(f.state.row), /private result|private task|fixture-token|openai\.azure\.com/);
});
test('no witness is UNKNOWN, not proof that the provider did nothing', async () => {
  const f = fixture(); await crash(f); f.state.witnesses = [];
  await fails(() => recover(f), 'g5_effect_remains_unknown');
  assert.equal(f.state.gets, 0); assert.equal(f.state.posts, 1); assert.equal(f.state.row.effectReceipt, undefined);
});
test('an unsigned or modified collector record cannot restore an ID', async () => {
  const f = fixture(); await crash(f); f.state.witnesses[0].payload.responseId = 'resp_substituted';
  await fails(() => recover(f), 'g5_witness_signature_invalid'); assert.equal(f.state.gets, 0);
});
test('unknown collector key is rejected', async () => {
  const f = fixture(); await crash(f); f.state.witnesses[0].keyId = 'untrusted';
  await fails(() => recover(f), 'g5_witness_untrusted'); assert.equal(f.state.gets, 0);
});
test('wrong Ed25519 key with a trusted-looking key ID is rejected', async () => {
  const f = fixture(); await crash(f); f.state.witnesses[0] = signed(f.state.witnesses[0].payload, keypair());
  await fails(() => recover(f), 'g5_witness_signature_invalid');
});
test('non-Ed25519 witness trust roots are refused', () => {
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => createIndependentResponseWitnessVerifier({ lookup: async () => [], trustedKeys: { collector: key } }), /key_invalid/);
});
for (const [label, patch] of [
  ['negative', { input_tokens: -1, output_tokens: 8, total_tokens: 7 }],
  ['sum', { input_tokens: 3, output_tokens: 4, total_tokens: 8 }],
  ['missing', { total_tokens: 7 }],
  ['overflow', { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER }]
]) test('invalid usage '+label+' cannot enter a signed witness', async () => {
  const f = fixture(); await crash(f);
  assert.throws(() => witnessSigningBytes({ ...f.state.witnesses[0].payload, usage: patch }), /witness_(invalid|usage_invalid)/);
});
test('extra unverified fields in the witness payload are rejected', async () => {
  const f = fixture(); await crash(f); f.state.witnesses[0].payload.invoiceVerified = true;
  await fails(() => recover(f), 'g5_witness_invalid');
});
test('another operation correlation ID is rejected before response GET', async () => {
  const f = fixture(); await crash(f);
  f.state.witnesses = [signed({ ...f.state.witnesses[0].payload, correlationId: 'a'.repeat(64) }, f.keys)];
  await fails(() => recover(f), 'g5_witness_binding_mismatch'); assert.equal(f.state.gets, 0);
});
test('another configured provider scope cannot query or recover the old effect', async () => {
  const f = fixture(); await crash(f);
  await fails(() => f.wrapped({ env: { ...env, AZURE_OPENAI_MODEL: 'another' } }).recoverUnknownEffect({ need, node }), 'g5_effect_has_no_precommitted_correlation');
  assert.equal(f.state.lookups, 0);
});
for (const kind of ['requester', 'provider', 'payload']) test('changed '+kind+' is rejected before external IO', async () => {
  const f = fixture(); await crash(f);
  const args = { need: structuredClone(need), node: structuredClone(node) };
  if (kind === 'requester') args.need.from = 'another';
  if (kind === 'provider') args.node.identity.nodeId = 'another';
  if (kind === 'payload') args.need.payload.input = 'another';
  await fails(() => f.wrapped().recoverUnknownEffect(args), 'g5_effect_binding_mismatch');
  assert.equal(f.state.lookups + f.state.gets, 0);
});
for (const kind of ['id', 'model', 'output', 'usage', 'correlation', 'scope', 'status']) test('provider GET '+kind+' mismatch cannot be captured', async () => {
  const f = fixture(); await crash(f); const writes = f.state.puts;
  f.state.getPatch = body => {
    if (kind === 'id') body.id = 'resp_other';
    if (kind === 'model') body.model = 'another';
    if (kind === 'output') body.output_text = 'another';
    if (kind === 'usage') body.usage = { input_tokens: 2, output_tokens: 5, total_tokens: 7 };
    if (kind === 'correlation') body.metadata.truyn_g5_correlation = 'f'.repeat(64);
    if (kind === 'scope') body.metadata.truyn_g5_scope = 'f'.repeat(64);
    if (kind === 'status') body.status = 'incomplete';
  };
  await assert.rejects(() => recover(f));
  assert.equal(f.state.puts, writes); assert.equal(f.state.row.effectReceipt, undefined); assert.equal(f.state.posts, 1);
});
for (const direction of [-1, 1]) test('stale/future witness time '+direction+' is refused', async () => {
  const f = fixture(); await crash(f);
  const p = { ...f.state.witnesses[0].payload, observedAt: new Date(Date.now() + direction*120_000).toISOString() };
  f.state.witnesses = [signed(p, f.keys)]; await fails(() => recover(f), 'g5_witness_time_invalid');
});
test('two different provider outcomes require reconciliation, never arbitrary first match', async () => {
  const f = fixture(); await crash(f);
  f.state.witnesses.push(signed({ ...f.state.witnesses[0].payload, responseId: 'resp_second' }, f.keys));
  await fails(() => recover(f), 'g5_multiple_provider_outcomes'); assert.equal(f.state.gets, 0);
});
test('duplicate copies of the same witness do not count as multiple effects', async () => {
  const f = fixture(); await crash(f); f.state.witnesses.push(structuredClone(f.state.witnesses[0]));
  await recover(f); assert.equal(f.state.posts, 1); assert.equal(f.state.row.effectReceipt.responseId, 'resp_effect_1');
});
test('unbounded witness batches are rejected', async () => {
  const f = fixture(); await crash(f); f.state.witnesses = Array(17).fill(f.state.witnesses[0]);
  await fails(() => recover(f), 'g5_witness_query_invalid');
});
test('lookup deadline leaves UNKNOWN and performs zero new provider calls', async () => {
  const f = fixture(); await crash(f);
  const verifier = createIndependentResponseWitnessVerifier({ lookup: () => new Promise(() => {}), timeoutMs: 15, trustedKeys: { collector: f.keys.publicKey } });
  await fails(() => f.wrapped({ witnessVerifier: verifier }).recoverUnknownEffect({ need, node }), 'g5_witness_deadline_exceeded');
  assert.equal(f.state.posts, 1); assert.equal(f.state.row.effectReceipt, undefined);
});
test('provider GET timeout remains UNKNOWN', async () => {
  const f = fixture(); await crash(f);
  await fails(() => recoverUnknownResponseFromWitness({ binding, scopeDigest: scope, ledger: f.ledger(), witnessVerifier: f.verifier,
    adapter: { retrieveResponseReceipt: () => new Promise(() => {}) }, timeoutMs: 15 }), 'g5_witness_deadline_exceeded');
  assert.equal(f.state.posts, 1); assert.equal(f.state.row.effectReceipt, undefined);
});
test('abort before recovery performs no lookup or GET', async () => {
  const f = fixture(); await crash(f); const c = new AbortController(); c.abort();
  await fails(() => f.wrapped().recoverUnknownEffect({ need, node, signal: c.signal }), 'g5_witness_aborted');
  assert.equal(f.state.gets + f.state.lookups, 0);
});
test('terminal status changed while fetching witness/response must not be resurrected', async () => {
  const f = fixture(); await crash(f); f.state.afterGet = () => { f.state.row.status = 'failed'; };
  await fails(() => recover(f), 'g5_effect_terminal_conflict'); assert.equal(f.state.row.effectReceipt, undefined);
});
test('old effects without correlation are not retroactively guessed into the new scheme', async () => {
  const f = fixture(); await crash(f); delete f.state.row.receiptExecution.correlationId;
  await fails(() => recover(f), 'g5_effect_has_no_precommitted_correlation'); assert.equal(f.state.lookups, 0);
});
test('lost capture reply is recovered by reading the now-known receipt, not by POST', async () => {
  const f = fixture(); await crash(f); f.state.losePut = true;
  await fails(() => recover(f), 'effect_receipt_store_unavailable');
  assert.equal(f.state.row.effectReceipt.responseId, 'resp_effect_1');
  const r = await f.wrapped().recoverStoredEffect({ need, node });
  assert.equal(r.effectStatus, 'unknown'); assert.equal(f.state.posts, 1);
});
test('two rival executors retain one claim and one upstream POST', async () => {
  const f = fixture({ loseReply: false });
  const all = await Promise.allSettled([f.wrapped().execute(request()), f.wrapped().execute(request())]);
  assert.equal(all.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.state.posts, 1);
});
test('correlation cannot silently activate storage when storage is disabled', async () => {
  let calls = 0;
  const provider = createAzureOpenAIProvider({ endpoint: env.AZURE_OPENAI_ENDPOINT, model: 'test', persistResponses: false,
    fetchImpl: async () => { calls++; throw Error(); } });
  await assert.rejects(() => provider.execute({ ...request(), g5Correlation: { version: 1, correlationId: 'a'.repeat(64), scopeDigest: 'b'.repeat(64) } }), /requires_stored_response/);
  assert.equal(calls, 0);
});
