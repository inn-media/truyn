# T-Series Commercial Proof — Benchmark Contract

Status: **FOUNDATION / NOT YET A RESULT**  
Owner: **OPEN methodology + sanitized public evidence**  
Private execution owner: `inn-media/truyn-platform`

The T-series is the commercial benchmark program for proving three claims without weakening TRUYN's existing technical acceptance discipline:

1. **T/BREAK-EVEN** — when TRUYN becomes cheaper than direct full-context execution as request volume grows;
2. **T/HEAD-TO-HEAD** — whether the measured advantage is attributable to TRUYN rather than generic orchestration or interoperability;
3. **T/PREDICT** — whether per-request cost and latency have bounded, enterprise-usable tails rather than only attractive averages.

No claim in this document is a completed benchmark result. Measured claims are publishable only after an immutable run satisfies the methodology, frozen acceptance manifest, evidence requirements and repository-boundary rules below.

## 1. Repository boundary

The two-repository split is part of the benchmark design.

### Public: `inn-media/truyn`

Public artifacts MAY contain:

- benchmark methodology;
- comparator definitions;
- telemetry schema;
- synthetic/public corpus and workload definitions;
- public price snapshots and their source references;
- sanitized run manifests;
- aggregate and per-sample safe measurements;
- tested public commit SHA;
- workflow/run identifiers;
- artifact digests;
- limitations, failures and corrections;
- final benchmark reports.

### Private: `inn-media/truyn-platform`

Private artifacts MUST contain operational material whose disclosure would expose managed product or cloud internals, including where applicable:

- real production/test deployment names and resource identifiers;
- privileged identities, allowlists and backchannels;
- billing account records, credit balances and effective negotiated/internal costs;
- actual quota/capacity ceilings and emergency limits;
- private customer/workload inputs;
- proprietary managed routing/ranking signals;
- private raw logs that contain operational topology;
- exact commercial traffic targets used to decide whether an observed break-even point is commercially attractive;
- private launch/runbooks and rollback controls.

The public repository MUST NOT import or depend on private source. The private runner consumes only released/versioned public contracts or immutable public artifacts.

## 2. Cross-series isolation invariant

T-series may run concurrently with D, S, H and future benchmark/test families.

All T execution MUST obey [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md). In particular:

- every run carries `series_id=T`, `benchmark_id` and globally unique `run_id`;
- mutable run-state, telemetry partitions, artifact prefixes, caches, indexes, budgets and cleanup scope are namespaced by series/run;
- shared dependencies are classified R0 immutable/read-only, R1 shared-but-attributed, or R2 exclusive mutable/fault targets;
- R2 mutation/fault injection requires an exclusive lease and MUST NOT overlap an active foreign series in the same fault domain;
- a D/S/H run MUST NOT warm, evict, overwrite, throttle, spend into, clean up or otherwise contaminate T evidence/state;
- T MUST NOT cancel, mutate or clean up a D/S/H run merely to obtain benchmark capacity;
- material cross-series interference invalidates the affected T headline measurement unless such interference was frozen as part of the methodology.

A T run waiting on a genuinely exclusive shared resource records `WAITING_SHARED_RESOURCE`; it does not weaken acceptance or interrupt the current lease owner.

## 3. Common invariant across all T-series tests

A T-series run is invalid unless every compared arm uses the same frozen task semantics.

The run manifest MUST freeze before paid inference begins:

- `series_id=T`, `benchmark_id` and `run_id`;
- tested public TRUYN commit SHA/release;
- comparator implementation/version/pin;
- model provider, model family/version/deployment class;
- inference parameters and completion budget;
- corpus snapshot identity and digest;
- workload/query-set identity and digest;
- task semantics and expected output contract;
- arm list;
- warmup policy;
- cache policy (`cold`, `warm`, or both as separate strata);
- cache/artifact namespace policy;
- concurrency/offered-load profile;
- cross-series shared-resource classifications and interference policy;
- randomization seed / arm ordering policy;
- retry policy;
- timeout/deadline policy;
- price snapshot ID and effective time;
- acceptance thresholds;
- telemetry schema version.

**Thresholds are immutable after the first measured request.** A failed gate is evidence; it is not permission to lower the gate and relabel the same run as PASS.

## 4. Cost accounting contract

T-series reports MUST separate four values:

1. `gross_provider_cost_usd` — provider list-price equivalent at the pinned price snapshot;
2. `truyn_overhead_cost_usd` — retrieval, embeddings, verification, routing, storage/compute and other attributable TRUYN overhead;
3. `fully_loaded_cost_usd` — gross provider cost + attributable TRUYN fixed/variable infrastructure;
4. `net_cash_cost_usd` — actual cash after credits/discounts, retained privately unless safe and useful to disclose.

Public commercial claims use **gross/list-price or fully-loaded economics**, not temporary cloud credits.

Where provider billing systems expose usage records, those records are authoritative. Where the provider exposes billed token/usage metadata but not a dollar amount, dollars are computed from that usage against a pinned published price snapshot. Locally estimated token counts MAY be diagnostic but MUST NOT be the sole evidence behind an accepted public dollar claim.

Every cost sample declares an evidence class:

- `A_INVOICE_METER` — provider billing/meter record;
- `B_PROVIDER_USAGE_X_PRICE` — provider-reported billed usage × pinned published price;
- `C_LOCAL_ESTIMATE` — local estimate only; diagnostic, not sufficient alone for an accepted public dollar claim.

Foreign concurrent-series usage MUST be excluded from T run totals. Shared-account effects remain private reconciliation facts unless sanitized safely.

## 5. Common telemetry envelope

Each measured request/hop emits one normalized record with, at minimum:

```json
{
  "schema": "truyn.t-series.telemetry/v1",
  "seriesId": "T",
  "benchmarkId": "...",
  "runId": "...",
  "runNamespace": "T/<benchmark>/<run-id>",
  "pairId": "...",
  "sampleId": "...",
  "arm": "TRUYN|DIRECT|NAIVE|MCP|A2A|NLWEB|NLWEB_OVER_TRUYN",
  "protocolProfile": "...",
  "taskClass": "...",
  "corpusId": "...",
  "model": {"provider":"...","family":"...","version":"..."},
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0,
    "requestBytes": 0,
    "responseBytes": 0,
    "contextBytes": 0
  },
  "latencyMs": {
    "endToEnd": 0,
    "provider": 0,
    "truyn": 0,
    "retrieval": 0,
    "verification": 0
  },
  "costUsd": {
    "providerGross": 0,
    "truynVariable": 0,
    "fullyLoaded": 0
  },
  "quality": {"score": null, "correct": null},
  "provenance": {"present": false, "verified": false},
  "interference": {"material": false, "resourceClass": null},
  "outcome": "ok|controlled_fail|error",
  "retryCount": 0,
  "priceSnapshotId": "...",
  "costEvidenceClass": "A_INVOICE_METER|B_PROVIDER_USAGE_X_PRICE|C_LOCAL_ESTIMATE"
}
```

Benchmark-specific records MAY extend this envelope but MUST NOT redefine the common fields.

## 6. Quality scoring hierarchy

Use the strongest available scoring method in this order:

1. deterministic exact/structured ground truth;
2. deterministic corpus-backed rubric;
3. blinded human evaluation;
4. blinded model judge as a secondary measure only.

A comparator is not allowed to win economically by silently reducing task quality. Cost/token claims therefore MUST be paired with quality/accuracy.

## 7. Randomization and cache/order bias

For paired comparator tests:

- every task is run through every applicable arm;
- arm order is randomized from a frozen seed or balanced with a Latin-square schedule;
- warmups are tagged and excluded from measured distributions;
- cold-cache and warm-cache results are never mixed into one number;
- cross-arm shared caches are disabled unless the shared cache itself is part of every arm's defined architecture;
- T cache namespaces are isolated from D/S/H/future-series mutable caches;
- failures and retries remain in the evidence ledger.

## 8. Evidence bundle

An accepted T-series run produces an immutable evidence bundle containing, when safe:

```text
manifest.json
acceptance.json
price-snapshot.json
corpus-manifest.json
workload-manifest.json
telemetry.jsonl
interference.jsonl
summary.json
checksums.sha256
REPORT.md
```

The public report retains tested SHA, run/workflow identity, artifact ID/digest, methods, limitations, negative results and corrections. Sensitive operational fields are redacted, not used as a reason to delete the benchmark record.

## 9. Program gates

The T-series foundation is complete only when:

- public methodology exists for all three tests;
- the normalized telemetry contract is implemented by every arm;
- the cross-series isolation contract is enforced for concurrent D/S/H/T execution;
- private execution/runbook material is isolated in `truyn-platform`;
- price snapshots can be pinned before a run;
- corpus/workload manifests are immutable and digest-addressed;
- comparator configurations are reviewable and fixed;
- acceptance thresholds are frozen before inference;
- raw evidence can be transformed into a safe public evidence bundle without manual reconstruction.

Measured PASS is a later stage. Foundation completion MUST NOT be represented as a benchmark win.

## 10. Canonical methodology documents

- [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md)
- [`T_BREAK_EVEN_METHODOLOGY.md`](T_BREAK_EVEN_METHODOLOGY.md)
- [`T_HEAD_TO_HEAD_METHODOLOGY.md`](T_HEAD_TO_HEAD_METHODOLOGY.md)
- [`T_PREDICT_METHODOLOGY.md`](T_PREDICT_METHODOLOGY.md)
- [`T_SERIES_TELEMETRY.md`](T_SERIES_TELEMETRY.md)
