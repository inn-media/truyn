# G5 Cosmos candidate: SDK execution boundary

**Not G5 PASS.** This text is a candidate conformance requirement, not a change to TRUYN/1 signed protocol bytes.

Five SDK language clients must never infer a committed effect from a successful network send, and must not auto-ACK a recovered signed event. For the future Cosmos-backed relay, admission must await an atomic shared NEED reservation and signed outbox persistence before any adapter dispatch. The provider must persist a shared intent before an external provider operation, and must reconcile unknown outcomes rather than blindly retry.

`createCosmosLifecycleLedger` exposes asynchronous reservations and ETag CAS; the existing synchronous relay remains **incompatible and intentionally not wired**. Its recipient-scoped delivery query and ACK are candidates pending live Azure, authentication, paging, region-failover and five-SDK negative qualification. A signed PARTIAL recorded in the outbox must remain recoverable even if the live recipient backpressures; no rollback of a remotely observable event.

No SDK release or mainnet admission is authorized by the candidate alone. Issue #990 remains OPEN until multi-host crash/partition/failover and external provider idempotency/reconciliation evidence is independently PASS.
