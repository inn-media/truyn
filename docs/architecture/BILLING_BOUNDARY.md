# TRUYN Billing Boundary

**Status:** implemented fail-closed billing safety plus accepted durable entitlement/accounting authority (`#433` + `#456`), accepted managed authority repository/runtime support (`#457`), and accepted managed provider accounting wiring (`#463`). Live managed accounting deployment/evidence and settlement adapters remain open.

## Principle

Before TRUYN causes a chargeable provider operation, it must answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If billing responsibility or mandatory entitlement/accounting authority is ambiguous, execution fails closed.

## Charge-prevention order

```text
authentication
  ↓
authoritative account/tenant/provider resolution
  ↓
provider visibility/access/grant authorization
  ↓
billing-owner/mode resolution
  ↓
entitlement resolution
  ↓
durable reservation
  ↓
provider execution
  ↓
commit/reconcile actual usage OR release reservation
```

Requester-controlled billing, owner, tenant or entitlement metadata cannot self-grant access or assign cost responsibility.

## Billing modes

Reference modes are `byok`, `owner-funded`, `sponsored`, `prepaid`, and `subscription`. Sponsored/prepaid/subscription can be resolved from durable server-side entitlement state. PR `#463` routes those three managed modes through the managed authority runtime; `owner-funded` and `byok` retain their existing local/private semantics. When mandatory authority is unavailable, behavior remains fail closed.

## Durable accounting

The accepted accounting authority uses request identity as an idempotent reservation coordinate. PR `#456` requires:

- provider success → commit;
- provider failure → release;
- cancellation → release;
- committed reservation replay → deny before provider execution.

Actual provider usage that exceeds the reservation ceiling is durably recorded as an overrun rather than erased.

## Managed provider accounting wiring

PR `#463` closes the repository/runtime wiring slice for managed provider accounting:

- authoritative reserve must complete before `adapter.execute()`;
- async reserve/reconcile is awaited in both provider-host execution paths and the durable-accounting helper;
- success reconciles actual reported token usage before terminal success;
- provider failure reconciles/releases as failed;
- cancellation after reserve reconciles/releases as cancelled and cannot emit a successful terminal result;
- authoritative reconcile failure suppresses successful unpaid output;
- committed request/reservation replay is denied before a second provider execution;
- managed accounting requires durable provider identity.

This acceptance is repository/runtime wiring, not live production accounting evidence.

## Managed authority runtime support

PR `#457` adds Cosmos-backed checkpoint/runtime support, ETag fencing, digest-bound bootstrap, private authority service/API and monotonic relay snapshots. Together with `#463`, this provides the managed repository/runtime path for authority plus provider accounting, but does not prove live production deployment.

Still open:

- provisioned managed backing service;
- production migration/cutover;
- multi-instance/multi-region accounting consistency/failover;
- continuous backup and accepted restore drills;
- deployed operator RBAC/audit;
- long-window reconciliation/incident evidence and production SLO proof.

## Settlement boundary

Settlement remains outside `TRUYN/1`. TRUYN does not define a proprietary currency, wallet, processor, blockchain or financial-finality rule. Future x402/AP2 or other settlement adapters may consume an already-authorized transaction boundary but may never grant provider access or override billing authority.
