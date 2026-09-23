# Benchmark Series Isolation Contract

Status: **NORMATIVE**  
Scope: all TRUYN benchmark/test families, including T, D, S, H, E and future series.

TRUYN benchmark families are designed to execute concurrently. A run from one series MUST NOT invalidate, perturb, overwrite, throttle, warm, fault-inject, spend from, or otherwise contaminate another series except where an explicitly declared shared dependency is immutable/read-only and proven not to alter measured conditions.

## 1. Isolation identity

Every measured or qualifying execution MUST carry:

```text
series_id
benchmark_id
run_id
run_class
public_truyn_sha_or_release
runner_sha_or_workflow_identity
```

Canonical execution namespace:

```text
<series_id>/<benchmark_id>/<run_id>
```

Examples:

```text
T/T-PREDICT/<run-id>
D/D-200/<run-id>
S/<benchmark>/<run-id>
H/<benchmark>/<run-id>
E/E-DECOMPOSE/<run-id>
E/E-PER-RESULT/<run-id>
E/E-KNEE/<run-id>
E/E-DEGRADE/<run-id>
```

`run_id` MUST be globally unique within the repository evidence domain. A mutable alias such as `latest`, `current`, or a branch name MUST NOT be an evidence identity.

## 2. What MUST be isolated

The following mutable state MUST be namespaced at least by `series_id` and `run_id`:

- run ledger/state machine;
- telemetry streams and temporary aggregation state;
- object-storage prefixes / artifact directories;
- caches unless a benchmark explicitly measures a shared-cache architecture;
- temporary indexes and corpus generations;
- stress/fault-injection targets and control state;
- ephemeral cloud resources;
- provider-capacity reservations where isolation is required for validity;
- benchmark identities/allowlists when provider execution is owner-funded;
- spend counters and run budgets;
- retry/deadline state;
- cleanup/rollback records;
- sanitized export staging;
- checksums and immutable evidence bundles.

One series MUST NOT reuse another series' mutable `run_id`, state path, artifact prefix, cache namespace or temporary-resource namespace.

## 3. Shared resources

Shared dependencies are allowed only when classified before the run.

### Class R0 — immutable/read-only shared

Examples: pinned source SHA, released SDK artifact, frozen public corpus, public price snapshot.

Allowed concurrently without additional exclusion when the dependency cannot be mutated by benchmark execution.

### Class R1 — shared service, observationally isolated

Examples: a provider endpoint, durable database, network fabric or telemetry backend used by several series.

Allowed only when:

- each series has distinct request/run attribution;
- quotas/concurrency are either independently partitioned or measured interference is proven negligible for the claimed metric;
- one series cannot mutate another series' configuration/state;
- a load/interference detector is active when latency/capacity is part of acceptance.

For E-Series, provider endpoints and shared network fabric are often R1 only when E does not change their capacity/configuration and can observe throttling/interference separately from TRUYN saturation.

### Class R2 — exclusive mutable/fault target

Examples: region degradation target, shared cache being flushed, mutable index, provider deployment whose capacity is being changed, network route under fault injection.

R2 MUST use an exclusive lease/lock. Parallel series may continue only on disjoint R2 targets.

E/DEGRADE does not automatically make a provider deployment R2: offered-load generation against an unchanged shared endpoint may remain R1 if interference is measurable and acceptable. Changing provider capacity, throttling configuration, route state or shared cache/index state makes the affected target R2.

A benchmark is invalidated when an undeclared cross-series R1/R2 interaction can affect a headline metric.

## 4. Concurrency contract

Repository/workflow concurrency MUST be scoped narrowly enough that unrelated series do not cancel or serialize each other.

Bad pattern:

```text
concurrency-group = truyn-benchmark
```

Required pattern:

```text
concurrency-group = <series_id>-<benchmark_id>-<resource_scope>
```

Cancellation policy MUST NOT allow a newer S/D/H/T/E run to cancel an unrelated active run from another series.

Global locks are prohibited unless the underlying resource is genuinely global and mutable. When a global exclusive dependency is unavoidable, the waiting series records `WAITING_SHARED_RESOURCE` with exact owner/lease identity rather than modifying or cancelling the active run.

## 5. Telemetry and evidence attribution

Every normalized telemetry/event record for any series SHOULD carry `seriesId` and MUST carry enough run identity to join unambiguously to exactly one run.

For T-series, `seriesId = "T"` is mandatory in implementation even where older schema examples omit it. For E-Series, `seriesId = "E"`, `benchmarkId`, `runId`, `batchId`, `requestId`, `scaleN` and `arm` are mandatory for measured request-level evidence.

Cross-series dashboards MAY aggregate, but accepted evidence MUST be reconstructable from one series/run namespace without relying on mutable global summaries.

## 6. Cost/budget isolation

Each paid run has its own spend envelope.

Required:

```text
series_budget_id
run_budget_id
maximum_run_spend
attributed_provider_usage
attributed_infrastructure_usage
```

A different concurrent series consuming shared account credits/quota MUST NOT be charged to the measured run. Public list-price economics remain independent; private actual-cash reconciliation must attribute shared-account effects explicitly.

For E/PER-RESULT and E/KNEE, cost attribution must remain request/run-specific even when E shares an R1 provider account with another series.

## 7. Cache and corpus isolation

Cache state is benchmark state.

- cache namespaces MUST be per series/run unless shared cache is part of every compared arm by design;
- T-series arm caches remain isolated from one another according to T methodology;
- a D/S/H/E run MUST NOT warm or evict a T-series measured cache namespace;
- E runs MUST NOT warm/flush another series' cache/index generation merely to improve or stress E results;
- corpus/index generations MUST be digest-addressed and immutable after freeze;
- cleanup from one series MUST never delete another series' generation.

## 8. Stress/fault isolation

Fault injection requires a declared `fault_domain_id` and an ownership lease.

Before injection:

```text
fault_domain owner = current series/run
other active measured runs in domain = 0
rollback path = proven
```

If another series is active in the same fault domain, the injector MUST wait or select a disjoint target. It MUST NOT proceed merely because the tests have different benchmark names.

E/DEGRADE offered-load ramps are not permission to inject faults into foreign/shared mutable resources. Any capacity/configuration/fault mutation follows the same R2 lease rule.

## 9. Cross-series interference detection

For metrics sensitive to shared capacity/latency, the run records enough environment state to detect interference, such as:

- concurrent benchmark series/runs on the same R1 service;
- provider throttling/rate-limit events;
- shared resource saturation;
- capacity/config changes;
- fault leases;
- unexpected cache/index namespace collisions.

Detected material interference produces `INCOMPLETE` or `INVALIDATED` unless the interference itself is a frozen part of the methodology.

### 9.1 GitHub Actions status is not sufficient proof of liveness

A GitHub Actions record MUST NOT be treated as R1/R2 interference merely because its API `status` is `queued`, `in_progress`, `pending`, `requested` or `waiting`.

An Actions interference guard MUST combine all applicable evidence:

1. exact current/campaign SHA membership;
2. run/campaign freshness;
3. workflow/run identity relevant to the benchmark;
4. actual shared-resource overlap (R1/R2), not repository-wide presence;
5. liveness/evidence checks for suspicious stale non-terminal records.

For a stale non-terminal run on a SHA outside the current campaign, the guard MUST inspect its jobs and artifacts before deciding. When all of the following are true:

```text
status = non-terminal
head_sha != current/campaign SHA
age > configured freshness window
material workflow/resource scope would otherwise match
jobs = 0
artifacts = 0
```

it is classified:

```text
ORPHANED_STALE
```

and MUST NOT block an otherwise clean R1/R2/collision gate. The historical Actions record is preserved and MUST NOT be rerun merely to clear the guard.

If jobs/artifact liveness is unavailable for such a stale record, the guard fails closed as `STALE_UNVERIFIED_LIVENESS` until the record is enriched. If the run has jobs, artifacts, a current/campaign SHA, or independently proven shared-resource activity, it remains potentially material and MUST NOT be ignored solely because it is old.

The canonical public classifier is `scripts/workflow-interference-guard.mjs`; benchmark automation should use the same semantics rather than implementing ad-hoc `status == queued|in_progress` checks.

## 10. Cleanup ownership

Cleanup is owner-scoped.

A run may delete/restore only resources whose ownership tag/prefix matches its frozen `series_id/run_id` (or an explicitly leased shared resource after verifying lease ownership).

Broad cleanup commands that enumerate and delete by product-wide prefix are prohibited for concurrent benchmark operation.

## 11. Public/private boundary

This public contract defines isolation semantics only.

Private details remain in `inn-media/truyn-platform`, including:

- real resource/fault-domain identifiers;
- lock/lease backend and paths;
- cloud account/project/subscription names;
- provider quota/capacity allocations;
- private budget values;
- active run registry;
- private topology and cleanup commands.

Public evidence may publish sanitized namespace/lease outcomes and interference status without disclosing those details.

## 12. Acceptance invariant

A final benchmark claim is acceptable only when:

```text
CROSS_SERIES_NAMESPACE_COLLISIONS = 0
FOREIGN_ARTIFACT_WRITES = 0
FOREIGN_CLEANUP_ACTIONS = 0
UNDECLARED_SHARED_MUTABLE_DEPENDENCIES = 0
UNCONTROLLED_CROSS_SERIES_FAULT_OVERLAP = 0
UNATTRIBUTED_CROSS_SERIES_PROVIDER_USAGE = 0
MATERIAL_INTERFERENCE = false
```

If isolation cannot be proven for a headline metric, the affected run is not a valid PASS.
