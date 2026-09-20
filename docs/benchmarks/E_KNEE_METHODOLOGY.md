# E/KNEE — Efficiency Knee Methodology

Status: **FOUNDATION / no result claim**

## Question

At what real-node scale does marginal efficiency stop improving materially, and what operating range is supported by measured evidence?

## Primary curve

E/KNEE consumes the frozen E/PER-RESULT definitions.

Primary v1 curve:

```text
G_cost(N) = cost_per_useful_DIRECT(N) / cost_per_useful_TRUYN(N)
```

Secondary curves:

```text
G_wall(N)
G_compute(N)
TRUYN_tax_pct(N)
```

The primary curve may not be changed after scale measurements are observed.

## Scale grid

Final v1 grid:

```text
50, 75, 100, 150, 200, 350, 500
```

Everything except `N` is frozen: corpus, oracle, provider mix, routing/retrieval/verification policy, workload distribution, load level, model parameters, warmup and measurement policy.

## Evidence density

Each point follows E-Series minimum evidence density: >=1,000 measured NEEDs total and >=5 independent measured batches/runs for final claims, unless pilot variance analysis freezes a larger minimum before final execution.

Report mean + 95% CI for the per-useful primary metric and gain ratio.

## Knee detector

The final campaign freezes the following deterministic detector before any final measured scale point:

1. transform the primary curve to `x = log(N)`, `y = log(G_cost(N))`;
2. fit every admissible single-breakpoint two-segment linear model whose breakpoint leaves at least two observed scale points on each side;
3. choose the breakpoint with minimum total squared residual error;
4. bootstrap the independent run/batch aggregates and refit the breakpoint;
5. accept a **KNEE_OBSERVED** only when:
   - the post-break absolute slope is <=25% of the pre-break positive slope, and
   - at least 70% of bootstrap refits select the same breakpoint or one immediately adjacent observed scale point, and
   - the post-break region does not show a statistically credible renewed growth trend that contradicts the plateau interpretation.

Otherwise report:

```text
NO_KNEE_OBSERVED_IN_RANGE
```

A knee must never be invented by visual inspection.

## Working range

When a knee is observed, publish:

- knee scale with bootstrap support;
- pre-knee growth region;
- recommended measured working range around/below the knee;
- plateau/decline region;
- secondary wall/compute curves;
- DECOMPOSE stage that best explains the curve change.

The recommended range is descriptive for the tested workload/provider mix; it is not a universal deployment recommendation.

## Marginal-gain table

In addition to the breakpoint fit, report interval gains:

```text
marginal_gain(N_i -> N_j) = G_cost(N_j) / G_cost(N_i) - 1
```

This table is interpretability evidence, not an alternate post-hoc knee rule.

## Relationship to DECOMPOSE

KNEE without DECOMPOSE identifies a scale boundary but not the mechanism. For the observed knee/plateau region, compare stage-share and absolute-stage-growth evidence from E/DECOMPOSE.

Examples:

- rising routing/authorization share -> coordination/selection pressure;
- rising verification share -> provenance/trust pressure;
- rising transport/dispatch share -> network/fanout/backpressure pressure;
- flat TRUYN stages + rising provider queue -> provider capacity limitation rather than TRUYN scale limit.

## Missing/blocked points

A point blocked by provider entitlement/quota or shared-resource ownership is labeled `EXTERNAL_LIMITED` or `WAITING_SHARED_RESOURCE`. It is not silently interpolated. If too many grid points are missing to satisfy the detector, the result is `INSUFFICIENT_KNEE_EVIDENCE`.

## Invalidation

Invalidate a point when configuration drift, undeclared material R1/R2 interference, inconsistent corpus/oracle, post-hoc load change, or acceptance-rule change can affect the primary metric.
