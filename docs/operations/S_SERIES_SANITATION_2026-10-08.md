# S-Series Documentation Sanitation — 2026-10-08

## Canonical result

S-50 Attempt 3 is the accepted S-50 checkpoint.

- run: `37782488279`
- job: `113328810009`
- immutable launch SHA: `a5d9adcbce0a7fb332714e724bdd6adcd446afbc`
- raw artifact ID: `11555246174`
- raw artifact digest: `sha256:373ad84ee2d41d170b3035a9e34419891edaa2a41fca2cd0138687177faebbf5`
- node target: 50
- scenario matrix: `ECON + MIX + XBORDER + CHAIN + CHURN + COST-ROUTING + CONTENTION + LANG`
- result: **8/8 PASS**

Canonical public evidence:

- `docs/benchmarks/S_SERIES_S50_2026-10-08.md`
- `docs/benchmarks/evidence/S_SERIES_S50_2026-10-08.json`

## Current S-Series ladder

- S-10: **ACCEPTED / PASS**
- S-20: **ACCEPTED / PASS**
- S-50: **ACCEPTED / PASS**
- S-100: **OPEN**
- S-200: **OPEN**
- S-500: **OPEN**

Passing S-50 does not imply any larger S level.

## Attempt lineage

Attempt 1 and Attempt 2 remain immutable failed evidence and are not rewritten.

- Attempt 1: CHURN runner/evidence serialization defect after workload execution.
- Attempt 2: CHURN repaired and passed; LANG orchestration timed out because 50 live workers were serviced serially.
- Attempt 3: LANG orchestration changed only to bounded parallelism of seven while retaining 50 simultaneously live workers. All eight scenarios passed.

No acceptance threshold, scenario set, provider set, multilingual corpus, recovery limit or failure model was weakened across the accepted repair sequence.

## Accepted headline measurements

- 50 unique nodes / 50 unique processes in each ECON/MIX profile;
- all 7 provider families represented;
- 150/150 ECON/MIX observations correct;
- 97.8102894640068% input-token reduction;
- 97.41284171441056% comparable GPT/Gemini provider-cost reduction;
- XBORDER: 2 clouds / 3 regions / 2 geographies;
- CHAIN: 16 chains / 48 hops / 100% lineage;
- CHURN recovery p95: 58,616 ms against <=120,000 ms;
- COST-ROUTING: 50/50 policy hits, 0 eligibility violations, 0 authorization violations;
- CONTENTION: 50/50 completed, maxInFlight 50, 0 cascading failures;
- LANG: 50/50 cases across EN/TR/ZH/RU/AZ;
- provider trace: 655 attempts, 652 HTTP 200, 3 recovered HTTP 429, 0 terminal provider failures.

## Important performance finding

S-50 passed correctness and stability under 50-way contention, but measured substantial queueing/backpressure:

- control p95: 3,118 ms;
- 50-way burst p95: 22,723 ms;
- p95 inflation: 7.2877x;
- observed completion throughput: 2.148 req/s.

This is retained as measured evidence and becomes an optimization target before or alongside S-100. It is not retroactively turned into an S-50 failure and no threshold is invented after the run.

## Sanitation decisions

The following statements are stale after accepted Attempt 3 and must not be used as current status:

- “S-50 OPEN”;
- “S-50+ remain OPEN” when referring to the current ladder;
- “S-10 and S-20 are the only accepted S checkpoints”;
- “XBORDER/CHAIN/CHURN remain unaccepted” without explicitly limiting that statement to S-20 scope.

Historical documents, issues, PRs and failed attempt evidence remain audit history. They are not deleted or rewritten.

Current status is:

**S-10 PASS -> S-20 PASS -> S-50 PASS -> S-100 OPEN -> S-200 OPEN -> S-500 OPEN.**

## Scope boundary

The S-50 benchmark is bounded evidence. It does not establish universal provider pricing, universal latency, production mainnet capacity, arbitrary geography coverage, or larger S-level acceptance.

The next independent semantic-scale acceptance gate is S-100.
