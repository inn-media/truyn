# TRUYN Account / Tenant Authority

**Status:** Account → Organization → Tenant hierarchy and relay-policy integration are accepted through PR `#425`; durable single-filesystem persistence/grants/entitlements/accounting/revocation are accepted through `#433` + `#456`; managed authority repository/runtime support is accepted through `#457`. Live managed deployment and multi-region operational evidence remain open.

## Authority hierarchy

```text
Account
  ↓
Organization
  ↓
Tenant
  ↓
Membership / role
  ↓
Principal / node / provider binding
```

Wire `ownerId`, `tenantId`, external-protocol metadata and transport credentials are descriptive inputs, not authority.

## Accepted durable layer

The production control plane persists authoritative account/tenant state, provider access modes/grants, sponsored/prepaid/subscription entitlements, atomic usage reservations and terminal revocation facts. PR `#456` closes reservation finalization/replay, terminal membership revocation and live-writer lock correctness.

## Accepted managed runtime support

PR `#457` adds repository/runtime support for a managed authority topology:

- Cosmos DB NoSQL checkpoint adapter using managed identity/AAD;
- checkpoint SHA-256 commitment, source SHA, bounded size and monotonic revision;
- optimistic `ETag` fencing;
- explicit digest-bound production bootstrap;
- private authority runtime/admin surface;
- monotonic relay snapshot cache with fail-closed staleness/readiness.

This is not evidence that the managed backing service is provisioned or that production state is migrated/cut over.

## Still open

- provisioned/hardened managed backing service;
- multi-instance and multi-region consistency/failover evidence;
- continuous backup and accepted restore drills;
- production migration/cutover evidence;
- deployed operator/admin RBAC and audit evidence;
- measured revocation/grant/entitlement propagation under partition/heal;
- long-window accounting reconciliation/incident evidence.

Tenant membership alone never creates provider entitlement, and public reachability never grants somebody else's provider capacity.
