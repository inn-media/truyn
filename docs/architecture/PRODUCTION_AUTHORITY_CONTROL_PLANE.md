# TRUYN Production Authority Control Plane

**Status:** bounded durable Production Authority is accepted via PR `#433` with correctness repair `#456`; managed authority repository/runtime support is accepted via PR `#457`. Live managed deployment, multi-region consistency, migration/cutover, backup/restore and propagation evidence remain open.

## Accepted authority semantics

The control plane owns server-side authoritative state for:

- Account / Organization / Tenant hierarchy and lifecycle;
- provider bindings, access modes and grants;
- sponsored/prepaid/subscription entitlements;
- durable atomic request/token reservation, commit, release and reconciliation;
- terminal revocations for authoritative control-plane objects.

Mandatory authority failure denies rather than falling back to requester/provider metadata.

## Single-filesystem reference authority

PR `#433` provides fsync-backed restart-persistent reference authority. PR `#456` ensures reservations finalize on success/failure/cancellation, committed reservation replay is denied before execution, terminal membership revocation is enforced, and an active writer cannot lose the filesystem lock merely because the lock age exceeds a stale threshold.

## Managed authority runtime support

PR `#457` adds:

- Azure Cosmos DB NoSQL checkpoint adapter over managed identity/AAD;
- full checkpoint SHA-256 commitment, source SHA, bounded size and monotonic revision;
- optimistic `ETag` fencing for acknowledged mutations;
- explicit digest-bound bootstrap with no empty/default production authority;
- private `TRUYN_ROLE=authority` runtime and distinct runtime/admin bearer credentials;
- allowlisted lifecycle/admin mutation surface;
- monotonic relay snapshot cache with digest verification and fail-closed staleness budget;
- production bootstrap/readiness wiring.

## Explicit non-claims

PR `#457` does **not** prove:

- that Cosmos is provisioned for production;
- multi-region writes or continuous backup;
- production-state migration;
- live relay cutover;
- accepted restore/failover drills;
- measured revocation/grant/entitlement propagation SLOs;
- long-window accounting reconciliation/SLO evidence.

Those remain separate deployment/operations gates.

## Settlement boundary

TRUYN/1 remains settlement-neutral. x402/AP2 or other payment rails may be future adapters, but they cannot grant provider access or override authority/billing decisions.
