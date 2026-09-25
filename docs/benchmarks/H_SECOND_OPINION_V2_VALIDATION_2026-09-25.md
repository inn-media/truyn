# H/SECOND-OPINION v2 — Validation Result — 2026-09-25

Status: **VALIDATION PASS / FINAL HIDDEN HOLDOUT NOT YET MEASURED**

This document records the measured validation result for the frozen methodology in `H_SECOND_OPINION_V2_METHODOLOGY.md`. It does not replace or modify the precommitted methodology and it is not the final headline benchmark result.

## Frozen claim under validation

TRUYN calibrated trust-aware `TRUST_WEIGHTED_K5` adjudication is tested against ordinary `MAJORITY_K5` voting and against three precommitted single-model reference comparators.

The validation exists to qualify the policy and freeze the final operational/economic envelopes before a fresh hidden final holdout.

## Measurement identity

- validation workflow run: `36132787723`
- exact private candidate SHA: `9e98549441f82be402e8c7e935a1decd318be35f`
- frozen public methodology SHA used by the run: `fe373172849f4b1411a0a4ca8b748cbdefbbd93e`
- immutable artifact ID: `10865630654`
- artifact name: `second-v2-validation-36132787723-a1`
- artifact ZIP SHA-256: `sha256:5da98fed52a24f4b802aaccdc79d869eedf730c9a1dffd886060ecbbe27b8ab0`
- independent zero-inference audit run: `36138616302`
- audit artifact ID: `10865815530`
- audit artifact ZIP SHA-256: `sha256:d8ebf98511f5d9c0e37c0dcfabe33d077957220040be01e85fc1d3565663fb20`

The raw evidence is retained in the private benchmark repository; the identities and digests above provide the public integrity anchors.

## Validation scale

- 150 fresh validation items
- 5 required strata
- 7 provider arms per item
- 1,050 logical provider calls
- 1,067 provider HTTP attempts
- 61 K5 disagreement items
- 19 items where calibrated trust and majority produced different final decisions

The validation partition is separate from the earlier v1 development/calibration material and is not the final hidden holdout.

## Frozen validation gates

All frozen validation gates passed:

- **Gate A — ensemble value: PASS**
- **Gate B — trust incremental value on disagreement subset: PASS**
- **Gate C — overall safety / non-inferiority: PASS**
- **Gate D — validation economics and latency reconciliation: PASS**

Measured point deltas:

- TRUST_WEIGHTED_K5 vs frozen worst-provider anchor: **+6.000 percentage points**
- TRUST_WEIGHTED_K5 vs mean of all seven providers: **+8.095 percentage points**
- TRUST_WEIGHTED_K5 vs frozen best-provider anchor: **+24.000 percentage points**
- trust lift over majority on disagreement subset: **+11.475 percentage points**
- overall trust-vs-majority delta: **+4.667 percentage points**
- trust corrections of majority errors: **7**
- trust regressions: **0**

The statistical PASS classifications were recomputed independently from the immutable artifact under the precommitted paired methodology. Thresholds were not changed after observing the result.

## Latency and economics

- measured validation K5 latency p95: **23,215 ms**
- frozen final K5 p95 envelope: **29,019 ms**
- envelope rule: `ceil(validation_p95 × 1.25)`
- provider-returned request-scoped usage reconciled: **1,050 / 1,050 answer rows**
- conservative validation cost upper bound: **USD 0.275633164**
- frozen validation/final cost ceiling: **USD 50**

Resource-level cloud metrics were treated as corroboration rather than as the canonical run-scoped meter where shared deployments contained unrelated traffic. The canonical validation meter is the provider-returned per-request usage captured in immutable results/telemetry.

## What this validation establishes

The validation supports proceeding to the precommitted hidden final holdout. It shows that the calibrated trust policy is non-degenerate, creates measurable decisions different from majority voting, passes the frozen trust-specific validation gate, and stays within the predeclared latency/cost constraints.

It does **not** yet authorize the final external benchmark claim from the methodology. That claim remains reserved for the fresh hidden final holdout.

## Next frozen measurement

The final lineage is precommitted as:

- 200 fresh hidden holdout items
- 40 items per required stratum
- 7 provider arms per item
- exactly 1,400 base provider calls
- no v1 item reuse
- no validation item reuse
- frozen provider/model pins, trust calibration, baselines, seed commitment, gates and statistical rules

The final measurement is single-shot. A terminal FAIL remains valid evidence and must not be repaired by changing thresholds or holdout truth after outcomes are observed.
