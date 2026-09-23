# TRUYN Operations

**Status:** current reference operations baseline; not a mainnet/SRE compliance claim.  
**Documentation audit:** 2026-09-23

Repository/runtime contracts exist for SLI/SLO, observability, alerting/error budgets, rotation/on-call and recovery/DR. Live deployment-specific telemetry/pager/backup/restore evidence remains a separate acceptance boundary.

## Implemented repository/runtime contracts

- production SLI/SLO and error-budget contract (`PRODUCTION_SLO.md`);
- OpenTelemetry metrics/traces, structured logs, Prometheus/dashboard surfaces (`OBSERVABILITY.md`);
- alert and burn-rate policy (`ALERTING.md`);
- credential/identity/trust rotation lifecycle (`ROTATION_LIFECYCLE.md`);
- PRIMARY/SECONDARY on-call ownership/escalation contract (`ON_CALL.md`);
- recovery/DR objectives and restore-drill contract (`RECOVERY_DR.md`);
- managed authority runtime boundary (`MANAGED_AUTHORITY_RUNTIME.md`).

## Benchmark execution state

### D-Series

Current accepted/active network-scale state belongs in `NETWORK_SCALE_STATUS.md`:

- Class C / D-100 / D-200 accepted;
- D-200 repeatability confirmed;
- D-500 attempted but not accepted;
- D-1000 open.

### S-Series

`S_SERIES_EXECUTION_AND_TELEMETRY.md` is no longer a planning-only document. Managed S-50 execution/qualification machinery and real attempt history exist, and public runtime repairs/regressions have been driven by S-Series qualification.

Current truth: **execution/qualification active, no accepted S-Series PASS**.

### E-Series

`E_SERIES_EXECUTION.md` now reflects the implemented/qualified public validator/recompute layer plus active private exact-head/isolation/provider qualification. Current truth: **implementation/qualification exists, no measured E benchmark PASS**.

All benchmark tracks use the common isolation contract in `../benchmarks/BENCHMARK_SERIES_ISOLATION.md`.

## Managed authority operations boundary

Managed production authority/control-plane implementation belongs to private `inn-media/truyn-platform`. Public TRUYN keeps open/reference contracts and conformance seams.

Repository/runtime support does **not** by itself prove:

- provisioned live production persistence;
- multi-region write/failover behavior;
- continuous backup acceptance;
- real production state migration/cutover;
- accepted restore/failover drills;
- long-window authority/accounting reconciliation.

Those remain deployment-specific gates.

## Live production evidence still open

- deployed telemetry backends with retention/access controls;
- independent external HTTP/WebSocket probes for the target deployment;
- real pager delivery/test-fire;
- populated private on-call roster;
- sanitized credential/authority rotation drills;
- configured backups/replication + accepted restore drills;
- durable SLO/error-budget evidence tied to an identified deployment;
- long-duration authority/accounting reconciliation.

Public `/health` remains intentionally minimal. Detailed operational state belongs in protected telemetry/control surfaces.

## Evidence rule

Checked-in dashboards, runbooks, workflow code, qualification tools and runtime support prove repository capability only. A deployment/benchmark/release is **accepted** only when the corresponding immutable evidence gate is satisfied.
