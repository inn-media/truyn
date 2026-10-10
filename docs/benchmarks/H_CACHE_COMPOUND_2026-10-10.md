# H/CACHE-COMPOUND — Final benchmark result

Status: **PASS / CLOSED**  
Closed: **2026-10-10**  
Series: **H**  
Benchmark: **H-CACHE-COMPOUND**

This is the sanitized public result for the frozen cross-node reuse compounding methodology in [`H_CACHE_COMPOUND_METHODOLOGY.md`](H_CACHE_COMPOUND_METHODOLOGY.md). The frozen methodology remains unchanged; this append-only report records the measured campaign, the preserved negative confirmatory result, and the later independently frozen high-power replication that closed the remaining pre-declared Zipf 1.4 network-effect gate.

Private seeds, raw prompts, cloud tokens, private resource/deployment identifiers and private operational traces are not published.

## Accepted bounded claim

Under the frozen corpus, overlap distributions, provider/model profile and logical node-count conditions, TRUYN shared reuse:

- reduced steady-state provider-gross cost/request by **93.587%** versus the reuse-disabled control in the primary full-factorial run, with 95% CI **[92.105%, 94.788%]**;
- produced **99.169% cross-node reuse share**, with 95% CI **[98.921%, 99.392%]**;
- showed a negative compounding cost slope with 95% CI entirely below zero;
- showed positive network-size effects for Zipf 0.8 and 1.1 in the primary run;
- and, after a separately frozen high-power independent replication, closed the previously inconclusive Zipf 1.4 network-size gate with a positive effect of **+2.054 percentage points**, 95% CI **[+0.430, +5.798] pp**.

The node counts in this benchmark are **logical benchmark nodes**. This result does not claim that 50/100/200 independent physical hosts were provisioned.

## Frozen public methodology

- public methodology SHA: `3979bfaa1e0371ec2377fe5a0d3a38dc8eb2d8a7`
- primary factors:
  - logical node count: 50 / 100 / 200;
  - Zipf overlap: 0.8 / 1.1 / 1.4;
  - cache strata: cold / warm / steady;
  - arms: `TRUYN_REUSE` / `REUSE_DISABLED_CONTROL`;
- confidence: 95%;
- bootstrap: deterministic cluster-aware, 5,000 replicates;
- frozen network-effect pass rule: **95% CI lower bound > 0**;
- safety acceptance: zero wrong accepted reuse, zero provenance-invalid accepted reuse, zero unauthorized cross-tenant reuse and zero material interference.

No threshold was weakened after measurement.

## Primary full-factorial run — Attempt 7

Immutable evidence:

- workflow run: `37903237195`
- exact measured SHA: `0b1bae93b624fd8d40650025abf464a188e3b00f`
- artifact ID: `11614325815`
- artifact digest: `sha256:5d16ebac085a712f2bef984a3f23ee6cca4b9f0ade134339bb8326851d49b408`
- planned logical rows: **37,800**
- provider calls: **21,664**
- run-scoped provider tokens: **606,592**
- provider-usage × frozen-price estimate: **$0.35268992**

### Primary metrics

| Metric | Estimate | 95% CI | Gate |
| --- | ---: | ---: | --- |
| steady-state reuse cost reduction | **93.587%** | **[92.105%, 94.788%]** | PASS |
| cross-node reuse share | **99.169%** | **[98.921%, 99.392%]** | PASS |
| compounding slope | **-6.3923e-7** | **[-1.2832e-6, -1.0586e-7]** | PASS |
| network effect, Zipf 0.8, 200 vs 50 | **+18.500 pp** | **[+12.921, +24.923] pp** | PASS |
| network effect, Zipf 1.1, 200 vs 50 | **+12.250 pp** | **[+5.198, +22.290] pp** | PASS |
| network effect, Zipf 1.4, 200 vs 50 | **+6.583 pp** | **[-0.442, +19.986] pp** | INCONCLUSIVE / FAIL under frozen rule |

Attempt 7 therefore remains historically **scientificPass=false**. It passed seven frozen acceptance/safety gates but did not close the Zipf 1.4 network-effect confidence gate. That negative/inconclusive result is retained and was not rewritten.

## First targeted Zipf 1.4 confirmatory run — preserved negative evidence

A separately frozen one-shot successor tested only the already pre-defined failed stratum. It did not pool selectively with Attempt 7 and did not change the threshold.

- workflow run: `37952123783`
- exact measured SHA: `7abec058b50d2622ef465ec4899eef38ceda1933`
- artifact ID: `11631363129`
- artifact digest: `sha256:4d695720bc802b306ae5f8538efb3cdb38f3c239ee4332511bdda03eacd6fcd8`
- logical rows: **12,600**
- provider calls: **6,742**
- provider tokens: **188,776**
- provider-usage × frozen-price estimate: **$0.10975976**
- Zipf 1.4 network effect: **+4.226 pp**
- 95% CI: **[-1.360, +13.483] pp**
- frozen gate: **FAIL / INCONCLUSIVE**
- safety: **PASS**

This result remains immutable negative evidence.

## High-power independent Zipf 1.4 replication — closing evidence

The final replication was prospectively frozen with a fresh hidden seed and a larger sample size. Historical results were not pooled into its statistic.

- workflow run: `37988342234`
- exact measured SHA: `c5fcee3bd0b449b38c653be94b8b86395adfed98`
- artifact ID: `11653630872`
- artifact digest: `sha256:ab4fb1ea42f1d9ef23944ac3492406dda996362f59a1c0db9636a0362c119915`
- logical rows: **50,400**
- samples/cell: **1,680 at N=50 / 6,720 at N=200**
- provider calls: **25,951**
- run-scoped provider tokens: **726,628**
- provider-usage × frozen-price estimate: **$0.42248228**
- prospective MDE: **4 pp**
- prospective approximate power: **99.91%**
- Zipf 1.4 network effect: **+2.0536 pp**
- 95% CI: **[+0.4301, +5.7979] pp**
- frozen rule `CI95 lower > 0`: **PASS**
- all safety counters: **0**
- qualification: **PASS**
- measured job: **PASS**

This independent replication closes the single remaining pre-declared network-effect stratum without altering Attempt 7 or the first confirmatory result.

## Provider meter and dollar-claim boundary

Canonical run-scoped metering uses provider-returned request-scoped token usage. This is attributable to the exact inference requests and reconciles provider ledger, telemetry and summary.

For Attempt 7:

- 21,664 / 21,664 successful provider calls had usage;
- canonical run-scoped total: **606,592 tokens**;
- frozen-price estimate: **$0.35268992**.

A separate read-only Azure corroboration audit completed successfully:

- Azure audit run: `37952259071`
- audit artifact: `11625669653`
- artifact digest: `sha256:04e377ecbba17bc55d86d204018964dfba9dfc9b71af144de17161da9ca38aaa`
- Azure Monitor exact-window `TotalTokens`: **638,941**
- exact-window prompt-token aggregate: **573,326**
- exact-window generated-token aggregate: **65,665**

The Azure resource-window total is about 5.3% above the exact run-scoped meter, consistent with a shared deployment containing other traffic. Azure Cost Management is resource/day aggregated and did not provide exact per-run invoice attribution. Therefore public dollar values in this report are **provider usage multiplied by the frozen public price profile**, not an exact invoice-line claim.

## Safety and integrity

Across the accepted evidence chain:

- wrong reused result accepted: **0**
- provenance-invalid reuse accepted: **0**
- unauthorized cross-tenant reuse: **0**
- material interference: **0**
- authorization violations: **0**
- cross-series mutation/cleanup: **0**
- post-freeze acceptance mutation: **0**

The closing replication also passed repository implementation tests and private platform guardrails on its exact launch SHA.

## Interpretation

The evidence supports a bounded network-reuse statement:

> For the frozen H/CACHE-COMPOUND workload, shared TRUYN reuse materially reduced provider-gross cost per request, almost all measured reusable hits were cross-node, cost continued to compound downward with reuse, and the 200-vs-50 logical-node reuse advantage was positive across all three frozen Zipf overlap strata after independent high-power confirmation of Zipf 1.4.

It does **not** prove the same percentage for arbitrary internet traffic, arbitrary corpora, unrelated model/provider mixes, physical-host scale, or workloads outside the tested overlap distributions.

## Final classification

- primary full-factorial Attempt 7: **MEASUREMENT COMPLETE / STRONG POSITIVE / NOT CLOSED**
- first targeted confirmatory: **NEGATIVE / INCONCLUSIVE / PRESERVED**
- high-power independent replication: **PASS**
- provider meter reconciliation: **PASS**
- safety: **PASS**
- H/CACHE-COMPOUND: **PASS / CLOSED**
- ordinary rerun required: **no**

A future run requires a material versioned change to methodology, workload, provider/model profile, statistical acceptance or claim scope and must use a new immutable campaign identity.
