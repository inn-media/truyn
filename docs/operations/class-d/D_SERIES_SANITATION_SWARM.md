# D-Series Sanitation / Swarm

## Authority

Sanitation / Swarm is the primary D-Series diagnostic and repair engine. Blockwise B01-B16 is subordinate to it and is used twice: first as parallel diagnostic shards inside the Swarm, then as the mandatory admission gate after the repair loop is clean.

If Swarm and Blockwise semantics ever conflict, preserve the stricter safety/acceptance rule and prefer the Swarm execution model: fail-collect, maximum parallel diagnosis, root-cause deduplication, resumable checkpoints, frozen-candidate evidence and no silent weakening.

## Permanent architecture lock

This architecture is a repository invariant for the remainder of the D-Series program. It is **LOCKED until `ALL_D_SERIES_TESTS_COMPLETE`**.

The machine-readable authorities are `config/d-series-swarm-blockwise-architecture-lock.json` and `config/d-series-frozen-candidate-policy.json`; their verifier scripts fail closed.

Until all D-Series tests are complete, ordinary refactors, repairs, CI cleanup, optimizations, launcher changes, sprint transitions, D-500 work and D-1000 work MUST preserve all of the following:

- Sanitation / Swarm remains the primary diagnostic and repair engine.
- Blockwise B01-B16 remains subordinate to Swarm.
- Expensive qualification is bound to an immutable frozen candidate, not to moving `main`.
- Movement of `main` triggers admission analysis, not automatic full D-Series requalification.
- Swarm owns massively parallel diagnostics, fail-collect execution, root-cause classification/deduplication and the repair loop.
- Targeted Bxx runs are repair accelerators only and can never authorize a real D-Series launch.
- Full B01-B16 on the frozen candidate remains a mandatory qualification/admission input after a clean Swarm.
- Before merge, the final Admission Gate integrates the frozen candidate with current `main`, recomputes fingerprints, and reruns only affected D-sensitive blocks.
- D-500/D-1000 remain final real-scale proofs after live qualification and collision/capacity checks.
- Acceptance thresholds may never be weakened to preserve this architecture or obtain GREEN.
- A competing `blockwise-only` or launcher-direct architecture is forbidden while this lock is active.
- An exact-current-main qualification architecture is likewise forbidden while this lock is active; current-main compatibility belongs only to final Admission.

Removal or material modification of this lock before `ALL_D_SERIES_TESTS_COMPLETE` requires an explicit user-authorized architecture change. It must not happen implicitly as part of another repair or refactor.

## Canonical chain

1. FREEZE CANDIDATE / BASE_SHA
2. SANITATION / SWARM — massively parallel diagnostics on the frozen candidate
3. root causes — deduplicated fingerprints, FAIL / INFRA / BLOCKED separated
4. repairs — minimal and acceptance-preserving
5. targeted block qualification — rerun only affected B01-B16 domains while repairing
6. FULL B01-B16 on the frozen candidate — mandatory qualification evidence after the Swarm is clean
7. FINAL ADMISSION TO CURRENT MAIN — compare `BASE_SHA → current main`, build integration candidate, recompute fingerprints, rerun only affected blocks
8. isolated LIVE qualification where required by D-sensitive drift/policy
9. shared-resource / capacity collision check
10. ONE REAL D-SERIES RUN
11. immutable evidence

The Swarm phase is a loop, not a single command. A RED Swarm is expected to produce root causes, not permission to launch. Repair the root causes, use targeted Bxx runs for fast confirmation, rerun the affected Swarm evidence until clean, and only then execute the full B01-B16 qualification pass. Parallel movement of `main` does not invalidate this expensive evidence by itself.

## What the Swarm owns

- canonical Class-D resumable fail-collect DAG for D-200, D-500 and D-1000;
- real local multiprocess reproductions;
- parallel diagnostic execution with fail-fast disabled;
- PASS / FAIL / INFRA / BLOCKED separation;
- frozen-candidate checkpoints and optional change-aware resume;
- failure fingerprints and root-cause deduplication;
- the proven 12-lane D-200 Bug Hunt as a retained compatibility/diagnostic layer;
- Blockwise domains as additional parallel diagnostic shards;
- retention of all evidence even when one or more shards fail.

The existing `scripts/class-d-stage-runner.mjs` remains the canonical stage engine. The Blockwise runner does not replace it. The historical `.github/workflows/d200-bug-hunt.yml` path is retained deliberately and promoted to the D-Series Sanitation Swarm entrypoint so the proven D-200 mechanics are not discarded.

## Canonical one-shot caller

`D-Series Swarm One-Shot Launcher` is a transport surface only. It does not implement diagnostics, admission, live qualification, collision checks or a real D-Series campaign. Its only material job is to validate a one-shot request and call the canonical reusable `.github/workflows/d200-bug-hunt.yml` Swarm.

A caller run is valid Swarm provenance only when all of these conditions are proven fail-closed by `scripts/verify-d-series-swarm-run.sh`:

- the launcher branch name is exactly `automation/d-series-dispatch/<source-prefix>-<scale>-swarm`;
- the launcher commit has exactly one parent and that parent is the frozen candidate source SHA;
- the launcher is exactly one commit ahead of that source SHA;
- the only changed file is `.github/d-series-dispatch/request.env`;
- the request contains exactly `SOURCE_SHA`, `SCALE` and `MODE=swarm` for the tested source and requested scale;
- the top-level caller run is attempt 1, completed successfully, and uses the canonical launcher workflow;
- the canonical Swarm summary artifact for that same run id and scale exists and is retained.

The caller never requires `SOURCE_SHA == current main`. Current-main compatibility is intentionally deferred to the final Admission Gate.

This caller is not a launcher-direct architecture: it cannot run Blockwise, live qualification or D-500/D-1000 acceptance and it cannot contain a copied Swarm implementation. Any caller that bypasses the canonical reusable Swarm remains forbidden by the architecture lock.

## What Blockwise owns

B01-B16 is the normalized domain model and final qualification/admission input. During the Swarm, all B01-B16 domains run as diagnostic shards so one pass exposes as many independent failures as possible. During repair, one Bxx block may be rerun in targeted mode. A targeted GREEN is never launch authorization.

A full frozen-candidate Blockwise run is valid only when:

- it executes against the immutable frozen candidate SHA, not necessarily current `main`;
- a successful exact-SHA `D-Series Sanitation Swarm` provenance run is supplied, either as the canonical direct `workflow_dispatch` or the strictly verified canonical one-shot reusable caller described above;
- the Swarm scope is the requested D-class or `all`;
- the full Blockwise aggregate is 16/16 PASS on that same frozen candidate SHA;
- the qualification provenance artifact is retained.

Merge/launch authority additionally requires the final Admission Gate against current `main`. The gate builds the integration candidate, recomputes fingerprints, selectively requalifies D-sensitive drift, fails closed when live requalification is required, and becomes stale if `main` moves during admission.

## Real scale

Neither local Swarm diagnostics nor Blockwise 16/16 is represented as production-scale proof. D-500 and D-1000 still require their isolated live qualification where applicable, a fresh shared-resource/capacity collision check, and exactly one immutable full-scale campaign.

No routing, recovery, topology, durability, safety, cleanup, evidence, terminal or process-count acceptance threshold is weakened by this architecture.
