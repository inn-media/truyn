# E/DEGRADE — Stress, Saturation and Recovery Methodology

Status: **FOUNDATION / no result claim**

## Question

As offered load increases, does TRUYN degrade gradually with controlled backpressure and recovery, or collapse abruptly through cascading failure?

## Fixed scales

Run independently at:

```text
50, 100, 200, 500 nodes
```

Scale, corpus, provider mix, routing/retrieval/verification policy and all acceptance definitions remain fixed while offered load is ramped.

## Load ladder

A low-cost pilot estimates a safe reference load `L_ref`. Before the final campaign, freeze a monotonically increasing ladder such as:

```text
0.50x, 0.75x, 1.00x, 1.25x, 1.50x, 2.00x, 3.00x ... L_ref
```

The final ladder must be frozen before measured execution. Each step has a fixed duration/request minimum and steady-state sampling window.

The ladder continues until one of these occurs:

- two consecutive internal-saturation steps fail sustainability gates;
- safety/authorization invariant failure occurs;
- provider/external quota makes the next internal-capacity observation impossible;
- frozen cost/time stop limit is reached.

## Metrics per load step

Record at minimum:

- offered NEED/s;
- admitted NEED/s;
- completed NEED/s;
- useful-result success %;
- p50/p95/p99 E2E where sample-qualified;
- queue depth / queue wait;
- active concurrency;
- retry/cancel/backpressure/partial counts;
- routing/retrieval/verification failure counts;
- provider 429/5xx/timeout counts;
- internal saturation events;
- bytes/tokens/cost;
- cross-series interference state.

## Error taxonomy

At minimum:

```text
provider_429
provider_5xx
provider_timeout
transport_timeout
routing_fail
authorization_fail
retrieval_fail
verification_fail
backpressure_reject
cancelled
internal_saturation
unknown
```

Provider 429 is reported as an external/provider constraint and is not relabeled as TRUYN internal saturation. It still affects the user-observed curve.

## Baseline

For each scale, establish a measured baseline at a low sustainable load before the ramp:

```text
baseline_success
baseline_p95
baseline_p99 if qualified
baseline_queue
```

## Max sustainable load

E-Series v1 defines a sustainable step as all of:

```text
useful_success_rate >= 99%
p95_e2e <= 2.0 * baseline_p95
zero safety/authorization invariant violations
no uncontrolled queue growth across the measured steady-state window
```

`MAX_SUSTAINABLE_LOAD` is the highest observed offered load that satisfies all gates and is not materially contaminated by undeclared cross-series interference.

If provider throttling prevents observing the internal ceiling, report `EXTERNAL_LIMITED_AT=<load>` and do not claim an internal max sustainable load above the last valid step.

## Degradation shape

Classify descriptively from measured curves:

- **GRACEFUL** — latency/queue rise progressively, useful success remains controlled, backpressure/rejection is bounded and recovery is clean;
- **CLIFF** — useful success or latency deteriorates abruptly over one step and/or cascading internal errors appear;
- **EXTERNAL_LIMITED** — provider/quota constraint dominates before an internal ceiling is observed;
- **MIXED** — multiple modes appear and must be reported separately.

The label must be accompanied by raw curve evidence and ordered failure modes; it is not a standalone score.

## Recovery / hysteresis

After the highest stress step, return immediately to the frozen baseline offered load.

Recovery is reached when three consecutive 30-second windows satisfy:

```text
success >= baseline_success - 0.5 percentage points
p95 <= 1.20 * baseline_p95
queue_depth <= frozen baseline tolerance
no continuing internal error cascade
```

Report:

```text
recovery_time_seconds
post_stress_baseline_delta
residual_queue_or_error_state
```

If baseline does not recover before the frozen recovery timeout, mark `RECOVERY_FAIL`.

## Backpressure semantics

A controlled backpressure reject may be preferable to unbounded latency/cascade, but it still lowers completion/useful success. Report it separately rather than hiding it as success.

## Required output

For each scale:

1. load -> useful-success curve;
2. load -> p50/p95/(qualified p99) curve;
3. queue/backpressure curve;
4. max sustainable load or explicit external-limit boundary;
5. failure modes ordered by first appearance and prevalence;
6. recovery time and hysteresis result;
7. provider-vs-internal attribution;
8. cross-series interference statement.

## Invalidation

Invalidate an affected step for undeclared mutable shared-resource interference, configuration drift, missing offered-load attribution, mixed warmup/measured windows, or load-generator saturation that makes offered load materially different from the declared step without being reported.
