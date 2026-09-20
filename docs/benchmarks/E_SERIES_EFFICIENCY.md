# E-Series Efficiency Benchmark Contract

Status: **FOUNDATION / NORMATIVE METHODOLOGY**  
Scope: efficiency limits, bottlenecks, useful-result economics, scale knee and overload behavior.  
Result status: **no E-series PASS is claimed by this document**.

## 1. Purpose

E-Series answers four different questions without collapsing them into one number:

1. **E/DECOMPOSE** — where end-to-end time, bytes and cost are spent, and which stage becomes dominant as node count grows;
2. **E/PER-RESULT** — how much money, wall time and compute are spent per **useful/correct result**, compared with a paired DIRECT control;
3. **E/KNEE** — at what deployment size marginal efficiency stops improving materially;
4. **E/DEGRADE** — how the system behaves as offered load crosses sustainable capacity, including recovery/hysteresis.

The intended causal sequence is:

```text
DECOMPOSE -> PER-RESULT -> KNEE -> DEGRADE
```

DECOMPOSE explains the mechanism, PER-RESULT defines the unit of useful efficiency, KNEE finds the efficient operating range, and DEGRADE finds the capacity ceiling and edge behavior.

## 2. Repository boundary

Public `inn-media/truyn` owns:

- benchmark hypotheses and definitions;
- stage taxonomy and telemetry field semantics;
- formulas and acceptance/invalidation rules;
- public-safe deterministic workloads/corpus descriptors when publishable;
- sanitized evidence and reproducible report formats;
- cross-series isolation semantics.

Private `inn-media/truyn-platform` owns:

- real cloud resource/deployment identifiers;
- provider quotas/capacity allocations and actual billing reconciliation;
- private workload material or holdouts;
- raw traces/logs that contain private topology or provider identifiers;
- run coordination/leases, active-run registry and private cleanup commands;
- exact spend ceilings, account credits and operational cost limits;
- private load-generator deployment details and capacity reservations.

Public code/documentation MUST NOT depend on private source. Private execution consumes only an immutable released/pinned public contract.

## 3. E-Series v1 comparability scope

E-Series v1 is **text/reasoning only** unless a later modality-specific E profile is declared. Image/video generation have different output-unit economics and must not be mixed into text efficiency curves.

For one E campaign, freeze before the first measured run:

```text
public_truyn_sha_or_release
private_runner_sha
corpus/workload digest
oracle digest
provider/vendor mix
provider model/deployment class
region class
retrieval/rerank configuration
routing/authorization policy
verification/provenance policy
context policy
DIRECT comparator policy
temperature/thinking budget
retry/deadline policy
price snapshot / billing attribution mode
scale grid
load grid
warmup policy
sample minima
confidence method
```

The immutable corpus, oracle and provider mix MUST remain constant across comparable scale points.

## 4. Scale grids

### E/DECOMPOSE

Primary node counts:

```text
50, 100, 200, 500
```

### E/KNEE

Dense scale grid:

```text
50, 75, 100, 150, 200, 350, 500
```

A point may be skipped only for an explicit external-access/capacity reason. Missing points are reported, never interpolated as observed measurements.

### E/DEGRADE

Run separately at:

```text
50, 100, 200, 500
```

Each scale has its own frozen offered-load ladder.

## 5. Common measured unit

The primary logical request unit is one accepted **NEED** transaction with exactly one terminal outcome.

Every measured NEED receives a globally unique `request_id` and is attributable to exactly one:

```text
series_id = E
benchmark_id
run_id
scale_n
arm
request_id
```

Retries are not new useful requests. Their cost/time are charged to the originating request.

## 6. Useful-result gate

A result is `useful=true` only when all applicable conditions pass:

```text
oracle_correct = true
provenance_or_trust_valid = true
minimal_context_valid = true
safety_authorization_valid = true
terminal_result_present = true
```

A wrong, unverified, provenance-invalid or minimal-context-invalid answer may consume time/tokens/money but contributes **zero useful results**.

The correctness oracle MUST be frozen before the measured campaign and MUST NOT be the tested model itself. Prefer deterministic extractable facts or a precommitted hidden gold answer set.

## 7. DIRECT control

Every E/PER-RESULT and E/KNEE claim requires a paired DIRECT arm using the same:

- task/question;
- provider/model family where feasible;
- output requirements;
- oracle;
- temperature/thinking budget;
- deadline/retry class;
- measurement window.

DIRECT correctness is judged by the same useful-result gate. DIRECT does not get credit merely for returning a response.

Pair order SHOULD be randomized or counterbalanced to reduce provider/time-of-day bias.

## 8. Clock and latency rule

Cross-host wall-clock subtraction is forbidden for stage attribution.

- stage duration is measured with a **monotonic clock on the host/process that owns that stage**;
- host-local stage quantiles are computed first;
- cross-host conservative reporting uses `max-of-host-quantiles` for the same stage/scale unless another frozen aggregation is explicitly justified;
- E2E client-observed wall latency may use the requester's monotonic clock because start and terminal observation occur on one host/process.

## 9. Warmup and steady state

Bootstrap/warmup is outside the measured window.

A measured run starts only after:

- all expected nodes/providers are ready;
- corpus/index generation is frozen and available;
- expected connections/routes are established;
- provider authentication is ready;
- no benchmark bootstrap mutation remains in progress;
- the frozen warmup condition is satisfied.

Warmup requests remain auditable but are marked `measured=false` and are excluded from headline metrics.

## 10. Minimum evidence density

For final claims:

- each DECOMPOSE/KNEE scale point SHOULD contain at least **1,000 measured NEEDs total** and at least **5 independent measured batches/runs**;
- confidence intervals are computed over independent run/batch aggregates, not by pretending every correlated request is independent;
- p99 is headline-grade only when the relevant condition contains at least **10,000 measured observations**; otherwise p99 is labeled exploratory;
- pilot runs may use lower counts only to validate instrumentation, variance and spend and MUST NOT become final claims.

Exact final sample minima may be increased after pilot variance analysis, but MUST be frozen before final immutable runs.

## 11. Confidence reporting

Default confidence reporting:

- mean + 95% bootstrap CI for cost/useful and wall/useful;
- p50/p95 and, where sample-qualified, p99 for latency/stage distributions;
- bootstrap CI for efficiency ratios using paired run-level resampling where pairing exists;
- no post-hoc removal of outliers except predeclared invalidation conditions.

## 12. Public headline outputs

A completed E series should produce four linked public reports:

1. **stage stacked bars** and `TRUYN tax` in ms and % at each DECOMPOSE scale;
2. **$/wall/compute per useful result** for TRUYN and DIRECT plus correctness-adjusted efficiency ratios;
3. **efficiency-vs-scale curve** with knee/working range or explicit `NO_KNEE_OBSERVED`;
4. **load-vs-success/latency curves**, max sustainable load, ordered failure modes and recovery time for each DEGRADE scale.

Every public conclusion MUST remain bounded to the frozen corpus/workload/provider/configuration and observed scale range.

## 13. Cross-series isolation

E may run in parallel with D, S, T, H and future series only under `BENCHMARK_SERIES_ISOLATION.md`.

Mandatory E namespace:

```text
E/<benchmark_id>/<run_id>
```

E MUST NOT:

- change capacity of a provider deployment actively measured by another series;
- warm/flush a foreign cache/index;
- reuse foreign telemetry/artifact/budget namespaces;
- inject load into a foreign measured endpoint without declared R1 sharing and interference accounting;
- fault a shared network/provider target without an R2 lease;
- clean up resources it does not own.

If material cross-series interference can affect a headline metric, the run is `INCOMPLETE` or `INVALIDATED`, not PASS.

## 14. Provider-limit attribution

Provider throttling is evidence, not automatically a TRUYN defect.

Every terminal or retry error is classified at minimum as:

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

An external provider-429 is excluded from the **internal-saturation cause count** but remains visible in the measured record and in end-user success/latency reporting. If external quota prevents measuring the intended internal capacity point, that step is `EXTERNAL_LIMITED`, not silently discarded.

## 15. Safety precedence

No E benchmark may weaken:

- provider ownership/authorization;
- tenant boundaries;
- safety/provenance gates;
- benchmark evidence preservation;
- D/S/T/H acceptance thresholds;
- production or other active benchmark resource protections.

Performance is never accepted by bypassing authorization, verification or correctness.

## 16. Result-state vocabulary

```text
DRAFT
PILOT
QUALIFIED
RUNNING
WAITING_SHARED_RESOURCE
EXTERNAL_LIMITED
INCOMPLETE
INVALIDATED
FAIL
PASS
```

Foundation documents, harness code and pilot data are not PASS.

## 17. Canonical companion documents

- `E_DECOMPOSE_METHODOLOGY.md`
- `E_PER_RESULT_METHODOLOGY.md`
- `E_KNEE_METHODOLOGY.md`
- `E_DEGRADE_METHODOLOGY.md`
- `E_SERIES_TELEMETRY.md`
- `../operations/E_SERIES_EXECUTION.md`
- `BENCHMARK_SERIES_ISOLATION.md`
