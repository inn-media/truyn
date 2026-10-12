# S-200 routing candidate — 2026-10-12

**CANDIDATE; not accepted new benchmark evidence.** Historical A14/A15 six-provider composite 8/8 PASS, original seven-provider/DeepSeek and WAN/SLO gates remain unchanged and OPEN where stated. This code does not modify immutable S-200 evidence or rerun any paid workload.

## Changes
- Default offer routing no longer chooses the most recently touched node; signed OFFER metadata can advertise `pricing.inputUsdPerMTok`, `pricing.outputUsdPerMTok` (USD/1M tokens), and `capacity.maxInFlight` (default 8).
- Provider in-flight requests and admission reservations are considered; when all options are saturated, select lowest utilization rather than deepening the cheapest queue.
- Signed NEED `policy.routing` optionally chooses `mode: cost|latency`, `expectedOutputRatio` (default 0.25), and `maxUnitCostUsdPerMTok`. Here `latency` means least-utilization routing, **not measured provider execution time**.
- Requested max unit cost is strictly enforced; unknown/partial price cannot satisfy a cost ceiling. OFFER cost is self-advertised, not authoritative actual billing cost.
- Preserve owner-only authorization, freshness, duplicate-admission CAS and durable OFFER revocation on every dispatch. Parallelize remote OFFER ledger checks in capped batches of eight; **do not cache positive Cosmos state**.
- At most one hot-path fast-request expiration sweep per 250 ms; heartbeat and health force full checks.

## Acceptance and private S-worker dependency
Targeted tests are necessary but do not prove p95 improvement, throughput, or cost savings under S-200. Qualify exact SHA, security and regression suites; test cross-relay revocation and realized cost separately. Private S workers must publish correct OFFER pricing/capacity and process NEED in bounded parallel slots. If the private worker remains serial, falsely advertising capacity 8 makes the queuing problem worse. New performance campaign must have a new admitted identity; do not rerun frozen A14/A15 or relax thresholds.

## Root-cause boundary from the actual frozen S-200 runner

A14/A15 `ops/s-series/s200-live/contention.mjs` dispatched one NEED to each of **200 individually named worker capabilities**. Because a given capability had one worker, that measured burst was not susceptible to choosing among four otherwise-equivalent OFFERs: recency herding is a real generic relay defect, but **not a demonstrated explanation** of the recorded 17.9-second non-provider p95. Its actual contribution requires per-stage evidence and controlled A/B.

Likewise frozen `cost-routing.mjs` executes `choose(policy)` **before** starting a uniquely named worker, with a cost comparison of GPT versus Gemini input and output token usage; its measured -2.2268% is not caused by relay recency ranking. The fixture's `maxInputRateUsdPerMillion`/trust rules can constrain selection so that minimum observed cost is not lower than the GPT premium baseline. Verify predicted versus realized USD using the same token usage and output ratio before claiming actual savings.

## G5 authoritative OFFER integrity preservation (new public main)

The concurrent ledger read path verifies **all** of: durable record presence under Cosmos, non-revocation, matching durable owner, and matching SHA-256 signed OFFER fingerprint. Durable corruption **fails closed with 503**, not fallback to a different offer. The same check is retained for owner-only discovery; current `main` security repair `3643938717d6e6bd8d070e81bbfaf5f99bfeb3ea` is incorporated rather than overwritten. Re-run its `g5-offer-durable-integrity.test.js` and the new cost/load tests together on the merged exact SHA.
