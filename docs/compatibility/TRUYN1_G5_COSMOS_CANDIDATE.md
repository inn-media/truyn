# TRUYN/1 G5: Public Cosmos shared-ledger candidate

**Acceptance state: NOT QUALIFIED / DO NOT DEPLOY.** Workstream: [#990](https://github.com/inn-media/truyn/issues/990).

This public, dependency-free storage adapter is an **async backend candidate**, not a safe drop-in for the current synchronous `createRelay({lifecycleLedger})` and not a production distributed G5 implementation. It is deliberately NOT wired into `runtime/service.js` or exposed for admission.

## Contract and isolation

- `network/relay/cosmos-lifecycle-ledger.js` uses Cosmos DB for NoSQL document REST API and a caller-supplied Microsoft Entra access token callback. No account key, emulator or connection string is accepted; no Azure resources are provisioned.
- Configure Cosmos partition key as `/partitionKey`; each NEED/OFFER/effect lives in a separate identity-derived partition. The primary-write-region CREATE reservation uniquely claims the ID; signed NEED outbox is inserted within the same document. Terminal CAS, PARTIAL sequence and ACK state use `If-Match` ETag of the same document. Competing CAS writers must retry against the latest row. Session reads alone do not grant mutual exclusion.
- Durable direct NEED binds requester, provider, canonical fingerprint, scope, policy digest and capability. No replay can become a new CREATE while the immutable tombstone remains. Same NEED ID re-submission returns `duplicate_request`; effect same-ID same-identity replay returns `acquired: false`; conflicting effect identity returns `effect_identity_conflict`. No automatic unknown-effect retry.
- Document and per-NEED outbox capacity are bounded and fail closed, and tombstones are never silently expired or recycled. Operators must plan fixed capacity and governed long-term retention; no automated pruning while replay horizon is open.
- The adapter provides bounded, recipient-scoped cross-partition `pendingDeliveries`, with persisted per-event ACK; caller-supplied recipient is NOT authentication by itself. The relay must authenticate the requester before calling it. The `rollbackPartial` operation deliberately **fails closed**: once a PARTIAL frame is durably recorded, it must be ACKed rather than rolled back after a delivery failure. Indexes and continuation/fairness need live acceptance before production.
- Provider-side intent is an at-most-one-invocation **gate** only. An opaque external provider might execute an effect yet lose its response. There is no proof of payment finality or exactly-once billing without provider idempotency keys, durable receipts and independent reconciliation before any retry.

## Automated tests and their limits

`node --test tests/g5-cosmos-distributed-ledger.test.js` checks two independent adapters using a deterministic emulated REST/ETag store. It covers concurrent CREATE, terminal CAS conflicts, cancellation, irreversible tombstones, ordered PARTIAL, ACK after new client construction, identity conflicts, provider effect intent and simulated network outage. This is **not a live multi-host SIGKILL/split-brain DR trial**, no external cloud writes, and no provider-paid-side-effect measurement.

## Remaining mandatory production gates

1. Integrate an asynchronous storage contract across **all** signed direct NEED, compact/legacy, PARTIAL, RESULT, REVOKE and reconnect HTTP/WebSocket entry paths. No async calls may be treated as successful synchronously, and no provider dispatch before reservation commit.
2. Implement bounded recipient recovery of signed NEED/PARTIAL/RESULT/REVOKE with ACK, terminal ordering, no outbox loss, backpressure and crash-safe replay, matching five SDK candidate semantics and wire-freeze bytes.
3. Create isolated Cosmos with verified `/partitionKey` and Microsoft Entra least-privilege RBAC, correct regional write semantics and replay retention. Validate retry/429/transport ambiguity and point-in-time restore.
4. Live 2+ independent hosts, kill -9 around all six failure windows, partition/heal/failover, no duplicate external provider effect. Capture immutable counts, source SHA, resource identifiers and cleanup evidence.
5. Use providers' true idempotency or reconcile external receipts/charges; do not equate a local intent with exactly-once remote side effect.
6. All transports/five SDK negative conformance, DCO, full CI, security/CodeQL, exact SHA postmerge and independent issue #990 reconciliation. Keep issue **OPEN** until every gate passes.
