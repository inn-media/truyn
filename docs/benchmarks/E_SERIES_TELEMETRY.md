# E-Series Telemetry and Evidence Contract

Status: **FOUNDATION / NORMATIVE SCHEMA SEMANTICS**

This document defines the minimum public-safe event semantics required to recompute E/DECOMPOSE, E/PER-RESULT, E/KNEE and E/DEGRADE. Private runners may store richer raw events, but sanitized export must preserve enough fields to independently recompute headline metrics.

## 1. Common identity

Every event MUST be attributable to:

```json
{
  "seriesId": "E",
  "benchmarkId": "E-DECOMPOSE|E-PER-RESULT|E-KNEE|E-DEGRADE",
  "runId": "globally-unique",
  "batchId": "stable-within-run",
  "requestId": "logical-NEED-id",
  "scaleN": 100,
  "arm": "TRUYN|DIRECT",
  "measured": true
}
```

Retries and stage spans retain the same logical `requestId`.

## 2. Environment manifest

Each run bundle contains an immutable manifest with safe identities/digests:

```text
public_truyn_sha_or_release
private_runner_sha_digest_or_safe_identity
workload_digest
oracle_digest
provider_mix_digest
configuration_digest
price_snapshot_digest_or_mode
scale_n
load_profile_digest
warmup_policy
sample_policy
confidence_policy
resource_scope_classes
```

Private operational identifiers are replaced by sanitized classes/digests.

## 3. Stage span event

```json
{
  "eventType": "stage_span",
  "requestId": "...",
  "hostClass": "sanitized-host-class",
  "stage": "ingress|retrieval_candidates|retrieval_rerank|routing_authorization|dispatch|provider_queue|provider_inference|verification_provenance|transport_flush",
  "durationNsMonotonic": 0,
  "requestBytes": 0,
  "responseBytes": 0,
  "inputTokens": null,
  "outputTokens": null,
  "costGross": null,
  "retryOrdinal": 0,
  "status": "ok|error"
}
```

No cross-host wall-clock duration is derived from timestamps.

## 4. Request terminal event

```json
{
  "eventType": "request_terminal",
  "requestId": "...",
  "elapsedMsMonotonic": 0,
  "terminalStatus": "success|error|cancelled|rejected",
  "oracleCorrect": false,
  "provenanceOrTrustValid": false,
  "minimalContextValid": false,
  "authorizationValid": true,
  "terminalResultPresent": false,
  "useful": false,
  "errorClass": null,
  "retryCount": 0
}
```

`useful` is recomputable as the conjunction defined in the canonical E contract.

## 5. Cost/compute event

```json
{
  "eventType": "resource_usage",
  "requestId": "...",
  "providerClass": "sanitized-provider-class",
  "grossProviderCost": 0.0,
  "rerankCost": 0.0,
  "attributableInfraVariableCost": 0.0,
  "fixedCostShare": null,
  "inputTokens": null,
  "outputTokens": null,
  "computeSeconds": null,
  "computeProxyUnit": "tokens|null",
  "computeProxyValue": null,
  "billingEvidenceMode": "provider-reported|public-price-snapshot|private-reconciled"
}
```

Private actual cash/credit detail need not be exported. Public evidence must state the billing evidence mode.

## 6. Load sample event

```json
{
  "eventType": "load_sample",
  "scaleN": 200,
  "loadStepId": "...",
  "windowSeconds": 30,
  "offeredNeedPerSec": 0.0,
  "admittedNeedPerSec": 0.0,
  "completedNeedPerSec": 0.0,
  "activeConcurrency": 0,
  "queueDepth": 0,
  "backpressureRejects": 0,
  "provider429": 0,
  "internalSaturation": 0
}
```

## 7. Interference event

```json
{
  "eventType": "interference_event",
  "resourceClass": "R0|R1|R2",
  "foreignSeries": "D|S|T|H|other|null",
  "foreignRunId": "sanitized-or-null",
  "detected": false,
  "materialToHeadlineMetric": false,
  "action": "none|wait|invalidate|mark-incomplete"
}
```

## 8. Error taxonomy

Canonical values:

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

Do not rewrite provider throttling as internal saturation.

## 9. Derived formulas

### Useful result

```text
useful = oracleCorrect
      && provenanceOrTrustValid
      && minimalContextValid
      && authorizationValid
      && terminalResultPresent
```

### Cost per useful

```text
attributed_cost_request = grossProviderCost
                        + rerankCost
                        + attributableInfraVariableCost
                        + declared fixedCostShare if fully-loaded view

cost_per_useful = sum(attributed_cost_request) / count(useful=true)
```

Zero useful results => `+infinity`.

### Wall per useful

```text
wall_per_useful = sum(elapsedMsMonotonic / 1000) / count(useful=true)
```

### Compute per useful

```text
compute_per_useful = sum(computeSeconds) / useful_count
```

or, when unavailable, a clearly labeled hosted-provider proxy.

### Efficiency ratios

```text
G_cost = cost_per_useful_DIRECT / cost_per_useful_TRUYN
G_wall = wall_per_useful_DIRECT / wall_per_useful_TRUYN
G_compute = compute_per_useful_DIRECT / compute_per_useful_TRUYN
```

### TRUYN tax

Compute per request first:

```text
truyn_tax_ms_request = sum(canonical non-provider TRUYN stage durations)
truyn_tax_pct_request = truyn_tax_ms_request / elapsed_ms * 100
```

Then summarize the request-level distribution.

### Sustainable load

A load step is sustainable when:

```text
useful_success_rate >= 0.99
AND p95_e2e <= 2.0 * baseline_p95
AND safety_authorization_violations = 0
AND uncontrolled_queue_growth = false
```

## 10. Evidence bundle

A final public E report should be accompanied, where safe, by:

```text
manifest.json
summary.json
stage-aggregates.json
request-outcomes.sanitized.jsonl
load-windows.sanitized.jsonl
interference.sanitized.jsonl
checksums.sha256
report.md
```

The private raw bundle may additionally contain provider request IDs, private topology, raw billing, resource IDs and detailed traces; those remain private.

## 11. Evidence preservation

Measured public E reports are append-only evidence under the benchmark evidence policy. Security cleanup redacts sensitive fields; it does not erase negative/failed E campaigns.
