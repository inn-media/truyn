# G5 recovered RESULT and operational usage finality

Related work: issue #990. **Implementation candidate; no live Azure qualification or vendor financial finality.** No new wire freeze, production flag activation, cloud controller or private-platform dependency is introduced.

## Implemented operation

`createRuntimeG5RecoveredResultFinalizer` supplies the explicit provider-host method `finalizeRecoveredResult({need, signal})`. The service wires it only when `TRUYN_G5_RECOVERED_RESULT_FINALITY=1`, existing durable Azure receipts and response storage are also enabled, and billing mode is public `owner-funded` or `byok`. It does not run automatically, create a public recovery endpoint, authorize billing, or send another provider POST. Ordinary provider execution is unchanged and the flag is default off.

The operation requires the original signed **legacy direct NEED**. The authorized provider host, retained signed request, original wire fingerprint, requester, selected provider and owner scope must agree. Compact and CHAIN are rejected; coverage for those modes is still separately required by #990. Access is checked before recovery and again after external GET. Known-response recovery verifies the stored response ID, scope, model, output digest and exact usage through the accepted receipt wrapper. Missing IDs must first be reconciled through the separately reviewed witness path; no successful outcome is fabricated.

The storage method `commitRecoveredResult` rechecks the immutable effect receipt and request binding, verifies the signed RESULT, and places `recoveredUsage`, the terminal NEED state and one signed RESULT outbox item in the **same NEED document**, using the existing ETag compare-and-swap request path. It retains session watermarks, `ttl=-1`, limits and capacity failure behavior. The record is immutable operational token usage, not a currency balance, invoice, quota debit or vendor charge.

There is no atomic transaction spanning the effect and NEED partitions. The receipt is read as an immutable commitment, not mutated; the single-document write is the boundary claimed here. Deployment still requires independent proof of the supported single-writer Cosmos authority; multi-region multi-writer conflict behavior is not admitted by this source test.

## Recovery and concurrency

A captured receipt timestamp and request-derived RESULT ID make rival finalizers produce identical signed bytes. Competing calls may encounter ETag conflicts but exactly one successful NEED mutation creates usage and RESULT. If the write succeeds and its reply is lost, a fresh authorized call reads the completed document and returns idempotently without a second PUT. A completed replay does not require another vendor GET, so already-durable RESULT recovery does not depend on continued vendor response retention. ACKed outbox items remain ACKed; replay never requeues them.

Cancellation that wins the NEED CAS prevents completion. Existing failed/cancelled state, conflicting completed results, changed receipts, forged signatures or accounting claims, different owners/providers/scopes and exhausted capacity fail closed. This operation does not backfill a legacy completed request lacking its own usage commitment. Such a case requires separate reconciliation rather than retroactively claiming a prior charge or delivery.

A monotonic invocation deadline bounds policy, provider read and storage stages. The deadline signal is checked inside the storage request path before invoking a late request. Aborting after a PUT has reached Cosmos is ambiguous, not rollback: the committed record must be read to determine the result. Arbitrary callbacks cannot be forcibly terminated. No automatic repeat POST, refund or effect-status promotion follows timeout.

## Explicit non-claims

- `providerInvoiceVerified=false`, `accountingSettled=false` and `vendorChargeVerified=false` are intentional. No financial amount, settled invoice or external payment mutation is inferred from token counts.
- `resultQueued` reports whether the durable outbox item remains unacknowledged; `terminalDelivered=false` says this operation did not transmit or acknowledge it. Normal authenticated polling/ACK delivery remains responsible for that.
- Effect status is not promoted. An `unknown` record with a verified immutable receipt may supply a recovered RESULT, while its external financial outcome remains unresolved. An unknown record **without** verified evidence remains blocked.
- Existing production workloads, Cosmos resources and provider settings are not changed. No two-host cloud execution, network partition, failover/PITR, full transport/SDK live conformance, retention/compaction closure or G5 COMPLETE is claimed.

## Evidence

`tests/g5-recovered-result-finality.test.js` exercises the actual Cosmos adapter, receipt wrapper, Azure provider adapter and provider host against explicitly modelled Cosmos/Azure HTTP: 24 rival clients, lost commit reply, fresh-client and ACK recovery, original signatures and scope, cancellation during GET and at CAS, immutable usage, absent ID, provider expiry, hung GET, capacity and false monetary metadata. These are not live cloud measurements or vendor billing counters. Require exact-head hosted full CI, five SDKs, DCO/security, CodeQL and independent postmerge qualification before source acceptance.

Primary storage contract: https://learn.microsoft.com/azure/cosmos-db/nosql/database-transactions-optimistic-concurrency . ETag protects the single-document conditional update; it is not vendor-side idempotency.
