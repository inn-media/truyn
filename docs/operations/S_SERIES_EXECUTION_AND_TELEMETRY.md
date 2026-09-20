# TRUYN S-Series Execution Isolation and Telemetry

Status: **DEFINED / IMPLEMENTATION NOT STARTED**  
Applies to: `S-50`, `S-100`, `S-200`, `S-500`

This document is the operational foundation for running Semantic Scale benchmarks without interfering with the Class-D benchmark family.

## 1. Parallel-track rule

D-Series and S-Series are independent benchmark tracks.

```text
D-Series
  network scale / resilience
  frozen D source + D evaluator + D evidence

S-Series
  live semantic-node scale
  real seven-vendor inference + semantic retrieval/economics
```

They may execute at the same time only if their run identities, cloud resources, concurrency controls, capacity and evidence are independently attributable.

S-Series never modifies or reuses a frozen D-Series launcher, evaluator, launch token or accepted evidence file.

## 2. Required namespaces

Before the first S launch, implementation must provide dedicated namespaces for at least:

```text
.github/workflows/s-series-*.yml
.github/s-series/<run-or-launch-token>
benchmarks/s-series/
docs/operations/s-series/
docs/benchmarks/SEMANTIC_SCALE_S_*.md
```

Exact implementation filenames may follow repository conventions, but D-Series workflow/launch namespaces are forbidden for S execution.

Concurrency groups must begin with:

```text
truyn-s-series-
```

and must not equal any D-Series concurrency group.

## 3. Resource isolation

Every S run must use an independently attributable ephemeral resource namespace. At minimum the run evidence must prove that names/IDs are distinct from concurrently active D resources without publishing sensitive resource identifiers.

Isolation must cover:

- compute/process hosts;
- relay/runtime staging resources;
- storage/artifact paths;
- provider runtime instances where dedicated instances are used;
- benchmark requester identities;
- cleanup inventory.

Shared cloud subscriptions/projects are allowed only if capacity/quota interference is prevented or explicitly bounded before launch.

If an active D run can be starved or behaviorally altered by S-Series consumption of shared VM/provider/network quota, the S launch must wait or move to isolated capacity.

## 4. Provider-spend boundary

S-Series uses owner-authorized benchmark provider access only.

The existing authorization invariant is unchanged:

```text
unauthorized requester
→ authorization DENY
→ adapter.execute() not called
→ provider request count 0
→ owner-funded tokens 0
```

Every S run must record unauthorized-provider-execution count, with required value `0`.

Provider credentials, service identities, endpoints, private resource names and allowlists remain outside public evidence.

## 5. Telemetry layers

S-Series telemetry is normalized at five levels:

1. **node**;
2. **request/provider call**;
3. **chain**;
4. **network/run**;
5. **economic pair**.

Every row/event must carry a run identity and timestamp or monotonic event ordering sufficient to reconstruct the measured scenario.

## 6. Node telemetry

Required normalized fields:

```text
runId
sLevel
scenario
nodeIdHash/public-safe-node-ordinal
providerFamily
providerVendor
cloud
region
countryOrJurisdiction (sanitized label when publishable)
processOrdinal
hostOrdinal
capabilities
status
readyAt
lastSeenAt
rssBytes (when measured)
cpuMeasurement (when measured)
networkRxBytes (when measured)
networkTxBytes (when measured)
```

Public evidence may use stable ordinals/hashes instead of internal addresses/resource names.

## 7. Request/provider telemetry

Required fields:

```text
runId
scenario
requestId
chainId (nullable)
nodeOrdinal
providerFamily
providerVendor
modelIdOrVersion
cloud
region
startedAt
completedAt
status
errorClass
latencyMs
providerLatencyMs
truynLatencyMs
retrievalLatencyMs
requestBytes
responseBytes
inputTokens
outputTokens
totalTokens
providerRequestId (only if safe to publish)
retryLayer
retryCount
rateLimited
cancelled
```

For provider usage fields, store authoritative provider values when available. `null` is preferred to fabricated estimation.

## 8. Semantic/provenance telemetry

Where semantic retrieval is exercised, record:

```text
rootCid
manifestCid/query-proof identifiers as permitted
queryHash
selectedRank
selectedBlockCid or safe proof reference
materializedBlockCount
provenanceVerified
minimalContextCorrect
internalBlockIdLeaked
retrievalCorrect
answerCorrect
```

Agent-facing request evidence must remain sufficient to prove that internal target block identifiers were not supplied by the caller.

## 9. Chain telemetry

Required fields:

```text
chainId
requestIdRoot
hopCount
hopOrdinals
providerFamiliesByHop
nodeOrdinalsByHop
startedAt
completedAt
e2eLatencyMs
chainSuccess
answerCorrect
provenanceComplete
receiptChainValid
unauthorizedHopCount
staleReceiptAcceptedCount
```

Per-hop request telemetry remains separately available; the chain row is a normalized summary.

## 10. Network/run telemetry

Required normalized metrics:

```text
targetNodes
readyNodes
uniqueIdentities
uniqueEndpoints
providerFamilyCount
cloudCount
regionCount
countryOrJurisdictionCount
routingAttempts
routingSuccesses
routingRatio
convergenceP50Ms
convergenceP95Ms
convergenceP99Ms
recoveryP50Ms
recoveryP95Ms
recoveryP99Ms
partitionRecoveryMs
acknowledgedWrites
acknowledgedWriteLoss
invalidSignedStateAccepted
staleRevokedReceiptAccepted
unauthorizedProviderExecutions
campaignCleanupConfirmed
campaignResourcesRemaining
```

Scenario-specific fields extend this object rather than replacing the common measurements.

## 11. Economic-pair telemetry

Each DIRECT/TRUYN pair records:

```text
pairId
workloadCaseId
providerFamily
modelIdOrVersion
currency
priceSnapshotDate
priceSourceIdentifier

directInputTokens
directOutputTokens
directProviderCostGross
directNetCashCost (nullable)
directLatencyMs
directRequestBytes

truynInputTokens
truynOutputTokens
truynProviderCostGross
truynNetCashCost (nullable)
truynLatencyMs
truynRequestBytes
truynRoutingCostGross
truynRetrievalCostGross

reusablePublicationBytes
reusablePublicationCostGross
reuseCountForAmortization
amortizedTransferBytes
amortizedTotalCostGross

inputTokenReductionPct
providerCostReductionPct
amortizedCostReductionPct
answerEquivalent
```

Gross/list-price-equivalent and net cash/credit-covered cost are never merged into one ambiguous field.

## 12. Calculation definitions

### Routing ratio

```text
routingRatio = routingSuccesses / routingAttempts
```

### Input-token reduction

```text
100 * (directInputTokens - truynInputTokens) / directInputTokens
```

### Provider-cost reduction

```text
100 * (directProviderCostGross - truynProviderCostGross) / directProviderCostGross
```

### Amortized total cost reduction

The reusable publication/index component is divided only by the actual declared reuse count for the measured run, then added to TRUYN per-request routing/retrieval/provider cost before comparison.

The evidence must preserve the exact formula inputs; percentage alone is insufficient.

## 13. Scale-curve outputs

Comparable S-50/S-100/S-200/S-500 runs should emit the same normalized fields so scale curves can be produced without changing definitions.

At minimum compare across levels:

- routing success;
- readiness/convergence/recovery;
- p50/p95/p99 E2E latency;
- throughput/completion rate;
- provider rate-limit pressure;
- token reduction;
- provider-cost reduction;
- amortized transfer/cost reduction;
- per-vendor answer accuracy;
- per-vendor token-reduction spread;
- RSS/network bytes per node and aggregate where measured;
- cross-region/cross-cloud latency deltas;
- failure/failover time.

No interpolation/extrapolation is a substitute for an unexecuted S level.

## 14. Preflight before spend

Every real S run must perform a bounded preflight before provider inference or large cloud provisioning:

- exact tested source/config resolved;
- provider access for all required families;
- provider/model mapping captured;
- region/cloud availability captured;
- VM/compute capacity sufficient for target node count;
- provider quota sufficient for declared workload;
- D-Series active-run/resource collision check;
- resource-prefix collision check;
- evidence/artifact destination writable;
- cleanup path present;
- cost/spend ceiling configured outside public evidence.

A failed preflight produces `BLOCKED_ACCESS` or a failed preparation state; it must not partially launch a large benchmark and then reinterpret missing vendors as success.

## 15. S-50 implementation order

Implementation should be minimal and reuse-first:

1. add S-specific configuration/runner around existing D network harness and existing semantic/provider runners;
2. add normalized telemetry adapter/aggregation only where current fields are missing;
3. add `ECON` paired workload runner;
4. add `MIX` assignment profiles;
5. qualify exact source/config;
6. execute S-50 `ECON` + `MIX` first;
7. only after clean evidence, execute the remaining S-50 scenario matrix.

This sequence is not permission to rewrite D-Series code. Shared reusable modules may be called; D frozen campaign semantics remain untouched.

## 16. Evidence closure

Each scenario run produces:

- normalized telemetry JSON;
- safe per-node/per-provider rows where useful;
- artifact SHA-256 manifest;
- public evidence report;
- explicit list of withheld unsafe raw artifacts with their digests when needed;
- terminal PASS/FAIL/INVALID result;
- cleanup confirmation.

The public report is the durable record; temporary Actions artifacts are supplementary.

## 17. Current state

No S-Series runtime workflow or cloud campaign is created by this document. The current work is documentation/contract foundation only.
