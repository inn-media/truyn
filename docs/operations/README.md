# TRUYN Operations

**Status:** current reference operations baseline; not a mainnet/SRE compliance claim. Numerical SLI/SLO, observability, alerting/error budgets, security rotation/on-call and recovery/DR contracts are implemented. Managed authority repository/runtime support is accepted through PR `#457`; live production authority/telemetry/pager/backup/restore evidence remains open.

## Implemented repository/runtime contracts

- production SLI/SLO and 28-day error-budget contract (`PRODUCTION_SLO.md`, PR `#424`);
- OpenTelemetry metrics/traces, structured logs, Prometheus endpoint and dashboards (`OBSERVABILITY.md`, PR `#434`);
- service alerts and multi-window burn policy (`ALERTING.md`, PR `#434`);
- credential/identity/trust rotation lifecycle (`ROTATION_LIFECYCLE.md`, PR `#440`);
- PRIMARY/SECONDARY on-call ownership/escalation (`ON_CALL.md`, PR `#440`);
- recovery/DR objectives and executable restore-drill contract (`RECOVERY_DR.md`, PR `#441`);
- managed authority runtime architecture (`MANAGED_AUTHORITY_RUNTIME.md`, PR `#457`).

## Managed authority operations boundary

PR `#457` supplies repository/runtime support for Cosmos checkpointing over managed identity/AAD, checkpoint digest/revision/ETag fencing, digest-bound bootstrap, private authority service/admin surface, monotonic relay cache and fail-closed readiness.

It does **not** prove:

- production Cosmos provisioning;
- multi-region writes/failover;
- continuous backup;
- migration of real production authority state;
- live relay cutover;
- restore/failover drill acceptance;
- measured revocation/grant/entitlement propagation.

Those remain operational acceptance gates.

## Live production evidence still open

- deployed metrics/log/trace backends with retention/access controls;
- independent HTTP/WebSocket probes from multiple vantage points;
- real pager delivery and controlled test-fire;
- populated private PRIMARY/SECONDARY roster;
- sanitized credential/authority rotation drills;
- configured backups/replication and accepted live restore drills;
- durable 28-day SLO/error-budget evidence tied to an identified deployment;
- long-window authority/accounting reconciliation evidence.

Public `/health` remains intentionally minimal; detailed operational state belongs in protected telemetry/control surfaces.

## Evidence rule

Checked-in dashboards, runbooks and runtime support prove repository capability, not live production compliance. Production claims require deployment-specific evidence.
