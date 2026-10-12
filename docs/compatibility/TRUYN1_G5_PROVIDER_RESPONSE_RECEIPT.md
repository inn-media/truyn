# G5: Azure Responses receipt readback (bounded; #990 still OPEN)

**This is not G5 exactly-once acceptance.** The readback operation is a **GET** for a previously known ID, not remote POST idempotency or reconciliation of vendor invoices. No live model calls, credentials, deployments or accounting mutations are introduced by this source patch.

## Opt-in and privacy

The Azure OpenAI adapter continues to send `store: false` by default. Only a specifically authorized isolated G5 workload may opt in using `TRUYN_G5_AZURE_STORE_RESPONSES=1` (or the explicit `persistResponses: true` adapter option). This changes Azure-side response retention and requires separate data-governance approval for the input; do not enable it on an existing production workload by inference.

A successfully completed POST returns `metadata.providerRequestId` and `metadata.providerStoredResponse`. After that ID has been **durably captured**, `provider.retrieveResponseReceipt({responseId})` performs `GET /openai/v1/responses/{responseId}` with the configured credential, verifies the exact ID, completion status, model and non-negative safe-integer total token count, and returns the provider output/usage with `responseRetrievedByGet: true`.

It **never retries the POST**. Invalid IDs, missing consent, mismatched/incomplete/invalid provider response, and GET failures fail closed. Response output can be sensitive; do not log or publish it.

## Remaining decisive uncertainty

A process may crash **after the external provider executes** but **before the response ID is received and recorded**. Azure Responses API does not provide an independently documented, guaranteed exactly-once `POST` deduplication key for this case. Neither `X-Client-Request-Id` nor the returned response ID supplies such a guarantee on its own. The state MUST remain `unknown`, must not be automatically resent, and cannot be accounted as a verified completed or refunded transaction.

The readback proves a known model response can be retrieved, **not** external invoice/charge settlement. Production G5 finality additionally requires durable receipt binding to immutable NEED fingerprint, at-most-one authorized accounting/usage CAS, authoritative vendor charge reconciliation, the crash matrix, and isolated cross-host evidence. See [issue #990](https://github.com/inn-media/truyn/issues/990).

No changes to signed TRUYN/1 envelope kinds, TCJ1 bytes or prerelease SDK artifacts.
