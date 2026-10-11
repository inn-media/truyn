# TRUYN/1 Direct Work Lifecycle — Release-Candidate State Machine

**Status:** normative *candidate*, scoped to the existing signed `OFFER → NEED → PARTIAL/RESULT → REVOKE` runtime. This document does **not** declare stable TRUYN/1, durable exactly-once, an accepted G5, or a production/mainnet admission.

This profile preserves the five existing signed JSON envelope types (`IDENTITY | OFFER | NEED | RESULT | REVOKE`). `PARTIAL` remains a **signed compact streaming record**, not a sixth top-level type. No change to Ed25519/TCJ1, compact `{t,i,s}`, released SDK wire bytes, or negotiated optional extensions is implied. An offer never conveys provider authorization.

## State and identity model

| Subject | Valid states | Legal transitions | Forbidden transitions |
| --- | --- | --- | --- |
| `OFFER` | active, revoked | publish → active → revoked | revoked → active under the same offer ID; a revoked offer must not become discoverable |
| direct `NEED` | matched, completed, cancelled, failed | accepted → matched → exactly one of completed/cancelled/failed | any terminal → matched, terminal → another terminal; late result revival |
| `PARTIAL` | accepted ordered records on matched NEED | sequence 0,1,2... followed by one RESULT | partial on terminal/foreign/unknown request; gap, conflicting duplicate, terminal reopening |
| `RESULT` | one commit for one matched NEED | matched → completed | second terminal delivery/accounting/statistics increment |
| `REVOKE` (need) | cancellation command | requester-authorized matched → cancelled; identical repeated cancellation is idempotent | non-owner cancellation; completed/failed → cancelled |
| `REVOKE` (offer) | withdrawal command | provider-authorized active → revoked | non-owner withdrawal; retroactive cancellation of prior accepted NEEDs |

An `OFFER` may be revoked while a previously accepted NEED is running. Revocation removes future discovery/eligibility but does not retroactively alter already-accepted request identity or outcome. A failed or cancelled `NEED` does not become eligible for a fresh RESULT. The relay may redeliver an already-authorized cancellation *notification* without undoing terminality or creating provider execution.

## Correlation, replay, delivery and authority

1. The **logical direct request ID** is `NEED` signed Envelope `id`, or compact signed frame `i` on the accepted compact path. `RESULT.requestId` / compact `RESULT.i`, `PARTIAL.i` and `REVOKE.targetId` must bind to that same accepted request.
2. A direct request ID is **single-use across both legacy HTTP and compact paths**, even when the second submission differs in payload, transport, session or signer. Different signed contents must not be silently treated as a new work item with an existing ID. A duplicate is rejected, not re-executed.
3. Requester identity is bound by the signed NEED and authenticated relay session. The selected provider identity is bound to the matched request. A forged requester/provider, wrong signature, mismatched request ID or unsupported required semantic cannot obtain or mutate request authority.
4. Within the bounded signed compact profile, `PARTIAL` begins at sequence 0 and increments by one. A retry of the **last** accepted identical frame may be acknowledged idempotently without second delivery; a conflicting retry or sequence gap is rejected. Backpressure must not advance sequence.
5. A single accepted `RESULT` transitions a matched request to `completed`. Subsequent RESULT/PARTIAL attempts are rejected **before** delivery, accounting or state mutation. After accepted `REVOKE` the same holds for late output. The provider may receive an abort signal; termination of an external provider workload is cooperative and not an absolute guarantee.
6. `REVOKE(targetKind=need)` is authorized only for the original signed requester; `REVOKE(targetKind=offer)` only for its provider/authorized owner. An ambiguous omitted namespace fails closed. Targeting arbitrary chain stages is outside this profile.

## Reference relay idempotency boundary

The current `network/relay/server.js` stores request detail in memory and may prune detailed terminal records under `maxRequests` pressure. To prevent re-accepting an old direct ID *after detail pruning*, the reference implementation keeps a separate in-process `seenNeedIds` guard spanning both direct transports. The guard is bounded by `maxSeenNeedIds` (default 262144); exhaustion returns HTTP 503 `need_idempotency_capacity_reached` **without dispatch**. Known duplicate IDs return 409 `duplicate_request`, including after client re-registration.

**This is an at-most-once *relay admission/dispatch* safety invariant within a single uninterrupted relay epoch. It is not a blanket exactly-once provider side-effect or durable multi-process guarantee.** The in-memory guard is lost on relay restart, is not coordinated across multiple relay replicas, and cannot atomically commit remote provider work. Do not advertise exactly-once across restart/replicas, guaranteed execution, or stable-v1 until a durable keyed ledger and provider-side idempotent/transactional execution protocol are both implemented and qualified. Do not solve bounded-capacity exhaustion by dropping replay tombstones silently.

A production-grade durable successor must atomically reserve a logical request ID before any dispatch; persist issuer, signed-content fingerprint, selected provider, terminal status and delivered outcome; retain dedup information for the published validity horizon; serialize concurrent admission across replicas; fence stale dispatchers; and recover ambiguous provider completion by reconciliation **before any resend**. The invariant requires restart, replica failover and crash-injection tests against actual durable state.

## Error/fail-closed matrix (reference behavior)

| Condition | Result |
| --- | --- |
| Existing direct ID (active or terminal), same or different transport | `409 duplicate_request`; no second work |
| Accepted ID lost from request detail map but retained in in-process guard | `409 duplicate_request` |
| Direct ID guard capacity exhausted | `503 need_idempotency_capacity_reached`; no work |
| Terminal completed / cancelled / failed RESULT or PARTIAL | `409 request_already_completed` / `request_cancelled` / `request_failed` |
| Invalid PARTIAL sequence / conflicting duplicate | `409 partial_sequence_mismatch`; no state advance |
| Unauthorized provider / cancellation issuer | `403 provider_mismatch` / `not_request_owner` |
| Unavailable required semantics | `version_mismatch`; no side effects |

## Conformance and closure boundary

The executable targeted regression is `tests/lifecycle-freeze-g5-replay.test.js`. Existing `tests/dx3-runtime-lifecycle.test.js`, `tests/dx3-runtime-hardening.test.js`, `tests/relay-result-replay-c8.test.js`, signed wire-freeze tests, five-language conformance and published-alpha old/new interop remain mandatory; one new test alone cannot prove the full gate. The accepted release requires **one exact SHA** with targeted + full CI, DCO, hosted CodeQL/security, five-SDK tests, true cross-transport and restart/replica/durable-side-effect negatives, and post-merge requalification. Each change invalidates old exact-head qualifications.

**G5 remains OPEN** until independent qualified evidence covers the entire agreed scope. The above is a precise bounded RC semantic contract and an in-process safety repair, not permission to mark overall TRUYN/1 stable.
