# T/PREDICT — Cost and Latency Predictability Methodology

Status: **PLANNED / NO RESULT CLAIM**

## Objective

Prove whether TRUYN provides bounded per-request cost and latency tails under realistic steady load and controlled degradation, rather than only attractive averages.

The enterprise question is:

> Can a buyer predict what a request will cost and how long it will take, including p99 behavior and controlled failures?

## Compared arms

Primary comparison:

- `DIRECT` — same frozen task class through the full-context direct path;
- `TRUYN` — same frozen task class through TRUYN retrieval/routing/verification and minimal context.

Optional additional comparator arms MAY be included, but DIRECT and TRUYN are mandatory.

## Workload class

A run fixes one workload class whose semantics stay constant while input values vary realistically.

The run manifest MUST freeze:

- corpus/workload digest;
- query/input generator or exact sample set;
- model/version;
- completion budget;
- offered load/concurrency;
- request timeout/deadline;
- retry policy;
- cache policy;
- region/provider placement class;
- guardrail policy;
- stress scenarios;
- acceptance thresholds.

Do not mix materially different task classes into one p99 distribution.

## Sample-size policy

A final public p99 claim requires enough observations to make the tail meaningful.

Default requirements:

- **pilot:** at least `1,000` measured requests per arm/condition; p99 is diagnostic only;
- **final p99 claim:** at least `10,000` measured requests per arm/condition after warmup.

If fewer than 10,000 measured requests are available, the report MUST state that the p99 result is preliminary and MUST NOT describe it as an enterprise/SLA-grade tail proof.

## Baseline load phase

1. Warm providers and TRUYN according to the frozen policy.
2. Exclude warmup samples.
3. Apply a steady offered load below the pre-measured saturation point.
4. Hold the load profile constant for DIRECT and TRUYN.
5. Capture every success, controlled failure, timeout, retry and rejected request.
6. Continue until the required sample count is reached.

The benchmark MUST publish enough throughput/concurrency context to interpret the latency distribution.

## Metrics

### Cost distribution

Per arm/condition publish:

- p50 / p90 / p95 / p99 / max `gross_provider_cost_usd`;
- p50 / p90 / p95 / p99 / max `fully_loaded_cost_usd` where available;
- mean;
- standard deviation;
- coefficient of variation (`CoV = stddev / mean`);
- median absolute deviation;
- p99/p50 ratio;
- min/max billed input tokens;
- min/max billed output tokens.

### Latency distribution

Publish separately:

- E2E latency;
- provider latency;
- TRUYN-only latency;
- retrieval latency;
- verification latency;
- queue/wait latency if observable.

For each applicable component publish p50/p90/p95/p99/max, mean, standard deviation, CoV and p99/p50.

### Outcome distribution

Publish:

- success rate;
- controlled-failure rate;
- uncontrolled-error rate;
- timeout rate;
- retry rate;
- reroute rate;
- fail-closed rate;
- guardrail rejection rate.

A fast controlled failure is not counted as a successful request.

## Cost and latency guardrails

The benchmark exercises NEED/request policies that carry predeclared ceilings such as:

```json
{
  "maxCostUsd": 0.0,
  "deadlineMs": 0,
  "maxRetries": 0,
  "allowReroute": true
}
```

The exact values are private run configuration when operationally sensitive, but the public report MUST disclose whether each hard guardrail was enforced and the observed breach counts.

Required guardrail metrics:

- `pre_dispatch_cost_reject_count`;
- `post_dispatch_hard_cost_breach_count`;
- `accepted_response_deadline_breach_count`;
- `controlled_deadline_fail_count`;
- `reroute_success_count`;
- `reroute_failure_count`;
- `provider_calls_after_fail_closed`;
- `bounded_outcome_rate` = `(success_within_bounds + controlled_fail_within_bounds) / total_requests`.

A request that violates a hard pre-dispatch cost ceiling MUST NOT reach the paid provider.

## Stress matrix

A final T/PREDICT run includes controlled disturbances. At minimum:

1. **provider slowdown** — inject deterministic additional provider-path latency;
2. **rate-limit pressure** — inject or safely induce bounded throttling/429 behavior;
3. **regional/provider degradation** — make one eligible path unavailable or unhealthy so routing/fail-closed behavior is exercised.

Recommended two-level pattern per disturbance:

- `MILD` — degradation that should normally be absorbed without user-visible failure;
- `SEVERE` — degradation that may require reroute or controlled failure.

Exact values are frozen in the private run manifest before execution.

The benchmark MUST NOT alter provider production settings in a way that can affect unrelated workloads.

## Stress reporting

For each disturbance report:

- baseline p99 latency;
- stressed p99 latency;
- `p99_shift_ratio = stressed_p99 / baseline_p99`;
- baseline p99 cost;
- stressed p99 cost;
- success/controlled-failure/error split;
- reroute rate;
- retry rate;
- guardrail breach counts;
- provider-call count after fail-closed decisions.

Do not report only successful samples. Failed and controlled-failure requests remain in the outcome distribution.

## Direct-vs-TRUYN comparison

For each arm compare:

- cost p99/p50;
- latency p99/p50;
- cost CoV;
- latency CoV;
- max cost;
- max latency;
- billed token range;
- bounded outcome rate;
- p99 shift under each stress condition.

The desired commercial property is not merely a lower median. It is a narrower and enforceable distribution.

## Default first-final-run acceptance profile

Unless superseded **before the first measured request** by a stricter frozen manifest, the first final run should use:

```text
BASELINE
cost p99 / cost p50 <= 1.25
latency p99 / latency p50 <= 2.00
hard pre-dispatch cost breaches = 0
accepted responses beyond hard deadline = 0
provider calls after fail-closed = 0
bounded outcome rate >= 99.9%

STRESS
hard cost breaches = 0
accepted responses beyond hard deadline = 0
provider calls after fail-closed = 0
bounded outcome rate >= 99.0%
stressed latency p99 / baseline latency p99 <= 2.50
```

The run also freezes a maximum acceptable quality/accuracy regression. A request is not considered commercially successful if cost/latency is bounded but output quality falls below the workload's acceptance floor.

These defaults are intentionally demanding. If they fail, the failure is retained and the next run may introduce a new, prospectively declared profile; the failed run is never relabeled.

## Procedure

1. Freeze SHA/release, model, workload class, load profile, guardrails, stress matrix and acceptance thresholds.
2. Validate telemetry completeness before paid load.
3. Execute warmup and exclude tagged warmups.
4. Run baseline DIRECT to required sample count.
5. Run baseline TRUYN to required sample count using the same offered-load profile.
6. Alternate or time-balance the arm schedule to reduce provider diurnal bias.
7. Execute each frozen stress condition for DIRECT and TRUYN where the condition is meaningful.
8. Preserve all errors/retries/controlled failures.
9. Compute percentile distributions from raw samples, not averages of per-batch percentiles.
10. Verify guardrail invariants from both requester and provider-execution telemetry.
11. Publish sanitized raw/per-sample measurements or a lossless safe equivalent plus digest.
12. Produce the final percentile-band/SLA-style chart and negative findings.

## Statistical hygiene

- Percentiles are computed over individual measured requests.
- Use the same percentile definition/library for every arm.
- Report sample count with every percentile table.
- For p99, include a bootstrap confidence interval when computationally feasible.
- Do not trim outliers unless the trimming rule was frozen in advance; prefer publishing both raw and incident-stratified distributions.
- Provider incidents are not silently deleted. They are either part of the distribution or reported as a separately justified incident stratum under the frozen incident policy.

## Acceptance

A T/PREDICT PASS requires:

1. final-sample-size requirement met for every condition used in a p99 claim;
2. provider usage/cost evidence meets the T-series cost evidence rule;
3. baseline cost and latency tail gates pass;
4. hard guardrail breach counts are zero;
5. no paid provider call occurs after a fail-closed decision;
6. stress bounded-outcome and p99-shift gates pass;
7. output quality remains above the frozen floor;
8. raw evidence, manifest, tested SHA and artifact digest are immutable.

## Primary outputs

- percentile-band chart for `$/request`;
- percentile-band chart for E2E latency;
- p50/p90/p95/p99/max table;
- CoV and p99/p50 table;
- stress p99-shift chart;
- hard-guardrail breach table;
- bounded-outcome table.
