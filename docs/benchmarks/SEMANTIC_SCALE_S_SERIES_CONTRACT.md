# TRUYN Semantic Scale S-Series Benchmark Contract

Status: **METHODOLOGY / NO S-SERIES PASS CLAIM YET**  
Applies to: **S-50, S-100, S-200, S-500**

This document defines the fixed benchmark method and acceptance boundary for the live semantic-node scale family described in `../architecture/SEMANTIC_SCALE_S_SERIES.md`.

## 1. Acceptance philosophy

S-Series combines already-proven TRUYN network and semantic/provider paths. It does not weaken either layer in order to reach a larger node count.

A run is accepted only if:

- the exact tested source and benchmark configuration are immutable and recorded;
- all counted nodes are real independently identified runtime processes;
- the required real provider families participate according to the declared profile;
- the benchmark uses real network paths rather than synthetic node counters;
- hard gates were declared before launch and were not relaxed afterward;
- cleanup/evidence closure is complete;
- failures remain preserved as failures.

A larger node count never compensates for a failed correctness, provenance, authorization or recovery gate.

## 2. Semantic-node eligibility

A node counts toward `S-x` only if all are true:

1. unique TRUYN identity;
2. real live process and network endpoint;
3. participates in the declared TRUYN discovery/routing substrate;
4. assigned to one of the seven required text-provider families;
5. provider authorization succeeds for the benchmark requester before execution;
6. at least one real inference request is attributable to that node during the measured scenario unless the scenario explicitly measures an outage/revocation state for that node;
7. node/provider/request telemetry is present and attributable to the immutable run.

Synthetic identities, mocked provider completions and duplicated identity aliases do not count.

## 3. Required provider families

A full S-Series gate uses all seven text-provider families:

- GPT;
- Gemini;
- Grok;
- DeepSeek;
- Llama;
- Mistral;
- Kimi.

The exact model/deployment version is operational configuration and must be captured in evidence. The protocol and capability remain vendor/version independent.

Before an S run, each selected provider path must have either:

- a previously accepted live smoke/evidence path on the tested implementation; or
- a same-source preflight proving provider access without changing S acceptance semantics.

A provider that is `blocked_access`, unavailable, missing quota or missing deployment cannot be silently replaced while still claiming the original seven-vendor S gate. That run is blocked/incomplete unless the benchmark contract was explicitly a narrower diagnostic run.

## 4. Fixed hard gates common to S-50 / S-100 / S-200 / S-500

The following thresholds are inherited from the already-used Class-D and Semantic Retrieval benchmark families and are fixed across the S ladder:

| Gate | Required |
|---|---:|
| Routing success | **>= 99%** |
| Recovery p95 | **<= 120 s** |
| Answer correctness | **>= 99%** |
| Retrieval correctness where retrieval is exercised | **>= 99%** |
| Provenance verification | **100%** |
| Minimal-context correctness | **100%** |
| Block-ID / internal selection leakage | **0** |
| Acknowledged durable-write loss where durability is exercised | **0** |
| Invalid signed state accepted | **0** |
| Stale/revoked receipt accepted | **0** |
| Unauthorized provider execution | **0** |
| Provider input-token reduction for paired ECON workload | **>= 90%** |
| Comparable provider inference-cost reduction for paired ECON workload | **>= 90%** |

A scenario may add stricter predicates before launch. It may not weaken these common predicates.

## 5. A/B economic method (`ECON`)

Every economic sample is paired.

### DIRECT arm

The selected provider receives the full comparison context required by the benchmark task.

### TRUYN arm

The same task uses the TRUYN semantic path:

```text
question + root CID
→ retrieval
→ provenance verification
→ minimal context
→ provider
```

The TRUYN arm includes routing/retrieval/orchestration overhead. Reusable one-time publication/index transfer is measured separately and amortized explicitly over the requests that reuse it.

For each pair record:

- provider/model/version;
- input/output tokens from authoritative provider usage when exposed;
- request/response bytes;
- provider latency;
- TRUYN network/retrieval/orchestration latency;
- full end-to-end latency;
- gross provider list-price-equivalent cost using a dated price snapshot;
- credit-covered amount when known;
- net cash cost when known;
- reusable publication/index bytes/cost;
- amortized transfer/cost for the measured reuse count;
- answer/correctness outcome.

If authoritative token/cost data required for the economic claim is unavailable, the sample cannot be represented as a measured token/cost PASS. Missing values remain missing; they are not estimated into a PASS claim.

## 6. Vendor-mix method (`MIX`)

Run the same workload under:

- balanced assignment;
- 60%-single-vendor skew;
- seeded per-request randomized assignment.

Required additional acceptance:

- all seven provider families represented in the benchmark evidence;
- per-vendor answer correctness **>=99%** where the sample count supports that calculation;
- per-vendor input-token reduction **>=90%** for ECON-compatible paired samples;
- spread between the maximum and minimum per-vendor token-reduction percentage: **< 1 percentage point** for the declared invariant workload.

The assignment map and random seed must be preserved.

## 7. Cross-border method (`XBORDER`)

Target topology:

- at least 3 cloud regions;
- at least 2 cloud providers;
- at least 2 countries/jurisdictions for a literal cross-border claim.

The run must exercise both intra-region/intra-cloud and cross-region/cross-cloud paths where the scenario requires comparison.

Required hard gates remain routing >=99%, recovery p95 <=120 s, answer >=99%, provenance 100% and zero unauthorized execution.

Measure, but do not invent an acceptance threshold for:

- cross-region latency delta vs intra-region;
- cross-cloud latency delta;
- bytes transferred by path class;
- provider latency by region/vendor;
- partition-to-heal timing;
- cross-border request share;
- cross-border successful task share.

A future threshold may be added only before a run and then becomes immutable for that run.

## 8. Multi-hop method (`CHAIN`)

Canonical chain shape:

```text
research → review → synthesize
```

Adjacent hops use different vendor families. Every hop must retain the same request/chain correlation identity and verifiable provenance lineage.

Required:

- completed chain correctness >=99%;
- provenance verification 100% at every hop;
- unauthorized execution 0;
- stale/revoked receipt acceptance 0;
- no hidden substitution of an undeclared provider.

Measure hop count, hop/provider identities, per-hop and E2E latency, per-hop tokens/cost and provenance/receipt status.

## 9. Failure method (`CHURN`)

During active workload, exercise the already-supported failure classes relevant to the scenario:

- selected node/provider process loss;
- network partition/heal;
- provider credential/authorization revocation or equivalent provider-unavailability event.

The scenario must not convert a revoked/unauthorized provider into a successful invocation.

Required:

- recovery p95 <=120 s for the measured recoverable network/node failure class;
- stale/revoked receipt accepted = 0;
- unauthorized provider execution = 0;
- routing/answer correctness remains >=99% on requests that the scenario declares recoverable.

Record failover path, failover latency and terminal state for every affected request.

## 10. Policy method (`COST-ROUTING`)

A NEED may declare the already-defined benchmark constraints:

- maximum cost;
- minimum trust;
- maximum latency target.

The benchmark compares eligible lower-cost provider choices with an always-premium control where applicable.

Required:

- **0 provider-eligibility violations**;
- **0 authorization violations**;
- selected provider satisfies every hard policy constraint that can be evaluated before dispatch;
- answer correctness >=99%.

Measure blended provider cost vs always-premium control, provider selection distribution, policy-hit rate and observed latency. Do not convert a soft latency target into a fake pre-dispatch guarantee.

## 11. Contention method (`CONTENTION`)

All/large subsets of S-nodes emit NEED workload concurrently according to a recorded load schedule.

Measure:

- offered request rate;
- accepted/completed request rate;
- p50/p95/p99 E2E latency;
- provider rate-limit responses;
- TRUYN queue depth/backpressure events;
- cancellation count and latency;
- retries separated by transport/provider/application layer;
- timeout/error class;
- cascading-failure indicators;
- CPU/RSS/network bytes where available.

Hard safety/correctness gates remain in force. Throughput is initially a measured benchmark result rather than an invented fixed threshold; later S levels can pin a threshold before launch using lower-level evidence.

## 12. Language method (`LANG`)

Required language set:

- EN;
- TR;
- ZH;
- RU;
- AZ.

The benchmark must report each language independently, not only aggregate accuracy.

Required per language:

- retrieval correctness >=99% where retrieval is exercised;
- answer correctness >=99%;
- provenance 100%;
- block-ID leakage 0.

Workload construction, expected answers and judge/evaluator version must be immutable within the run.

## 13. Ladder execution intent

### S-50

First establish `ECON` and `MIX` as the integration/economic baseline. Then execute the remaining scenario matrix using the same S-50 source and explicit scenario configurations where practical.

### S-100 / S-200

Repeat the same comparable core scenarios to produce scale curves and detect degradation. A prior smaller PASS is baseline evidence, not a substitute for the larger gate.

### S-500

At minimum preserve comparable `ECON`, `XBORDER` and `COST-ROUTING` results; other scenarios remain part of the target matrix and may execute independently if bounded by provider quota/cost controls.

No S-500 headline may be inferred from extrapolation of S-50/100/200.

## 14. Run identity and reproducibility

Every measured scenario run must preserve:

- `S_LEVEL`;
- scenario;
- immutable tested source SHA/tree;
- workflow/run/attempt;
- configuration digest;
- provider assignment map digest;
- random seed when used;
- corpus/workload/evaluator identity;
- model/version mapping;
- node count and unique-identity count;
- cloud/region distribution;
- fixed gates;
- normalized telemetry artifact identity/digest;
- terminal result;
- cleanup result.

Changing source, workload, provider map or gate set creates a new run identity.

## 15. Evidence status vocabulary

Use only:

- `PREPARED` — contract/config prepared, not executed;
- `BLOCKED_ACCESS` — provider/region/quota entitlement prevents execution;
- `RUNNING` — immutable run exists and is active;
- `PASS` — all required predicates satisfied and evidence closed;
- `FAIL` — a required predicate failed;
- `INVALID` — measurement/evidence integrity failed and no PASS claim is permitted.

A failed or invalid run is never silently replaced. Subsequent attempts get new immutable identities.

## 16. Current state

The S-Series architecture and methodology are defined. **No S-50/S-100/S-200/S-500 acceptance result exists yet.**
