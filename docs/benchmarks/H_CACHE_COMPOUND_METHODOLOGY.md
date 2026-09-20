# H/CACHE-COMPOUND — Cross-Node Reuse Compounding Methodology

Status: **METHODOLOGY / NOT YET A RESULT**

## Hypothesis

As more independent TRUYN nodes issue partially overlapping requests against the same immutable content-addressed corpus, cross-node reuse causes the marginal token and dollar cost per request to fall. If the effect strengthens with network size, it is evidence of a network-level reuse effect rather than merely a local cache.

Primary causal statement:

> At fixed workload semantics and overlap distribution, enabling shared TRUYN reuse lowers steady-state cost/request relative to a reuse-disabled paired control, and the reduction increases as the number of participating nodes grows because cross-node hits become a larger part of reuse.

## 1. Experimental factors

Freeze a factorial design over at least:

```text
node_count: 50 / 100 / 200
query_overlap: controlled Zipf distribution
zipf_s: at least low / medium / high overlap strata
cache_state: cold-start then warm/steady-state
arm: TRUYN_REUSE / REUSE_DISABLED_CONTROL
```

The exact request count per cell is frozen in the acceptance manifest after pilot qualification and before the final measured run.

The corpus is immutable and digest-addressed. Query semantics and order are generated from a deterministic seed.

## 2. Arms

### TRUYN_REUSE

Normal content-addressed reuse is enabled. Reusable events may include, but must remain separately observable:

- immutable CID object already present;
- reusable semantic/context materialization;
- reusable RESULT where result caching is part of the tested architecture;
- delta/reference transfer instead of full payload transfer.

### REUSE_DISABLED_CONTROL

Run the identical request semantics and order, but prevent the compared request from consuming shared reusable state created by other requests/nodes. The control must not change provider/model parameters or quality expectations.

The preferred implementation is a disjoint benchmark namespace or deterministic cache-bypass policy, not repeated destructive global cache flushes.

## 3. Procedure

1. Freeze corpus/workload/model/provider pins, node count, Zipf `s`, seed and arm order.
2. Allocate H-owned run/cache namespaces under `H/H-CACHE-COMPOUND/<run-id>`.
3. Verify no foreign series can read/write/evict the H cache namespace.
4. For the cold stratum, assert reusable state for this run namespace is empty.
5. Run both arms under the frozen randomized/balanced order policy.
6. Emit one reuse event for every reusable lookup, including misses.
7. Tag every hit by origin:
   - `same_node`;
   - `cross_node`;
   - `preexisting_frozen` if a frozen immutable object legitimately predates the measured request.
8. Emit actual provider billed usage/cost evidence and all attributable TRUYN overhead.
9. Split cold bucket(s) from warm/steady-state buckets before aggregation.
10. Repeat for all node-count and overlap cells.
11. Recompute headline metrics from raw telemetry and reuse ledger.

## 4. Required telemetry

Per request:

```text
node_id_sanitized
query_id
query_rank_or_popularity_bucket
node_count
zipf_s
cache_stratum
arm
input/output/total billed tokens
provider gross cost
TRUYN variable/fully-loaded cost
request/context/result bytes
latency
quality/correctness
```

Per reuse lookup:

```text
object_class
object_cid_or_safe_digest
hit: true|false
hit_origin: same_node|cross_node|preexisting_frozen|null
producer_node_id_sanitized
consumer_node_id_sanitized
bytes_avoided
tokens_avoided_estimate_or_null
```

CID/object reuse, semantic-context reuse and RESULT caching MUST be reported separately so one mechanism cannot masquerade as another.

## 5. Primary metrics

### Cost/request

For each cell and time bucket:

```text
mean_cost_per_request
median_cost_per_request
p95_cost_per_request
mean_billed_tokens_per_request
```

### Reuse gain against paired control

```text
reuse_cost_reduction = 1 - cost(TRUYN_REUSE) / cost(REUSE_DISABLED_CONTROL)
```

Report variable-provider and fully-loaded variants separately.

### Cross-node reuse share

```text
cross_node_reuse_share = cross_node_hits / all_reuse_hits
```

A network-effect claim requires cross-node hits to dominate steady-state reusable hits; the default acceptance gate is `cross_node_reuse_share > 0.50`, frozen before final measurement.

### Compounding slope

For steady-state buckets, fit the predeclared robust model to cost/request as cumulative requests grow. Report the slope and 95% CI.

The direction required for a compounding claim is:

```text
CI95_upper(compounding_slope) < 0
```

### Network-size interaction

Compare reuse advantage as node count increases at fixed workload-overlap parameters:

```text
network_effect_delta(N2,N1) = reuse_cost_reduction(N2) - reuse_cost_reduction(N1)
```

A “stronger with network size” claim requires the predeclared 95% CI of the relevant interaction/effect to exclude zero in the positive direction.

## 6. Secondary metrics

- CID/object hit rate;
- context-materialization hit rate;
- RESULT-cache hit rate;
- full-vs-delta/reference transfer share;
- bytes/request reduction;
- provider calls/request;
- local vs cross-node bytes avoided;
- cost fairness across nodes (`p95 node mean / p50 node mean`);
- warmup length until stable hit/cost band;
- cache churn/eviction rate;
- stale/invalid reuse rejection count.

## 7. Signal vs noise

The following do **not** prove a network effect:

- a local node repeatedly asking the same question;
- mixing cold and warm buckets into one mean;
- provider price changes between arms;
- an arm using different model parameters or quality budget;
- shared cache warmed by D/S/T/future-series work;
- cost reduction caused by lower output quality;
- a result-cache shortcut when the claim is specifically about CID/context reuse, unless reported separately.

Material cross-series cache contamination invalidates the affected cell.

## 8. Quality guardrail

Every paired request keeps the same output contract. The reuse arm must not achieve lower cost by serving stale, semantically wrong or provenance-invalid material.

Required safety/quality checks:

```text
wrong_reused_result_accepted = 0
provenance_invalid_reuse_accepted = 0
cross_tenant_unauthorized_reuse = 0
```

Accuracy/quality is reported beside cost for every cell.

## 9. Statistical plan

Use paired bootstrap or another method frozen in the acceptance manifest over request/task IDs. Report 95% CIs for:

- reuse cost reduction;
- compounding slope;
- network-size interaction;
- cross-node reuse share.

Do not treat repeated events from one query family as fully independent if the workload generator clusters them; use cluster-aware resampling where required.

## 10. What a PASS can prove

A final PASS supports a bounded statement of the form:

> Under the frozen corpus, overlap distribution, provider pool and node counts, TRUYN reduced steady-state cost/request by X% versus the reuse-disabled control; more than Y% of reuse hits were cross-node; and the measured cost advantage increased as the network grew from N1 to N2.

It does not prove the same effect for arbitrary internet traffic, arbitrary corpora or unmeasured overlap distributions.
