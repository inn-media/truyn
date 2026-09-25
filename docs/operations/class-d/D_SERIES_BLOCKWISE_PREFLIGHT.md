# D-Series Blockwise Preflight

Blockwise B01-B16 remains the mandatory D-Series admission layer inside the broader Sanitation / Swarm architecture. Sanitation / Swarm remains the primary diagnostic and repair engine; Blockwise may not replace it.

The canonical definition is `config/d-series-blockwise-preflight.json`. B01-B16 keep their existing domains and acceptance semantics. Blocks run in parallel with fail-fast disabled, and targeted mode remains the fast repair mechanism.

## Permanent qualification model

The D-Series no longer binds expensive qualification to moving `main`.

Canonical chain:

`Frozen Candidate -> Sanitation/Swarm branch qualification -> full B01-B16 branch qualification -> immutable qualification manifest -> Admission to current main -> integration fingerprints -> affected Bxx only when needed -> fresh Admission PASS -> collision/capacity -> one real D-Series campaign when required -> immutable evidence`.

Machine authority for this model is:

- `config/d-series-frozen-candidate-admission.json`;
- `config/d-series-swarm-blockwise-architecture-lock.json`;
- `scripts/check-d-series-frozen-candidate-admission.mjs`;
- `scripts/verify-d-series-swarm-blockwise-architecture-lock.mjs`.

Detailed operational contract: `docs/operations/class-d/D_SERIES_FROZEN_CANDIDATE_ADMISSION.md`.

## Frozen branch qualification

`D-Series Frozen Candidate Qualification` qualifies an immutable candidate SHA and does **not** require that SHA to remain current `main`.

The workflow uses the canonical Class-D stage DAG and the canonical B01-B16 runners. It creates an immutable qualification artifact containing the Swarm summary, full Blockwise summary, and automatic D qualification manifest with per-surface fingerprints.

A `main` movement after GREEN does not make this evidence stale by itself.

## Admission after main movement

Before merge or launch, `D-Series Admission Gate` compares `BASE_SHA -> current main` and computes the combined integration tree.

- If D-sensitive fingerprints are unchanged, frozen evidence is retained and Admission can PASS without repeating B01-B16.
- If D-sensitive fingerprints changed, only mapped affected blocks are rerun against the combined integration state.
- If integration conflicts, manifest identity is invalid, or affected blocks fail, Admission fails closed.
- A full D-Series rerun is never triggered merely because `main` moved.

The final Admission result is bound to the exact `currentMainSha`. If `main` moves again, rerun Admission only. The frozen branch qualification remains valid unless the Admission analysis proves an incompatibility requiring additional qualification.

## Launch authority

A GREEN candidate SHA, a GREEN Swarm run, a GREEN full B01-B16 run, or a targeted GREEN block is **not** sufficient launch authority by itself.

Launch authority requires a fresh `D-Series Admission Gate` artifact whose `currentMainSha` still equals live `main`. Future D-500/D-1000 launch surfaces must verify this provenance with `scripts/verify-d-series-admission-run.sh`.

## Live qualification

Cloud-dependent isolated qualification and real D campaigns remain separate gates. They are repeated only when affected integration qualification or a concrete runtime/cloud semantic change proves that prior frozen evidence is insufficient. Acceptance thresholds are never weakened to avoid a rerun.

Legacy exact-main Swarm/Blockwise transports may remain for diagnostics and compatibility, but they no longer define the D-Series merge/admission model.
