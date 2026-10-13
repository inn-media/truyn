# S-200 six-provider Double-Check verification — 2026-10-13

**State: CLOSED / ACCEPTED / DOUBLE-CHECK VERIFIED for the bounded six-provider S-200 scope.**

The primary accepted closure remains the immutable A14+A15 composite documented in [S_SERIES_S200_2026-10-12.md](S_SERIES_S200_2026-10-12.md). **Attempt 17 is a new, independent real-model confirmation**: one exact launch identity, all eight scenarios freshly measured, no historical scenario-result adoption, and final reconciliation over preserved per-scenario checkpoints.

This does **not** close the original seven-provider contract because DeepSeek was not in the measured family set. It also does not prove a 200-host physical WAN, long-duration production SLO, Mainnet readiness, or invoice-level savings.

## Immutable Double-Check identity

| Item | Evidence |
|---|---|
| Measured workflow | private run `38300564788` |
| Qualified source SHA | `4c5b13630aa3c2255203df93eee043bf15083d76` |
| Launch SHA / measured candidate | `796029e6947649d9959074385c2b9241cebcd732` |
| Historical evidence adopted | **No** |
| Scenario jobs | **7/7 GREEN**: ECON+MIX, XBORDER, CHAIN, CHURN, COST-ROUTING, CONTENTION, LANG |
| Final suite | **8/8 PASS** |
| Reconcile-only verification | run `38371943412` |
| Reconciled artifact | `11800135348`, SHA-256 `564f7166f2cb776a5c30aa3d3a5aab538fa07d0456274e82a905a9bb9ac60b00` |
| Cleanup | **PASS / verified** |

The reconcile repair did not execute inference; it only downloaded the already-GREEN A17 stage artifacts, verified their exact launch SHA and terminal success, then produced final network/suite evidence.

## Scenario results

| Scenario | A17 Double-Check |
|---|---|
| ECON / MIX | **PASS** — 3 profiles × 200 processes; routing/answer/retrieval/provenance/minimal-context = 100%; input-token reduction **99.4497%**; comparable priced GPT/Gemini provider-cost reduction **99.3503%** |
| XBORDER | **PASS** — 200 requests; Azure 166 / GCP 34; 2 clouds, 3 regions, 2 geographies; p95 **2,337 ms** |
| CHAIN | **PASS** — 64 chains / 192 hops; 100% chain/hop correctness and provenance lineage; 6 provider families; 0 hidden substitutions |
| CHURN | **PASS** — 86 recovery events; p50 **31,884 ms**, p95 **47,105 ms**, p99 **50,164 ms** vs fixed p95 <=120,000 ms; routing/answer/provenance 100% |
| COST-ROUTING | **PASS** — 200 requests; 0 eligibility/authorization violations; policy hit 100%; measured selected-vs-premium reduction **+4.5808%** |
| CONTENTION | **PASS** — 200/200 complete, maxInFlight 200, 0 errors/timeouts/cascades, 0 provider retries; e2e p95 **8,901 ms**, throughput **16.1499 req/s**, non-provider p95 **2,412 ms** |
| LANG | **PASS** — EN/ZH/RU/ES/UK, 40 each; retrieval/answer/provenance 100%, leakage 0 |

Measured providers: GPT, Gemini, Grok, Llama, Mistral and Kimi.

## Independent confirmation of the S-100 latency diagnosis

S-100 recorded non-provider contention p95 **5,874 ms** at 100 nodes and left stage-level residual decomposition as the next target. A14 S-200 later exposed **17,897 ms** non-provider p95 and **19,106 ms** e2e p95 at 200-way contention.

A17 measured non-provider p95 **2,412 ms**, requester NEED-ACK p95 **2,368 ms**, dispatch-to-worker-receive p95 **2,382 ms**, worker pre-provider p95 **18 ms**, result-submit p95 **234 ms**, result-delivery p95 **325 ms**, and provider execution p95 **7,031 ms**.

Against A14, e2e p95 improved **19,106 → 8,901 ms** (~53.4%), non-provider p95 improved **17,897 → 2,412 ms** (~86.5%), and throughput improved **8.249 → 16.150 req/s** (~1.96×).

**Conclusion:** the earlier large TRUYN/request-path contention tax is no longer the dominant tail at S-200 scale. The remaining CONTENTION tail is primarily provider execution.

## Remaining latency issue: provider throttling

ECON/MIX still records TRUYN p95 **61,648 ms** versus direct p95 **9,943 ms**. Its ledger contains **1,314 HTTP attempts: 1,208 HTTP 200 and 106 HTTP 429**; all 106 rate-limit responses are on Azure OpenAI deployment the measured Azure OpenAI GPT deployment. CONTENTION recorded **0 provider 429** and **0 retry attempts**.

Therefore the next performance target is capacity-aware provider routing/admission/pacing for GPT rate limits, not another relay rewrite.

## Economics boundary

These are benchmark comparisons using measured token usage and a frozen pricing snapshot, not cloud invoices.

- ECON comparable priced direct cost: **$1.4041234**
- ECON comparable priced TRUYN cost: **$0.00912286**
- reduction: **99.3503%**
- COST-ROUTING premium-control: **$0.028292**
- COST-ROUTING selected: **$0.026996**
- reduction: **4.5808%**

## Acceptance statement

The six-provider S-200 bounded gate is now **repeatability-confirmed / DOUBLE-CHECK VERIFIED**:

1. primary accepted evidence: A14+A15 composite, immutable and still authoritative history;
2. independent confirmation: A17, fresh real-model evidence for all eight scenarios under one exact launch SHA.

Still OPEN: DeepSeek/seven-provider parity, physical 200-host WAN, sustained production SLO/Mainnet, S-500, and GPT capacity/rate-limit optimization.
