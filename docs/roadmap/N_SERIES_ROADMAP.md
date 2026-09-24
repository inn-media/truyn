# TRUYN N-Series Roadmap

Status: **FOUNDATION DEFINED / EXECUTION NOT STARTED**  
Task: `truyn-n-series-foundation-260920-n0`

This roadmap takes N-Series from documentation to immutable measured evidence while preserving the two-repository boundary and cross-series isolation.

## N0 — Foundation — THIS CHANGE

- [x] define N-Series architecture and scope;
- [x] define N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY and N/SUSTAINED-CHURN;
- [x] define public/private ownership boundary;
- [x] bind N to common D/S/T/H/E-compatible benchmark isolation semantics;
- [x] define common/result-state vocabulary;
- [x] define telemetry events and recomputable metric formulas;
- [x] define full execution/cleanup/evidence procedure;
- [x] define false-PASS traps and invalidation rules;
- [ ] merge public foundation only when doing so does not invalidate an unrelated exact-main qualifying campaign;
- [ ] pin the accepted public N foundation in the private runner.

No benchmark PASS is created by N0.

## N1 — Contract pin + runner/schema qualification

- [ ] private runner pins exact accepted public N contract/release/SHA;
- [ ] implement/freeze private run manifest, acceptance manifest, resource plan and evidence index schemas;
- [ ] integrate `seriesId=N` with the existing private benchmark coordinator;
- [ ] prove globally unique run IDs and N-only namespace ownership;
- [ ] prove R2 lease conflict yields `WAITING_SHARED_RESOURCE` without mutating the owner;
- [ ] prove R1 interference events are attributable;
- [ ] prove foreign cleanup/resource mutation is impossible;
- [ ] qualify deterministic private→public sanitizer/exporter against N telemetry vocabulary.

## N2 — N/SOVEREIGNTY harness

- [ ] topology planner for >=3 jurisdiction classes / >=2 clouds;
- [ ] policy matrix: only-region, forbid-region, data-stays-source, compute-near-data;
- [ ] conflict arm with cheaper/faster forbidden provider;
- [ ] impossible-policy fail-closed arm;
- [ ] actual data-plane egress/flow evidence collector;
- [ ] leak-canary/log audit path;
- [ ] paired unrestricted/restricted measurement for compliance tax;
- [ ] safe public evidence projection.

### N2 pilot gate

- 50-node low-cost pilot;
- validate instrumentation, no headline claim;
- repair only by new source/run identity; no acceptance weakening.

### N2 final cells

- [ ] 50-node immutable final;
- [ ] 100-node immutable final with unchanged gates;
- [ ] independent reconciliation and safe public report.

## N3 — N/MARKETPLACE harness

- [ ] frozen independent capability manifest;
- [ ] requester fixture that contains capability/constraints but no provider identity;
- [ ] capability inventory across translation, summary, embedding, image, code review, reasoning, data fetch (or frozen equivalent classes);
- [ ] >=2 equivalent eligible providers in fairness arm;
- [ ] discovery fan-out instrumentation;
- [ ] atomic NEED and >=3-step composite DAG fixtures;
- [ ] per-step provenance;
- [ ] Jain fairness calculation and anti-broadcast gate.

### N3 pilot/final

- [ ] 50-node pilot;
- [ ] 50-node immutable final;
- [ ] 100-node immutable final with unchanged gates;
- [ ] independent reconciliation and safe public report.

## N4 — N/TRUST-DECAY harness

- [ ] hidden independent ground-truth/oracle dataset;
- [ ] pre-run oracle/workload/seed digest commitment;
- [ ] signed plausible bad/stale/low-quality provider behavior fixtures;
- [ ] domain A bad / domain B good fixture;
- [ ] hostile unauthorized dispute fixture;
- [ ] rehabilitation phase;
- [ ] static/no-learning paired control when causal improvement is claimed;
- [ ] confidence method, minimum sample size, learning window and recovery window frozen after pilot and before final.

### N4 pilot/final

- [ ] low-cost pilot to size samples/windows only;
- [ ] freeze final acceptance manifest;
- [ ] 50-node immutable final;
- [ ] 100-node immutable final with unchanged gates/windows;
- [ ] independent reconciliation and safe public report.

## N5 — N/SUSTAINED-CHURN harness

- [ ] continuous request generator;
- [ ] churn planner with exact join/leave/replace rate and bootstrap participation;
- [ ] peer TTL/refresh capture;
- [ ] time-bucketed routing/recovery/peer-table/backlog telemetry;
- [ ] newcomer steady-state measurement;
- [ ] long-window runner >= `max(2h, 12*TTL)`;
- [ ] initial characterization at 5%/10%/20% replacement rates where feasible;
- [ ] supported-rate and first-break-rate calculation.

### N5 pilot/final

- [ ] 100-node pilot;
- [ ] freeze claimed target rate/interval before final;
- [ ] 100-node immutable final;
- [ ] 200-node immutable final using unchanged acceptance gates and comparable rate definition;
- [ ] independent reconciliation and safe public report.

## N6 — Cross-series proof

Before any headline final campaign:

- [ ] run representative N preflight while D/S/T/H (or synthetic coordinator records representing their active ownership) exist;
- [ ] prove namespace collision = 0;
- [ ] prove foreign writes/deletes = 0;
- [ ] prove R1 interference behavior blocks only the affected N run;
- [ ] prove R2 conflict produces `WAITING_SHARED_RESOURCE`;
- [ ] prove N concurrency groups cannot cancel foreign runs;
- [ ] prove N spend/budget attribution is isolated.

## N7 — Evidence closure

For every final scenario/cell:

- [ ] raw/private evidence retained under private policy;
- [ ] headline metrics independently recomputed;
- [ ] exception/retry/exclusion ledger reconciled;
- [ ] cleanup verified;
- [ ] deterministic sanitized export produced;
- [ ] safe public report committed to append-only benchmark ledger;
- [ ] artifact/file digests retained;
- [ ] negative/failed/invalidated attempts preserved;
- [ ] claims bounded to exact tested node count, churn rate, policy set, domains and workload.

## Required scenario order for first evidence generation

```text
SOVEREIGNTY → MARKETPLACE → TRUST-DECAY → SUSTAINED-CHURN
```

The order may overlap only when resource classification proves isolation. A long-running churn test must never block an unrelated benchmark by using a global benchmark lock.

## Completion definition

The N-Series foundation is technically complete when N0 is accepted in both repositories. The N-Series itself is not complete until every intended scenario has immutable real evidence or is explicitly closed with a preserved negative/unsupported result.
