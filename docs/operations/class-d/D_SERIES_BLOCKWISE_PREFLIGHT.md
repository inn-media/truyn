# D-Series Blockwise Preflight

Blockwise is the mandatory D-Series admission layer inside the broader Sanitation / Swarm architecture. Sanitation / Swarm remains the primary diagnostic and repair engine; Blockwise does not replace it.

The permanent expensive-qualification model is now:

`Frozen Candidate -> Branch Qualification -> Admission to Main`.

The machine authority for this rule is `config/d-series-frozen-candidate-policy.json`, reinforced by `config/d-series-swarm-blockwise-architecture-lock.json`. See `docs/operations/class-d/FROZEN_CANDIDATE_ADMISSION.md`.

## Candidate-bound qualification

active-12 Blockwise run against an exact frozen candidate SHA/tree. The full candidate proof requires clean Sanitation Swarm evidence plus 12/12 Blockwise PASS. `D-Series Frozen Candidate Qualification` then emits an automatic qualification manifest containing `BASE_SHA`, candidate SHA/tree, evidence run IDs and D-sensitive fingerprints.

Expensive evidence is attached to this candidate. `main` may move while the qualification is running. Main movement alone does not cancel the run, stale the candidate evidence, or authorize an automatic full rerun.

Targeted mode remains diagnostic: a repaired block may be rerun quickly, but targeted GREEN alone is not candidate qualification and never authorizes merge or launch.

## active-12 Blockwise

Active: B01, B02, B04, B07, B08, B09, B10, B11, B12, B13, B14, B15. Legacy B03/B05/B06/B16 retired and preserved in `history/D_SERIES_RETIRED_BLOCKS_2026-10-10.json`.

The canonical block definition remains `config/d-series-blockwise-preflight.json`. Local proof remains bounded and is not represented as a 20-host live-scale proof.

## Admission to moving main

Before merge or D-Series launch, `D-Series Admission Gate` compares `BASE_SHA -> current main`, constructs the integration candidate, and recomputes all D-sensitive fingerprints.

If the main delta is D-insensitive, the frozen expensive evidence is reused after the small integration gate.

If the main delta touches D-sensitive surfaces, only mapped affected Bxx blocks are rerun on the integrated state. A live rerun is requested only when the locked sensitive-surface policy marks it necessary. Main movement itself is never a reason for an automatic full D-Series rerun.

A GREEN frozen branch SHA is never merge authority by itself. The final Admission Gate on the integrated state is mandatory. If main moves after that gate, the Admission is stale and must be recalculated; the frozen expensive qualification remains reusable unless the new admission analysis proves otherwise.

## Launch boundary

Real D-200/D-500/D-1000 acceptance remains downstream of Sanitation Swarm and Blockwise, but launch authorization additionally requires a fresh successful integration Admission manifest. `scripts/verify-d-series-blockwise-preflight-run.sh` calls `scripts/verify-d-series-admission-run.sh` fail-closed.

This model does not weaken routing, recovery, topology, safety, cleanup, evidence or terminal thresholds and does not weaken the single-shot rule.

## User-approved retirement (2026-10-10)

Active Blockwise and Swarm execution excludes B03, B05, B06 and B16. Their original definitions, former run IDs and immutable Git history remain available under `history/D_SERIES_RETIRED_BLOCKS_2026-10-10.json`. Other 12 blocks remain fail-closed. The D-5000 strict first-attempt >=99%, 100 ack/zero loss, 20 x 250 topology, recovery, evidence and zero-resource cleanup acceptance remain unchanged.
