# E/PER-RESULT — Useful-Result Efficiency Methodology

Status: **FOUNDATION / no result claim**

## Question

How much money, wall time and compute are consumed per **useful/correct result**, and how does that compare with a paired DIRECT control?

## Useful result

A returned response counts as useful only when all applicable gates pass:

```text
oracle_correct
AND provenance_or_trust_valid
AND minimal_context_valid
AND authorization_valid
AND terminal_result_present
```

Failed, wrong, unverifiable or context-invalid responses still contribute all incurred cost/time/compute to the numerator but add zero to useful-result count.

The oracle is frozen before the measured run and must be independent of the tested model.

## Arms

Minimum required arms:

```text
TRUYN
DIRECT
```

Each pair uses the same task, oracle, provider/model class where feasible, output contract, temperature/thinking budget and deadline/retry class.

DIRECT must not be granted a weaker correctness rule.

## Primary numerators

### Money

Public comparable economics SHOULD report provider list-price/gross billed-equivalent attribution. Private execution additionally reconciles actual billed usage, credits and net cash without exposing sensitive account data.

```text
total_attributed_cost = provider_cost
                      + attributable_rerank_cost
                      + attributable_infrastructure_variable_cost
                      + declared_fixed_cost_share_if_fully_loaded
```

Variable-only and fully-loaded views must be labeled separately.

### Wall time

Requester monotonic elapsed time from accepted request start to terminal result, including failed attempts/retries charged to that logical request.

### Compute

For self-hosted providers, use actual measured compute-seconds when available. For hosted APIs where compute-seconds are unavailable, use a declared proxy such as normalized input/output tokens and never label the proxy as measured GPU/CPU seconds.

## Primary formulas

For arm `A`:

```text
useful_A = count(useful=true)

cost_per_useful_A = sum(attributed_cost_A) / useful_A
wall_per_useful_A = sum(elapsed_seconds_A) / useful_A
compute_per_useful_A = sum(compute_or_proxy_A) / useful_A
```

If `useful_A = 0`, the metric is `+infinity`, not zero or NA.

Correctness-adjusted efficiency ratio, DIRECT vs TRUYN:

```text
cost_efficiency_gain = cost_per_useful_DIRECT / cost_per_useful_TRUYN
wall_efficiency_gain = wall_per_useful_DIRECT / wall_per_useful_TRUYN
compute_efficiency_gain = compute_per_useful_DIRECT / compute_per_useful_TRUYN
```

A value `>1` favors TRUYN for that metric; `<1` favors DIRECT. Report raw arm values alongside ratios.

## Accuracy and waste metrics

Always report:

```text
useful_rate = useful_results / logical_requests
wasted_cost = cost from requests with useful=false
wasted_compute = compute/proxy from requests with useful=false
wasted_wall = elapsed contribution from requests with useful=false
```

This prevents token reduction from hiding correctness losses and exposes money spent on unusable answers.

## Pairing and order

Tasks are paired by immutable task ID. Pair order is randomized/counterbalanced. If provider conditions differ materially between paired arms, the pair is flagged and either rerun under the frozen policy or excluded only through a predeclared invalidation rule.

## Required output

For TRUYN and DIRECT separately:

- logical request count;
- useful-result count and useful rate;
- total and per-useful gross cost;
- total and per-useful wall seconds;
- total and per-useful compute/proxy;
- wrong/unverified/minimal-context failure counts;
- wasted cost/compute/wall;
- 95% CI for per-useful metrics;
- paired efficiency ratios with CI.

The headline comparison must include both absolute values and the ratio.

## Guardrails

A cheaper result does not count as an efficiency win if correctness/provenance/minimal-context gates are weakened. Authorization/safety failures invalidate the run regardless of cost.

## Relationship to KNEE

E/KNEE consumes the frozen PER-RESULT metric definitions. The primary v1 knee curve is `cost_efficiency_gain(N)`; wall and compute gains are secondary curves. The primary metric cannot be changed after observing scale results.
