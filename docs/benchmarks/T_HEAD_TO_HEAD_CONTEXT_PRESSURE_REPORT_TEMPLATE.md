# T/HEAD-TO-HEAD-CONTEXT-PRESSURE — Result Report Template

Status: **TEMPLATE / NO RESULT CLAIM**

This template is mandatory for the first published result of `T/HEAD-TO-HEAD-CONTEXT-PRESSURE`.

## 1. Run identity

- public TRUYN commit/release:
- methodology commit/blob:
- private frozen candidate SHA:
- run ID:
- workflow run:
- immutable artifact ID/digest:
- provider/model/version:
- comparator pins:
- price snapshot:
- accounting policy digest:
- corpus/workload/rubric digests:
- topology profile:
- telemetry completeness:
- paid provider calls:
- retries:

## 2. Execution validity

| Gate | Result | Evidence |
|---|---|---|
| exact frozen identity |  |  |
| comparator good-faith review |  |  |
| native MCP execution |  |  |
| native A2A execution |  |  |
| native NLWeb execution |  |  |
| TRUYN native context/retrieval |  |  |
| telemetry completeness >=99.9% |  |  |
| pair-ID loss = 0 |  |  |
| unattributed paid calls = 0 |  |  |
| quality/provenance floor |  |  |
| cross-series interference |  |  |
| WAN cleanup / lease release |  |  |

## 3. Protocol Surface Benchmark

This section has no economic winner.

| Arm | native operations | protocol bytes | artifact/reference bytes | serialization ms | orchestration ms | evidence/provenance capabilities |
|---|---:|---:|---:|---:|---:|---|
| BARE_MCP | | | | | | |
| BARE_A2A | | | | | | |
| NLWEB | | | | | | |
| TRUYN | | | | | | |
| NLWEB_OVER_TRUYN | | | | | | |

Document every comparator optimization enabled.

## 4. Economic Context Pressure Benchmark

Report separately for each cache state and network profile.

### LOCAL_CONTROL / cold

| Arm | P2 fully-loaded | P10 | P25 | P50 | P2 input tokens | P10 | P25 | P50 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| NAIVE | | | | | | | | |
| BARE_MCP | | | | | | | | |
| BARE_A2A | | | | | | | | |
| NLWEB | | | | | | | | |
| TRUYN | | | | | | | | |
| NLWEB_OVER_TRUYN | | | | | | | | |

Repeat for:
- LOCAL_CONTROL / warm
- WAN_DISTRIBUTED / cold
- WAN_DISTRIBUTED / warm

## 5. Context duplication

For every arm and stratum publish:

- unique semantic bytes;
- total materialized semantic/context bytes;
- duplicated context bytes;
- context duplication ratio;
- evidence bytes;
- protocol metadata bytes;
- artifact/reference bytes.

Do not merge protocol bytes into semantic bytes.

## 6. WAN transfer

For WAN_DISTRIBUTED publish:

- WAN tx bytes;
- WAN rx bytes;
- cross-node context/evidence bytes;
- retransmitted bytes;
- network cost evidence class;
- topology/node/location class.

## 7. Cost decomposition

For every arm/stratum:

| Component | USD | Evidence class |
|---|---:|---|
| provider gross | | |
| orchestration compute | | |
| embedding/retrieval | | |
| storage | | |
| network | | |
| setup allocation | | |
| allocated fixed | | |
| fully-loaded / completed valid workflow | | |

A C_LOCAL_ESTIMATE component remains labeled as such.

## 8. Latency and quality

Publish:
- end-to-end p50/p90/p95 and p99 only where supported;
- provider latency separately;
- routing/retrieval/materialization latency separately;
- evidence verification latency separately;
- final correctness;
- required evidence coverage;
- provenance integrity;
- cross-hop state consistency.

## 9. Scaling curves

Required curves:

1. billed input tokens vs hops;
2. duplicated context bytes vs hops;
3. WAN bytes vs hops;
4. fully-loaded cost/completed workflow vs hops;
5. E2E latency vs hops.

For each comparator show the paired TRUYN percentage delta at P2/P10/P25/P50.

Do not force monotonic fitting. If the curve is flat, noisy, reversed or comparator-favoring, publish it as measured.

## 10. Hypothesis disposition

Report each criterion independently:

| Criterion | P2 | P10 | P25 | P50 |
|---|---|---|---|---|
| TRUYN duplicated context lower than BARE_MCP | diagnostic | required | required | required |
| TRUYN duplicated context lower than BARE_A2A | diagnostic | required | required | required |
| TRUYN duplicated context lower than NLWEB | diagnostic | required | required | required |
| TRUYN provider input tokens lower | diagnostic | diagnostic | required | required |
| TRUYN WAN bytes lower | n/a/diagnostic | diagnostic | required | required |
| TRUYN fully-loaded cost lower | diagnostic | diagnostic | required | required |

Also state whether the P50 fully-loaded advantage is at least as large as the P25 advantage.

## 11. Relationship to prior evidence

Explicitly preserve:
- the closed negative T/HEAD-TO-HEAD Attempt 3/4 result;
- the earlier context-efficiency A/B result;
- the seven-actor semantic-retrieval result.

Do not use the new result to rewrite those historical conclusions.

## 12. Final bounded claim

Use only:

> Under <frozen corpus/workflow/topology/model/cache/network conditions>, TRUYN measured <specific scaling result> versus <specific comparator>, while preserving <quality/provenance condition>.

Never use “TRUYN is always cheaper/faster than MCP/A2A/NLWeb.”
