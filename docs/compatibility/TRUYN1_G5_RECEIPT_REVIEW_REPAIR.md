# G5 receipt review corrections (PR #1067, issue #990)

This is a source correction, not live G5 admission. The three review findings are executable regressions in `tests/g5-receipt-review-regressions.test.js`.

1. Same-container Cosmos receipt writes now share the lifecycle ledger's internal session state in both directions. A write watermark is observed before reading the response body, so claim/capture/body ambiguity does not silently lose read-your-write state before host completion. A mismatched container or absent shared-session interface is rejected. This internal interface does not grant cloud credentials or add a public endpoint.
2. Azure execution metadata retains `providerResponseStatus`. The explicit durable-receipt profile requires `completed`; HTTP 200 plus partial output/usage is insufficient. Failed, incomplete, pending, cancelled or missing status never becomes a verified successful receipt, internal settlement or successful RESULT. Existing default-off deployments are unchanged.
3. Adapter validation preserves only the optional bound `recoverStoredEffect` method. `TruynAdapterHost.recoverStoredEffect({need, signal})` is the explicit internal entrypoint: it checks the host's existing access policy and capability, fixes the provider identity to `this.node`, and delegates GET-only receipt recovery. It never authorizes another provider POST, finalizes billing, sends RESULT, ACKs an outbox item, or promotes UNKNOWN. No public recovery route is introduced.

The local regression run uses actual storage/receipt/adapter/host source with modelled Cosmos lag and Azure HTTP; it is not a live cloud test or a substitute for hosted five-SDK/crypto qualification. Original receipt negatives remain intact. Full exact-head CI, DCO/security, seven hosted CodeQL analyzers and post-merge main qualification are still required.

An external effect whose response ID was never durably captured remains UNKNOWN. The correction does not invent provider idempotency, a receipt, or invoice/accounting finality. The separate #990 live infrastructure, OFFER directory, retention and external reconciliation gates remain open.
