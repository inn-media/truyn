import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { withCosmosEffectReceipts, wrapRuntimeG5ReceiptAdapter } from '../../runtime/g5-durable-response-receipt.js';
import { createIndependentResponseWitnessVerifier, witnessSigningBytes, G5_WITNESS_SCHEMA } from '../../runtime/g5-independent-response-witness.js';
import { createAzureOpenAIProvider } from '../../adapters/providers/azure-openai.js';

export const hash = x => createHash('sha256').update(x).digest('hex');
export const need = { id: 'g5-unknown-before-id', from: 'requester', payload: { capability: 'research', input: 'private task' } };
export const node = { identity: { nodeId: 'provider' } };
export const binding = { id: need.id, requester: need.from, provider: node.identity.nodeId,
  fingerprint: hash(JSON.stringify([need.id, need.from, need.payload])) };
export const env = { TRUYN_G5_DURABLE_AZURE_RECEIPTS: '1', TRUYN_G5_AZURE_STORE_RESPONSES: '1',
  TRUYN_G5_CORRELATED_RESPONSE_RECOVERY: '1',
  AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_MODEL: 'fixture' };
export const request = () => ({ need: structuredClone(need), node, input: 'private task', capability: 'research', policy: {} });
export const scope = hash(JSON.stringify([env.AZURE_OPENAI_ENDPOINT, env.AZURE_OPENAI_MODEL]));
export function baseEffect() {
  const id = 'effect-' + hash(need.id);
  return { ...binding, id, logicalId: need.id, partitionKey: id, kind: 'effect', schemaVersion: 1,
    ttl: -1, status: 'started', version: 1, _etag: 'v1' };
}
export function keypair() {
  const pair = generateKeyPairSync('ed25519');
  return { privateKey: pair.privateKey, publicKey: pair.publicKey.export({ format: 'pem', type: 'spki' }) };
}
export function witnessFor(body, keys) {
  const payload = { schema: G5_WITNESS_SCHEMA, provider: 'azure-openai',
    correlationId: body.metadata.truyn_g5_correlation, scopeDigest: body.metadata.truyn_g5_scope,
    responseId: body.id, model: body.model, usage: body.usage, outputDigest: hash(body.output_text),
    observedAt: new Date().toISOString(), recordId: 'test-witness-record', exportDigest: hash('test-only-export') };
  return signed(payload, keys);
}
export function signed(payload, keys, keyId = 'collector') {
  return { keyId, payload: structuredClone(payload), signature: sign(null, witnessSigningBytes(payload), keys.privateKey).toString('base64') };
}
export function fixture({ loseReply = true, correlation = true } = {}) {
  let row = baseEffect();
  const keys = keypair();
  const state = { posts: 0, gets: 0, puts: 0, lookups: 0, row, witnesses: [], response: null,
    loseReply, getPatch: null, afterGet: null, losePut: false, requestBody: null };
  const fetchImpl = async (uri, options = {}) => {
    const u = new URL(uri);
    if (u.hostname === 'fixture.documents.azure.com') {
      if (options.method !== 'PUT') throw Error('unexpected Cosmos method');
      if (options.headers['if-match'] !== state.row._etag) return new Response(null, { status: 412 });
      const next = JSON.parse(options.body); state.puts++;
      state.row = { ...next, _etag: 'v' + next.version };
      if (state.losePut) { state.losePut = false; throw Error('test-lost-commit-reply'); }
      return new Response(JSON.stringify(state.row), { status: 200 });
    }
    if (u.hostname !== 'fixture.openai.azure.com') throw Error('test-host-not-allowed');
    if (options.method === 'POST') {
      state.posts++; state.requestBody = JSON.parse(options.body);
      state.response = { id: 'resp_effect_1', status: 'completed', model: 'fixture-version',
        output_text: 'private result', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
        metadata: state.requestBody.metadata || {} };
      if (correlation) state.witnesses.push(witnessFor(state.response, keys));
      if (state.loseReply) throw Error('test-worker-response-lost');
      return new Response(JSON.stringify(state.response), { status: 200 });
    }
    if (options.method === 'GET') {
      state.gets++;
      const value = structuredClone(state.response);
      if (state.getPatch) state.getPatch(value);
      if (state.afterGet) state.afterGet();
      return new Response(JSON.stringify(value), { status: 200 });
    }
    throw Error('test-method-not-allowed');
  };
  const ledger = () => withCosmosEffectReceipts({ kind: 'cosmos-multi-host-v1', receiptSession: { scope: 'https://fixture.documents.azure.com/dbs/test/colls/test/docs', requestHeaders: () => ({}), observeResponse() {} }, getEffect: async () => structuredClone(state.row) }, {
    endpoint: 'https://fixture.documents.azure.com', database: 'test', container: 'test',
    getAccessToken: async () => 'fixture-token', fetchImpl
  });
  const lookup = async () => { state.lookups++; return structuredClone(state.witnesses); };
  const verifier = createIndependentResponseWitnessVerifier({ lookup, trustedKeys: { collector: keys.publicKey } });
  const adapter = createAzureOpenAIProvider({ endpoint: env.AZURE_OPENAI_ENDPOINT, model: 'fixture',
    accessTokenProvider: async () => 'fixture-token', persistResponses: true, fetchImpl });
  const wrapped = (overrides = {}) => wrapRuntimeG5ReceiptAdapter({ adapter, ledger: ledger(),
    env: { ...env, TRUYN_G5_CORRELATED_RESPONSE_RECOVERY: correlation ? '1' : '0' }, witnessVerifier: verifier, ...overrides });
  return { state, keys, ledger, adapter, verifier, wrapped, lookup };
}
export async function crash(f) {
  try { await f.wrapped().execute(request()); } catch (e) { if (!/response-lost/.test(e.message)) throw e; }
  f.state.row.status = 'unknown'; f.state.row.version++; f.state.row._etag = 'unknown-' + f.state.row.version;
}
