# TRUYN/1 Paid NEED — shared durable spend boundary (candidate)

**Status: source candidate only. NOT production PASS, NOT G5 PASS, NOT vendor invoice reconciliation.** No paid AI generation is authorized by this document.

## Security invariant

On the first-party cloud provider runtime, every paid `NEED` MUST have:

1. An authenticated requester identity and a relay-selected provider with a server-injected **durable grant authority**. The authority cannot originate in the signed OFFER, requester policy, arbitrary SDK field, or env allowlist.
2. A confirmed `truyn.paid.need/1` authorization co-committed with the unique `NEED` record in **shared Cosmos** (`getNeed/reserveNeed`), binding immutable `requesterNodeId`, `providerNodeId`, `capability`, `payerNodeId`, `authorityRevision`, and optional `grantId`. Payer is provider-owner for the open owner-funded/BYOK modes. This identifies economic responsibility; no vendor invoice or dollar value is claimed.
3. A provider-side independent read of that exact shared record, with provider identity supplied by the running node, NOT the incoming message. The provider also applies its own independent requester access and billing policy.
4. A provider effect intent created atomically by `beginEffect` in the same shared Cosmos namespace before any external call. Existing committed/unknown intent is never automatically executed again, even after worker restart or competing replica.
5. A second durable authorization read immediately before `adapter.execute`. Any unconfirmed, missing, inconsistent, expired or unavailable ledger state halts the execution.

The production entrypoint refuses to start billable providers without Cosmos `getNeed`, `beginEffect`, `finishEffect`; public/production relay refuses to start paid dispatch without the shared Cosmos lifecycle ledger. Direct legacy HTTP and compact HTTP NEEDs share the same admission. A foreign requester receives `403 paid_need_denied` (private discovery remains filtered). Signed `CHAIN` is currently explicitly denied in strict mode: per-stage paid reservations must be implemented before activating paid multi-stage chains. No success can be declared by bypassing the chain boundary.

## Deploy / migration constraints

- Relay and provider MUST point to the **same Cosmos account/database/container**, with session consistency and independent managed identities having appropriately scoped rights.
- Configure `TRUYN_G5_RELAY_LIFECYCLE_LEDGER=cosmos`, `TRUYN_G5_PROVIDER_EFFECT_LEDGER=cosmos`, their existing shared `TRUYN_G5_COSMOS_*` connection settings, and the independent server-side durable provider grant authority. Missing components intentionally result in unavailable/rejected workloads, not silent fallback.
- Release across **all replicas together** behind an explicit maintenance/admission barrier. Do not deploy strict provider first while relays still dispatch without paid grants; that causes deliberate fail-closed denials.
- Protect Cosmos against deletion, TTL expiry, container recreation and incorrect partition key. Need/effect ID tombstones MUST outlive the replay threat, with bounded-capacity admission failure instead of recycling unproven identities.
- Tokens consumed by a provider are not equivalent to financial settlement. Actual provider usage, pricing, adjustments, budgets, refund/reconciliation, downstream billing and cross-cloud invoice proofs remain separate private operational work.
- A provider that does not support external idempotency cannot guarantee **exactly-once successful effect** across an ambiguous remote POST. The proven target is *at most one provider invocation initiated by compliant TRUYN workers* under a shared ledger; ambiguous outcomes require external recovery evidence, never an automatic re-POST.
- Roll back by blocking new paid admissions or preserving immutable ledger state, never by disabling the provider guard and resuming on the same `NEED` ID.

## PASS gate (not yet achieved)

1. Exact-head CI, security/regression and five-SDK conformance GREEN.
2. Two independent relays/providers sharing the same remote Cosmos partition, with concurrent same-ID signed legacy/compact NEED: one admitted, duplicate denied, one external mocked effect maximum.
3. Foreign/forged requester and missing/grant-revoked authority: `DENIED`, 0 `adapter.execute`, 0 upstream paid HTTP calls and 0 billable tokens.
4. Provider restart, SIGKILL before/after external-call boundary, cross-replica recovery: no second invocation; `unknown` blocks until reconciled.
5. Fault injection: Cosmos outage/timeout, stale session, mismatched provider/payer, missing entitlement or expired authorization → `DENIED/UNAVAILABLE`, no paid provider request.
6. A full deployment/rollback and independent operational verification of the exact source SHA, workflow runs, immutable artifact digests, and provider-side counters. Do NOT promote this candidate to stable TRUYN/1 or claim zero duplicated vendor charges from source tests alone.

## Candidate code

- `core/security/paid-need-admission.js`
- `network/relay/server.js` and `network/relay/cosmos-lifecycle-ledger.js`
- `adapters/sdk/index.js` and `runtime/service.js`
- `tests/paid-need-durable-security.test.js`

See also `docs/compatibility/TRUYN1_G5_SQLITE_DURABLE_PROFILE.md`, `docs/compatibility/TRUYN1_G5_COSMOS_CANDIDATE.md` and `docs/assurance/README.md`.
