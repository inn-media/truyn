# TRUYN Account / Tenant Authority

**Status:** implemented bounded authoritative resolver and relay policy integration for P1.1. This is the account/organization/tenant identity-control primitive; durable grant administration, commercial entitlement issuance/revocation and distributed usage accounting remain separate P1 gates.

## Purpose

The existing node-level provider boundary proves that requester-controlled `ownerId`, `tenantId` and billing fields cannot assign ownership or cost responsibility. P1.1 adds a trusted server-side hierarchy capable of answering:

> Which account, organization and tenant does this authenticated node/provider belong to, what active roles does its principal hold, and is that binding still active now?

The hierarchy is:

```text
Account
  └── Organization
       └── Tenant
            ├── scoped memberships / roles
            ├── node bindings
            └── provider bindings
```

## Authoritative objects

`core/security/account-tenant-authority.js` implements:

- accounts;
- organizations bound to one account;
- tenants bound to one organization;
- principal memberships scoped to account, organization or tenant;
- TRUYN node identity → principal + tenant bindings;
- provider-node identity → provider + principal + tenant bindings.

Provider bindings must match the authoritative principal and tenant of the provider node. A provider cannot claim another tenant merely by changing `OFFER` metadata.

## Roles

The bounded role vocabulary is:

- `account-owner`;
- `org-admin`;
- `tenant-admin`;
- `member`;
- `provider-operator`;
- `auditor`.

Account- and organization-scoped membership roles inherit down to descendant tenants. Effective roles are resolved from active memberships only.

Requester execution is permitted only for an active principal holding at least one of:

```text
account-owner
org-admin
tenant-admin
member
provider-operator
```

Provider operation is permitted only for:

```text
account-owner
org-admin
tenant-admin
provider-operator
```

`auditor` alone does not grant provider execution.

These roles establish identity/control authority, not capability-specific commercial grants. Cross-tenant paid/shared grants remain a separate P1 layer.

## Lifecycle

Every authority object has one of:

```text
active
suspended
removed
```

Resolution is fail closed across the whole ancestry. Suspending an account, organization or tenant therefore immediately makes descendant node/provider resolutions ineligible without rewriting every child record.

Membership, node and provider bindings can also be suspended independently.

`removed` is terminal. Tombstoned IDs are retained by the authority object and cannot be resumed or silently reused through the same lifecycle API.

## Relay integration

`relay-provider-policy.js` can be configured with an account/tenant authority. Each stored provider policy captures that trusted authority reference; discovery and dispatch re-resolve requester/provider context on every match decision.

For an authority-backed private provider:

```text
signed provider OFFER
       ↓
providerNodeId
       ↓
authoritative provider binding
       ↓
active account/org/tenant ancestry
       ↓
active provider-operator/admin role
       ↓
requester authoritative node binding
       ↓
active membership + execution role
       ↓
same tenant → eligible
```

Requester/provider wire fields such as `tenantId` and `ownerId` are ignored for the authoritative binding.

A lifecycle change is therefore reflected on the next discovery/dispatch decision. A previously authenticated session is not itself tenant entitlement.

## Compatibility boundary

When no account/tenant authority is configured, the existing node-level provider policy remains unchanged:

- signed `OFFER.from` is the provider owner identity;
- private `allowedRequesterIds` and trusted requester behavior continue to work;
- public-provider opt-in remains explicit.

This keeps current bounded deployments compatible while allowing production deployments to opt into the stronger resolver.

## Security invariants

- requester-controlled account/org/tenant metadata is non-authoritative;
- provider-controlled tenant metadata is non-authoritative;
- inactive account/org/tenant ancestry fails closed;
- inactive membership fails closed;
- inactive node binding fails closed;
- inactive provider binding fails closed;
- auditor-only principals cannot execute provider work;
- provider bindings cannot cross their node's authoritative principal/tenant;
- same-tenant eligibility is computed from trusted authority state, not from payload claims;
- cross-tenant sharing still requires an explicit policy/grant path and never arises from forged tenant metadata.

## Bounded evidence

`tests/account-tenant-authority.test.js` covers:

- inherited scoped roles;
- requester/provider role separation;
- membership/tenant/provider suspend/resume;
- terminal node removal;
- provider binding anti-spoofing;
- forged wire tenant/owner metadata;
- real relay same-tenant private discovery/dispatch;
- foreign-tenant discovery denial;
- immediate denial after membership suspension.

## Deliberate next gates

P1.1 does not claim completion of the remaining production provider-control program. Still separate:

- durable cross-tenant grant/policy administration;
- production entitlement issuance/revocation and prepaid/subscription resolution;
- durable distributed usage reservation/accounting/reconciliation;
- commercial control-plane API/UI and settlement integrations.

The account/tenant authority snapshot is intentionally exportable and revisioned so a later durable control-plane implementation can persist/replicate this state without changing the relay authorization invariant.
