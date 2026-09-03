# TRUYN Production Alerting and Error Budgets

**Status:** repository alerting/error-budget implementation contract; deployed Alertmanager/paging delivery and on-call acceptance evidence remain OPEN.  
**Related:** [Production SLI / SLO Contract](PRODUCTION_SLO.md), [Production Observability Plane](OBSERVABILITY.md).

This runbook turns production telemetry into service-level alerts. CPU, memory and container restarts remain useful diagnostic signals, but they are not the primary paging policy. Paging is driven by user-visible service failure, SLO burn and zero-budget correctness/security conditions.

## 1. Paging principle

For percentage SLOs, a single short spike must not page by itself. A page requires the same burn condition in a long window and a confirming short window:

| Policy | Long window | Short window | Burn threshold | Action |
|---|---:|---:|---:|---|
| fast burn | 1 h | 5 min | >= 14.4x | page / SEV-1 candidate |
| sustained burn | 6 h | 30 min | >= 6x | page / SEV-2 candidate |
| slow burn | 24 h | 2 h | >= 3x | reliability ticket/work item |

The thresholds use the allowed error ratio of the affected SLO. For example, `SLO-HTTP-1` has a 0.0005 allowed error ratio, the 99.90% SLOs use 0.001, and `SLO-DHT-RECOVERY-1` uses 0.01.

The Prometheus rules are in:

- `observability/prometheus/error-budget-rules.yml` — rolling 28-day consumed/remaining budget;
- `observability/prometheus/slo-alerts.yml` — multi-window burn pages and service/anomaly alerts.

## 2. Error budgets

`truyn:slo_error_budget_consumed:ratio` is recorded independently for:

- `SLO-HTTP-1`;
- `SLO-AUTH-1`;
- `SLO-DISPATCH-1`;
- `SLO-RESULT-1`;
- `SLO-PROVIDER-1` for the first-party provider lane only;
- `SLO-DHT-1` when a production DHT profile actually emits production routing metrics;
- `SLO-DHT-RECOVERY-1` when qualifying production heal/recovery events emit production recovery metrics.

A value of `0.25` means 25% of the rolling 28-day error budget has been consumed. `1.0` means the budget is exhausted. `truyn:slo_error_budget_remaining:ratio` is clamped at zero and is intended for dashboards/change-control automation.

Budgets are never pooled. A healthy provider SLO cannot compensate for a breached RESULT-delivery SLO.

The repository policy is:

- `>= 0.50` consumed: reliability review/change-risk review;
- `>= 1.00` consumed: SLO breach, page and block Productionized/stable promotion for the affected deployment class;
- security/correctness zero-budget conditions are incidents regardless of availability budget.

## 3. Canonical service alerts

### Availability SLO burn

`TruynRelayHttpFastBurn`, `TruynRelayHttpSustainedBurn` and `TruynRelayHttpSlowBurn` use the relay serving-path request SLI. `TruynPublicAvailabilityProbeFastBurn` uses independent public-path probes and is required for transport/DNS/TLS/edge failures that an in-process request counter cannot observe.

### 5xx / server error rate

`TruynRelay5xxFastBurn` isolates 5xx responses from the broader HTTP availability failure class and applies the HTTP SLO error budget. Correct 4xx fail-closed responses do not become 5xx failures.

### WebSocket disconnect storm

The production alert-signal wrapper records `truyn_websocket_disconnects_total` and WebSocket lifetime. `TruynWebSocketDisconnectStorm` requires both a high short-lived disconnect ratio and minimum event counts in 15-minute and 5-minute windows. Long-lived normal session closure therefore does not page as a storm merely because it occurred.

### Dispatch failures

`TruynDispatchFastBurn`, `TruynDispatchSustainedBurn` and `TruynDispatchSlowBurn` measure unexpected `NEED -> provider` failure against `SLO-DISPATCH-1`. Correct `no_provider` semantics remain outside the success/failure denominator defined by the SLO contract.

### RESULT timeout / delivery failures

The production alert-signal wrapper converts relay `504` outcomes on synchronous fast NEED/chain wait paths into `truyn_result_timeouts_total`. RESULT burn calculations include explicit delivery failures plus these timeouts, so a request that times out waiting for its terminal result cannot disappear from the RESULT reliability picture.

`TruynResultTimeoutFastBurn` provides the direct timeout symptom page, while `TruynResultDelivery*Burn` provides the complete RESULT error-budget view.

### DHT convergence degradation

`TruynDhtRoutingSustainedBurn` watches healthy-state production routing failures against `SLO-DHT-1`. `TruynDhtStaleSelectionDegradation` watches the <=0.50% stale-selection objective on both 6-hour and 30-minute windows.

The alert-signal API exposes `recordNetworkConvergence(durationSeconds, ...)` for qualifying production heal/recovery integration. A recovery is recorded as failed when it does not restore the required route-success condition within 120 seconds; `TruynDhtRecoverySustainedBurn` and the independent `SLO-DHT-RECOVERY-1` error budget use those events. D-100/D-200/D-1000 benchmark data is not automatically promoted into these production series.

### Provider execution failures

The alert-signal wrapper records `truyn_provider_service_events_total` with the low-cardinality lane `first_party` or `byok`. Billing modes other than explicit `byok` are first-party because the owner-operated runtime/upstream obligation belongs to TRUYN; the BYOK lane remains separately visible.

`TruynProviderExecutionFastBurn`, `TruynProviderExecutionSustainedBurn` and the `SLO-PROVIDER-1` error budget filter `lane="first_party"`. A user-owned BYOK upstream failure therefore remains observable but does not burn the first-party provider SLO.

### Authorization deny anomaly

Correct authorization denial is a security success and does not consume availability error budget. `TruynAuthorizationDenyAnomaly` is therefore an anomaly/security signal, not an SLO-failure conversion. It requires both a high deny ratio and minimum deny volume on two windows so low-volume legitimate denials do not wake an operator.

### Billing ambiguity

Fail-closed billing decisions caused by unavailable authority are recorded separately as `truyn_billing_ambiguity_events_total`. Current ambiguity classes include unavailable entitlement resolution, unavailable durable sponsored usage state and missing access-policy authority.

`TruynBillingAmbiguity` is zero-budget: repeated ambiguity pages because TRUYN must not silently convert an unknown billing state into owner-funded/free execution.

### Artifact store failures

The provider execution wrapper recognizes failures from artifact/object-storage operations and records `truyn_artifact_store_failures_total` without logging artifact references, URLs or payloads. `TruynArtifactStoreFailures` pages only when both the failure ratio and minimum event counts are material on 15-minute and 5-minute windows.

### Origin bypass probe failure

The perimeter probe is intentionally external to the relay process. The canonical Prometheus/Blackbox job name is `truyn-origin-bypass`; its module must treat the expected protected result as probe success. Exact direct Front Door/origin targets and proof material stay in protected deployment configuration, never in this repository.

`TruynOriginBypassProbeFailure` requires repeated failure on both 15-minute and 5-minute windows. `TruynOriginBypassProbeMissing` fires when the security probe itself disappears. This condition is zero-budget.

## 4. Probe requirements

Two external jobs are reserved by the checked-in rules:

```text
truyn-relay-public
truyn-origin-bypass
```

`truyn-relay-public` should run from more than one independent vantage point and exercise the real public edge path.

`truyn-origin-bypass` must prove the deployed perimeter expectation without exposing live topology in Git. The probe configuration may validate public success plus direct-edge/direct-origin fail-closed behavior, but target URLs, headers and credentials belong to the deployment secret/configuration system.

Missing probe telemetry is alertable because an unmeasured perimeter cannot be counted as healthy evidence.

## 5. Alert routing contract

Repository labels define intent; the production Alertmanager/on-call backend supplies people and delivery channels.

- `severity=page` — wake the responsible production on-call;
- `severity=ticket` — create/route a reliability or security work item without waking on a single spike;
- `team=security` — security ownership/escalation path;
- `zero_budget=true` — cannot be waived by availability error budget;
- `policy=multi_window_burn` — page requires SLO burn in both windows;
- `policy=multi_window_anomaly` — page requires anomaly persistence/volume confirmation;
- `policy=production_promotion_block` — blocks stable/Productionized promotion until resolved.

Actual pager destinations, phone numbers, private escalation contacts and incident-room identifiers must not be committed to the public repository.

## 6. Acceptance still required after merge

Checked-in rules are implementation, not alert-delivery proof. Production Operations acceptance still requires:

1. production Prometheus/compatible backend loading both rule files successfully;
2. independent public and origin-bypass probe series present;
3. controlled test-fire of every `severity=page` route without weakening the security perimeter;
4. evidence that fast/sustained pages reach the intended on-call path and slow burn creates the intended work item;
5. dashboard visibility of 28-day consumed/remaining budgets;
6. proof that correct authorization denial does not consume availability budget;
7. proof that a synthetic RESULT timeout, DHT recovery miss and artifact-store fault hit the intended service alerts;
8. proof that a BYOK upstream failure is visible without consuming `SLO-PROVIDER-1`;
9. durable exact-SHA evidence and incident timeline for the acceptance exercise.
