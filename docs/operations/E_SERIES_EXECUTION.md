# E-Series Execution Procedure

Status: **EXECUTION FOUNDATION + PUBLIC VALIDATOR/RECOMPUTE IMPLEMENTED / QUALIFIED; NO E BENCHMARK PASS**  
Documentation audit: **2026-09-23**

This is the public execution procedure. Private resource names, quotas, billing reconciliation, leases and raw traces live only in `inn-media/truyn-platform`.

## Current implementation boundary

The original methodology-only foundation has progressed: public telemetry validation/recompute code exists under `benchmarks/e-series/` and was exact-head qualified in public commit `cdb1164f45b23c4335559e73edfea9cd71a07adb` (S20/S22 validator/recompute qualification; CI + Class-D Five-Patch GREEN).

That qualification proves the public evidence validator/recompute implementation only. It does **not** prove E/DECOMPOSE, E/PER-RESULT, E/KNEE or E/DEGRADE results.

Managed private qualification is active around exact-head, cross-series interference/collision guards and an exactly-once provider-smoke boundary. Until measured immutable evidence is independently reconciled, E-Series remains without a benchmark PASS.

## Required order

```text
E0 contract freeze
  → E1 instrumentation + public/private exact-head qualification
  → E2 cross-series R0/R1/R2 isolation/collision qualification
  → E3 provider-smoke / attribution proof
  → E4 E/DECOMPOSE measured campaign
  → E5 E/PER-RESULT measured campaign
  → E6 E/KNEE measured campaign
  → E7 E/DEGRADE measured campaign
  → E8 independent reconciliation + safe export
```

DECOMPOSE precedes KNEE so any plateau has a measured mechanism. PER-RESULT defines the useful-efficiency curve before KNEE analysis.

## Contract freeze

Freeze/digest before measured work:

- public source/release and private runner identity;
- corpus/workload/oracle;
- provider mix/model/config class;
- canonical stage mapping;
- DIRECT control;
- scale/load grids;
- warmup/sample/confidence policy;
- cost/compute attribution mode;
- invalidation/stop rules.

A material change creates a new campaign identity.

## Instrumentation qualification

Before paid/large-scale work, prove on a bounded run:

- one terminal outcome per logical NEED;
- canonical stage coverage;
- monotonic-clock durations;
- retries attributed to the original request;
- request/run cost and usage attribution;
- independently recomputable useful-result oracle;
- provider-limit vs internal-saturation taxonomy;
- sanitized export recomputes headline metrics;
- no private identifier is required for public recomputation.

The existing public validator/recompute implementation is part of this gate, not a benchmark result.

## Cross-series isolation

Classify every dependency under `BENCHMARK_SERIES_ISOLATION.md`.

- R0: immutable/read-only sharing allowed.
- R1: shared services require distinct attribution + active interference detection.
- R2: capacity/cache/index/fault mutation is exclusive.

Immediately before any paid provider smoke or measured campaign, reread authoritative public/private heads, duplicate history and material foreign runs. Stale orphaned historical Actions records must not be treated as active interference; current material shared-resource runs must be.

If a required R2 target is owned by another series, record `WAITING_SHARED_RESOURCE`. Do not cancel/mutate the foreign run.

## Exactly-once provider-smoke boundary

Provider smoke is a prerequisite, not an E result. It must be dispatched only after exact-head + isolation gates are GREEN, with duplicate history checked immediately before dispatch.

A failed or blocked smoke is never silently repeated as multiple paid calls. Exactly-once intent and provider billing attribution remain explicit.

## Measured lanes

### E/DECOMPOSE

At frozen scale points, measure canonical stage latency/bytes/tokens/cost and request-level TRUYN tax. Final claims require the sample minima and host aggregation rules fixed by the methodology.

### E/PER-RESULT

Pair TRUYN and DIRECT on the same useful-result gate. All failed/wrong/unverified work keeps its cost and receives zero useful-result credit.

### E/KNEE

Use the precommitted dense scale grid and breakpoint rule. Publish an observed knee/working range or explicitly `NO_KNEE_OBSERVED_IN_RANGE`; never invent/extrapolate one.

### E/DEGRADE

Use frozen offered-load ramps and measure success, latency, queues/backpressure, failure taxonomy, sustainable load and recovery/hysteresis. Provider external limits are labeled separately from internal TRUYN saturation.

## Evidence closure

Every final claim requires:

- frozen exact source/runner/manifest identities;
- complete safe telemetry or cryptographic identities for withheld raw evidence;
- independent recomputation of headline metrics;
- interference/lease/budget/cleanup reconciliation;
- append-only sanitized public report;
- explicit limitations/scope.

Public E evidence owns formulas and safe recomputation. Private actual billing, topology, service identities, quotas, budgets and raw traces remain private.

## Non-claims

Existence of methodology, validator code, exact-head qualification, provider-smoke or a pilot does not prove efficiency, bottleneck, scale knee, capacity or overload behavior. Those claims require their corresponding measured immutable campaign.
