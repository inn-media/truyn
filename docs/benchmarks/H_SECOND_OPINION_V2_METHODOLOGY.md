# H/SECOND-OPINION v2 — Calibrated Trust-Aware Multi-Vendor Methodology

Status: **V2 METHODOLOGY / NOT YET A RESULT**

The original v1 methodology and its measured evidence remain immutable historical records. V2 exists because v1 exposed a design mismatch: the final runner evaluated `TRUST_WEIGHTED` with equal trust weights, making it mathematically equivalent to majority voting while the frozen acceptance required positive trust lift over majority.

## Hypothesis

TRUYN trust-aware adjudication can outperform ordinary majority voting on genuine provider disagreements, while also delivering measurable accuracy lift over precommitted single-model benchmark anchors.

The trust-specific claim is intentionally retained:

> `trust_lift_over_majority > 0` with uncertainty excluding zero.

This is a separate claim from generic ensemble value.

## 1. Frozen single-model benchmark anchors

V2 uses three single-model reference points:

1. **Frozen worst provider** — provider identity selected from immutable pre-v2 evidence.
2. **Mean of all seven providers** — mean correctness of all seven single-model arms on the same v2 holdout items.
3. **Frozen best provider** — provider identity selected from immutable pre-v2 evidence.

Provider identities for the worst and best anchors MUST be selected before v2 validation/holdout and MUST NOT be reselected from v2 holdout outcomes.

The immutable pre-v2 evidence used for this selection is H/SECOND run `36114342475` / artifact `10856455609`. It freezes:

- worst anchor: **Grok**;
- best anchor: **Kimi**;
- the seven-provider reference set: Gemini, GPT, Grok, DeepSeek, Llama, Mistral, Kimi.

The historical source accuracies are selection evidence only. V2 lift is computed against the anchors' **v2 holdout performance**, not against the old percentages.

## 2. Trust calibration

Trust weights MUST come from calibration/development evidence that predates the new v2 holdout.

V2 may reuse the now-revealed v1 final evidence for calibration/development only. It MUST NOT reuse the v1 120-item set as the v2 final holdout.

The initial v2 trust calibration is context-aware:

```text
trust(provider, stratum)
```

with a global provider fallback. The initial calibration uses a Beta(1,1) posterior mean over historical correctness for each provider/stratum cell to avoid assigning literal 0 or 1 certainty from a finite sample.

The calibration artifact is frozen and hashed before any v2 validation or final holdout request.

### Mandatory anti-degeneracy guard

A paid v2 validation or final run MUST NOT start if the trust matrix collapses to equal weights.

At minimum preflight must prove:

- all seven providers have a trust value;
- the calibration source predates the v2 holdout;
- the matrix contains more than one distinct trust weight;
- a synthetic disagreement fixture exists where calibrated trust and ordinary majority can produce different decisions.

This directly prevents recurrence of the v1 defect.

## 3. Hard validation before final freeze

The old HS10 validation was not discriminative: all seven providers scored 100% and no disagreement was observed. V2 therefore requires a new, harder validation partition before the final acceptance is frozen.

Validation MUST include disagreement-rich failure modes across at least:

```text
fact extraction with distractors
multi-step deterministic reasoning
source-priority grounded verification
hallucination bait with explicit insufficient-evidence behavior
adversarial ambiguity with explicit ambiguity behavior
```

Validation may be used to confirm policy viability and freeze final operational/economic envelopes. It MUST NOT expose or tune against the v2 final holdout truth.

### Frozen validation acceptance

The validation gate is frozen before its first measured request. It uses **150 items**: 30 per required stratum and all seven single-provider arms, for exactly **1,050 base provider calls**.

Validation PASS requires all of the following:

- all 150 items and all seven provider arms complete without silent drops;
- no v1 final item is reused;
- at least **20 K5 disagreement items**;
- at least **5 items where TRUST_WEIGHTED_K5 and MAJORITY_K5 produce different final decisions**;
- positive point accuracy lift of TRUST_WEIGHTED_K5 over the frozen worst provider;
- positive point accuracy lift over the mean of all seven single-provider arms;
- positive point accuracy lift over the frozen best provider;
- positive trust lift over majority on the disagreement subset;
- trust corrections of majority errors are strictly greater than trust regressions;
- overall trust-vs-majority accuracy delta is not worse than **−2 percentage points**.

Validation is a qualification gate, not headline final evidence; statistical-significance claims remain reserved for the fresh final holdout.

The latency rule is also frozen before validation:

```text
validation_latency_p95 = p95(sum of the first five frozen provider-call latencies per K5 item)
final_latency_p95_envelope = ceil(validation_latency_p95 * 1.25)
```

After a validation measurement PASS, provider-backed meter reconciliation is still mandatory. Final acceptance MUST NOT freeze until the validation meter reconciliation is complete and the numeric latency envelope above has been recorded.

## 4. Fresh final holdout

The v2 final holdout is a new hidden set with new IDs, seed commitment and gold digest.

Requirements:

- minimum 40 items per required stratum;
- minimum 200 total items;
- all seven single-provider arms on every item;
- no v1 final item may appear in v2 final holdout;
- gold is unavailable to prompts, trust scoring, routing and adjudication;
- provider/model pins, policy, trust calibration, seed commitment and acceptance gates are frozen before the first final request.

## 5. Primary policy

The primary v2 policy is frozen as:

```text
TRUST_WEIGHTED_K5
```

Majority K5 is the direct trust-specific comparator.

Other k values and VERIFY_DISPUTE remain diagnostic unless explicitly promoted before the final freeze.

## 6. Gate A — Ensemble value

For each holdout item, compare TRUST_WEIGHTED_K5 correctness to:

```text
frozen worst provider
mean correctness across all seven single providers
frozen best provider
```

For every comparator:

```text
accuracy_lift = accuracy(TRUST_WEIGHTED_K5) - accuracy(comparator)
```

PASS requires the item-paired 95% confidence interval lower bound to be greater than zero for **all three** comparisons.

The best-anchor comparison is the strongest single-model claim; worst and mean are retained as required benchmark context rather than hidden by a single favorable comparator.

## 7. Gate B — Trust incremental value

Trust is only causally informative on items where candidate providers disagree.

Let `D` be the frozen K5 disagreement subset.

```text
trust_lift_over_majority_D =
  accuracy(TRUST_WEIGHTED_K5 | D)
  - accuracy(MAJORITY_K5 | D)
```

PASS requires:

- at least the predeclared minimum disagreement sample;
- item-paired 95% CI lower bound > 0.

This is the hard proof for the claim that TRUYN trust-aware adjudication is better than ordinary majority voting.

Overall trust lift is still reported, but agreement items are not allowed to dilute the causal test of the trust layer.

## 8. Gate C — Overall safety / non-inferiority

Trust weighting must not buy disagreement wins by materially degrading total accuracy.

```text
overall_delta =
  accuracy(TRUST_WEIGHTED_K5)
  - accuracy(MAJORITY_K5)
```

The v2 non-inferiority margin is 2 percentage points and is frozen before the final holdout.

PASS requires:

```text
95% CI lower bound >= -0.02
```

## 9. Gate D — Economics

Accuracy claims are inseparable from resource cost.

Final PASS requires both:

- provider-backed cost reconciliation inside the frozen budget envelope;
- latency inside the numeric envelope derived from the predeclared validation rule before final holdout.

No invoice-dollar claim is valid from response token usage alone.

The hard ceiling remains:

```text
maximum final provider base calls: 1400
maximum final provider cost: USD 50
```

## 10. Statistics

Use precommitted deterministic item-paired resampling:

- paired bootstrap CI for accuracy deltas;
- McNemar or equivalent paired binary diagnostic;
- cluster-aware resampling where source/question families repeat;
- 95% confidence level;
- fixed bootstrap seed commitment before final measurement.

For the mean-of-seven comparator, the per-item comparator is the fraction of the seven single providers that are correct on that same item, preserving item pairing.

## 11. Evidence and fail-closed behavior

The evidence bundle must include:

- exact public/private SHAs;
- calibration artifact + digest + provenance;
- frozen baseline artifact + source evidence identity;
- frozen validation acceptance + digest;
- validation artifact and terminal status;
- validation provider-meter reconciliation;
- numeric final latency envelope derived from the frozen validation formula;
- fresh holdout dataset/gold commitments;
- raw per-provider answers;
- per-item majority and trust decisions;
- disagreement membership;
- paired Gate A/B/C recomputation;
- provider usage and meter reconciliation;
- latency reconciliation;
- final terminal classification.

A green workflow is not itself a PASS. If Gate D is unreconciled the state remains `MEASUREMENT_COMPLETE_RECONCILIATION_REQUIRED`.

## 12. Interpretation

A v2 PASS supports the bounded statement:

> On the frozen v2 hidden holdout, calibrated TRUYN trust-aware K5 adjudication beat the frozen worst provider, the mean of all seven providers, and the frozen best provider with positive paired 95% lower bounds; on disagreement items it also beat ordinary K5 majority voting with positive paired 95% lower bound, without violating the overall non-inferiority or economic envelopes.

A FAIL remains valid benchmark evidence and MUST NOT be repaired by changing thresholds after holdout outcomes are observed.
