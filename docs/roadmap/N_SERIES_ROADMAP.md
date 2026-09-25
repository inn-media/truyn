# TRUYN N-Series Roadmap

Status: **FOUNDATION DEFINED / EXECUTION NOT STARTED**  
Task: `truyn-n-series-foundation-260920-n0`

## Locked qualification model — entire N-Series

Canonical model: **`Frozen Candidate -> Branch Qualification -> Admission to Main`**.

This model is non-optional until all N-Series tests complete. Expensive qualification belongs to a frozen candidate SHA, not moving `main`. Main movement triggers `BASE_SHA -> current main` admission analysis, never an automatic full rerun. Non-N-sensitive drift reuses candidate evidence. N-sensitive drift is mapped to N1-N7 and **only targeted blocks are executed by `scripts/n-series-selective-block-runner.mjs`**; every targeted block must be GREEN. Integration-candidate fingerprints are recomputed before admission. Historical GREEN candidate evidence alone never authorizes merge/launch. Admission is exact-current-main bound and becomes stale when main moves. Acceptance weakening is forbidden. Removal/bypass requires explicit user authorization.

Machine lock: `config/n-series-frozen-candidate-policy.json`. Verifier: `scripts/verify-n-series-frozen-candidate-policy.mjs`. Manifest engine: `scripts/n-series-qualification-manifest.mjs`. Selective runner: `scripts/n-series-selective-block-runner.mjs`.

## N0 — Foundation

- [x] architecture/scope and four N scenarios;
- [x] public/private ownership boundary;
- [x] D/S/T/H/E-compatible isolation semantics;
- [x] telemetry, evidence, cleanup and false-PASS contracts;
- [x] Frozen Candidate -> Branch Qualification -> Admission to Main lock;
- [x] automatic qualification/admission manifests;
- [x] selective N1-N7 admission runner; all targeted blocks GREEN required.

No benchmark PASS is created by N0.

## N1 — Contract pin + runner/schema qualification

- [ ] private runner pins exact accepted public N contract/release/SHA;
- [ ] freeze private run/acceptance/resource/evidence schemas;
- [x] public selective N1-N7 admission runner implemented and machine-locked;
- [ ] integrate private `seriesId=N` with benchmark coordinator;
- [ ] prove unique run IDs/N-only namespace, R1 attribution, R2 waiting and owner-safe cleanup;
- [ ] qualify deterministic private→public sanitizer/exporter.

## N2 — N/SOVEREIGNTY

Harness requirements: >=3 jurisdiction classes / >=2 clouds; only-region, forbid-region, data-stays-source and compute-near-data policies; cheaper/faster forbidden-provider conflict arm; impossible-policy fail-closed arm; actual data-plane egress evidence; leak-canary/log audit; paired unrestricted/restricted compliance-tax measurement; safe public evidence projection.

### Mandatory progression — each cell is a separate immutable test

- [ ] **10-node qualification / smoke** — prove topology, policy enforcement, evidence collection and fail-closed behavior before scale;
- [ ] **50-node immutable run** — unchanged acceptance semantics;
- [ ] **100-node immutable run** — unchanged acceptance semantics;
- [ ] independent reconciliation and safe public report for each accepted cell.

**10 -> 50 -> 100 is the canonical N/SOVEREIGNTY sequence.** A GREEN 10-node test does not substitute for 50 or 100; each is executed and evidenced separately.

## N3 — N/MARKETPLACE

- [ ] frozen capability manifest and provider-neutral requester;
- [ ] >=2 eligible providers per fairness arm;
- [ ] discovery/execution fan-out instrumentation;
- [ ] atomic NEED + >=3-step DAG workloads;
- [ ] provenance, Jain fairness and anti-central-selection gates;
- [ ] 50-node pilot;
- [ ] 50-node immutable final;
- [ ] 100-node immutable final;
- [ ] independent reconciliation/public report.

## N4 — N/TRUST-DECAY

- [ ] hidden oracle/gold dataset + seed/workload commitment;
- [ ] signed plausible bad/stale/low-quality behavior;
- [ ] domain-specific degradation, hostile dispute and rehabilitation;
- [ ] static/no-learning paired control when causal improvement is claimed;
- [ ] pilot-only calibration then frozen confidence/sample/window rules;
- [ ] 50-node immutable final;
- [ ] 100-node immutable final;
- [ ] independent reconciliation/public report.

## N5 — N/SUSTAINED-CHURN

- [ ] continuous load and deterministic seeded churn planner;
- [ ] join/leave/replace + bootstrap participation;
- [ ] TTL/refresh/newcomer/time-bucketed routing/recovery/backlog telemetry;
- [ ] long-window >= `max(2h, 12*TTL)`;
- [ ] characterize 5%/10%/20% replacement where feasible;
- [ ] supported-rate/first-break-rate evaluator;
- [ ] 100-node pilot;
- [ ] 100-node immutable final;
- [ ] 200-node immutable final;
- [ ] independent reconciliation/public report.

## N6 — Cross-series proof

- [ ] representative N preflight with D/S/T/H/E ownership present;
- [ ] namespace collision = 0 and foreign writes/deletes = 0;
- [ ] R1 blocks/invalidates only affected N work;
- [ ] R2 conflict => `WAITING_SHARED_RESOURCE`;
- [ ] N concurrency cannot cancel foreign runs;
- [ ] N spend/budget attribution isolated.

## N7 — Evidence closure

For every final scenario/cell: retain raw/private evidence; independently recompute headline metrics; reconcile retry/exception/exclusion ledger; verify cleanup; deterministic sanitized export; append-only public report; artifact digests; preserve negative/failed/invalidated attempts; bound claims to exact tested scope.

## First evidence order

`SOVEREIGNTY -> MARKETPLACE -> TRUST-DECAY -> SUSTAINED-CHURN`.

Independent lanes may overlap only when R0/R1/R2 proves isolation. Long-running churn may not impose a global benchmark lock.

## Completion

N-Series is complete only when every intended scenario/cell has immutable real evidence or an explicitly preserved negative/unsupported result.
