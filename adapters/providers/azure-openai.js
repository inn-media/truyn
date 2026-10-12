function extractText(response) {
  if (typeof response.output_text === 'string' && response.output_text.length) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

async function containerAppsManagedIdentityToken({ fetchImpl = fetch, signal } = {}) {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  if (!endpoint || !identityHeader) {
    throw new Error('Azure managed identity is unavailable: IDENTITY_ENDPOINT/IDENTITY_HEADER are missing');
  }

  const url = new URL(endpoint);
  url.searchParams.set('resource', process.env.AZURE_OPENAI_TOKEN_RESOURCE || 'https://cognitiveservices.azure.com/');
  url.searchParams.set('api-version', '2019-08-01');
  if (process.env.AZURE_CLIENT_ID) url.searchParams.set('client_id', process.env.AZURE_CLIENT_ID);

  const response = await fetchImpl(url, {
    headers: { 'x-identity-header': identityHeader },
    signal
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.error || `Azure identity HTTP ${response.status}`);
  }
  return body.access_token;
}

export function createAzureOpenAIProvider({
  endpoint = process.env.AZURE_OPENAI_ENDPOINT,
  model = process.env.AZURE_OPENAI_MODEL || process.env.AZURE_OPENAI_DEPLOYMENT,
  apiKey = process.env.AZURE_OPENAI_API_KEY,
  capabilities = ['research'],
  accessTokenProvider = containerAppsManagedIdentityToken,
  fetchImpl = fetch,
  persistResponses = process.env.TRUYN_G5_AZURE_STORE_RESPONSES === '1'
} = {}) {
  if (!endpoint) throw new Error('AZURE_OPENAI_ENDPOINT is required');
  if (!model) throw new Error('AZURE_OPENAI_MODEL or AZURE_OPENAI_DEPLOYMENT is required');
  if (typeof persistResponses !== 'boolean') throw new Error('persistResponses must be a boolean');

  return {
    name: 'azure-openai-responses',
    version: '1',
    capabilities,
    // Authenticated read of a known response ID, never a repeat paid POST.
    // Storage requires explicit consent. Usage is not a settled vendor invoice.
    async retrieveResponseReceipt({ responseId, signal } = {}) {
      if (!persistResponses) throw new Error('azure_response_receipt_requires_explicit_storage_opt_in');
      if (typeof responseId !== 'string' || !/^resp_[a-zA-Z0-9_-]{1,200}$/.test(responseId))
        throw new Error('invalid_azure_response_receipt_id');
      const headers = { accept: 'application/json' };
      if (apiKey) headers['api-key'] = apiKey;
      else headers.authorization = 'Bearer ' + await accessTokenProvider({ fetchImpl, signal });
      const response = await fetchImpl(
        endpoint.replace(/\/$/, '') + '/openai/v1/responses/' + encodeURIComponent(responseId),
        { method: 'GET', headers, signal }
      );
      if (!response.ok) throw new Error('azure_response_receipt_read_unavailable');
      let body;
      try { body = await response.json(); }
      catch { throw new Error('azure_response_receipt_invalid_json'); }
      if (body?.id !== responseId || body?.status !== 'completed' ||
          typeof body.model !== 'string' || body.model.length === 0 ||
          !Number.isSafeInteger(body?.usage?.total_tokens) || body.usage.total_tokens < 0)
        throw new Error('azure_response_receipt_unverified');
      return {
        provider: 'azure-openai', providerResponseId: responseId,
        providerModel: body.model, usage: body.usage, output: extractText(body),
        responseRetrievedByGet: true, providerInvoiceVerified: false,
        accountingSettled: false
      };
    },
    async execute({ capability, input, policy, signal }) {
      const startedAt = Date.now();
      const prompt = [
        `You are a TRUYN provider for capability: ${capability}.`,
        'Return only the useful task result. Do not describe TRUYN internals unless asked.',
        `Task input: ${typeof input === 'string' ? input : JSON.stringify(input)}`,
        Object.keys(policy || {}).length ? `Request policy: ${JSON.stringify(policy)}` : null
      ].filter(Boolean).join('\n\n');

      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers['api-key'] = apiKey;
      else headers.authorization = `Bearer ${await accessTokenProvider({ fetchImpl, signal })}`;

      const requestBody = JSON.stringify({ model, input: prompt, store: persistResponses });
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/openai/v1/responses`, {
        method: 'POST',
        headers,
        body: requestBody,
        signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `Azure OpenAI HTTP ${response.status}`);

      const providerRequestBodyBytes = Buffer.byteLength(requestBody);
      const providerResponseBodyBytes = Buffer.byteLength(JSON.stringify(body));

      return {
        output: extractText(body),
        metadata: {
          provider: 'azure-openai',
          model: body.model || model,
          providerRequestId: body.id || null,
          providerStoredResponse: persistResponses,
          providerLatencyMs: Date.now() - startedAt,
          providerRequestBodyBytes,
          providerResponseBodyBytes,
          providerBodyBytes: providerRequestBodyBytes + providerResponseBodyBytes,
          usage: body.usage || null
        }
      };
    }
  };
}
