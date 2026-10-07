# H/SECOND-OPINION Attempt 1 — Final benchmark result

Status: **PASS / CLOSED**  
Date: **2026-10-07**

This is the sanitized public result report for H-Series SECOND-OPINION v2 Attempt 1. It publishes bounded benchmark outcomes and immutable evidence identities while withholding hidden holdout contents, private seeds, raw prompts, operational cloud identifiers and private execution details.

## Immutable evidence identity

- workflow run: `37672469441`
- measured source SHA: `8f6e48fd253e3933d2da7a35be769f3661911119`
- artifact ID: `11506652560`
- artifact name: `h-second-opinion-attempt-1-37672469441`
- artifact digest: `sha256:526ee9e5f0d20253492cd3573c9c4151b2b408e08f70eb2ac1b2b9d5154c141a`
- final items: **200 / 200**
- providers per item: **7**
- logical provider calls: **1,400 / 1,400**
- physical HTTP attempts: **1,402**

The direct Attempt 1 launch omitted the usual pre-launch qualification/preflight/collision gates by explicit operator instruction. The frozen scientific thresholds, provider set and Gate A/B/C/D definitions were not weakened after measurement. No partial predecessor dataset is combined into this result.

## Provider benchmark

| Provider | Accuracy |
| --- | ---: |
| Gemini | **87.5%** |
| Mistral | **81.0%** |
| GPT | **80.0%** |
| Grok | **80.0%** |
| Llama | **80.0%** |
| DeepSeek | **79.5%** |
| Kimi | **64.0%** |
| Mean of all seven | **78.857%** |

These are single-provider correctness rates on the same hidden 200-item holdout. Provider identities used as frozen benchmark anchors were selected before this holdout; the anchor names do not imply they must remain the numerically best/worst provider on the new holdout.

## Ensemble benchmark

| Policy | k | Accuracy |
| --- | ---: | ---: |
| MAJORITY | 2 | 80.0% |
| TRUST_WEIGHTED | 2 | 83.0% |
| VERIFY_DISPUTE | 2 | 81.5% |
| MAJORITY | 3 | 81.0% |
| TRUST_WEIGHTED | 3 | 83.0% |
| VERIFY_DISPUTE | 3 | 84.5% |
| MAJORITY | 5 | **82.0%** |
| TRUST_WEIGHTED | 5 | **87.0%** |
| VERIFY_DISPUTE | 5 | 81.5% |

The frozen primary policy was **TRUST_WEIGHTED K5**. It achieved **87.0% accuracy**, versus **82.0%** for ordinary K5 majority voting.

## Gate A — ensemble value: PASS

TRUST_WEIGHTED K5 was compared item-by-item with the frozen single-provider anchors and the seven-provider mean.

- versus frozen-worst anchor performance on this holdout: **+7.0 percentage points**, paired 95% CI **[+3.5, +10.5] pp**
- versus mean of all seven providers: **+8.143 pp**, paired 95% CI **[+5.429, +11.286] pp**
- versus frozen-best anchor performance on this holdout: **+23.0 pp**, paired 95% CI **[+17.0, +29.5] pp**

All three lower confidence bounds are above zero.

## Gate B — trust incremental value: PASS

There were **75 disagreement items** out of 200.

On this subset:

- TRUST_WEIGHTED K5 accuracy: **65.333%**
- MAJORITY K5 accuracy: **52.0%**
- trust lift over majority: **+13.333 pp**
- paired 95% CI: **[+6.667, +21.333] pp**

This is the primary evidence that calibrated trust contributes value specifically when the candidate intelligence sources disagree.

## Gate C — overall safety / non-inferiority: PASS

Across all 200 items:

- TRUST_WEIGHTED K5: **87.0%**
- MAJORITY K5: **82.0%**
- delta: **+5.0 pp**
- paired 95% CI: **[+2.0, +8.0] pp**
- frozen non-inferiority floor: **-2.0 pp**

The trust-aware policy was not merely non-inferior; the observed paired interval was entirely positive.

## Gate D — economics and latency: PASS

Provider-returned request-scoped usage reconciled all **1,400 / 1,400** successful answer rows.

Using the same conservative provider-backed upper-bound pricing method frozen during validation:

- conservative total provider-cost upper bound: **$0.368344732**
- frozen maximum: **$50.00**
- remaining margin to cap: **$49.631655268**

Latency uses the predeclared K5 metric: sum of the five selected provider-call latencies for each item, with the same percentile method used to derive the validation envelope.

- Attempt 1 K5 p95: **11,528.2 ms**
- frozen final K5 p95 envelope: **29,019 ms**
- margin: **17,490.8 ms**

Both economic conditions pass.

## Error diversity

The run also confirms that adding more providers is not equivalent to adding independent intelligence.

Several provider pairs had highly overlapping error sets; for example GPT/Grok and GPT/Llama had error Jaccard **1.0** on this holdout. By contrast, Kimi had lower standalone accuracy but substantially lower error overlap with several other providers. This supports using calibrated diversity/trust signals rather than treating every model vote as interchangeable.

This observation is descriptive evidence from this holdout and is not a universal ranking of providers.

## Interpretation

The bounded result supports this statement:

> On the frozen 200-item H/SECOND-OPINION v2 holdout, calibrated TRUYN TRUST_WEIGHTED K5 adjudication outperformed ordinary K5 majority voting and the required frozen single-provider benchmark comparators with positive paired confidence bounds, while remaining inside the frozen provider-cost and latency envelopes.

What this means architecturally is that TRUYN can extract measurable value from **how independent intelligence sources disagree**, rather than only selecting one model or counting votes equally.

This report does **not** claim that 87% is a universal accuracy rate, that one listed provider is globally better than another, or that every multi-model workload benefits by the same amount.

## Final classification

- Gate A: **PASS**
- Gate B: **PASS**
- Gate C: **PASS**
- Gate D: **PASS**
- H/SECOND-OPINION: **PASS / CLOSED**
- ordinary rerun required: **no**
