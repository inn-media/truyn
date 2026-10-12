import test from 'node:test';
import assert from 'node:assert/strict';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { createProviderAdapter } from '../adapters/providers/index.js';

test('Azure OpenAI provider uses managed identity bearer auth and reports usage', async () => {
  const calls = [];
  const provider = createAzureOpenAIProvider({
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    apiKey: null,
    capabilities: ['research'],
    accessTokenProvider: async () => 'azure-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'resp_test',
            model: 'gpt-test',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'azure result' }] }],
            usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 }
          };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'research', input: 'hello', policy: {} });
  assert.equal(result.output, 'azure result');
  assert.equal(result.metadata.provider, 'azure-openai');
  assert.equal(result.metadata.usage.total_tokens, 16);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.openai.azure.com/openai/v1/responses');
  assert.equal(calls[0].options.headers.authorization, 'Bearer azure-token');
});

test('Azure OpenAI provider uses api-key when explicitly configured', async () => {
  const provider = createAzureOpenAIProvider({
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    apiKey: 'secret-test-key',
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers['api-key'], 'secret-test-key');
      assert.equal(options.headers.authorization, undefined);
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: 'ok', model: 'gpt-test', usage: {} };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'research', input: 'hello', policy: {} });
  assert.equal(result.output, 'ok');
});

test('Vertex Gemini provider calls generateContent and reports token metadata', async () => {
  const calls = [];
  const provider = createVertexGeminiProvider({
    projectId: 'truyn-test-project',
    location: 'us-central1',
    model: 'gemini-test',
    capabilities: ['review'],
    accessTokenProvider: async () => 'gcp-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'x-request-id' ? 'vertex-request' : null },
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: 'gemini result' }] } }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, totalTokenCount: 16 }
          };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'review', input: { candidate: 'hello' }, policy: {} });
  assert.equal(result.output, 'gemini result');
  assert.equal(result.metadata.provider, 'vertex-gemini');
  assert.equal(result.metadata.usage.totalTokenCount, 16);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://aiplatform.googleapis.com/v1/projects/truyn-test-project/locations/us-central1/publishers/google/models/gemini-test:generateContent'
  );
  assert.equal(calls[0].options.headers.authorization, 'Bearer gcp-token');
});

test('Vertex Gemini converts non-JSON upstream failures into bounded provider errors', async () => {
  const provider = createVertexGeminiProvider({
    projectId:'truyn-test-project',
    location:'global',
    model:'gemini-test',
    accessTokenProvider:async () => 'gcp-token',
    fetchImpl:async () => ({
      ok:false,
      status:504,
      headers:{ get:() => null },
      async text() { return 'upstream request timeout'; }
    })
  });

  await assert.rejects(
    provider.execute({ capability:'reasoning.general', input:'hello', policy:{} }),
    (error) => {
      assert.equal(error instanceof SyntaxError, false);
      assert.match(error.message, /^Vertex AI HTTP 504: upstream request timeout$/);
      assert.doesNotMatch(error.message, /gcp-token|aiplatform\.googleapis\.com/);
      return true;
    }
  );
});

test('Vertex Gemini rejects a successful non-JSON response explicitly', async () => {
  const provider = createVertexGeminiProvider({
    projectId:'truyn-test-project',
    location:'global',
    model:'gemini-test',
    accessTokenProvider:async () => 'gcp-token',
    fetchImpl:async () => ({
      ok:true,
      status:200,
      headers:{ get:() => null },
      async text() { return 'not-json'; }
    })
  });

  await assert.rejects(
    provider.execute({ capability:'reasoning.general', input:'hello', policy:{} }),
    /Vertex AI HTTP 200: invalid non-JSON response/
  );
});

test('provider factory exposes cloud provider aliases', () => {
  const azure = createProviderAdapter('azure-openai', {
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    apiKey: 'x'
  });
  const gemini = createProviderAdapter('gemini', {
    projectId: 'project',
    location: 'global',
    model: 'gemini-test',
    accessTokenProvider: async () => 'x'
  });
  assert.equal(azure.name, 'azure-openai-responses');
  assert.equal(gemini.name, 'vertex-gemini-generate-content');
});

test('G5 Azure receipt: historical store=false blocks GET recovery and does not issue paid POST', async () => {
  let calls = 0;
  const adapter = createAzureOpenAIProvider({
    endpoint: 'https://example.openai.azure.com', model:'gpt-test', apiKey:'mock',
    fetchImpl: async () => { calls++; throw Error('unexpected paid request'); }
  });
  await assert.rejects(() => adapter.retrieveResponseReceipt({responseId:'resp_known'}), /explicit_storage_opt_in/);
  assert.equal(calls, 0);
});

test('G5 Azure stored opt-in: known response ID is independently read by GET, never replay POST', async () => {
  const calls = [];
  const adapter = createAzureOpenAIProvider({
    endpoint:'https://example.openai.azure.com/', model:'gpt-test',
    apiKey:null, accessTokenProvider:async()=> 'fixture-token', persistResponses:true,
    fetchImpl:async (url, options) => {
      calls.push({url,method:options.method,body:options.body,auth:options.headers.authorization});
      if(options.method === 'POST') return {
        ok:true,
        async json(){return {id:'resp_known123',model:'gpt-test',output_text:'one',
          usage:{input_tokens:3,output_tokens:4,total_tokens:7}};}
      };
      assert.equal(options.method,'GET');
      return {ok:true,async json(){return {
        id:'resp_known123', status:'completed',model:'gpt-test',
        output_text:'one',usage:{input_tokens:3,output_tokens:4,total_tokens:7}
      };}};
    }
  });
  const original=await adapter.execute({capability:'research',input:'G5 isolated fixture',policy:{}});
  assert.equal(original.metadata.providerStoredResponse,true);
  assert.equal(original.metadata.providerRequestId,'resp_known123');
  const verified=await adapter.retrieveResponseReceipt({responseId:'resp_known123'});
  assert.deepEqual(calls.map(c=>c.method),['POST','GET']);
  assert.equal(JSON.parse(calls[0].body).store,true);
  assert.equal(calls[1].url,'https://example.openai.azure.com/openai/v1/responses/resp_known123');
  assert.equal(calls[1].auth,'Bearer fixture-token');
  assert.equal(verified.providerResponseId,'resp_known123');
  assert.equal(verified.usage.total_tokens,7);
  assert.equal(verified.output,'one');
  assert.equal(verified.responseRetrievedByGet,true);
  assert.equal(verified.providerInvoiceVerified,false);
  assert.equal(verified.accountingSettled,false);
});

test('G5 Azure receipt: forged, unfinished, malformed or inaccessible result fails closed',async()=>{
  let reads=0;
  const replies=[
    {ok:true,async json(){return {id:'resp_different',status:'completed',model:'gpt-test',usage:{total_tokens:8}};}},
    {ok:true,async json(){return {id:'resp_known',status:'in_progress',model:'gpt-test',usage:{total_tokens:8}};}},
    {ok:true,async json(){return {id:'resp_known',status:'completed',model:'gpt-test',usage:{total_tokens:-1}};}},
    {ok:false,status:404},
  ];
  const adapter=createAzureOpenAIProvider({
    endpoint:'https://example.openai.azure.com',model:'gpt-test',apiKey:'fixture',
    persistResponses:true,
    fetchImpl:async (_url,options)=>{assert.equal(options.method,'GET');return replies[reads++];}
  });
  await assert.rejects(()=>adapter.retrieveResponseReceipt({responseId:'../bad'}),/invalid_azure_response_receipt_id/);
  assert.equal(reads,0);
  for(let i=0;i<3;i++) await assert.rejects(
    ()=>adapter.retrieveResponseReceipt({responseId:'resp_known'}),/azure_response_receipt_unverified/
  );
  await assert.rejects(()=>adapter.retrieveResponseReceipt({responseId:'resp_known'}),/azure_response_receipt_read_unavailable/);
  assert.equal(reads,4);
});
