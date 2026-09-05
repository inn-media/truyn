# TRUYN Authorization Model

**Status:** implemented fail-closed authorization with Account/Organization/Tenant authority, durable grants/entitlements/accounting/revocation and accepted managed authority repository/runtime support. Live managed deployment evidence remains open.

## Core rule

TRUYN authorization is **server-side, identity-bound and fail closed**. Requester/provider payload fields, A2A/MCP metadata and client UI constraints are not security authority.

## Canonical decision path

```text
authenticate requester
  ↓
resolve account / organization / tenant / membership
  ↓
resolve provider binding + access policy/grants
  ↓
resolve billing responsibility + entitlement
  ↓
reserve durable usage when chargeable
  ↓
apply request constraints and dispatch
  ↓
provider-host authority/billing recheck
  ↓
execute
  ↓
commit or release accounting reservation
```

If mandatory authority cannot produce a trustworthy answer, execution must not occur.

## Accepted authority layers

- PR `#425`: Account → Organization → Tenant, memberships/roles, node/provider bindings and lifecycle.
- PR `#433`: durable provider access modes `self/private/shared/network`, grants, entitlements, accounting reservations and terminal revocation.
- PR `#456`: reservation finalization/replay, membership-revocation and durable-writer locking correctness.
- PR `#457`: managed authority repository/runtime support using Cosmos checkpointing over managed identity/AAD, ETag fencing, digest-bound bootstrap, private authority role/API and monotonic relay cache/readiness.

## Default deny examples

Deny on missing/unreadable mandatory authority, unresolved requester/provider binding, inactive/revoked ancestry, missing shared-provider grant, invalid entitlement, reservation/quota failure, ambiguous billing responsibility, or compatibility paths that cannot preserve equivalent authorization.

No HTTP, WebSocket, SDK, A2A or MCP path may introduce an authorization shortcut.

## Replay / exactly-once interaction

Authorization approval is not permission to replay a side effect. Request/correlation and accounting coordinates remain part of the execution boundary. A committed reservation ID cannot trigger another chargeable execution.

## Managed-runtime boundary

The existence of `#457` support does not make the live deployment productionized. Still open are provisioned/hardened managed backing service, production migration/cutover, multi-region consistency/failover, backup/restore drills, deployed operator RBAC/audit, propagation evidence and long-window accounting/SLO evidence.

## Non-goals

This document does not define a universal identity provider, payment processor or global account system. It defines authorization invariants that any TRUYN deployment must preserve.
