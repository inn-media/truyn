# D-Series Sanitation / Swarm

## Authority

Sanitation / Swarm is the primary D-Series diagnostic and repair engine. Blockwise B01-B16 is subordinate to it and is used twice: first as parallel diagnostic shards inside the Swarm, then as the mandatory admission gate after the repair loop is clean.

If Swarm and Blockwise semantics ever conflict, preserve the stricter safety/acceptance rule and prefer the Swarm execution model: fail-collect, maximum parallel diagnosis, root-cause deduplication, resumable checkpoints, exact-SHA evidence and no silent weakening.

## Permanent architecture lock

This architecture is a repository invariant for the remainder of the D-Series program. It is **LOCKED until `ALL_D_SERIES_TESTS_COMPLETE`**.

The machine-readable authority is `config/d-series-swarm-blockwise-architecture-lock.json`; `scripts/verify-d-series-swarm-blockwise-architecture-lock.mjs` verifies it fail-closed.

Until all D-Series tests are complete, ordinary refactors, repairs, CI cleanup, optimizations, launcher changes, sprint transitions, D-500 work and D-1000 work MUST preserve all of the following:

- Sanitation / Swarm remains the primary diagnostic and repair engine.
- Blockwise B01-B16 remains subordinate to Swarm.
- Swarm owns massively parallel diagnostics, fail-collect execution, root-cause classification/deduplication and the repair loop.
- Targeted Bxx runs are repair accelerators only and can never authorize a real D-Series launch.
- Full B01-B16 exact-SHA remains a mandatory admission gate after a clean exact-SHA Swarm.
- D-500/D-1000 remain final real-scale proofs after live qualification and collision/capacity checks.
- Acceptance thresholds may never be weakened to preserve this architecture or obtain GREEN.
- A competing `blockwise-only` or launcher-direct architecture is forbidden while this lock is active.

Removal or material modification of this lock before `ALL_D_SERIES_TESTS_COMPLETE` requires an explicit user-authorized architecture change. It must not happen implicitly as part of another repair or refactor.

## Canonical chain

1. SOURCE CHANGE
2. SANITATION / SWARM — massively parallel diagnostics
3. root causes — deduplicated fingerprints, FAIL / INFRA / BLOCKED separated
4. repairs — minimal and acceptance-preserving
5. targeted block qualification — rerun only affected B01-B16 domains while repairing
6. FULL B01-B16 exact-SHA — mandatory admission gate after the Swarm is clean
7. isolated LIVE qualification where required
8. shared-resource / capacity collision check
9. ONE REAL D-SERIES RUN
10. immutable evidence

The Swarm phase is a loop, not a single command. A RED Swarm is expected to produce root causes, not permission to launch. Repair the root causes, use targeted Bxx runs for fast confirmation, rerun the affected Swarm evidence until clean, and only then execute the full B01-B16 admission pass.

## What the Swarm owns

- canonical Class-D resumable fail-collect DAG for D-200, D-500 and D-1000;
- real local multiprocess reproductions;
- parallel diagnostic execution with fail-fast disabled;
- PASS / FAIL / INFRA / BLOCKED separation;
- exact-source checkpoints and optional change-aware resume;
- failure fingerprints and root-cause deduplication;
- the proven 12-lane D-200 Bug Hunt as a retained compatibility/diagnostic layer;
- Blockwise domains as additional parallel diagnostic shards;
- retention of all evidence even when one or more shards fail.

The existing `scripts/class-d-stage-runner.mjs` remains the canonical stage engine. The Blockwise runner does not replace it. The historical `.github/workflows/d200-bug-hunt.yml` path is retained deliberately and promoted to the D-Series Sanitation Swarm entrypoint so the proven D-200 mechanics are not discarded.

## What Blockwise owns

B01-B16 is the normalized domain model and final admission gate. During the Swarm, all B01-B16 domains run as diagnostic shards so one pass exposes as many independent failures as possible. During repair, one Bxx block may be rerun in targeted mode. A targeted GREEN is never launch authorization.

A full admission run is valid only when:

- it is a `workflow_dispatch` on exact current `main`;
- a successful exact-SHA `D-Series Sanitation Swarm` run is supplied as provenance;
- the Swarm scope is the requested D-class or `all`;
- the full Blockwise aggregate is 16/16 PASS on that same source SHA;
- the admission provenance artifact is retained.

## Real scale

Neither local Swarm diagnostics nor Blockwise 16/16 is represented as production-scale proof. D-500 and D-1000 still require their isolated live qualification where applicable, a fresh shared-resource/capacity collision check, and exactly one immutable full-scale campaign.

No routing, recovery, topology, durability, safety, cleanup, evidence, terminal or process-count acceptance threshold is weakened by this architecture.
