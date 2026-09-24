# H/ARBITRAGE — Final benchmark evidence

Status: **PASS / CLOSED**  
Measured: **2026-09-24**  
Series: **H**  
Benchmark: **H-ARBITRAGE**

This is the sanitized public evidence record for the first H-Series final lane to close. It complements the frozen methodology in [`H_ARBITRAGE_METHODOLOGY.md`](H_ARBITRAGE_METHODOLOGY.md). The methodology artifact remains immutable because it is pinned by the private execution contract; this report records the later measured result without rewriting that frozen contract.

## Scope

The benchmark tested whether TRUYN cost-aware routing could capture scripted price arbitrage relative to a frozen STATIC route while preserving the frozen quality/trust floor.

The measured comparison used the same frozen workload and scripted price timeline for:

- `STATIC` — frozen provider assignment;
- `TRUYN_COST_AWARE` — routing using only information available at decision time;
- `ORACLE` — ex-post theoretical cheapest eligible choice, used only for reconciliation and never exposed to the live router.

The benchmark did **not** mutate real provider prices and did **not** allow future ORACLE information into live routing.

## Frozen public contract

- frozen public methodology commit: `3979bfaa1e0371ec2377fe5a0d3a38dc8eb2d8a7`
- methodology document: `docs/benchmarks/H_ARBITRAGE_METHODOLOGY.md`
- methodology blob identity retained by the private public-contract pin
- predecessor acceptance digest: `sha256:67e086172ef49c8c569e41737b24cfe83b298dde7672ea7ca4b05577c2fc708e`
- successor freeze digest: `sha256:2c28d948263356c33c7507229e32c9675c51e8cbc86f86793f30953711c34a46`
- seed commitment: `sha256:1ec6ca6d3044c365dbd800e6903a28a75537fbfa4bfdb13e06dcff2389ee6acc`

The successor freeze preserved the original hypothesis, statistical gates, safety rules and seed. It corrected only a predecessor sample-plan/budget contradiction so that the frozen three-cell plan could execute exactly 360 paired tasks / 720 measured provider calls.

## Workload and evidence scale

- 3 required scenarios;
- 120 tasks per scenario;
- 360 paired task requests;
- 720 real measured provider calls;
- 1,080 routing-decision rows;
- 1,800 telemetry events;
- 6 scripted price-change events;
- 0 measured retries;
- 0 duplicate measured calls.

Scenarios:

1. initially cheapest provider becomes non-cheapest;
2. capacity/throttling herd condition;
3. stable control.

## Headline result

| Metric | Result |
| --- | ---: |
| Captured arbitrage | **1.0000 / 100%** |
| Absolute regret vs ORACLE | **0** |
| Normalized regret | **0** |
| Misroute rate | **0%** |
| Switch count | 18 |
| Oscillation rate | 5.014% |
| Reaction lag across six scripted changes | **0 ms** |
| STATIC quality | **97.222% (350/360)** |
| TRUYN cost-aware quality | **98.056% (353/360)** |
| Quality delta | **+0.833 pp** |
| Modeled STATIC cost | 0.01380612 |
| Modeled TRUYN cost | 0.01087812 |
| Modeled ORACLE cost | 0.01087812 |
| Modeled comparative savings | 0.00292800 |
| Modeled comparative savings rate | **21.208%** |

Under the frozen scripted price timeline, TRUYN matched the modeled ex-post ORACLE cost exactly: zero absolute regret and zero misroutes.

## Statistical reconciliation

The independent reconciliation recomputed the paired statistics with 20,000 deterministic bootstrap iterations at 95% confidence.

### Modeled cost saving vs STATIC

- mean paired saving: `0.000008133333333333332`
- 95% CI: `[0.000006574583333333333, 0.000009748611111111102]`
- frozen gate: lower 95% bound `> 0`
- result: **PASS**

### Quality non-inferiority

- mean paired quality delta: `+0.008333333333333333`
- 95% CI: `[-0.002777777777777778, 0.022222222222222223]`
- frozen non-inferiority gate: lower 95% bound `>= -0.05`
- result: **PASS**

## Per-scenario result

| Scenario | STATIC quality | TRUYN quality | Quality delta | Modeled savings rate | TRUYN provider mix |
| --- | ---: | ---: | ---: | ---: | --- |
| initially cheapest becomes non-cheapest | 92.500% | 94.167% | +1.667 pp | 21.208% | Gemini 70 / GPT 50 |
| capacity/throttling herd | 100.000% | 100.000% | 0 pp | 21.208% | Gemini 70 / GPT 50 |
| stable control | 99.167% | 100.000% | +0.833 pp | 21.208% | Gemini 70 / GPT 50 |

Each scenario produced modeled savings of `0.000976` over 120 paired tasks. In every scenario the TRUYN modeled cost matched the ex-post ORACLE modeled cost.

## Provider usage and measured quality

| Provider | Calls | Correct | Incorrect | Accuracy | Input tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini | 570 | 553 | 17 | **97.018%** | 17,670 | 2,177 | 19,847 |
| GPT | 150 | 150 | 0 | **100.000%** | 5,300 | 450 | 5,750 |
| Total | 720 | 703 | 17 | — | 22,970 | 2,627 | **25,597** |

Measured-arm mix:

- STATIC: Gemini 360 / GPT 0;
- TRUYN_COST_AWARE: Gemini 210 / GPT 150.

## Token trade-off

| Arm | Input tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: |
| STATIC | 11,160 | 1,370 | 12,530 |
| TRUYN_COST_AWARE | 11,810 | 1,257 | 13,067 |

TRUYN used 537 more total tokens, or **+4.286%** relative to STATIC. The measured economic effect therefore came from routing across the frozen price/capacity choices, not from simply using fewer tokens.

## Latency trade-off

Cost-aware routing was slower on this campaign because GPT was slower than Gemini and was intentionally selected for 150 eligible tasks.

| Arm | Mean | Median | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| STATIC | 422.83 ms | 406 ms | 608.05 ms | 740.87 ms | 1,145 ms |
| TRUYN_COST_AWARE | 516.81 ms | 447.5 ms | 889.6 ms | 1,377.89 ms | 3,003 ms |

Mean latency delta: **+93.99 ms / +22.23%** for TRUYN_COST_AWARE vs STATIC.

This latency cost is part of the benchmark result and must accompany interpretation of the modeled cost saving.

## Execution integrity

Independent recomputation confirmed:

- measured retries: **0**;
- duplicate provider-call keys: **0**;
- duplicate routing-decision keys: **0**;
- all measured request outcomes: `ok`;
- material foreign-series interference: **none**;
- measured-request provenance: verified;
- frozen provider pins: verified;
- future ORACLE information used by live router: **false**;
- real provider prices mutated by benchmark: **false**;
- unexpected measured arms: **0**.

## Immutable evidence anchors

Measured source run:

- GitHub Actions run: `36039411026`
- logical run ID: `h-arbitrage-final-36039411026-a1`
- artifact ID: `10826811817`
- artifact name: `h-arbitrage-standalone-final-36039411026-a1`
- artifact ZIP SHA-256: `sha256:d5ca5f48ea043787efe553a6955b31ab0adfc47c2e72b1897ce0282d3fd157b4`
- telemetry SHA-256: `sha256:79fe3f1d2d76d7291b863211f6f4e0338b25d3608e2c0aa2ffcde7dc4a10c947`

Independent HS13 recomputation:

- run: `36043622812` — **SUCCESS**
- artifact ID: `10827117612`
- audit ZIP SHA-256: `sha256:3c2f06c2e5d8239cad7f25c48a4e6878dfc018bc89d96a0a8c22ce01ebb18715`
- full-metrics SHA-256: `sha256:dc449a37b7a17dcd589fdc70cfb79e66ddd1f7cf91ded429712f6c85f76992ca`
- paid provider calls by audit: **0**

Read-only provider billing audit:

- run: `36044260834` — **SUCCESS**
- artifact ID: `10827952475`
- audit ZIP SHA-256: `sha256:5024dddaa272e46f922456baf6c33c6480e97690913421a349a6154e78106bf8`
- paid provider calls by audit: **0**

Sensitive operational identifiers and raw logs remain in the private `inn-media/truyn-platform` evidence record. They are intentionally not copied into this public report.

## Billing / claim boundary

Provider call counts and token usage are evidence-backed. Exact provider invoice attribution for the six-minute measured window was **not** available from both clouds during the post-run audit:

- Azure Cost Management access for the benchmark identity returned an RBAC denial for the requested cost surface;
- no queryable standard/detailed GCP BigQuery billing export was available to the benchmark runtime for exact run-window attribution.

Therefore:

- `modeledComparativeSavingsClaimEligible = true`
- `externalRealDollarSavingsClaimEligible = false`

The **21.208%** figure is a modeled comparative saving under the frozen scripted price timeline. It must **not** be represented as proof that an actual Azure/GCP invoice was reduced by 21.208%.

## Accepted bounded claim

For this frozen workload/provider pool/eligibility contract and scripted price timeline, TRUYN captured **100% of the modeled available static-to-oracle arbitrage**, with **0% misroutes**, **zero regret to the modeled ORACLE**, a **21.208% modeled comparative saving** versus STATIC, and preserved the frozen quality non-inferiority gate. The routing choice increased mean latency by **22.23%** in this campaign.

This result does not claim that future live provider prices, quotas, provider mixes or workloads will produce the same opportunity.

## Closure / rerun rule

`H_ARBITRAGE_FINAL = PASS / CLOSED`.

Ordinary H-Series continuation must **not** re-run this final benchmark. A new H/ARBITRAGE final run requires a material versioned change to the methodology, provider set, price model, workload, seed/statistical acceptance or claim scope and must receive a new immutable run identity.
