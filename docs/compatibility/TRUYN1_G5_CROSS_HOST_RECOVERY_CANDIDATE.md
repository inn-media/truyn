# G5 cross-host signed terminal/stream handoff candidate

**Gate status: OPEN, NOT production acceptance.** Issue #990.

A provider with the same cryptographic identity can reconnect to another registered relay while its originally signed direct NEED exists only in the shared Cosmos ledger. The recovering relay now accepts signed direct `PARTIAL` and `RESULT` frames (both compact and legacy RESULT) with no local request object, provided that:

- The provider is authenticated on the recovering relay and its signature verifies using the registered public key.
- The immutable shared NEED exists in `matched` state and binds that exact provider identity and transport mode.
- The Cosmos single-document CAS commits the monotonic PARTIAL (with signed outbox row) or terminal RESULT (with signed outbox row) **before** returning HTTP success.
- Any rival terminal, cancelled request, late PARTIAL, changed same-sequence payload or conflicting owner fails closed. No new NEED is dispatched; no usage is settled by this recovery bridge.
- The requester authenticates again to a relay and explicitly fetches/verifies/persists and ACKs its signed pending outbox events.

The recovery bridge is intentionally limited to `cosmos-multi-host-v1`: single-host SQLite and chains do not gain cross-host semantics. It does NOT reconstruct the prior synchronous HTTP waiter, execute a provider call, make signed OFFERs available to new relays, or guarantee provider receipt/financial settlement. A completely failed provider with an ambiguous external call still requires independent provider reconciliation. This simulated two-relay E2E is not a live network partition, regional failover, or real SIGKILL drill.

Postmerge G5 acceptance additionally requires live shared resources and crash/partition/heal with immutable provider effect counts, a safe durable OFFER directory and global retention/compaction, and validated external idempotency/receipts. The unchanged five signed kinds and TCJ1/wire freeze must remain qualified.
