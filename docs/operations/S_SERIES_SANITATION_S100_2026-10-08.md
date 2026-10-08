# S-Series Documentation Sanitation — 2026-10-08 — S-100 Accepted

## Canonical result

S-100 Attempt 1 is the accepted S-100 checkpoint.

- run: `37802170819`
- job: `113396919570`
- immutable launch SHA: `b32d59cdf2cbbc4849b30a0d87e5814869b3f82f`
- raw artifact ID: `11564432004`
- raw artifact digest: `sha256:a5f45b27004230bb2ca6a6de8f69d24d14d97729d62d08a77bdbf974543fbc69`
- node target: 100
- scenario matrix: `ECON + MIX + XBORDER + CHAIN + CHURN + COST-ROUTING + CONTENTION + LANG`
- result: **8/8 PASS**

Canonical public evidence:

- `docs/benchmarks/S_SERIES_S100_2026-10-08.md`
- `docs/benchmarks/evidence/S_SERIES_S100_2026-10-08.json`

## Current S-Series ladder

- S-10: **ACCEPTED / PASS**
- S-20: **ACCEPTED / PASS**
- S-50: **ACCEPTED / PASS**
- S-100: **ACCEPTED / PASS**
- S-200: **OPEN**
- S-500: **OPEN**

Passing S-100 does not imply S-200 or S-500.

## Accepted headline measurements

- 100 unique nodes / 100 unique processes in each ECON/MIX profile;
- all 7 provider families represented;
- 300/300 ECON/MIX observations correct;
- 98.90318941377166% input-token reduction;
- 98.68217899146197% comparable GPT/Gemini provider-cost reduction;
- XBORDER: 2 clouds / 3 regions / 2 geographies;
- CHAIN: 32 chains / 96 hops / 100% provenance lineage;
- CHURN recovery p95: 54,002 ms against <=120,000 ms;
- COST-ROUTING: 100/100 policy hits, 0 eligibility violations, 0 authorization violations;
- CONTENTION: 100/100 completed, maxInFlight 100, 0 cascading failures;
- LANG: 100/100 cases across EN/TR/ZH/RU/AZ;
- provider trace: 1,290 attempts, 1,271 HTTP 200, 19 recovered HTTP 429, 0 terminal provider failures.

## Azure-auth harness sanitation

S-50 exposed a benchmark-side Azure token stampede: many workers could synchronously invoke `az account get-access-token`, inflating apparent provider latency. Before S-100 the harness was changed so Azure bearer acquisition occurs outside worker processes and the token is inherited through environment state.

S-100 contention decomposition measured:

- auth p50/p95: 0 / 3 ms;
- provider HTTP p50/p95: 1,030 / 3,476 ms;
- non-provider residual p50/p95: 4,586 / 5,874 ms;
- 100-way e2e p50/p95: 5,786 / 7,741 ms;
- completion throughput: 10.7504 req/s.

This confirms the prior 17-18 second Azure-auth delay was a test-harness artifact, not a TRUYN network tax.

The remaining non-provider residual is retained as the next diagnostic target before S-200. It must not be hidden or retroactively converted into an S-100 failure.

## Honest retained findings

The accepted result does not erase adverse or mixed measurements:

- ECON/MIX TRUYN p95 was 61,646 ms versus DIRECT p95 5,321 ms on the bounded paired workload;
- COST-ROUTING selected blended cost was 1.8154% above premium control;
- AZ LANG p95 was 8,628 ms despite 20/20 correctness;
- CONTENTION still showed 4.586 s p50 / 5.874 s p95 non-provider residual.

These are engineering observations, not failed hard gates.

## Sanitation decisions

The following statements are stale after accepted S-100 Attempt 1 and must not be used as current status:

- “S-100 OPEN”;
- “S-100+ remain OPEN” when referring to the current accepted ladder;
- “S-50 is the highest accepted semantic-scale checkpoint”;
- “S-200 is next only after executing S-100”.

Historical S-50 diagnosis and accepted S-50 evidence remain immutable history. They are not rewritten.

Current status is:

**S-10 PASS -> S-20 PASS -> S-50 PASS -> S-100 PASS -> S-200 OPEN -> S-500 OPEN.**

## Scope boundary

The S-100 benchmark is bounded evidence. It does not establish universal provider pricing, universal latency, production-mainnet capacity, arbitrary geography coverage, S-200 or S-500 acceptance.

The next independent semantic-scale acceptance gate is **S-200**.
