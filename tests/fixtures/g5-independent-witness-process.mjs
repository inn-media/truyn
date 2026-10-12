import { createAzureOpenAIProvider } from '../../adapters/providers/azure-openai.js';
import { withCosmosEffectReceipts, wrapRuntimeG5ReceiptAdapter } from '../../runtime/g5-durable-response-receipt.js';
import { createIndependentResponseWitnessVerifier } from '../../runtime/g5-independent-response-witness.js';
import { env, need, node, request } from './g5-witness-model.mjs';

// This fixture cannot select a production host. The only transport is a
// test parent's loopback server. No real Azure credentials or inference.
const config = JSON.parse(process.env.G5_LOCAL_TEST_CONFIG || 'null');
if (!config || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(config.url) ||
  !['execute', 'recover'].includes(config.role) || !process.send) throw Error('isolated test config required');
const transport = (uri, options) => {
  const u = new URL(uri);
  const group = u.hostname === 'fixture.documents.azure.com' ? 'cosmos' :
    u.hostname === 'fixture.openai.azure.com' ? 'azure' : null;
  if (!group) throw Error('test origin rejected');
  return fetch(config.url + '/' + group + u.pathname, options);
};
const readJson = async path => {
  const response = await fetch(config.url + path);
  if (!response.ok) throw Error('test read rejected');
  return response.json();
};
const ledger = withCosmosEffectReceipts({ kind: 'cosmos-multi-host-v1', receiptSession: { scope: 'https://fixture.documents.azure.com/dbs/test/colls/test/docs', requestHeaders: () => ({}), observeResponse() {} }, getEffect: () => readJson('/effect') }, {
  endpoint: 'https://fixture.documents.azure.com', database: 'test', container: 'test',
  getAccessToken: async () => 'fixture-not-a-credential', fetchImpl: transport
});
const adapter = createAzureOpenAIProvider({ endpoint: env.AZURE_OPENAI_ENDPOINT, model: 'fixture',
  persistResponses: true, accessTokenProvider: async () => 'fixture-not-a-credential', fetchImpl: transport });
const witnessVerifier = createIndependentResponseWitnessVerifier({ trustedKeys: { collector: config.publicKey },
  lookup: () => readJson('/witnesses') });
const wrapped = wrapRuntimeG5ReceiptAdapter({ adapter, ledger, env, witnessVerifier });
try {
  const result = config.role === 'execute' ? await wrapped.execute(request()) : await wrapped.recoverUnknownEffect({ need, node });
  process.send({ ok: true, result }, () => process.disconnect());
} catch (error) {
  process.send({ ok: false, code: error.publicCode || error.message }, () => process.disconnect());
  process.exitCode = 1;
}
