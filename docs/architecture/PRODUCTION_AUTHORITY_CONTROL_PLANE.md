# TRUYN Production Authority Control Plane

**Status:** implementation candidate for P1 durable authority acceptance. This layer moves provider access grants, entitlements, accounting reservations and terminal revocations into server-side durable authority state. It does not make settlement part of TRUYN/1 and it does not claim geo-replicated database consensus.

## Authority chain

```text
authenticated TRUYN node identity
        ↓
Account → Organization → Tenant → membership/role
        ↓
provider + requester authoritative bindings
        ↓
Production Revocation Authority
        ↓
Provider Grant Authority
        ↓
Entitlement Authority (when chargeable)
        ↓
Durable Accounting reservation
        ↓
provider execution
        ↓
commit / release / reconciliation
```

Every unresolved or unavailable authority step fails closed.

## Durable Account / Tenant authority

`durable-account-tenant-authority.js` persists the P1.1 hierarchy and lifecycle state to local durable authority storage. The bootstrap seed is fsync-persisted on first construction, so a restart does not require an operator to replay the seed in order to resolve already-provisioned nodes.

The underlying P1.1 semantics remain unchanged:

- Account → Organization → Tenant ancestry;
- scoped roles and memberships;
- node → principal + tenant bindings;
- provider → provider/principal/tenant bindings;
- active / suspended / removed lifecycle;
- removed objects are terminal inside the authority lifecycle.

## Durable provider grants

When `ProviderGrantAuthority` is configured for the relay, the relay no longer treats provider-signed `metadata.allowedRequesterIds` or `metadata.accessMode` as authority. Those fields cannot widen discovery or dispatch.

The server-side provider policy supports four explicit modes:

| Mode | Meaning |
|---|---|
| `self` | requester must resolve to the same principal as the provider |
| `private` | requester must resolve to the provider's tenant |
| `shared` | requester must match an explicit durable grant |
| `network` | any currently valid authoritative requester may use the provider |

`shared` grants can target a node, principal, tenant, organization or account and can be capability-scoped and time-bounded.

Changing or revoking a durable grant takes effect on the next relay discovery/dispatch decision. Republishing the OFFER is not required.

## Entitlement Authority

Chargeable `sponsored`, `prepaid` and `subscription` modes can resolve entitlements from durable server-side state.

An entitlement binds:

- a subject: node / principal / tenant / organization / account;
- provider or provider wildcard;
- one or more capabilities;
- billing mode;
- validity window;
- accounting period: day / month / lifetime;
- optional request and token limits;
- billing responsibility.

Resolution rechecks both requester and provider Account/Tenant authority and terminal revocation state before returning an entitlement.

A requester-supplied billing field cannot create an entitlement or assign billing responsibility.

## Durable Accounting

`DurableAccountingAuthority` uses an idempotent reservation model:

```text
authorize chargeable request
        ↓
reserve(requestId, entitlement, period, estimated usage)
        ↓
execute
        ↓
completed → commit(actual usage)
failed/cancelled → release
```

The request ID is the accounting reservation ID. Reusing the same ID with different accounting coordinates fails as an idempotency conflict.

The accounting state tracks committed and reserved request/token counters. A new reservation fails before execution if the effective entitlement quota would be exceeded.

Actual provider usage is always recorded as an accounting fact. If a provider reports an actual token total that exceeds the reserved/entitled ceiling, accounting still durably commits that actual usage, marks the reservation `quotaOverrun=true`, increments the ledger overrun counter and returns `actual_token_quota_exceeded`. This prevents an over-limit provider call from disappearing from the ledger and causes later reservations to remain fail closed against the now-exhausted balance.

Reservations and reconciliation survive process restart.

`createProviderBillingPolicy()` supports this authority path and returns a `finalize(...)` operation for the reserved call. `ProductionControlPlane.createBillingPolicy(...)` binds a provider billing policy to the same durable Entitlement and Accounting authorities automatically.

`executeWithDurableAccounting(...)` is the canonical bounded execution helper for the authority path. It performs authorization/reservation before provider execution, derives actual token usage from RESULT/runtime `metadata.totalTokens` or `metadata.usage.total`, commits successful usage, and releases the reservation when execution fails. A durable overrun is surfaced as an execution/accounting error after the actual usage has already been recorded.

Existing BYOK/owner-funded and legacy signed-sponsored behavior remains available when the new authorities are not configured. Prepaid/subscription still fail closed when no resolver exists.

## Production Revocation Authority

`ProductionRevocationAuthority` records terminal durable revocations for:

- account;
- organization;
- tenant;
- membership;
- principal;
- node;
- provider;
- grant;
- entitlement;
- request.

Revocations are intentionally not resumable. Temporary administrative suspension remains the Account/Tenant or grant/entitlement lifecycle operation; terminal security revocation is a separate authority fact.

Grant and entitlement resolution recheck revocations on every decision. If revocation storage becomes unreadable/unavailable, the dependent authority path denies rather than falling back to provider metadata.

## Storage contract

The reference durable backend is `durable-json-store.js`.

It provides:

- server-side files with restrictive creation permissions;
- exclusive lock-file serialization for writers;
- stale-lock recovery with bounded acquisition timeout;
- read-current-state inside the write lock;
- atomic same-directory temporary write + rename;
- file fsync before rename;
- directory fsync after rename;
- monotonic store revision;
- corruption detection.

This is a durable single-filesystem reference backend and can coordinate processes sharing that filesystem. It is not a claim of multi-region database consensus. A later database/replicated adapter may replace the backend without changing the authorization invariants.

## Relay production configuration

`createProductionControlPlane({ stateDir, accountTenantSeed })` composes:

- durable Account/Tenant Authority;
- Production Revocation Authority;
- Provider Grant Authority;
- Entitlement Authority;
- Durable Accounting Authority.

Calling `controlPlane.configureRelay()` installs the Account/Tenant and Provider Grant authorities into the current relay policy boundary and returns a restoration function for bounded/test lifecycles.

## Acceptance evidence

`tests/production-authority-control-plane.test.js` covers:

- `self / private / shared / network` semantics;
- account/tenant state persistence without seed replay;
- durable grant persistence;
- terminal grant revocation across restart;
- real relay discovery/dispatch with forged provider `public`/allowlist metadata ignored;
- immediate grant-revocation effect on real relay discovery/dispatch;
- entitlement resolution against current requester/provider authority;
- reservation idempotency;
- token overspend denial before execution;
- commit/release reconciliation;
- accounting persistence across restart;
- terminal entitlement revocation persistence;
- node revocation blocking both grant and entitlement authority;
- corrupted durable grant state failing closed.

`tests/accounted-execution.test.js` additionally covers:

- successful execution committing provider-reported actual token usage;
- failed execution releasing its reservation;
- actual-token overrun being durably committed and marked as a safety violation;
- later quota reservations remaining denied after an overrun.

## Deliberate remaining production boundary

This PR establishes durable authority semantics and restart evidence for the reference backend. It does **not** by itself prove:

- multi-region consensus/replication;
- external managed database failover;
- operator RBAC/API/UI for mutating this control plane;
- cross-region disaster recovery;
- settlement/payment-rail integration;
- 28-day production SLO compliance.

Those remain separate operational/deployment gates rather than reasons to keep authority in provider-signed metadata.
