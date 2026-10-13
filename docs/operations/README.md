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

## Current A-Series documentation coordination (2026-10-09)

- [A-Series assurance methodology](../assurance/README.md) is a merged public foundation, not a real 3600-second SOAK PASS.
- [2026-10-09 A-Series sanitation](DOCUMENTATION_SANITATION_2026-10-09_A_SERIES.md) reconciles current status and public/private ownership. [2026-10-08 D-1000 sanitation](DOCUMENTATION_SANITATION_2026-10-08.md) remains accepted historical benchmark evidence.
- Private A-MGMT owns cloud leases, costs, tenant billing and teardown; no public source depends on private runtime, and no documentation update is launch authorization.

## Accepted D-Series scale closure

- **D-5000 ACCEPTED / CLOSED / DOUBLE-CHECK VERIFIED**. Attempt 12 measured 15/15 stages PASS with immutable replay (historical workflow FAIL retained); Attempt 13 official terminal PASS, 20 hosts / 5,000 processes, 100/100 retained, 0 acknowledged loss and complete cleanup. See [canonical D-5000 evidence](../benchmarks/CLASS_D_5000_2026-10-11.md). Bounded scale acceptance is not Production SLO.
- **H-Series 4/4 ACCEPTED / PASS / CLOSED**: CACHE-COMPOUND, SECOND-OPINION, ARBITRAGE and CHAOS-FUZZ. See [canonical H status](../benchmarks/H_SERIES_STATUS.md). H/CHAOS-FUZZ is not F-Series physical infrastructure chaos.

- `class-d/D_SERIES_FINAL_CLOSURE_2026-10-08.md` is the compact closure ledger for accepted D-200, repeatability-confirmed D-500 and accepted D-1000. D-1000 Attempt 1 run `37687469411`, successful `run_attempt=2`, closes the defined 20-host / 1,000-real-process Class-D scale gate. This is benchmark acceptance, not production SLO/mainnet acceptance.
- `NETWORK_SCALE_STATUS.md` remains the current operational authority; `../benchmarks/CLASS_D_1000_2026-10-08.md` and JSON companion are the durable D-1000 evidence.

## Benchmark execution contracts

- `S_SERIES_EXECUTION_AND_TELEMETRY.md` defines the operational boundary for the planned Semantic Scale S-50/100/200/500 family: dedicated S workflow/concurrency/resource/evidence namespaces, D-Series non-interference, normalized node/request/chain/network/economic telemetry, spend preflight and immutable evidence closure. It is the active execution contract; accepted evidence now exists for S-10, S-20, S-50 and the full S-100 eight-scenario gate, while **S-200's bounded six-provider scope is CLOSED / DOUBLE-CHECK VERIFIED** by A14+A15 primary evidence plus independent fresh A17 8/8 evidence; full seven-provider/DeepSeek parity, physical WAN/SLO and S-500 remain OPEN. See [Double-Check report](../benchmarks/S_SERIES_S200_DOUBLE_CHECK_2026-10-13.md) and [current sanitation](S_SERIES_SANITATION_2026-10-13.md).
- `N_SERIES_EXECUTION_AND_ISOLATION.md` defines the public execution procedure for N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY and N/SUSTAINED-CHURN: `N/<benchmark>/<run_id>` ownership, series-scoped concurrency, R0/R1/R2 classification, authorization/budget/instrumentation preflight, paired controls, interference detection, owner-scoped cleanup, independent reconciliation and deterministic safe export. It is an execution contract. Separately, N/SOVEREIGNTY-10 has GREEN qualification evidence; that is not accepted physical 50/100-node measurement.

- `GLOBAL_STATUS_RECONCILIATION_2026-10-10.md` is an immutable dated **2026-10-10 historical snapshot**, with the S-200 row explicitly superseded; the [2026-10-13 S-Series sanitation record](S_SERIES_SANITATION_2026-10-13.md) and [canonical implementation status](../architecture/IMPLEMENTATION_STATUS.md) contain the current S-200 Double-Check status; the 2026-10-12 record remains historical primary-closure context.

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

- [Read-only live observability evidence audit (2026-10-11)](PRODUCTION_OBSERVABILITY_LIVE_AUDIT_2026-10-11.md): private 90-day metrics/probe-series backend canary PASS; collector/trace/log final proof and Microsoft.Monitor registration RED; real independent Azure/GCP HTTP/WebSocket probes and actual pager delivery not yet verified.

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


Independent repository/capsule/deploy audit: [2026-10-10 dependency and deployment reconciliation](INDEPENDENT_DEPENDENCY_CAPSULE_DEPLOYMENT_AUDIT_2026-10-10.md). No code removal or production acceptance is inferred from its candidate inventory.
