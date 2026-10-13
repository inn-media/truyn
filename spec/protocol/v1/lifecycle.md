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
2. A direct request ID is **single-use across legacy HTTP, compact and direct QUIC paths**, even when the second submission differs in payload, transport, session or signer. Different signed contents must not be silently treated as a new work item with an existing ID. A duplicate is rejected, not re-executed. All replicas/transports in one admission domain MUST use the same authoritative ledger namespace; independent ledgers do not establish this invariant.
3. Requester identity is bound by the signed NEED and authenticated relay session. The selected provider identity is bound to the matched request. A forged requester/provider, wrong signature, mismatched request ID or unsupported required semantic cannot obtain or mutate request authority.
4. Within the bounded signed compact profile, `PARTIAL` begins at sequence 0 and increments by one. A retry of the **last** accepted identical frame may be acknowledged idempotently without second delivery; a conflicting retry or sequence gap is rejected. Backpressure must not advance sequence.
5. A single accepted `RESULT` transitions a matched request to `completed`. Subsequent RESULT/PARTIAL attempts are rejected **before** delivery, accounting or state mutation. After accepted `REVOKE` the same holds for late output. The provider may receive an abort signal; termination of an external provider workload is cooperative and not an absolute guarantee.
6. `REVOKE(targetKind=need)` is authorized only for the original signed requester; `REVOKE(targetKind=offer)` only for its provider/authorized owner. An ambiguous omitted namespace fails closed. Targeting arbitrary chain stages is outside this profile.

## Frozen admission window and replay retention

These are receiver admission rules. They do not change TCJ1, signed bytes, the five envelope types or the ability to verify historical signatures.

| Surface | First admission | Replay retention |
| --- | --- | --- |
| Signed `IDENTITY` registration | `now - 300000ms <= createdAt <= now + 30000ms` (existing profile) | Registration replay marker covers its entire freshness window |
| Signed direct `NEED`, HTTP and QUIC | `now - 300000ms <= createdAt <= now + 30000ms`, inclusive, checked after authentication and again at admission | Accepted ID is permanently consumed in the ledger namespace, including after its timestamp expires |
| Compact signed `NEED` | Valid compact signature and current authenticated session; the unchanged compact wire has no signed `createdAt` and claims no creation-age proof | Same permanent logical-ID namespace as HTTP/QUIC; session expiry/reconnect never resets it |
| QUIC HELLO | Existing signed `issuedAt` skew of at most 30000ms in either direction | Nonce/session replay protection is additional to NEED ID reservation |
| PARTIAL / RESULT / REVOKE | Authority and correlated lifecycle state, not the original NEED's admission clock | Original terminal state and replay tombstone remain authoritative |

An old/future first signed NEED returns `400 need_outside_acceptance_window` on HTTP (the same error token on QUIC), before reservation/dispatch. A known accepted ID returns `duplicate_request`; re-signing its timestamp does not authorize another execution. This window limits **first admission**, not execution duration or RESULT retention. Queueing does not grant extra acceptance time. A compact sender cannot claim an unsigned timestamp as authority. Adding compact creation-age proof requires a separately negotiated wire extension.

NEED/effect/OFFER tombstones have no automatic time expiry or LRU eviction. Cosmos records use `ttl=-1`; SQLite keys remain until the entire admission namespace is deliberately retired. Payload compaction cannot remove the ID, signer/provider binding, fingerprint or terminal state. A restored older snapshot is not safe to resume dispatch until reconciled against all newer accepted IDs/effects. Capacity exhaustion and storage uncertainty fail closed. The admission window is never a tombstone garbage-collection horizon.

## Reference runtime idempotency boundary

Without a `lifecycleLedger`, `network/relay/server.js` retains a bounded in-process `seenNeedIds` guard after terminal-detail pruning. QUIC now reserves NEED IDs before calling its envelope handler, across every stream and connection. Both guards default to 262144 IDs and reject exhaustion with `need_idempotency_capacity_reached` before dispatch. They never silently evict IDs. QUIC errors use the same tokens as the HTTP 409 duplicate / 503 capacity responses.

**This is an at-most-once *relay admission/dispatch* safety invariant within a single uninterrupted relay epoch. It is not a blanket exactly-once provider side-effect or durable multi-process guarantee.** The in-memory guard is lost on relay restart, is not coordinated across multiple relay replicas, and cannot atomically commit remote provider work. Do not advertise exactly-once across restart/replicas, guaranteed execution, or stable-v1 until a durable keyed ledger and provider-side idempotent/transactional execution protocol are both implemented and qualified. Do not solve bounded-capacity exhaustion by dropping replay tombstones silently.

The existing SQLite and Cosmos `lifecycleLedger` adapters can be passed to the relay and to `TruynQuicTransport` / `TruynNetworkNode`. Their atomic `reserveNeed` precedes handler dispatch, including asynchronous Cosmos CAS. Use one shared authoritative namespace for all transports. SQLite coordinates independent processes on one durable local disk only; Cosmos is the candidate for independent hosts. A QUIC handler response is not itself a signed RESULT or a terminal/accounting commit. Handler errors, lost responses and process death never release the reservation. Work may remain unexecuted if the process dies before its first effect: this is at-most-once dispatch safety, not guaranteed exactly-once completion.

The legacy `workInboxPath` implements **at-least-once recovery** and is rejected when combined with `lifecycleLedger`; it must not replay ambiguous pending work behind a durable reservation. Provider-side effect fencing, terminal CAS, signed result/outbox recovery and independently verified outcome reconciliation remain required. Actual multi-host fault/restore qualification is tracked in issue #990 and is not replaced by local SQLite or modeled Cosmos evidence.

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

Targeted regressions include `tests/lifecycle-freeze-g5-replay.test.js`, `tests/g5-need-acceptance-window.test.js` and `tests/g5-quic-need-replay.test.js` (real QUIC, SQLite reopen, two replicas, actual child SIGKILL before/after a counted local effect, modeled Cosmos partition). The five-native-SDK lifecycle harness includes admission-window boundaries on each SDK's signed bytes plus durable replica/reopen replay negatives for published/source pairs. These are explicitly local tests, not live Azure qualification. Existing `tests/dx3-runtime-lifecycle.test.js`, `tests/dx3-runtime-hardening.test.js`, `tests/relay-result-replay-c8.test.js`, signed wire-freeze tests, five-language conformance and published-alpha old/new interop remain mandatory. The accepted release requires **one exact SHA** with targeted + full CI, DCO, hosted CodeQL/security, five-SDK tests, true cross-transport and restart/replica/durable-side-effect negatives, and post-merge requalification. Each change invalidates old exact-head qualifications.

**G5 remains OPEN** until independent qualified evidence covers the entire agreed scope. The above is a precise bounded RC semantic contract and an in-process safety repair, not permission to mark overall TRUYN/1 stable.
