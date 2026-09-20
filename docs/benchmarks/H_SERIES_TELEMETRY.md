# H-Series Telemetry and Evidence Schema

Status: **FOUNDATION / NOT YET A RESULT**

This document defines the normalized evidence vocabulary shared by H/CACHE-COMPOUND, H/SECOND-OPINION, H/ARBITRAGE and H/CHAOS-FUZZ.

The schema is designed so a final headline metric can be recomputed from immutable per-event/per-sample records rather than trusted from a mutable dashboard.

## 1. Common envelope

Every H record contains at least:

```json
{
  "schema": "truyn.h-series.telemetry/v1",
  "seriesId": "H",
  "benchmarkId": "H-CACHE-COMPOUND|H-SECOND-OPINION|H-ARBITRAGE|H-CHAOS-FUZZ",
  "runId": "...",
  "runNamespace": "H/<benchmark>/<run-id>",
  "eventId": "...",
  "eventType": "request|reuse|provider_answer|adjudication|routing_decision|price_event|fault_event|invariant_event|recovery_event|interference_event",
  "sampleId": "...",
  "pairId": null,
  "seedCommitment": "sha256:...",
  "publicTruynShaOrRelease": "...",
  "runnerIdentity": "sanitized-or-digest",
  "timestamp": "...",
  "outcome": "ok|controlled_fail|error|invalidated|waiting_shared_resource"
}
```

Private execution MAY retain richer identifiers, but sanitized public evidence must preserve stable join keys or safe deterministic replacements.

## 2. Request record

```json
{
  "eventType": "request",
  "arm": "...",
  "taskClass": "...",
  "corpusId": "...",
  "workloadId": "...",
  "requesterNode": "sanitized",
  "provider": {"provider":"...","family":"...","version":"..."},
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0,
    "requestBytes": 0,
    "responseBytes": 0,
    "contextBytes": 0
  },
  "latencyMs": {"endToEnd":0,"provider":0,"truyn":0},
  "costUsd": {
    "providerGross": 0,
    "truynVariable": 0,
    "fullyLoaded": 0
  },
  "quality": {"correct":null,"score":null,"abstainExpected":null},
  "provenance": {"present":false,"verified":false},
  "retryCount": 0,
  "costEvidenceClass": "A_INVOICE_METER|B_PROVIDER_USAGE_X_PRICE|C_LOCAL_ESTIMATE",
  "interference": {"material":false,"resourceClass":null}
}
```

## 3. CACHE reuse record

```json
{
  "eventType": "reuse",
  "arm": "TRUYN_REUSE|REUSE_DISABLED_CONTROL",
  "nodeCount": 0,
  "zipfS": 0,
  "cacheStratum": "cold|warm|steady",
  "objectClass": "cid_object|semantic_context|result|delta_reference|other",
  "objectDigest": "...",
  "hit": true,
  "hitOrigin": "same_node|cross_node|preexisting_frozen|null",
  "producerNode": "sanitized-or-null",
  "consumerNode": "sanitized",
  "bytesAvoided": 0,
  "tokensAvoidedEstimate": null
}
```

Required CACHE summary formulas:

```text
reuse_cost_reduction = 1 - cost(reuse) / cost(control)
cross_node_reuse_share = cross_node_hits / all_reuse_hits
network_effect_delta = reuse_gain(N2) - reuse_gain(N1)
```

## 4. SECOND-OPINION provider answer record

```json
{
  "eventType": "provider_answer",
  "policy": "SINGLE|MAJORITY|TRUST_WEIGHTED|VERIFY_DISPUTE",
  "ensembleId": null,
  "provider": {"provider":"...","family":"...","version":"..."},
  "answerDigest": "...",
  "normalizedDecision": "...",
  "trustScore": null,
  "correctAgainstGold": null,
  "disagreementSet": false,
  "usage": {"inputTokens":0,"outputTokens":0,"totalTokens":0},
  "costUsd": {"providerGross":0,"fullyLoaded":0}
}
```

Adjudication event:

```json
{
  "eventType": "adjudication",
  "policy": "MAJORITY|TRUST_WEIGHTED|VERIFY_DISPUTE",
  "candidateAnswerDigests": ["..."],
  "agreementState": "all_agree|disagree|ambiguous",
  "escalated": false,
  "verifierProvider": null,
  "finalDecision": "...",
  "correctAgainstGold": null,
  "incrementalCostUsd": 0,
  "incrementalLatencyMs": 0
}
```

Required SECOND-OPINION formulas:

```text
accuracy_lift = accuracy(ensemble) - accuracy(primary_single)
trust_lift_over_majority = accuracy(trust_weighted) - accuracy(majority)
accuracy_per_dollar = correct_items / gross_cost
ensemble_cost_multiplier = fully_loaded_cost(ensemble) / fully_loaded_cost(primary_single)
```

## 5. ARBITRAGE price event

```json
{
  "eventType": "price_event",
  "priceTimelineId": "...",
  "priceSnapshotId": "...",
  "provider": {"provider":"...","family":"...","version":"..."},
  "inputPrice": null,
  "outputPrice": null,
  "requestPrice": null,
  "effectiveFrom": "...",
  "mode": "scripted|live_public",
  "sourceClass": "provider_public|scripted_from_pinned_base"
}
```

Routing decision:

```json
{
  "eventType": "routing_decision",
  "arm": "STATIC|TRUYN_COST_AWARE|ORACLE",
  "eligibleProviders": ["..."],
  "observedEffectiveCosts": {"provider-alias":0},
  "chosenProvider": "...",
  "reasonCode": "lowest_cost|hysteresis_hold|health_exclusion|trust_exclusion|capacity_penalty|static_assignment|oracle",
  "misroute": false,
  "priceSnapshotId": "..."
}
```

Required ARBITRAGE formulas:

```text
captured_arbitrage = (C_static - C_truyn) / (C_static - C_oracle)
absolute_regret = C_truyn - C_oracle
normalized_regret = absolute_regret / max(C_static - C_oracle, epsilon)
misroute_rate = unexplained_nonminimum_choices / eligible_decisions
```

## 6. CHAOS-FUZZ fault event

```json
{
  "eventType": "fault_event",
  "seed": "private-or-later-safe",
  "seedDigest": "sha256:...",
  "tracePosition": 0,
  "faultClass": "protocol|provider|identity_auth|timing_network_storage|trust_provenance",
  "mutationClass": "...",
  "targetClass": "...",
  "expectedOutcomeClass": "reject|bounded_fail|recover|continue",
  "faultDomain": "sanitized-or-digest"
}
```

Invariant event:

```json
{
  "eventType": "invariant_event",
  "invariantId": "...",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "passed": true,
  "failureSignature": null,
  "reproducerDigest": null
}
```

Recovery event:

```json
{
  "eventType": "recovery_event",
  "faultClass": "...",
  "recovered": true,
  "recoveryLatencyMs": 0,
  "postHealCorrect": true,
  "requestsControlledFailed": 0,
  "requestsLost": 0
}
```

## 7. Cross-series interference record

Every H runner must be able to emit:

```json
{
  "eventType": "interference_event",
  "resourceClass": "R0|R1|R2",
  "foreignSeries": "D|S|T|other|null",
  "foreignRunId": "sanitized-or-null",
  "detected": false,
  "material": false,
  "reason": null,
  "action": "continue|wait|invalidate"
}
```

## 8. Evidence integrity fields

Every final bundle preserves or references:

```text
manifest_digest
acceptance_digest
workload/corpus digest
seed commitment digest
price timeline/snapshot digest where applicable
raw telemetry digest
summary digest
tested public SHA/release
private runner SHA or safe digest
workflow/run ID
artifact ID/digest where available
```

No dashboard-only metric is sufficient as accepted evidence.

## 9. Null and unavailable semantics

A numeric field is never fabricated as zero when unavailable.

Use explicit `null` plus a reason/evidence-class field. Examples:

- provider does not report token counts;
- a fixed-price request has no token unit price;
- a private identity is intentionally redacted;
- gold correctness is withheld from an intermediate public artifact.

## 10. Corrections and negative evidence

Failed runs, discovered bugs, invalidated cells and corrected calculations remain append-only evidence. A corrected report points to the superseded calculation/run rather than deleting it.
