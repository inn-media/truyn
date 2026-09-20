# H-Series Hidden-Value Benchmarks — Benchmark Contract

Status: **FOUNDATION / NOT YET A RESULT**  
Owner: **OPEN methodology + sanitized public evidence**  
Private execution owner: `inn-media/truyn-platform`

The H-series is the benchmark program for finding and proving value that is not guaranteed by the protocol contract itself but may emerge from a real multi-provider TRUYN network.

The initial H-series contains four tests:

1. **H/CACHE-COMPOUND** — whether cross-node reuse makes marginal cost/request fall as overlapping demand and network size grow;
2. **H/SECOND-OPINION** — whether trust-aware multi-vendor verification is more accurate than the best single-vendor baseline on a gold-labeled test set;
3. **H/ARBITRAGE** — whether cost-aware routing captures available price arbitrage while preserving the frozen quality/trust floor;
4. **H/CHAOS-FUZZ** — whether seeded adversarial campaigns fail closed, preserve safety invariants, recover cleanly and reveal previously unknown failure modes.

No claim in this document is a benchmark result. A measured H-series claim exists only after an immutable run satisfies the frozen methodology, acceptance manifest, evidence rules and cross-series isolation contract.

## 1. Repository boundary

The two-repository split is part of the benchmark design.

### Public: `inn-media/truyn`

Public artifacts MAY contain:

- benchmark hypotheses and causal controls;
- normalized telemetry schemas and metric formulas;
- synthetic/public workload generators;
- public provider/model identities and public price snapshots where safe;
- sanitized run/acceptance manifests;
- sanitized per-sample measurements;
- tested public commit SHA/release;
- workflow/run identifiers and artifact digests;
- statistical method and confidence intervals;
- failures, limitations, corrections and final reports.

### Private: `inn-media/truyn-platform`

Private artifacts MUST own operational or intentionally hidden material, including where applicable:

- real cloud resource/deployment names, private identities, allowlists and backchannels;
- billing-account data, credits, negotiated/internal prices and exact quota/capacity ceilings;
- unreleased gold labels, holdout items and benchmark item contents when disclosure would permit gaming;
- pre-run seeds, mutation schedules and campaign ordering until disclosure is safe;
- private trust-calibration data and proprietary managed ranking signals;
- raw fuzz traces or exploit details that would create a security risk if published before repair;
- exact live resource/fault-domain identifiers and lease backend;
- exact run budgets, kill switches, cleanup commands and active-run registry;
- raw operational logs before deterministic sanitization.

The public repository MUST NOT import or depend on private source. The private runner consumes only immutable released/versioned public contracts or explicitly pinned public artifacts.

## 2. Cross-series isolation

H-series may run in parallel with D, S, T and future test families, but only under [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md).

Every H run MUST carry:

```text
series_id=H
benchmark_id
run_id
run_namespace=H/<benchmark>/<run-id>
```

H execution MUST NOT warm, evict, throttle, fault, mutate, spend into, clean up, cancel or otherwise contaminate a foreign series. In particular:

- H cache state is H-owned benchmark state;
- H price/routing experiments cannot change a deployment capacity used by an active foreign benchmark without an exclusive R2 lease;
- H/CHAOS-FUZZ cannot inject faults into a fault domain containing an active D/S/T measured run;
- provider/shared-service interference that can affect a headline metric must be measured and either bounded by the frozen methodology or the run is `INVALIDATED_INTERFERENCE`;
- waiting for a genuine exclusive resource is `WAITING_SHARED_RESOURCE`, not permission to weaken acceptance or cancel the lease owner.

## 3. Common H-series invariants

Every measured H run MUST freeze before the first measured request:

- public TRUYN SHA/release and private runner SHA;
- benchmark and telemetry schema versions;
- provider/model/version pool;
- task/corpus/workload digests;
- exact arms and policies;
- cache/warmup state policy;
- concurrency/offered-load profile;
- retry/timeout/deadline policy;
- randomization seed commitment and ordering policy;
- quality/trust eligibility rules where applicable;
- price snapshot/timeline identity where applicable;
- fault-class/mutation-profile digest where applicable;
- acceptance thresholds;
- statistics/confidence procedure;
- maximum measured-request count and private spend envelope;
- cross-series shared-resource classification.

Thresholds are immutable after the first measured request. A failure is evidence; it is never repaired by lowering the gate and relabeling the same run as PASS.

## 4. Paired-control rule

Every H benchmark has a causal control.

- **CACHE-COMPOUND:** identical workload with reuse disabled or isolated so the same cross-node reusable state cannot be consumed;
- **SECOND-OPINION:** all seven single-vendor arms plus frozen ensemble policies;
- **ARBITRAGE:** static routing and an ex-post oracle against the same workload and price timeline;
- **CHAOS-FUZZ:** no-fault control plus seeded fault campaign, with property-based invariants active in both.

Compared arms use the same task semantics. Warm/cold strata, workload order and provider parameters are never silently mixed.

## 5. Provider pool

The initial text/reasoning candidate pool is the already integrated heterogeneous provider set:

```text
Gemini
GPT
Grok
DeepSeek
Llama
Mistral
Kimi
```

The methodology does not hard-code a current model version into the protocol. Every measured run freezes exact public model/version identities and private deployment references before inference.

A provider that is unavailable at freeze time is recorded as unavailable; the runner does not silently substitute a different family mid-run.

## 6. Cost accounting

H-series uses the same evidence discipline as T-series.

At minimum keep separate:

```text
gross_provider_cost_usd
truyn_variable_cost_usd
fully_loaded_cost_usd
net_cash_cost_usd   # private unless explicitly safe
```

Provider billing/meter evidence is preferred. Provider-reported billed usage multiplied by a pinned public price snapshot is acceptable when direct dollar meters are unavailable. Local token estimates are diagnostic only and are not sufficient by themselves for a final public dollar claim.

All TRUYN overhead required by the tested policy — routing, retrieval, trust scoring, verification, storage, ensemble calls and reranking — stays inside the TRUYN arm.

## 7. Statistical contract

H-series is not judged by one attractive average.

Unless a methodology specifies a stronger test, final reports use:

- paired estimates wherever the same item is evaluated across arms;
- 95% confidence intervals from an explicitly frozen method;
- effect size plus uncertainty, not p-value alone;
- exact sample counts including failed/controlled-fail samples;
- stratification for cold/warm cache and relevant workload classes;
- no post-hoc removal of inconvenient items except a predeclared invalid-sample rule.

A positive-effect claim such as “more accurate”, “cheaper” or “network compounding exists” requires the predeclared confidence interval for the primary effect to exclude zero in the claimed direction.

## 8. Hidden-benchmark integrity

Some H material is intentionally hidden before the final run so providers, routing policies or operators cannot overfit to the answer key.

Before the first measured request, the private runner creates a canonical manifest containing dataset/workload digests, seed commitment, policy/config digests and acceptance thresholds. Its SHA-256 commitment is retained as immutable evidence.

A later public report MAY reveal safe seeds/items, but MUST at least publish the commitment/digests required to prove the measured campaign was not replaced after results were observed.

Hidden does not mean unverifiable: reproducibility comes from immutable commitments, exact SHAs, deterministic generators, retained raw evidence and later safe disclosure/export.

## 9. Safety precedence

H value discovery never overrides existing safety/authorization/provenance gates.

Particularly for H/CHAOS-FUZZ:

```text
unauthorized execution accepted = 0
invalid/revoked identity accepted = 0
known-invalid provenance accepted = 0
ambiguous authority silently accepted = 0
wrong result marked verified/valid = 0
```

Any such event is a critical safety failure even if throughput, recovery or cost metrics look attractive.

## 10. Evidence bundle

An accepted H-series run produces an immutable evidence bundle containing, when safe:

```text
manifest.json
acceptance.json
provider-snapshot.json
workload-manifest.json
seed-commitment.json
telemetry.jsonl
interference.jsonl
summary.json
checksums.sha256
REPORT.md
```

Benchmark-specific bundles add:

```text
CACHE: reuse-ledger.jsonl
SECOND-OPINION: gold-evaluation.jsonl + disagreement-ledger.jsonl
ARBITRAGE: price-timeline.json + routing-decisions.jsonl + oracle.jsonl
CHAOS-FUZZ: fault-events.jsonl + invariant-events.jsonl + minimized-repros/
```

Sensitive operational bytes remain private and are represented publicly by safe digests/identifiers where appropriate. Negative runs are preserved under the repository `redact-not-delete` evidence policy.

## 11. Program gates

The H-series foundation is complete only when:

- all four public methodologies exist;
- a common H telemetry schema exists;
- cross-series isolation is enforced for H/D/S/T concurrency;
- the private execution/runbook boundary exists in `truyn-platform`;
- dataset/seed/config precommitment is supported;
- cost/price evidence can be frozen and attributed;
- cache/reuse origin can distinguish same-node from cross-node hits;
- ensemble evaluation can distinguish majority from trust-weighted/verify-dispute policies;
- arbitrage can compare static, TRUYN and oracle on the same timeline;
- fuzz campaigns are seeded, minimizable and property-based;
- private raw evidence can be transformed into safe public evidence without manual reconstruction.

Foundation completion is **not** a benchmark PASS.

## 12. Canonical H methodology documents

- [`H_CACHE_COMPOUND_METHODOLOGY.md`](H_CACHE_COMPOUND_METHODOLOGY.md)
- [`H_SECOND_OPINION_METHODOLOGY.md`](H_SECOND_OPINION_METHODOLOGY.md)
- [`H_ARBITRAGE_METHODOLOGY.md`](H_ARBITRAGE_METHODOLOGY.md)
- [`H_CHAOS_FUZZ_METHODOLOGY.md`](H_CHAOS_FUZZ_METHODOLOGY.md)
- [`H_SERIES_TELEMETRY.md`](H_SERIES_TELEMETRY.md)
- [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md)
