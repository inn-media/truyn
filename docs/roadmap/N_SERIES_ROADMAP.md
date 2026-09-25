# TRUYN N-Series Roadmap

Status: **QUALIFICATION ACTIVE / SOVEREIGNTY-10 QUALIFICATION GREEN / REAL MEASURED SOVEREIGNTY-50 NEXT**

N-Series uses the locked `Frozen Candidate -> Branch Qualification -> Admission to Main` model and Swarm-Blockwise N1-N7 qualification. Moving `main` does not erase frozen candidate evidence; exact-current integration Admission is mandatory before material launch. Historical GREEN alone never authorizes a later cell. Acceptance weakening is forbidden.

## N0 — Foundation

- [x] architecture and four N scenarios;
- [x] public/private ownership boundary;
- [x] D/S/T/H/E-compatible isolation semantics;
- [x] telemetry, evidence, cleanup and false-PASS contracts;
- [x] Frozen Candidate / selective admission / Swarm-Blockwise locks.

## N1 — executable substrate

- [x] exact-SHA run identity and immutable manifest primitives;
- [x] N coordinator integration for SOVEREIGNTY qualification;
- [x] R1 probe, R2 lease, shared-resource/collision and cleanup path;
- [x] deterministic evidence sanitizer for qualification evidence.

## N2 — N/SOVEREIGNTY

Safety semantics remain: >=3 jurisdiction classes and Azure+GCP representation; only-region/forbid-region/data-stays-source/compute-near-data policy; deliberately cheaper/faster forbidden-provider conflict; impossible-policy fail-closed; data-plane/leak evidence; paired unrestricted/restricted comparison.

- [x] **10-node qualification/smoke** — accepted GREEN run `36175269021`. It proved policy/control-plane/evidence/coordinator mechanics. Its 20/24 ms and 1.00/1.10 cost-unit pair is a deterministic fixture with zero paid provider calls and is not a production-performance claim. See `../benchmarks/N_SOVEREIGNTY_10_2026-09-25.md`.
- [ ] **50-node immutable real measured run** — exactly 50 unique real Azure/GCP nodes/endpoints. Required metrics: RTT p50/p95/p99, throughput, success rate, routing-decision p50/p95/p99, sovereignty overhead, node-runtime/egress cost, data-plane bytes and forbidden-flow/leak proof. See `../benchmarks/N_SOVEREIGNTY_MEASURED_50_100.md`.
- [ ] **100-node immutable real measured run** — scale the accepted measured 50 harness to 100 with unchanged safety semantics and metric vocabulary.
- [ ] independent reconciliation and safe public report for each measured cell.

Canonical progression is **10 -> 50 -> 100**. Each cell is independently admitted, executed and evidenced; earlier GREEN never substitutes for later scale.

## N3 — N/MARKETPLACE

- [ ] frozen capability manifest and provider-neutral requester;
- [ ] discovery/execution instrumentation and composite workloads;
- [ ] provenance/fairness/anti-central-selection gates;
- [ ] 50-node pilot, 50-node immutable final, 100-node immutable final;
- [ ] independent reconciliation/public report.

## N4 — N/TRUST-DECAY

- [ ] hidden oracle/gold dataset and workload commitment;
- [ ] signed bad/stale/low-quality behavior and rehabilitation;
- [ ] paired no-learning control when causal improvement is claimed;
- [ ] frozen statistical rules after pilot;
- [ ] 50-node and 100-node immutable finals;
- [ ] independent reconciliation/public report.

## N5 — N/SUSTAINED-CHURN

- [ ] continuous load and deterministic seeded churn;
- [ ] join/leave/replace/bootstrap and recovery telemetry;
- [ ] long-window >= `max(2h, 12*TTL)`;
- [ ] 5%/10%/20% replacement characterization where feasible;
- [ ] 100-node pilot/final and 200-node immutable final;
- [ ] independent reconciliation/public report.

## N6 — Cross-series proof

- [ ] representative N preflight with D/S/T/H/E ownership present;
- [ ] namespace collision and foreign writes/deletes remain zero;
- [x] R1/shared-resource/collision preflight qualified for SOVEREIGNTY-10;
- [x] R2 lease authority qualified for SOVEREIGNTY-10;
- [ ] concurrency and measured-cell spend attribution isolation.

## N7 — Evidence closure

For every final measured cell retain raw evidence, independent metric recomputation, retry/exception/exclusion ledger, cleanup proof, deterministic sanitized export, artifact digests and negative/invalidated attempts. Claims remain bounded to exact tested scope.

First evidence order remains `SOVEREIGNTY -> MARKETPLACE -> TRUST-DECAY -> SUSTAINED-CHURN`.
