# T/HEAD-TO-HEAD — Attempts 3 and 4 — Final Benchmark Record

Status: **EXECUTED / CLOSED — NEGATIVE ECONOMIC RESULT**  
Date: **2026-10-07**  
Benchmark: `T/HEAD-TO-HEAD`

## Executive conclusion

The T/HEAD-TO-HEAD test was successfully executed and is now closed.

The benchmark did **not** prove the pre-frozen claim that TRUYN reduces gross provider cost by at least 30% versus competent BARE_MCP and BARE_A2A comparators on this frozen two-hop workload.

What it did prove:

- all six arms completed the same frozen task with accuracy `1.0`;
- native MCP, A2A and NLWeb execution was exercised and independently evidenced;
- telemetry was complete: 144/144 measured arm-samples, 100% completeness, zero pair-ID loss and zero unattributed paid provider calls;
- each accepted measured attempt executed exactly 312 provider calls with zero retries;
- TRUYN was approximately 98% cheaper than the intentionally inefficient NAIVE full-context handoff control;
- against competent minimal-context MCP/A2A/NLWeb comparators, provider inference cost was approximately equal, so the 30% economic gate was not met;
- when measurable orchestration/setup compute was included in Attempt 4, TRUYN was slightly more expensive than BARE_A2A and NLWeb on this micro-workload.

This is a negative result for the specific 30% HEAD-TO-HEAD economic hypothesis. It is retained as evidence and must not be rewritten as a PASS.

## Frozen workload

- model: GPT-4.1-mini, version `2025-04-14`;
- arms: NAIVE, BARE_MCP, BARE_A2A, NLWEB, TRUYN, NLWEB_OVER_TRUYN;
- 24 measured samples per arm;
- 2 warmups per arm;
- 2 provider hops per sample;
- 312 provider calls maximum and observed;
- retries: 0;
- exact-answer quality contract;
- comparator pins:
  - MCP server/client `2.0.0`, protocol `2026-07-28`;
  - A2A SDK `1.0.1`, protocol `1.0`;
  - NLWeb source commit `d973d4fe811830eb3734c01a79133adfc474c197`.

## Attempt 3 — gross provider-cost result

Workflow run: `37678944260`  
Frozen candidate: `2050cd43f2a3443d1d8285aa13da06486e21477d`  
Lane admission: `37678586838`  
Artifact: `11509185852`  
Artifact digest: `sha256:c67f0667e02551e7b7cb7da41aa24583d984eb024789c74b2789640533f4adcc`

Attempt 3 completed the full measured workload.

| Arm | Gross provider cost, USD | Accuracy |
|---|---:|---:|
| NAIVE | 0.25929552 | 1.0 |
| BARE_MCP | 0.00488928 | 1.0 |
| BARE_A2A | 0.00478368 | 1.0 |
| NLWEB | 0.00478368 | 1.0 |
| TRUYN | 0.00478368 | 1.0 |
| NLWEB_OVER_TRUYN | 0.00478368 | 1.0 |

TRUYN gross provider-cost deltas:

- vs NAIVE: **98.155% lower** — gate PASS;
- vs BARE_MCP: **2.160% lower** — 30% gate FAIL;
- vs BARE_A2A: **0.000%** — 30% gate FAIL;
- vs NLWEB: **equal** — the `TRUYN <= NLWEB` condition PASS.

Attempt 3 terminal result: **RED**, because the required 30% reduction versus BARE_MCP and BARE_A2A was not achieved.

## Attempt 4 — measurable fully-loaded diagnostic

Workflow run: `37686420651`  
Frozen candidate: `cb373b7f33acb819a871ee8ce996efa2186d659b`  
Lane admission: `37686163076`  
Artifact: `11511747659`  
Artifact digest: `sha256:790218248154c6ab8cb86a17f7be2b09675d458ec1b5fab9875b158ec4dc92af`

Attempt 4 preserved the same 30% threshold, sample policy, provider-token accounting and quality floor. It additionally measured arm-specific setup/protocol/orchestration wall time and priced that compute at the frozen GitHub-hosted Linux runner rate. Protocol bytes were **not** converted into provider tokens. Loopback transport retained byte telemetry but incurred zero external-egress charge.

| Arm | Gross provider cost, USD | Measurable orchestration/setup compute, USD | Fully-loaded measurable cost, USD | Accuracy |
|---|---:|---:|---:|---:|
| NAIVE | 0.25502928 | 0 | 0.25502928 | 1.0 |
| BARE_MCP | 0.00488928 | 0.00002103695 | 0.00491031695 | 1.0 |
| BARE_A2A | 0.00478368 | 0.00001441762 | 0.00479809762 | 1.0 |
| NLWEB | 0.00478368 | 0.00000908441 | 0.00479276441 | 1.0 |
| TRUYN | 0.00478368 | 0.00005003123 | 0.00483371123 | 1.0 |
| NLWEB_OVER_TRUYN | 0.00478368 | 0.00005697331 | 0.00484065331 | 1.0 |

TRUYN fully-loaded measurable deltas:

- vs NAIVE: **98.105% lower**;
- vs BARE_MCP: **1.560% lower**;
- vs BARE_A2A: **0.742% higher**;
- vs NLWEB: **0.854% higher**.

Attempt 4 terminal result: **RED** on the fully-loaded diagnostic gate.

### Methodology note

The public frozen HEAD-TO-HEAD methodology explicitly freezes a 30% **gross provider-cost** reduction gate. Attempt 4 was run to diagnose the broader `all overhead included` requirement using measurable fully-loaded accounting. It is therefore published as a diagnostic extension and does **not** retroactively redefine Attempt 3 or the original frozen gross-cost acceptance criterion.

The honest headline remains: the 30% gross provider-cost advantage versus competent MCP/A2A comparators was **not demonstrated**.

## Native comparator execution evidence

Both measured attempts recorded native comparator execution rather than substituting TRUYN semantics behind the comparator arms.

Attempt 4 proof totals:

| Comparator | Native operations |
|---|---|
| BARE_MCP | resources/list 26; resources/read 26; tools/call 26 |
| BARE_A2A | Agent Card 1; SendMessage 52; GetTask 52 |
| NLWEB | WHO 26; ASK 52 |
| NLWEB_OVER_TRUYN | WHO 26; ASK 52 with TRUYN backend extension |

The comparator executions also retained request/response and artifact-reference byte measurements.

## Interpretation

This benchmark isolates a small two-hop workload where competent MCP/A2A/NLWeb comparators already transmit minimal task-relevant context. Under those conditions, the model-provider token bill is nearly identical across BARE_A2A, NLWEB and TRUYN. A 30% provider-cost advantage therefore does not emerge.

The result does **not** establish that TRUYN has no economic value in larger distributed workflows. It establishes a narrower and useful fact:

> TRUYN's economic advantage is not demonstrated by protocol substitution alone on this frozen two-hop minimal-context workload.

Any future benchmark intended to test TRUYN's content-addressed reuse, distributed retrieval and context-deduplication advantages must be a new prospectively frozen methodology. It must not modify this closed benchmark or degrade comparator configurations to manufacture a win.

## Historical exclusions

Earlier attempts remain historical evidence but are not used as accepted economic measurements:

- Attempt 1: comparator-execution configuration was non-conformant; benchmark invalid.
- Attempt 2: bootstrap dependency-materialization failure before provider calls; no paid inference.
- an early stale Attempt 4 dispatch was consumed by an Azure HTTP 429 infrastructure failure after partial calls; it is not part of the final measured result.

## Closure

T/HEAD-TO-HEAD is **complete and closed**.

Execution success and economic acceptance are intentionally separated:

- benchmark execution: **PASS**;
- evidence completeness: **PASS**;
- quality parity: **PASS**;
- native comparator proof: **PASS**;
- 30% gross provider-cost hypothesis vs BARE_MCP/BARE_A2A: **FAIL**;
- final scientific disposition: **NEGATIVE RESULT, PRESERVED**.

No further HEAD_TO_HEAD rerun is required for this methodology.
