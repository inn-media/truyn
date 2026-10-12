import { createHash, createPublicKey, verify } from 'node:crypto';

// Internal evidence format. This is NOT a sixth TRUYN signed envelope kind,
// not a vendor signature and not proof of a settled invoice.
export const G5_WITNESS_DOMAIN = 'TRUYN/G5/INDEPENDENT-RESPONSE-WITNESS/1\n';
export const G5_WITNESS_SCHEMA = 'truyn.g5.independent-response-witness/v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max;
export function witnessFault(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.publicCode = code;
  return error;
}
const reject = code => { throw witnessFault(409, code); };

export function executionCorrelation(binding, executionToken, scopeDigest) {
  if (![binding?.id, binding?.requester, binding?.provider, binding?.fingerprint, executionToken].every(v => text(v)) || !digest(scopeDigest))
    throw witnessFault(400, 'g5_correlation_binding_invalid');
  return hash(JSON.stringify(['TRUYN/G5/CORRELATION/1', binding.id, binding.requester,
    binding.provider, binding.fingerprint, executionToken, scopeDigest]));
}
function fields(object, expected) {
  return object && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).sort().join('|') === [...expected].sort().join('|');
}

// Fixed field order in a separate domain. No changes to TCJ1 or TRUYN wire bytes.
export function witnessSigningBytes(payload) {
  if (!fields(payload, ['schema', 'provider', 'correlationId', 'scopeDigest', 'responseId',
    'model', 'usage', 'outputDigest', 'observedAt', 'recordId', 'exportDigest']) ||
    payload.schema !== G5_WITNESS_SCHEMA || payload.provider !== 'azure-openai' ||
    !digest(payload.correlationId) || !digest(payload.scopeDigest) || !digest(payload.outputDigest) ||
    !digest(payload.exportDigest) || !/^resp_[a-zA-Z0-9_-]{1,200}$/.test(payload.responseId || '') ||
    !text(payload.model, 256) || !text(payload.recordId, 512) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(payload.observedAt || '') ||
    !Number.isFinite(Date.parse(payload.observedAt)) ||
    new Date(payload.observedAt).toISOString() !== payload.observedAt ||
    !fields(payload.usage, ['input_tokens', 'output_tokens', 'total_tokens']))
    reject('g5_witness_invalid');
  const u = payload.usage;
  if (!Object.values(u).every(v => Number.isSafeInteger(v) && v >= 0) ||
    !Number.isSafeInteger(u.input_tokens + u.output_tokens) ||
    u.input_tokens + u.output_tokens !== u.total_tokens) reject('g5_witness_usage_invalid');
  return Buffer.from(G5_WITNESS_DOMAIN + JSON.stringify([payload.schema, payload.provider,
    payload.correlationId, payload.scopeDigest, payload.responseId, payload.model,
    u.input_tokens, u.output_tokens, u.total_tokens, payload.outputDigest,
    payload.observedAt, payload.recordId, payload.exportDigest]), 'utf8');
}

export async function boundedWitnessIO(operation, { signal, timeoutMs = 10_000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw witnessFault(400, 'g5_witness_deadline_invalid');
  if (signal?.aborted) throw witnessFault(409, 'g5_witness_aborted');
  const controller = new AbortController();
  let timer, aborted;
  const deadline = new Promise((_, rejectPromise) => {
    aborted = () => { controller.abort(); rejectPromise(witnessFault(409, 'g5_witness_aborted')); };
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => {
      controller.abort(); rejectPromise(witnessFault(503, 'g5_witness_deadline_exceeded'));
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
}

export function createIndependentResponseWitnessVerifier({ lookup, trustedKeys, timeoutMs = 10_000, now = () => Date.now() } = {}) {
  if (typeof lookup !== 'function' || !trustedKeys || typeof now !== 'function' ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw witnessFault(503, 'g5_independent_witness_configuration_required');
  const keys = new Map();
  for (const [id, pem] of Object.entries(trustedKeys)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw witnessFault(503, 'g5_witness_key_invalid');
    let key;
    try { key = createPublicKey(pem); } catch { throw witnessFault(503, 'g5_witness_key_invalid'); }
    if (key.asymmetricKeyType !== 'ed25519') throw witnessFault(503, 'g5_witness_key_invalid');
    keys.set(id, key);
  }
  if (keys.size < 1 || keys.size > 8) throw witnessFault(503, 'g5_witness_key_invalid');
  return Object.freeze({
    version: 1,
    async lookupAndVerify({ correlationId, scopeDigest, claimedAt, signal } = {}) {
      if (!digest(correlationId) || !digest(scopeDigest) || !Number.isFinite(Date.parse(claimedAt)))
        reject('g5_witness_binding_invalid');
      const entries = await boundedWitnessIO(s => lookup({ correlationId, signal: s }), { signal, timeoutMs });
      if (!Array.isArray(entries) || entries.length > 16) reject('g5_witness_query_invalid');
      if (entries.length === 0) reject('g5_effect_remains_unknown');
      let selected, immutable;
      for (const entry of entries) {
        if (!fields(entry, ['keyId', 'payload', 'signature']) || !keys.has(entry.keyId) ||
          !text(entry.signature, 88)) reject('g5_witness_untrusted');
        const signature = Buffer.from(entry.signature, 'base64');
        if (signature.length !== 64 || signature.toString('base64') !== entry.signature)
          reject('g5_witness_untrusted');
        const bytes = witnessSigningBytes(entry.payload);
        if (!verify(null, bytes, keys.get(entry.keyId), signature)) reject('g5_witness_signature_invalid');
        const p = entry.payload;
        if (p.correlationId !== correlationId || p.scopeDigest !== scopeDigest) reject('g5_witness_binding_mismatch');
        const observed = Date.parse(p.observedAt);
        if (observed < Date.parse(claimedAt) - 30_000 || observed > now() + 30_000)
          reject('g5_witness_time_invalid');
        const current = JSON.stringify([p.responseId, p.model, p.usage.input_tokens,
          p.usage.output_tokens, p.usage.total_tokens, p.outputDigest]);
        if (immutable && immutable !== current) reject('g5_multiple_provider_outcomes');
        immutable = current;
        selected ||= { payload: structuredClone(p), keyId: entry.keyId,
          witnessDigest: hash(Buffer.concat([bytes, signature])) };
      }
      return selected;
    }
  });
}

export async function recoverUnknownResponseFromWitness({ binding, scopeDigest, ledger, adapter, witnessVerifier, signal, timeoutMs = 10_000 } = {}) {
  if (ledger?.kind !== 'cosmos-multi-host-v1' || typeof ledger.getEffect !== 'function' ||
    typeof ledger.captureEffectReceipt !== 'function' || typeof adapter?.retrieveResponseReceipt !== 'function' ||
    witnessVerifier?.version !== 1 || typeof witnessVerifier.lookupAndVerify !== 'function')
    throw witnessFault(503, 'g5_independent_witness_configuration_required');
  const saved = await boundedWitnessIO(() => ledger.getEffect(binding?.id), { signal, timeoutMs });
  validateRow(saved, binding, scopeDigest);
  // Do not substitute or overwrite a receipt captured by the normal path.
  if (saved.effectReceipt) throw witnessFault(409, 'g5_use_known_receipt_recovery');
  const claim = saved.receiptExecution;
  const found = await witnessVerifier.lookupAndVerify({ correlationId: claim.correlationId,
    scopeDigest, claimedAt: claim.claimedAt, signal });
  const expected = found.payload;
  const read = await boundedWitnessIO(s => adapter.retrieveResponseReceipt({ responseId: expected.responseId, signal: s }), { signal, timeoutMs });
  if (read?.responseRetrievedByGet !== true || read.provider !== 'azure-openai' ||
    read.providerResponseId !== expected.responseId || read.providerModel !== expected.model ||
    typeof read.output !== 'string' || hash(read.output) !== expected.outputDigest ||
    read.g5Correlation?.correlationId !== claim.correlationId ||
    read.g5Correlation?.scopeDigest !== scopeDigest || read.g5Correlation?.version !== 1 ||
    !['input_tokens', 'output_tokens', 'total_tokens'].every(k => read.usage?.[k] === expected.usage[k]))
    reject('g5_independent_receipt_mismatch');
  const latest = await boundedWitnessIO(() => ledger.getEffect(binding.id), { signal, timeoutMs });
  validateRow(latest, binding, scopeDigest);
  if (latest.receiptExecution.token !== claim.token) reject('g5_witness_binding_mismatch');
  if (signal?.aborted) throw witnessFault(409, 'g5_witness_aborted');
  // One immutable receipt in the SAME effect document. This is not a resend,
  // not a new effect, and not an accounting or terminal-state mutation.
  await boundedWitnessIO(() => ledger.captureEffectReceipt({ ...binding, executionToken: claim.token,
    value: { provider: 'azure-openai', responseId: expected.responseId, model: expected.model,
      usage: expected.usage, scopeDigest, outputDigest: expected.outputDigest }
  }), { signal, timeoutMs });
  // A timeout during the preceding CAS is ambiguous; caller must read, not retry POST.
  const committed = await boundedWitnessIO(() => ledger.getEffect(binding.id), { signal, timeoutMs });
  validateRow(committed, binding, scopeDigest);
  const r = committed.effectReceipt;
  if (r?.responseId !== expected.responseId || r.model !== expected.model || r.outputDigest !== expected.outputDigest ||
    r.scopeDigest !== scopeDigest || !['input_tokens', 'output_tokens', 'total_tokens'].every(k => r.usage?.[k] === expected.usage[k]))
    reject('g5_independent_receipt_mismatch');
  return { output: read.output, usage: structuredClone(expected.usage), providerResponseId: expected.responseId,
    receiptBoundToEffect: true, responseRetrievedByGet: true, witnessDigest: found.witnessDigest,
    witnessKeyId: found.keyId, effectStatus: committed.status, providerInvoiceVerified: false,
    accountingSettled: false, terminalDelivered: false, automaticallyRetryAllowed: false };
}

function validateRow(row, binding, scopeDigest) {
  if (!row || row.kind !== 'effect' || row.schemaVersion !== 1 || row.ttl !== -1 ||
    row.logicalId !== binding?.id || row.provider !== binding.provider || row.requester !== binding.requester ||
    row.fingerprint !== binding.fingerprint) reject('g5_effect_binding_mismatch');
  if (!['started', 'unknown', 'completed'].includes(row.status)) reject('g5_effect_terminal_conflict');
  if (!row.receiptExecution?.token || row.receiptExecution.scopeDigest !== scopeDigest ||
    row.receiptExecution.correlationId !== executionCorrelation(binding, row.receiptExecution.token, scopeDigest))
    reject('g5_effect_has_no_precommitted_correlation');
}
