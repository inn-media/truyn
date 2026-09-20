# E/DECOMPOSE — Stage Decomposition Methodology

Status: **FOUNDATION / no result claim**

## Question

Which component dominates end-to-end work at each network scale, and which component grows fastest with node count?

## Controlled variables

Freeze corpus/workload, provider/vendor mix, model configuration, region class, retrieval/rerank policy, routing/authorization policy, verification policy, load shape and DIRECT policy. Vary only the declared node scale for the primary comparison.

Primary scales: `50 / 100 / 200 / 500` real benchmark nodes.

## Canonical semantic stages

Every measured NEED is traced through these logical boundaries:

```text
ingress
retrieval_candidates
retrieval_rerank
routing_authorization
dispatch
provider_queue
provider_inference
verification_provenance
transport_flush
```

A concrete implementation may contain more spans, but public reporting MUST map them deterministically into these canonical stages. No implementation stage may be moved between categories after seeing results.

## Clock discipline

Use monotonic clocks only for duration. Cross-machine wall-clock deltas are invalid for stage attribution. Compute per-host stage distributions first and report the conservative cross-host `max-of-host-quantiles` for stage p50/p95/p99.

Client-observed E2E uses one requester monotonic clock from accepted request start to terminal result.

## Required metrics per stage

For every scale and stage:

- count / completion count;
- p50 / p95 / p99 latency where sample-qualified;
- mean latency;
- request/response bytes attributable to the stage;
- tokens where meaningful;
- gross provider cost or reranker cost where meaningful;
- retry count;
- error taxonomy;
- host/node attribution;
- queue/wait time separately from active execution where observable.

## TRUYN tax

Primary public overhead metric:

```text
TRUYN_tax_ms = retrieval_candidates
             + retrieval_rerank
             + routing_authorization
             + dispatch
             + verification_provenance
             + transport_flush
```

`provider_queue` and `provider_inference` are reported separately because the provider cost/latency exists even without TRUYN, although queue behavior may still be affected by routing/load.

```text
TRUYN_tax_pct = TRUYN_tax_ms / E2E_ms * 100
```

Do not sum independently reported p95s and call the result E2E p95. Tax decomposition at request level must be computed per request first, then summarized.

## Dominance metrics

At scale `N`:

```text
stage_share_i(N) = stage_duration_i(N) / E2E_duration(N)
```

Growth indicator:

```text
stage_growth_i(N1,N2) = median_stage_i(N2) / median_stage_i(N1)
```

A stage is a **candidate scale bottleneck** when its share or absolute latency increases materially with N while workload/provider settings are frozen. A final bottleneck conclusion should be supported by both stage-share behavior and absolute stage growth, not share alone.

## Interpretation

- provider inference dominates and stays flat vs N -> TRUYN overhead is not the scaling limiter for the observed range;
- routing/authorization grows with N -> selection/authority path is a likely scale limiter;
- retrieval/rerank grows -> retrieval/index/candidate fanout is the likely target;
- verification grows -> provenance/trust verification is the likely target;
- transport/dispatch grows -> network/fanout/backpressure path is the likely target;
- queue grows while active stages remain flat -> capacity contention rather than pure algorithmic cost.

## Required output

For each scale:

1. stacked stage-duration bar using one declared statistic, normally median request-level contribution;
2. p50/p95 table by stage;
3. TRUYN tax in ms and %;
4. stage bytes/tokens/cost where applicable;
5. candidate dominant stage and evidence;
6. explicit external/provider constraints;
7. cross-series interference status.

## Invalidation

Invalidate the affected cell when stage boundaries are missing for a headline component, monotonic duration is unavailable, cross-host wall-clock subtraction was used, corpus/provider configuration drifted, or material undeclared R1/R2 interference occurred.
