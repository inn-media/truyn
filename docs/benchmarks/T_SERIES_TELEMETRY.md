# T-Series Telemetry and Evidence Schema

Status: **FOUNDATION CONTRACT**  
Schema target: `truyn.t-series.telemetry/v1`

This document defines the minimum measurement vocabulary shared by T/BREAK-EVEN, T/HEAD-TO-HEAD and T/PREDICT.

The goal is simple: every chart and dollar figure must be reproducible from immutable per-request/per-hop records rather than reconstructed from screenshots or prose.

All T-series telemetry also obeys [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md). T runs may execute concurrently with D, S, H and future series, so every mutable record/evidence path must remain attributable to exactly one series/run namespace.

## 1. Record types

A complete run may emit the following logical record types:

- `run_manifest` — frozen run configuration;
- `setup_event` — corpus preparation/index/publication/setup cost;
- `request_sample` — one end-to-end measured request;
- `hop_sample` — one protocol/model hop inside a request;
- `provider_usage` — provider-reported billed usage;
- `price_snapshot` — pinned public pricing inputs;
- `quality_result` — deterministic/blinded quality score;
- `guardrail_event` — cost/deadline/quota/reroute/fail-closed decision;
- `stress_event` — injected degradation and its exact timing/class;
- `interference_event` — cross-series/shared-resource interference observation;
- `summary` — derived metrics only; never the sole evidence.

## 2. Immutable identifiers

Every record MUST be attributable to:

```text
series_id       # T for this schema
benchmark_id
run_id
run_namespace   # T/<benchmark>/<run-id>
sample_id
pair_id        # same task across comparator arms
hop_id         # when applicable
arm
public_source_sha
manifest_digest
workload_digest
corpus_digest
price_snapshot_id
telemetry_schema_version
```

`pair_id` is required for paired comparator statistics.

`series_id = T` is mandatory in implementation. A record without an unambiguous series/run namespace is not eligible for accepted T-series evidence.

## 3. Common dimensions

Required dimensions where applicable:

```text
task_class
corpus_class
cache_state        cold|warm
cache_namespace
load_condition     baseline|stress:<name>
protocol_profile
protocol_version
provider
model_family
model_version
region_class       sanitized/public class, not private resource ID
resource_scope_class   R0|R1|R2
attempt
retry_count
outcome
error_class
```

Private deployment/resource names MUST NOT be required by the public schema.

## 4. Usage fields

### Provider usage

```text
input_tokens
output_tokens
total_tokens
cached_input_tokens         nullable
reasoning_tokens            nullable
provider_billed_units       structured / provider-specific normalized object
provider_usage_attribution_key
```

### Bytes

```text
system_prompt_bytes
conversation_bytes
task_payload_bytes
context_bytes
protocol_metadata_bytes
artifact_reference_bytes
provider_request_bytes
provider_response_bytes
network_tx_bytes             nullable
network_rx_bytes             nullable
```

Do not infer bytes from token counts when real serialized bytes are available.

## 5. Latency fields

All duration fields use monotonic-clock durations where the runtime permits it.

```text
end_to_end_ms
queue_ms                     nullable
discovery_ms                 nullable
routing_ms                   nullable
query_embedding_ms           nullable
retrieval_ms                 nullable
context_materialization_ms   nullable
verification_ms              nullable
provider_ms                  nullable
serialization_ms             nullable
truyn_total_ms               nullable
```

The implementation MUST document whether subcomponents overlap. Do not add overlapping durations and label the sum as E2E.

## 6. Cost fields

All public USD fields use the pinned price snapshot and declare the evidence class.

```text
provider_input_cost_usd
provider_output_cost_usd
provider_other_cost_usd
provider_gross_cost_usd
embedding_cost_usd
storage_cost_usd
compute_cost_usd
network_cost_usd
truyn_variable_cost_usd
allocated_fixed_cost_usd
fully_loaded_cost_usd
cost_evidence_class
series_budget_id             private/sanitized reference
run_budget_id                private/sanitized reference
```

`net_cash_cost_usd`, cloud credits and negotiated/internal rates are private operational telemetry unless explicitly sanitized for publication.

Foreign D/S/H usage on a shared provider/account MUST NOT be included in T run cost totals. Private reconciliation must preserve enough attribution to prove that separation.

### Cost evidence classes

```text
A_INVOICE_METER
B_PROVIDER_USAGE_X_PRICE
C_LOCAL_ESTIMATE
```

Accepted public dollar claims require A or B coverage for the claimed cost component.

## 7. Setup-event fields

T/BREAK-EVEN setup records require:

```text
setup_phase
start_time
end_time
duration_ms
source_bytes
normalized_bytes
block_count
embedding_count
embedding_billed_units
index_bytes
publication_bytes
storage_writes
compute_cost_usd
embedding_cost_usd
storage_cost_usd
network_cost_usd
setup_total_cost_usd
```

Every setup component is attributable either to TRUYN, DIRECT or SHARED. Shared costs must not be charged to only one arm.

A setup event also records/derives ownership namespace so cleanup cannot affect another series' index/corpus generation.

## 8. Quality fields

```text
scoring_method
score
correct                    nullable
rubric_version
ground_truth_id            nullable
judge_id                   nullable
judge_blinded              nullable
factual_error_count        nullable
completeness_score         nullable
```

If a model judge is used, judge model/version and prompt digest belong in the immutable run manifest.

## 9. Provenance/evidence fields

Record atomic capabilities rather than a single marketing boolean:

```text
source_refs_present
source_refs_verified
actor_identity_present
actor_identity_verified
content_digest_present
content_digest_verified
request_response_correlation_present
receipt_present
receipt_verified
replay_check_performed
tamper_check_performed
native_or_extension        native|extension|na
```

TRUYN-specific receipt fields may extend this section.

## 10. Guardrail fields

```text
max_cost_usd               nullable
deadline_ms                nullable
max_retries                nullable
allow_reroute              nullable
estimated_cost_pre_dispatch_usd   nullable
dispatch_allowed
fail_closed
rerouted
accepted_response
response_within_deadline
hard_cost_breach
provider_call_count_after_decision
```

For a denied pre-dispatch request, provider execution count MUST be observable so `0 paid provider calls` can be proven rather than inferred.

## 11. Stress-event fields

```text
stress_id
stress_type                 slowdown|rate_limit|path_unavailable|other
severity                    mild|severe|custom
start_time
end_time
injection_target_class
fault_domain_class          nullable
exclusive_lease_held        nullable
injected_latency_ms         nullable
injected_error_rate         nullable
notes_digest                nullable
```

Operationally sensitive target identities remain private.

A T/PREDICT stress event is invalid if a foreign active measured run shares the same mutable fault domain without an explicitly frozen joint methodology.

## 12. Cross-series interference fields

For any R1/R2 dependency that can affect cost, latency, capacity or correctness, emit/retain enough evidence to derive:

```text
foreign_active_series_count
foreign_active_run_count
shared_resource_class       R1|R2
quota_partitioned           nullable
interference_probe_status   pass|fail|unknown
material_interference       true|false|unknown
r2_lease_conflict           true|false
namespace_collision         true|false
foreign_artifact_write      true|false
foreign_cleanup_candidate   true|false
```

A headline T-series PASS requires `material_interference=false`, no R2 lease conflict and no namespace/artifact/cleanup collision.

## 13. Derived metrics

Derived values MUST be reproducible from raw records.

### Token reduction

```text
token_reduction_pct = 100 * (1 - truyn_total_billed_tokens / comparator_total_billed_tokens)
```

### Cost reduction

```text
cost_reduction_pct = 100 * (1 - truyn_cost / comparator_cost)
```

The report must name which cost basis is used: provider-gross, variable, or fully-loaded.

### Context duplication ratio

```text
context_duplication_ratio = total_context_bytes_across_hops / unique_task_context_bytes
```

### Break-even

```text
N_star_variable = C_setup / (c_direct - c_truyn)
N_star_full = (C_setup + F_truyn - F_direct) / (c_direct - c_truyn)
```

### Coefficient of variation

```text
CoV = standard_deviation / mean
```

### Tail ratios

```text
cost_tail_ratio = cost_p99 / cost_p50
latency_tail_ratio = latency_p99 / latency_p50
p99_shift_ratio = stressed_latency_p99 / baseline_latency_p99
```

### Bounded outcome

```text
bounded_outcome_rate =
  (success_within_bounds + controlled_fail_within_bounds) / total_requests
```

## 14. Aggregation rules

- Percentiles are computed from individual request samples, not from batch-percentile averages.
- Failed/controlled-failure requests remain in outcome counts.
- Cost distributions include retries that incurred billable usage.
- Warmup samples are retained with `is_warmup=true` but excluded from measured summaries.
- Cold and warm cache samples are separate strata.
- Do not merge materially different model versions, price snapshots, corpus versions or task classes into a single headline number.
- Do not merge D/S/H/T records into one accepted T-series sample set merely because they share a provider or dashboard.
- Every summary states `n`.

## 15. Evidence bundle layout

Recommended public artifact layout:

```text
benchmarks/T/<benchmark>/<run-id>/
  manifest.json
  acceptance.json
  price-snapshot.json
  corpus-manifest.json
  workload-manifest.json
  setup.jsonl
  samples.jsonl
  hops.jsonl
  quality.jsonl
  guardrails.jsonl
  interference.jsonl
  summary.json
  checksums.sha256
  REPORT.md
```

Private raw evidence may contain additional operational fields. Public export MUST be generated through deterministic redaction/sanitization, preserving numeric evidence and digests wherever safe.

## 16. Telemetry completeness gate

Before a paid final run, execute a zero/low-cost telemetry qualification that proves:

- every expected record type can be emitted;
- `series_id=T`, benchmark ID and run ID survive all records;
- pair IDs survive all arms;
- provider usage is captured and attributable to the T run;
- prices resolve to the frozen snapshot;
- all relevant TRUYN overhead fields are populated or explicitly `null` with documented reason;
- provider execution count is observable for fail-closed tests;
- cache/artifact namespaces do not collide with active D/S/H/T runs;
- shared R1/R2 dependencies are classified and interference/lease state is observable;
- artifacts can be checksummed and exported safely;
- no private resource name/credential appears in the public export.

If telemetry completeness or cross-series isolation fails, the benchmark MUST NOT proceed to an expensive final run.
