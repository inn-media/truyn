# G5 Cosmos operation deadline repair

Issue #990. Source repair only; no new wire freeze, cloud deployment, provider call or G5 final admission.

## Reproduced defect

The accepted ledger blob `7628b57297cc5b9a91d4783025cc8fb9dc4b97ba` (unchanged between main `8cd23898314fd3d96a4796b485935f812a59f2a1` and base `79dbb9a05cc5df4afbce4056461ef6d01849d638`) awaited `getAccessToken()` before starting its timeout. Token acquisition could remain pending indefinitely. Its later timer only aborted the fetch signal; a custom transport or response body that ignored that signal could also remain unresolved. An outer caller timeout did not prevent a late token from allowing a later storage request.

Twelve regressions execute the actual ledger with explicitly modelled Cosmos storage and HTTP. Before the repair: 2 PASS / 10 FAIL. After the repair: 12 PASS / 0 FAIL locally. This is not a live Azure two-host measurement or a provider charge count.

## Change

One monotonic deadline now covers token acquisition, headers and body for each storage API request. A promise deadline enforces return even when a callback ignores cancellation. Checks before and after each asynchronous stage prevent a late token from reaching storage after the deadline. Token errors remain sanitized `503 lifecycle_ledger_auth_unavailable`; storage/body timeouts are `503 lifecycle_ledger_unavailable`. Timeout is not treated as a confirmed failed write, missing document, empty outbox or permission to retry a CAS write. Redirects are refused.

`requestTimeoutMs` remains 10,000 ms by default and must be an integer in the supported native timer range 1..2,147,483,647, avoiding invalid/infinite/overflow coercion. The budget is per API request, not a new global latency claim for multi-request CAS retries or paginated scans. Timer cancellation cannot forcibly terminate arbitrary user callback code, and a remote service may already have committed a timed-out write. Its outcome must still be reconciled through immutable identity/CAS; there is no automatic replay or rollback.

## What the tests establish

- A hung or late credential does not permit a storage call after timeout.
- Headers and body share the remaining deadline; success clears the timer.
- Lost reservation/effect-create replies leave one stored identity; an independent client cannot acquire the effect again.
- Lost terminal-write replies preserve one RESULT outbox item and no second PUT on a completed request.
- A stalled outbox query fails rather than returning an empty queue; observed session headers survive a body timeout.

No ownership, receipt, signature, tombstone, outbox/ACK, cancellation, SDK, or provider billing acceptance is weakened. Full exact-head CI, five SDKs, security, CodeQL and post-merge qualification remain required. Live failure injection and independent external provider/accounting finality remain OPEN.
