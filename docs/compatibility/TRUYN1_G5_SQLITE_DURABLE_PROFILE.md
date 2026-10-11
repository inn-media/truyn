# G5 durable lifecycle ledger — SQLite single-host profile

**Status: implementation candidate / not G5 production admission.** This is a narrowly scoped durable safety upgrade to the public direct TRUYN/1 lifecycle, not a change to the five canonical signed envelope types or compact PARTIAL wire bytes.

## Using the adapter

Create `const ledger = createSqliteLifecycleLedger({ filePath: '/var/lib/truyn/lifecycle.sqlite', maxRecords: 262144 })` from `network/relay/durable-lifecycle-ledger.js` and pass it to `createRelay({ ..., lifecycleLedger: ledger })`. The database path MUST be on a locally durable disk, backed up safely. The SQLite adapter uses `BEGIN IMMEDIATE`, primary-key uniqueness, `synchronous=FULL` and WAL. It serializes competing Node.js processes that open **the same local file on the same host**. It does **not** coordinate replicas on different hosts or safely support a shared NFS SQLite WAL.

Without `lifecycleLedger`, the existing in-memory local-developer relay behavior remains unchanged for backward compatibility. **A deployment that omits shared durable storage MUST NOT advertise durable G5.**

The provider-side `TruynAdapterHost` accepts optional `effectLedger`, an adapter exposing `beginEffect`/`finishEffect`. Supply the same ledger or a mutually consistent ledger shared by provider workers. The effect fence writes an intent **before** billing authorization or external `adapter.execute`, and a duplicate direct request will not execute or bill again from that host. A collision on the same effect ID with a different original requester, provider or signed work fingerprint is a fail-closed 409 `effect_identity_conflict`, even after a restart. A crash or unconfirmed external effect leaves an ambiguous intent (or `unknown`), which cannot be retried blindly. Reconciliation with the external provider is mandatory before declaring an outcome. External providers that expose an idempotency key or transaction/outbox should participate using the same canonical request ID; a generic irreversible provider side effect cannot be made truly exactly-once by network retries alone.

## CLI usage (explicit local-only opt-in)

```sh
truyn relay --host 127.0.0.1 --port 8787 --lifecycle-sqlite /var/lib/truyn/lifecycle.sqlite
truyn provider --relay http://127.0.0.1:8787 --effect-sqlite /var/lib/truyn/lifecycle.sqlite
```

The directory must exist and be writable by the service identity. Back up database + WAL consistently; never mount SQLite WAL through an unsupported network filesystem. These switches do not make a multi-host production runtime safe or turn on production admission.

Authenticated `GET /v1/lifecycle/needs/{id}` returns only request status to the original requester or matched provider. `GET /v1/lifecycle/effects/{id}` returns the provider's persisted intent status only to that provider. Neither endpoint exposes request inputs, raw fingerprints or a bypass for signed NEED/RESULT/REVOKE authorization. A `started` or `unknown` effect requires explicit reconciliation; a bare restart never authorizes a fresh paid execution.

## State semantics

- Direct `NEED` reservation is global within a SQLite file. Issuer, selected provider, capability, mode and hash of the signed representation are recorded atomically. Legacy and compact routes share the same key namespace.
- Admission after a relay restart or another process with the same ledger returns `409 duplicate_request` even if the old in-memory detail has been pruned.
- Terminal `completed/cancelled/failed` transitions are compare-and-set from `matched`, never reversible. Provider and requester authority is bound by durable identity columns.
- Signed `OFFER` ID is never reusable after revocation, even following a restart. Strict cross-transport in-memory compatibility remains.
- `PARTIAL` advances zero-based sequence by durable CAS after signature/provider validation. Backpressure before any delivery reverses an unobserved increment.
- `GET /v1/requests/{id}` and `GET /v1/fast/requests/{id}` can return owner-authenticated persisted status after a local relay restart; a result body is **not** assumed recoverable merely because a terminal state is durable.
- Missing in-memory runtime context after restart is **fail-closed** for late RESULT/PARTIAL: `request_recovery_required` or a deterministic terminal rejection. No implicit re-dispatch.
- `maxRecords` is a hard cap on reserved direct IDs, with 503 fail-closed on exhaustion. Entries are **not** silently deleted at arbitrary age, because that would re-enable replay. The retention horizon and immutable archival policy must be admitted separately.
- The SQLite database is the durable state ledger, **not** a durable delivery queue, shared session/offer registry or atomic provider transaction. A power failure between terminal commit and result delivery may require independent result reconciliation.

## Explicit G5 blockers not solved by this bounded adapter

1. Distributed consensus/CAS across **separate hosts / shared control plane**. NFS cannot be substituted for it. A production-capable shared durable backend (e.g. a properly qualified transactional database) and split-brain tests remain required.
2. Atomic provider remote side effect/outcome and financial settlement reconciliation across death/partition. This implementation fences repeated invocation but cannot force an opaque non-idempotent external API to provide exactly-once outcomes.
3. Durable event outbox, delivery acknowledgment, ownership/session migration, capacity and retention policy under multi-replica failover.
4. Kill -9, shared-DB replica race, outage, partition/heal and five-SDK conformance at one exact release SHA, plus independent post-merge tests and immutable evidence.

This file is additive to `spec/protocol/v1/lifecycle.md` and the existing P6–P9 state machine. **Keep #990 and G5 OPEN until all external distributed gates above are proven.**
