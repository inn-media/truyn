# TRUYN S-Series Execution Isolation and Telemetry

Status: **EXECUTION CONTRACT IMPLEMENTED / QUALIFICATION ACTIVE — NO S PASS**  
Applies to: `S-50`, `S-100`, `S-200`, `S-500`  
Documentation audit: **2026-09-23**

This document defines the operational boundary for Semantic Scale execution without contaminating D/E/T/H benchmark evidence.

## 1. Parallel-track rule

D-Series and S-Series are independent:

```text
D-Series = network scale / resilience
S-Series = live semantic-node scale / heterogeneous inference / semantics / economics
```

They may overlap only when run identities, capacity, mutable resources, provider attribution and evidence are independently attributable. An S run never modifies/reuses a frozen D launcher, evaluator, launch token or accepted evidence file.

## 2. Namespace and isolation requirements

S execution uses dedicated workflow/concurrency/resource/evidence namespaces. Concurrency groups begin with `truyn-s-series-` and never equal D-Series groups.

Isolation covers compute/process hosts, relay/runtime staging, artifacts/storage, provider runtime instances where dedicated, benchmark requester identities and cleanup inventory.

Shared dependency classification follows `docs/benchmarks/BENCHMARK_SERIES_ISOLATION.md`:

- R0 immutable/read-only can be shared;
- R1 shared services require attribution + active interference detection;
- R2 capacity/cache/index/fault mutation is exclusive.

If a required shared mutable target is owned by another measured series, record/wait rather than cancelling or perturbing the owner run.

## 3. Provider-spend boundary

S-Series uses owner-authorized benchmark provider access. The fail-closed invariant remains:

```text
unauthorized requester
→ authorization DENY
→ adapter.execute() not called
→ provider calls = 0
→ owner-funded tokens/cost = 0
```

Credentials, real service identities, private endpoints, allowlists, quotas and spend ceilings never enter public evidence.

## 4. Telemetry contract

Every measured record carries immutable run identity plus enough ordering/timestamp information to reconstruct the run.

Required evidence layers:

1. node/readiness identity and placement class;
2. request/provider call timing/usage/status;
3. semantic retrieval/provenance correctness where exercised;
4. chain/hop correlation where exercised;
5. network/run routing/recovery/write/safety/cleanup state;
6. paired DIRECT/TRUYN economic evidence for ECON.

Provider usage uses authoritative provider values where available; unknown values are `null`, never fabricated estimates.

Headline calculations preserve their raw inputs. Gross/list-price-equivalent provider cost and net cash/credit-covered cost remain separate fields.

## 5. Common hard gates

The exact benchmark contract remains authoritative, but the common S-Series boundary retains:

- routing success `>=99%` where exercised;
- recovery p95 `<=120 s` where exercised;
- semantic retrieval/answer correctness `>=99%` where exercised;
- provenance/minimal-context correctness `100%`;
- zero internal block-ID leakage;
- zero acknowledged-write loss where exercised;
- zero invalid/stale/unauthorized acceptance;
- ECON paired input-token/provider-cost reduction `>=90%` for the frozen comparable workload;
- zero unauthorized owner-funded provider execution.

No threshold may be weakened to close a run.

## 6. Spend preflight

Before paid inference or large provisioning, every real run verifies:

- exact public/private source/release identities;
- frozen benchmark source/config and manifest digests;
- provider/model access and mapping;
- compute/provider quota sufficient for the declared run;
- D/E/T/H collision/interference state;
- unique run/resource/artifact namespace;
- cleanup path;
- private budget/stop conditions.

A failed prerequisite yields blocked/preparation failure and must not be reinterpreted as benchmark success.

## 7. S-50 qualification and acceptance sequence

The current sequence is stricter than the old documentation-only plan:

1. reconcile exact public/private heads and frozen benchmark-source SHA;
2. execute the full blockwise prerequisite set (currently B01–B16) against the exact candidate;
3. repair only materially failing blocks, preserving acceptance semantics;
4. repeat exact-head qualification after material repairs;
5. perform fresh shared-resource/capacity collision check;
6. only after all prerequisites are GREEN, dispatch exactly one fresh immutable S-50 acceptance attempt;
7. preserve terminal evidence and cleanup state even on failure;
8. independently reconcile before any public PASS claim.

Historical attempts are immutable and are never rerun or relabeled.

## 8. Current factual state

The prior statement **“IMPLEMENTATION NOT STARTED” is obsolete**.

As of this audit:

- S-50 managed execution and qualification tooling exists in `inn-media/truyn-platform`;
- real S-50 attempt/repair/preflight history exists;
- public `main@3a1f7e67b80cecf678d373e33db9ceb09098e8a4` contains S-Series-driven 50-socket heartbeat stability and `1013 socket_backpressure` reconnect/exactly-once regression coverage;
- blockwise qualification is an active prerequisite model.

No S-50 acceptance PASS is claimed by this document. S-100/S-200/S-500 likewise remain open.

## 9. Evidence closure

An accepted run must emit/freeze:

- normalized telemetry/evidence;
- exact source/config/run identities;
- artifact digest manifest;
- terminal PASS/FAIL/INVALID classification;
- cleanup confirmation;
- public sanitized report with limitations;
- cryptographic identities for withheld unsafe raw artifacts where needed.

The durable public report is the acceptance record. Temporary Actions artifacts are supplementary, not a substitute for explicit durable closure.
