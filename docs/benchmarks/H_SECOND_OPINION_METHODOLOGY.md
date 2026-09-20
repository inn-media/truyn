# H/SECOND-OPINION — Trust-Aware Multi-Vendor Accuracy Methodology

Status: **METHODOLOGY / NOT YET A RESULT**

## Hypothesis

Routing the same claim/task to multiple heterogeneous providers and resolving disagreement with a trust-aware policy can produce higher accuracy than the best single-vendor baseline, while retaining measurable cost efficiency.

Primary causal statement:

> On a hidden gold-labeled holdout set, a frozen TRUYN ensemble policy achieves positive accuracy lift over the strongest frozen single-vendor baseline, and the improvement is not explained solely by naive majority voting.

## 1. Gold dataset design

The benchmark requires known truth. The final set is held private until the immutable campaign is complete or a deliberate safe disclosure is approved.

Stratify the set across at least:

```text
fact extraction / structured truth
multi-step reasoning with deterministic answer
source-grounded verification
hallucination-bait / misleading premise
adversarial ambiguity where correct behavior may be abstain/dispute
```

Use separate partitions:

- `calibration` — may be used to fit/freeze trust policy parameters;
- `validation` — used to select/freeze policy variants and the comparison baseline procedure;
- `holdout_test` — untouched until the final measured campaign.

Gold labels MUST NOT be available to routing, model prompts, trust scoring or adjudication during the holdout run.

## 2. Arms

Run every applicable holdout item through:

### Single-vendor baselines

```text
Gemini
GPT
Grok
DeepSeek
Llama
Mistral
Kimi
```

### Ensemble policies

At minimum:

```text
MAJORITY_K2_OR_K3          # where voting semantics are meaningful
TRUST_WEIGHTED_K2_OR_K3
VERIFY_DISPUTE_K2_OR_K3
```

Optional later extension:

```text
K5 variants
```

The exact provider subset for each policy is frozen before holdout inference. Dynamic policy may choose among eligible providers only according to a predeclared rule that has no access to holdout truth.

## 3. Best-single baseline without selection leakage

Do not choose the “best single vendor” after seeing final holdout labels and then treat that selection as independent.

Preferred procedure:

1. use validation results to freeze the primary single-vendor comparator;
2. on holdout, report that comparator and all seven single-vendor outcomes;
3. additionally report `max observed single accuracy` descriptively;
4. if the headline claim is against the maximum of seven, use a predeclared bootstrap/multiple-comparison procedure that accounts for selection of the maximum.

## 4. Procedure

1. Freeze public/private SHAs, provider/model pins, dataset digests and policy versions.
2. Freeze the trust calibration artifact using calibration data only.
3. Freeze ensemble membership/selection rule, escalation rule and completion budgets.
4. Commit the holdout dataset/gold digest and seed before first holdout inference.
5. Run all single-vendor arms on every valid holdout item.
6. Run majority, trust-weighted and verify→dispute policies on the same items.
7. Log every provider answer before adjudication.
8. Log disagreement classification and exact adjudication path.
9. Score outputs against gold using the strongest deterministic rubric available.
10. Compute accuracy, disagreement-subset performance, error correlation/diversity, cost and accuracy-per-dollar.
11. Recompute summary from raw per-item evidence independently.

## 5. Primary metrics

### Accuracy lift

```text
lift = accuracy(ensemble) - accuracy(primary_single_baseline)
```

A “more accurate” claim requires the frozen 95% CI lower bound to be greater than zero.

If claiming superiority over the observed best of all seven singles, use the predeclared max-selection statistical procedure.

### Disagreement accuracy

Let `D` be items where candidate providers do not all produce the same normalized answer/decision.

```text
disagreement_accuracy = correct_ensemble_on_D / |D|
```

This is a primary explanatory metric because agreement cases provide little evidence for the value of adjudication.

### Accuracy per dollar

```text
accuracy_per_dollar = correct_items / gross_provider_cost_usd
```

Also report fully-loaded TRUYN cost so ensemble accuracy is not presented without its price.

### Trust value beyond majority

```text
trust_lift_over_majority = accuracy(TRUST_WEIGHTED) - accuracy(MAJORITY)
```

The intended trust-value proof requires positive predeclared lift with uncertainty excluding zero. If it does not, the correct finding is that the tested trust layer did not outperform naive voting.

## 6. Error diversity / ensemble headroom

Measure whether vendors make different mistakes.

Required outputs:

- pairwise error correlation;
- pairwise error-overlap/Jaccard;
- independent-error rate;
- all-wrong rate;
- exactly-one-correct / exactly-two-correct distributions where applicable;
- oracle ensemble ceiling: fraction of items where at least one candidate is correct.

A high correlated-error rate is a legitimate negative or limiting finding, not a reason to discard items.

## 7. Verify→dispute policy telemetry

For every escalated item record:

```text
initial_provider_set
initial_answers_normalized
agreement_state
trust_scores_used
escalation_trigger
verifier_provider
verifier_answer
final_resolution
correct_against_gold
incremental_cost
incremental_latency
```

The benchmark must be able to answer: “which disagreements were corrected by the trust/verification primitive, and at what marginal cost?”

## 8. Quality and abstention semantics

Some items intentionally permit/require `abstain`, `insufficient_evidence`, or `dispute` rather than a forced factual answer. The expected output contract is frozen per item class before measurement.

A policy is not rewarded for confident guessing when the gold contract requires abstention.

## 9. Cost multiplier

Report:

```text
ensemble_cost_multiplier = fully_loaded_cost(ensemble) / fully_loaded_cost(primary_single_baseline)
```

and separately gross provider multiplier.

The headline result always pairs accuracy lift with cost multiplier and latency delta.

## 10. Statistical plan

Use item-paired confidence intervals and a paired test appropriate to the outcome:

- paired bootstrap CI for accuracy delta and cost/accuracy-per-dollar;
- McNemar or equivalent paired binary test as a diagnostic for correctness deltas;
- bootstrap of the max-single statistic if the claim uses the observed best of seven;
- cluster-aware resampling if several items share one source/document/question family.

The method and seed are frozen before holdout measurement.

## 11. Confounders / invalidation conditions

The final result is invalid or must be explicitly qualified if:

- holdout gold leaks to prompts/routing/trust calibration;
- models/providers differ across arms without the difference being part of the frozen policy;
- one arm receives richer source context than another;
- trust policy is changed after holdout answers are observed;
- failed provider calls are silently dropped from one arm;
- evaluator is changed post-hoc to favor a policy;
- foreign benchmark load materially changes one arm but not its pair.

## 12. What a PASS can prove

A final PASS supports a bounded statement of the form:

> On the frozen hidden gold set, the specified TRUYN multi-vendor policy improved accuracy by X percentage points over the frozen single-vendor baseline at Y× cost, with Z accuracy-per-dollar; on disagreement items it resolved Q% correctly, and the trust-aware policy added R points over naive voting.

It does not prove universal superiority over every future model, domain or dataset.
