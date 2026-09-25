# D-Series Frozen Candidate → Branch Qualification → Admission to Main

This is the mandatory D-Series qualification model until `ALL_D_SERIES_TESTS_COMPLETE`.

## Core rule

**Expensive D-Series qualification belongs to a frozen candidate, not to moving `main`.**

A change to `main` does not automatically invalidate a GREEN frozen candidate and does not automatically authorize a full D-Series rerun. Instead, every merge/launch boundary performs a fresh Admission analysis of `BASE_SHA -> current main` and the combined integration state.

Permanent sequence:

`Frozen Candidate -> Sanitation/Swarm branch qualification -> full B01-B16 branch qualification -> immutable qualification manifest -> main may move -> Admission analysis -> integration fingerprints -> affected Bxx only -> fresh Admission PASS -> merge/launch boundary -> live D rerun only when proven necessary`.

## Frozen qualification

`D-Series Frozen Candidate Qualification` accepts an immutable `candidate_sha`, its `base_sha`, and D scale (`d200`, `d500`, `d1000`, or `all`). The candidate is deliberately **not required to equal current main**.

The workflow runs the canonical Sanitation/Swarm stage DAG, the canonical B01-B16 block runners, and D-200 legacy lanes when D-200 is in scope. It then emits `d-series-qualification-manifest.json` with:

- `baseSha`;
- `candidateSha` and candidate tree SHA;
- scale;
- immutable qualification run identity;
- candidate delta;
- per D-sensitive surface fingerprints.

`main` movement after this point does not erase this evidence.

## D-sensitive surfaces

Machine authority is `config/d-series-frozen-candidate-admission.json`. Each surface maps repository paths to one or more canonical B01-B16 blocks.

The Admission system compares `BASE_SHA -> current main`, recalculates fingerprints on the **combined integration tree**, and classifies the result:

- no D-sensitive fingerprint change: `ADMIT_WITH_FROZEN_EVIDENCE`;
- D-sensitive change: `REQUALIFY_AFFECTED_BLOCKS`;
- integration conflict: fail closed;
- stale/invalid manifest: fail closed.

Unchanged surfaces retain their frozen evidence. A D-sensitive change does **not** trigger an automatic full B01-B16 rerun and does **not** trigger an automatic live D rerun.

## Targeted requalification

When Admission identifies affected blocks, only those canonical Bxx blocks run against the materialized combined integration state. All affected blocks must PASS before Admission may emit `ADMIT_AFTER_TARGETED_REQUALIFICATION`.

A targeted block PASS is never, by itself, launch authority. The terminal authority is the final Admission artifact.

## Fresh Admission is mandatory

A GREEN frozen candidate SHA alone can never authorize merge or launch.

`D-Series Admission Gate` binds its result to:

- frozen candidate SHA;
- frozen `BASE_SHA`;
- exact `currentMainSha` observed by the gate;
- exact integration tree SHA;
- `BASE_SHA -> current main` changed-file set;
- recomputed surface fingerprints;
- affected block set and targeted PASS evidence when applicable.

If `main` moves after Admission, that Admission becomes stale. The correct response is to rerun the **Admission Gate only**. Full frozen qualification remains valid unless Admission proves a D-sensitive incompatibility that requires additional qualification.

## Live D reruns

Live D-200/D-500/D-1000 campaigns are not repeated merely because `main` moved. A live rerun is allowed only when affected integration qualification or a concrete runtime/cloud semantic change proves that the frozen live evidence no longer covers the integration candidate.

Acceptance thresholds, safety predicates, cleanup requirements, single-shot semantics, and immutable evidence rules are never weakened to avoid a rerun.

## Enforcement

The model is protected by three independent layers:

1. `config/d-series-frozen-candidate-admission.json` — D-sensitive mapping and fail-closed policy;
2. `config/d-series-swarm-blockwise-architecture-lock.json` + verifier — permanent architecture lock;
3. regression tests and launch verifiers — future D launch surfaces must require a fresh Admission Run whose `currentMainSha` still equals live `main`.

Material replacement or weakening of this model before `ALL_D_SERIES_TESTS_COMPLETE` requires an explicit user-authorized architecture change.
