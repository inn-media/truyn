# H/SECOND-OPINION v2 — Validation Qualification Result

Date: **2026-09-25**  
Status: **VALIDATION PASS / FINAL HIDDEN HOLDOUT NOT YET MEASURED**

This document records the completed validation qualification for the methodology frozen in `docs/benchmarks/H_SECOND_OPINION_V2_METHODOLOGY.md` at public methodology commit `fe373172849f4b1411a0a4ca8b748cbdefbbd93e`.

The methodology file itself is intentionally not rewritten after measurement. This result record is additive and must not be interpreted as the final hidden-holdout benchmark result.

## What was tested

The validation measured calibrated, context-aware TRUYN trust adjudication across seven provider arms on a fresh disagreement-rich validation partition.

- validation items: **150**;
- strata: **5**;
- provider arms per item: **7**;
- logical base provider calls: **1,050**;
- provider HTTP attempts: **1,067**;
- K5 disagreement items: **61**;
- TRUST_WEIGHTED vs MAJORITY decision differences: **19**.

The frozen single-provider identities remained selected from pre-v2 evidence: **Grok** as the frozen worst-anchor identity and **Kimi** as the frozen best-anchor identity. They were not reselected after seeing v2 validation outcomes.

## Validation result

All frozen scientific validation gates passed.

| Gate | Frozen purpose | Validation result |
| --- | --- | --- |
| Gate A | Ensemble value vs frozen worst identity, mean of all seven, and frozen best identity | **PASS** |
| Gate B | Incremental calibrated-trust value over ordinary K5 majority on disagreement subset D | **PASS** |
| Gate C | Overall trust-vs-majority non-inferiority | **PASS** |
| Gate D | Provider-meter reconciliation + cost + latency envelope | **PASS** |

Observed point metrics:

- lift vs frozen worst-anchor identity on this validation: **+6.000 pp**;
- lift vs mean of all seven provider arms: **+8.095 pp**;
- lift vs frozen best-anchor identity on this validation: **+24.000 pp**;
- trust lift over ordinary majority on disagreement subset D: **+11.475 pp**;
- overall TRUST_WEIGHTED minus MAJORITY accuracy delta: **+4.667 pp**;
- majority-error corrections by trust: **7**;
- trust regressions relative to majority: **0**.

The anchor labels refer to identities frozen from pre-v2 evidence, not to a re-ranking of providers on the validation set. This is why the numerical lift ordering need not match the historical best/worst ordering.

## Latency and economics qualification

The frozen latency rule was:

```text
final_latency_p95_envelope = ceil(validation_K5_p95 * 1.25)
```

Measured validation K5 p95 was **23,215 ms**, producing a frozen final K5 p95 envelope of **29,019 ms**.

All **1,050 / 1,050** answer rows carried provider-returned request-scoped usage and reconciled to immutable validation evidence. Resource-level cloud metrics were treated only as corroboration because shared deployments can include unrelated traffic.

A conservative provider-backed validation cost upper bound was **USD 0.275633164**, below the predeclared **USD 50** ceiling. The estimate deliberately applies conservative per-model/family maximum rates to all run-scoped tokens; it is an upper bound rather than an invoice-dollar claim.

## Immutable validation identity

- private measured workflow run: `36132787723`;
- exact private validation candidate SHA: `9e98549441f82be402e8c7e935a1decd318be35f`;
- validation artifact ID: `10865630654`;
- validation artifact ZIP SHA-256: `sha256:5da98fed52a24f4b802aaccdc79d869eedf730c9a1dffd886060ecbbe27b8ab0`;
- manifest SHA-256: `sha256:17916ade38844a8a55e1b82e34165616fb4676b430c0eb3a58dc53fe5ec1feb9`;
- summary SHA-256: `sha256:b6020465e0c9b571051fb4e6e56e643e25fff0bfe969a229ac4852a7304b3efb`;
- results SHA-256: `sha256:8d892a4f24a7138a1a6d31062f8bcc913f540a7ea85aefb8726fc535c0847544`;
- telemetry SHA-256: `sha256:092052cf8184472ea463f1c017e4aacbe4009f27368a75b035051b39bd57257d`.

Independent zero-inference audit:

- audit run: `36138616302`;
- audit artifact ID: `10865815530`;
- audit artifact ZIP SHA-256: `sha256:d8ebf98511f5d9c0e37c0dcfabe33d077957220040be01e85fc1d3565663fb20`;
- paid provider calls by audit: **0**.

## Claim boundary

This validation supports the statement that the frozen v2 policy was sufficiently non-degenerate and effective to proceed to the precommitted hidden final holdout under the already-frozen acceptance.

It is **not** the final headline benchmark. Statistical final claims remain reserved for the hidden final partition.

The next frozen measurement is:

- **200** fresh hidden-final items;
- **7** provider arms per item;
- exactly **1,400** base provider calls;
- unchanged calibrated trust policy and thresholds;
- frozen final K5 p95 envelope: **29,019 ms**;
- frozen maximum provider cost: **USD 50**;
- no v1 item reuse;
- no validation item-ID reuse.

A final FAIL remains valid evidence. The acceptance criteria, trust calibration, provider identities, seed commitment and thresholds must not be changed after hidden-final outcomes are observed.
