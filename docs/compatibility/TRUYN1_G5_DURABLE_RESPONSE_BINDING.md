# G5: durable known-response binding and read-only recovery

Issue #990. **Implementation candidate, not G5 production admission or invoice finality.** Extends the known-ID GET from PR #1063. Signed TRUYN/1 messages, SDK release coordinates, public/private ownership and existing production configuration are unchanged.

## Runtime path

The provider runtime supplies the SAME configured Cosmos effect ledger to the existing `TruynAdapterHost` and `wrapRuntimeG5ReceiptAdapter`. Only an explicitly enabled Azure Responses provider uses the wrapper. Other providers and all historical default-off deployments retain their existing behavior.

```ini
TRUYN_G5_PROVIDER_EFFECT_LEDGER=cosmos
TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE=1
TRUYN_G5_AZURE_STORE_RESPONSES=1
TRUYN_G5_DURABLE_AZURE_RECEIPTS=1
```

These are operator opt-ins, NOT approval to change a live workload or retain private data with a vendor. Existing isolated Cosmos endpoint/database/container and Azure model configuration are still required. Enabling durable receipts without explicit Azure response storage or a shared Cosmos fence fails startup. Receipt-enabled CHAIN execution is rejected before upstream invocation; this profile is direct NEED only.

Sequence: authenticated direct NEED -> existing shared `beginEffect` -> existing billing authorization -> receipt execution claim CAS -> one provider POST -> bounded receipt capture CAS -> existing `finishEffect` -> existing internal billing settlement -> signed RESULT. The receipt claim and capture mutate the same effect document using ETag `If-Match`; they do not create a second effect or a second ledger namespace. Competing workers cannot obtain the same execution claim. Ambiguous writes are not automatically replayed. A failed read/auth/write never permits an unfenced upstream request.

## Persisted commitment

The existing immutable NEED ID, requester, provider identity and task fingerprint are checked on every receipt mutation and on recovery, before and after external GET. The document additionally retains one claim token and one bounded `effectReceipt`: response ID, returned model identifier, exact input/output/total token counts, hash of the configured Azure endpoint/deployment scope, and SHA-256 of the returned text. Plaintext prompt/output, credentials and endpoint names are not copied into that receipt. Model/response identifiers are operational metadata and are not to be published from live records.

All token counters must be non-negative safe integers and the input/output sum must equal the total. A receipt cannot be replaced by another response, model, output or usage tuple. Identical capture is idempotent. Capacity for the bounded receipt is reserved before the external invocation; permanent `ttl=-1` tombstones are retained. This does not yet solve global container retention/compaction or guarantee indefinite vendor-side response availability.

## Recovery after a worker loss

`wrappedAdapter.recoverStoredEffect({need, node, signal})` is an INTERNAL operator/provider API, not a new public HTTP endpoint and not an authentication bypass. The caller supplies the original authenticated NEED and provider identity. It reads the previously captured ID from the shared effect record, checks the endpoint/deployment scope, retrieves that exact ID using the existing Azure GET method, compares model, output digest and all three usage counters, then rechecks the authoritative effect binding.

Recovery performs no provider POST, signed terminal delivery, outbox ACK, billing finalize, refund, or effect-status promotion. It returns `receiptBoundToEffect:true` and explicitly `providerInvoiceVerified:false`, `accountingSettled:false`, `terminalDelivered:false`. These flags describe what this recovery operation establishes, not a claim that an independently reconciled accounting record cannot exist elsewhere. Even a successfully recovered response leaves an `unknown` effect status unchanged until the independent terminal/accounting reconciliation is implemented and accepted.

If the worker dies after the remote operation but BEFORE its response ID is durably captured, the receipt remains UNKNOWN. No receipt is fabricated from a request ID; no repeated create POST is allowed. Missing/deleted provider responses and mismatches fail closed. The existing separate signed RESULT/outbox recovery remains mandatory.

## Executable evidence and limitations

`tests/g5-durable-response-receipt.test.js` covers two-client CAS rivalry, exact owner/task/scope binding, lost claim/capture replies, missing response ID, explicit opt-in, immutable receipt conflicts, corrupt usage, bounded storage deadlines and capacity. `tests/g5-receipt-runtime-integration.test.js` exercises the actual runtime ledger factory, Azure adapter and provider host: receipt persistence before settlement/RESULT, restart after RESULT transport failure, and ambiguous upstream response with no resend/refund. Cosmos and Azure HTTP in these suites are explicitly simulated; test counters are NOT vendor charges or live cross-host evidence.

The original #990 remaining gates are unchanged: independently isolated live hosts and shared private data-plane RBAC; SIGKILL/partition/heal/write-region failover/PITR; globally durable OFFER authority; authenticated five-SDK fault conformance; global bounded retention; vendor-authoritative effect/charge verification and at-most-one accounting mutation; independent exact-main final evidence. Default-off integration and green mock tests do not authorize production activation.

## Primary interface references

- Azure Responses retrieval by ID: https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses
- Azure Responses storage and retrieval guide: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses

GET-by-ID is response retrieval, not a documented guarantee of idempotent create POST or vendor invoice settlement.
