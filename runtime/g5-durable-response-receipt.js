import { createHash, randomUUID } from 'node:crypto';
import { executionCorrelation, recoverUnknownResponseFromWitness } from './g5-independent-response-witness.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
function fault(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.publicCode = code;
  return error;
}
function owner(row, binding) {
  if (![binding?.id, binding?.provider, binding?.requester, binding?.fingerprint].every(text))
    throw fault(400, 'invalid_effect_receipt_binding');
  if (!row || row.logicalId !== binding.id || row.kind !== 'effect' || row.schemaVersion !== 1 || row.ttl !== -1)
    throw fault(503, 'effect_receipt_record_invalid');
  if (row.provider !== binding.provider || row.requester !== binding.requester || row.fingerprint !== binding.fingerprint)
    throw fault(409, 'effect_identity_conflict');
}
function receipt(value) {
  const usage = value?.usage;
  if (value?.provider !== 'azure-openai' || !/^resp_[a-zA-Z0-9_-]{1,200}$/.test(value?.responseId || '') ||
      !text(value?.model) || value.model.length > 256 ||
      !/^[a-f0-9]{64}$/.test(value?.scopeDigest || '') || !/^[a-f0-9]{64}$/.test(value?.outputDigest || '') ||
      !usage || !['input_tokens', 'output_tokens', 'total_tokens'].every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0) ||
      !Number.isSafeInteger(usage.input_tokens + usage.output_tokens) || usage.input_tokens + usage.output_tokens !== usage.total_tokens)
    throw fault(409, 'effect_receipt_unverified');
  // Only bounded identifiers, usage and digests enter shared storage, never output or credentials.
  return { version: 1, provider: 'azure-openai', responseId: value.responseId, model: value.model,
    scopeDigest: value.scopeDigest, outputDigest: value.outputDigest,
    usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, total_tokens: usage.total_tokens } };
}
const sameReceipt = (a, b) => JSON.stringify(receipt(a)) === JSON.stringify(receipt(b));

// Extend the same Cosmos effect document. No auxiliary reservation, container,
// external charge, or change to NEED/OFFER/RESULT signed protocol bytes.
export function withCosmosEffectReceipts(ledger, { endpoint, database, container, getAccessToken, fetchImpl = fetch, requestTimeoutMs = 10_000 } = {}) {
  if (ledger?.kind !== 'cosmos-multi-host-v1' || typeof ledger.getEffect !== 'function' ||
      typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 10_000 ||
      typeof endpoint !== 'string' || !/^https:\/\/[a-z0-9.-]+\.documents\.azure\.com(?::443)?\/?$/i.test(endpoint) ||
      ![database, container].every(v => typeof v === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(v)))
    throw fault(503, 'effect_receipt_cosmos_configuration_required');
  const base = endpoint.replace(/\/$/, '') + `/dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}/docs/`;
  const session = ledger.receiptSession;
  if (session?.scope !== base.slice(0, -1) || typeof session.requestHeaders !== 'function' ||
      typeof session.observeResponse !== 'function')
    throw fault(503, 'effect_receipt_shared_session_required');
  async function mutate(binding, update) {
    if (![binding?.id, binding?.provider, binding?.requester, binding?.fingerprint].every(text))
      throw fault(400, 'invalid_effect_receipt_binding');
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await ledger.getEffect(binding.id);
      if (!current) throw fault(409, 'effect_intent_required');
      owner(current, binding);
      const expectedId = 'effect-' + sha256(binding.id);
      if (current.id !== expectedId || current.partitionKey !== expectedId || !text(current._etag) ||
          !Number.isSafeInteger(current.version) || current.version < 1 || current.version >= Number.MAX_SAFE_INTEGER)
        throw fault(503, 'effect_receipt_record_invalid');
      const next = update(structuredClone(current));
      if (next === null) return { changed: false, row: current };
      next.version = current.version + 1;
      delete next._etag;
      // Leave room for subsequent terminal timestamp/status; retain the existing tombstone forever.
      if (Buffer.byteLength(JSON.stringify(next)) + 256 > 850_000) throw fault(503, 'lifecycle_document_capacity_reached');
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(fault(503, 'effect_receipt_store_unavailable'));
      }, requestTimeoutMs); });
      const bounded = promise => Promise.race([promise, deadline]);
      try {
        const token = await bounded(Promise.resolve().then(() => getAccessToken()));
        if (typeof token !== 'string' || !token || Buffer.byteLength(token) > 16384) throw fault(503, 'lifecycle_ledger_auth_unavailable');
        const response = await bounded(fetchImpl(base + encodeURIComponent(expectedId), {
          method: 'PUT', redirect: 'error', signal: controller.signal,
          headers: { authorization: encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
            'x-ms-date': new Date().toUTCString(), 'x-ms-version': '2018-12-31',
            'x-ms-consistency-level': 'Session',
            ...session.requestHeaders(),
            'x-ms-documentdb-partitionkey': JSON.stringify([expectedId]),
            'if-match': current._etag, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(next)
        }));
        // Observe headers even when body validation is ambiguous: subsequent
        // host reads and finishEffect must honor the same write watermark.
        session.observeResponse(response);
        if (response.status === 412) continue;
        if (response.status !== 200) throw fault(503, 'effect_receipt_store_unavailable');
        // Read through the normal ledger again on subsequent calls. Never trust
        // a transport send as confirmation, nor replay a PUT after an ambiguous response.
        const committed = await bounded(response.json());
        if (committed?.id !== expectedId || committed?.version !== next.version || committed?.ttl !== -1 ||
            committed?.provider !== next.provider || committed?.requester !== next.requester ||
            committed?.fingerprint !== next.fingerprint || committed?.status !== next.status ||
            committed?.receiptExecution?.token !== next.receiptExecution?.token ||
            committed?.receiptExecution?.correlationId !== next.receiptExecution?.correlationId ||
            committed?.receiptExecution?.scopeDigest !== next.receiptExecution?.scopeDigest ||
            (next.effectReceipt && !sameReceipt(committed?.effectReceipt, next.effectReceipt)))
          throw fault(503, 'effect_receipt_store_unverified');
        return { changed: true, row: next };
      } catch (error) {
        if (Number.isInteger(error?.httpStatus)) throw error;
        throw fault(503, 'effect_receipt_store_unavailable');
      } finally { clearTimeout(timer); }
    }
    throw fault(503, 'effect_receipt_cas_contention');
  }
  return Object.freeze({ ...ledger,
    async claimReceiptExecution(binding, { scopeDigest = null } = {}) {
      if (scopeDigest !== null && !/^[a-f0-9]{64}$/.test(scopeDigest)) throw fault(400, 'g5_correlation_binding_invalid');
      const executionToken = randomUUID();
      const result = await mutate(binding, row => {
        if (row.status !== 'started' || row.receiptExecution || row.effectReceipt)
          throw fault(409, 'effect_execution_already_claimed');
        if (Buffer.byteLength(JSON.stringify(row)) + 4096 > 850_000)
          throw fault(503, 'lifecycle_document_capacity_reached');
        row.receiptExecution = { token: executionToken, claimedAt: new Date().toISOString(),
          ...(scopeDigest ? { scopeDigest, correlationId: executionCorrelation(binding, executionToken, scopeDigest) } : {}) };
        return row;
      });
      return { executionToken: result.row.receiptExecution.token,
        ...(scopeDigest ? { correlationId: result.row.receiptExecution.correlationId } : {}) };
    },
    async captureEffectReceipt({ executionToken, value, ...binding }) {
      const normalized = receipt(value);
      if (!text(executionToken)) throw fault(400, 'effect_execution_token_required');
      return mutate(binding, row => {
        if (row.receiptExecution?.token !== executionToken) throw fault(409, 'effect_execution_token_mismatch');
        if (row.receiptExecution.scopeDigest && row.receiptExecution.scopeDigest !== normalized.scopeDigest)
          throw fault(409, 'effect_receipt_scope_mismatch');
        if (!['started', 'unknown', 'completed'].includes(row.status)) throw fault(409, 'effect_receipt_terminal_conflict');
        if (row.effectReceipt) {
          if (!sameReceipt(row.effectReceipt, normalized)) throw fault(409, 'effect_receipt_conflict');
          return null;
        }
        row.effectReceipt = normalized;
        row.receiptCapturedAt = new Date().toISOString();
        return row;
      });
    }
  });
}

function bindingFor(need, node) {
  if (need?.chain || !text(need?.id) || !text(need?.from) || !text(node?.identity?.nodeId) ||
      !need.payload || typeof need.payload !== 'object') throw fault(400, 'direct_effect_receipt_identity_required');
  return { id: need.id, provider: node.identity.nodeId, requester: need.from,
    fingerprint: sha256(JSON.stringify([need.id, need.from, need.payload])) };
}

export function wrapRuntimeG5ReceiptAdapter({ adapter, ledger, env = process.env, witnessVerifier = null } = {}) {
  if (env.TRUYN_G5_DURABLE_AZURE_RECEIPTS !== '1') return adapter;
  if (env.TRUYN_G5_AZURE_STORE_RESPONSES !== '1' || adapter?.name !== 'azure-openai-responses' ||
      typeof adapter.execute !== 'function' || typeof adapter.retrieveResponseReceipt !== 'function' ||
      ledger?.kind !== 'cosmos-multi-host-v1' || typeof ledger.claimReceiptExecution !== 'function' ||
      typeof ledger.captureEffectReceipt !== 'function' || typeof ledger.getEffect !== 'function')
    throw fault(503, 'durable_azure_receipt_configuration_required');
  const endpoint = new URL(env.AZURE_OPENAI_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw fault(503, 'durable_azure_receipt_endpoint_invalid');
  const model = env.AZURE_OPENAI_MODEL || env.AZURE_OPENAI_DEPLOYMENT;
  if (!text(model)) throw fault(503, 'durable_azure_receipt_model_required');
  const scopeDigest = sha256(JSON.stringify([endpoint.href.replace(/\/$/, ''), model]));
  const correlated = env.TRUYN_G5_CORRELATED_RESPONSE_RECOVERY === '1';
  if (correlated && (adapter.g5CorrelationVersion !== 1 || witnessVerifier?.version !== 1 ||
      typeof witnessVerifier.lookupAndVerify !== 'function'))
    throw fault(503, 'g5_independent_witness_configuration_required');
  return { ...adapter,
    async execute(input) {
      const binding = bindingFor(input.need, input.node);
      if (input.signal?.aborted) throw fault(409, 'effect_execution_cancelled');
      const { executionToken, correlationId } = await ledger.claimReceiptExecution(binding, correlated ? { scopeDigest } : {});
      if (input.signal?.aborted) throw fault(409, 'effect_execution_cancelled');
      // Only the winner of this persisted CAS can issue the paid POST. Unknown
      // claim/write/create outcomes remain quarantined; no automatic retries.
      // Internal correlation is never taken from the caller's NEED/policy.
      const { g5Correlation: ignoredCorrelation, ...executionInput } = input;
      const correlation = correlated ? { version: 1, correlationId, scopeDigest } : null;
      const result = await adapter.execute({ ...executionInput, ...(correlation ? { g5Correlation: correlation } : {}) });
      if (correlated && (result?.metadata?.g5Correlation?.correlationId !== correlationId ||
          result.metadata.g5Correlation.scopeDigest !== scopeDigest))
        throw fault(409, 'g5_independent_receipt_mismatch');
      if (result?.metadata?.provider !== 'azure-openai' || result.metadata.providerStoredResponse !== true ||
          result.metadata.providerResponseStatus !== 'completed' || typeof result.output !== 'string')
        throw fault(409, 'effect_receipt_unverified');
      const value = receipt({ provider: 'azure-openai', responseId: result.metadata.providerRequestId,
        model: result.metadata.model, usage: result.metadata.usage, scopeDigest, outputDigest: sha256(result.output) });
      await ledger.captureEffectReceipt({ ...binding, executionToken, value });
      return { ...result, metadata: { ...result.metadata, providerReceiptDurablyCaptured: true } };
    },
    async recoverUnknownEffect({ need, node, signal } = {}) {
      if (!correlated) throw fault(503, 'g5_independent_witness_configuration_required');
      return recoverUnknownResponseFromWitness({ binding: bindingFor(need, node), scopeDigest,
        ledger, adapter, witnessVerifier, signal });
    },
    async recoverStoredEffect({ need, node, signal } = {}) {
      const binding = bindingFor(need, node);
      const saved = await ledger.getEffect(binding.id);
      if (!saved) throw fault(409, 'effect_intent_required');
      owner(saved, binding);
      if (!saved.effectReceipt) throw fault(409, 'effect_receipt_unknown');
      if (!['started', 'unknown', 'completed'].includes(saved.status)) throw fault(409, 'effect_receipt_terminal_conflict');
      const expected = receipt(saved.effectReceipt);
      if (expected.scopeDigest !== scopeDigest) throw fault(409, 'effect_receipt_scope_mismatch');
      const read = await adapter.retrieveResponseReceipt({ responseId: expected.responseId, signal });
      if (read?.responseRetrievedByGet !== true || read.provider !== 'azure-openai' || typeof read.output !== 'string')
        throw fault(409, 'effect_receipt_unverified');
      const actual = receipt({ provider: read.provider, responseId: read.providerResponseId, model: read.providerModel,
        usage: read.usage, scopeDigest, outputDigest: sha256(read.output) });
      if (!sameReceipt(actual, expected)) throw fault(409, 'effect_receipt_conflict');
      // Recheck authoritative identity after external IO; no automatic RESULT,
      // ACK, billing finalize, effect-status promotion, or external POST here.
      const latest = await ledger.getEffect(binding.id);
      owner(latest, binding);
      if (!['started', 'unknown', 'completed'].includes(latest.status) || !sameReceipt(latest.effectReceipt, expected))
        throw fault(409, 'effect_receipt_conflict');
      return { output: read.output, usage: actual.usage, providerResponseId: actual.responseId,
        effectStatus: latest.status, responseRetrievedByGet: true, receiptBoundToEffect: true,
        providerInvoiceVerified: false, accountingSettled: false, terminalDelivered: false };
    }
  };
}
