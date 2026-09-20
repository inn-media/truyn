# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot:** 2026-09-20  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

This document distinguishes accepted facts from open PRs, diagnostics, planned work and live-production evidence that does not yet exist.

## Canonical matrix

| Subsystem | Current factual state | Next boundary |
|---|---|---|
| Signed identity / envelopes | **Implemented / CI-proven** | `TRUYN/1` remains draft |
| QUIC / authenticated sessions / Kademlia | **Implemented / CI-proven** | broader production/WAN evidence |
| Class C WAN | **ACCEPTED / PASS** | — |
| Class D-100 | **ACCEPTED / PASS** | — |
| Class D-200 | **ACCEPTED / PASS** — run `35503894414`, attempt 1 | D-500 / D-1000 remain separate gates |
| Class D-500 | **OPEN** | real accepted D-500 evidence |
| Class D-1000 | **OPEN** | real accepted D-1000 evidence |
| Semantic Scale S-Series | **DEFINED / NOT YET EXECUTED** | S-50 `ECON` + `MIX`, then remaining S-50 scenarios |
| Efficiency E-Series | **FOUNDATION DEFINED / NOT YET EXECUTED** | stage instrumentation + isolation qualification, then DECOMPOSE → PER-RESULT → KNEE → DEGRADE |
| Semantic/distributed retrieval | **Implemented bounded CI/benchmark slices** | broader decentralized/adversarial scale |
| Claim-centric + active Trustability | **Implemented bounded slices** | Production Trust Authority remains open |
| Account → Organization → Tenant | **Historical public acceptance; managed ownership is TRUYN Platform** | public contract/reference seams |
| Durable Production Authority | **Historical public acceptance; managed implementation migrated to TRUYN Platform** | public self-hostable/reference surfaces |
| Managed authority runtime support | **Implemented / accepted in TRUYN Platform** | public repository exposes contracts/conformance only |
| Managed provider accounting wiring | **Implemented / accepted in TRUYN Platform** | live managed reconciliation evidence open |
| Live managed authority deployment | **OPEN** | provisioned production evidence |
| Provider grants / entitlements / accounting / terminal revocation | **Managed implementation owned by TRUYN Platform; public contract/reference behavior retained where classified OPEN** | live managed ops + reconciliation evidence |
| Production SLI/SLO | **Defined numerical contract** | live compliance evidence |
| Observability / alerting | **Implemented repository/runtime contracts** | deployed evidence |
| Rotation / on-call | **Implemented contracts** | live drills/roster/test-fire |
| Recovery / DR | **Implemented contract** | real backup/restore evidence |
| A2A/MCP C1–C8 | **ACCEPTED bounded profile** | broader optional surfaces separate |
| P2-E1 / Sprint E | **ACCEPTED / CLOSED** | — |
| P2-E2 `a2a-mcp-pre-v1/g1` | **ACCEPTED / CLOSED** | stable-v1 not claimed |
| P2-E3 canonical reconciliation | **ACCEPTED / MERGED** | — |
| NLWeb interoperability | **BOUNDED NLWeb 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN** | later upstream profiles require requalification |
| Five first-party SDK clients | **Implemented / conformance-proven** | release ecosystem completion |
| PyPI alpha | **Accepted immutable public release** | — |
| Go alpha | **Accepted immutable public release** | — |
| npm alpha.1 | **Immutable historical artifact; clean-room Node 22 ESM failed** | superseded, never overwritten |
| npm alpha.2 | **Accepted immutable public release** | — |
| Maven Central / NuGet | **OPEN** | public publication evidence |
| Agent Descriptor | **Bounded valid-profile implemented** | refresh/re-sign + full endpoint parity |
| Live developer site | **OPEN** | deployment/liveness evidence |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers/TSC/neutral stewardship |
| Mainnet | **Not productionized** | external qualification + live ops + release/governance gates |

## Network-scale acceptance boundary

Class D-200 is accepted on immutable workflow run `35503894414`, attempt 1, with strict `TRUYN_D200_TERMINAL result=PASS`. The accepted tuple is frozen tested source `e91c165c67c655deb80df4511ca346acb9f1f45b`, tested tree `3a402ba72502de12ed2277db3c9f472872f44b46`, launcher merge `e785815530a59a56787e20ceb6bb232ccc93ad4f`, artifact ID `10603748497`, artifact digest `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`.

Measured D-200 acceptance included 20 hosts / 200 real processes, readiness 200/200, baseline routing 400/400, post-restart routing 100/100 first-attempt with zero application retries, healed routing 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, real packet-partition recovery `32,159 ms`, 100 acknowledged writes with zero loss, zero safety violations, and zero remaining campaign/staging resources after cleanup.

This closes D-200 only. It does not promote D-500, D-1000, long-duration stability or mainnet to accepted status.

Durable evidence: `../benchmarks/CLASS_D_200_2026-09-20.md`.

## Semantic Scale S-Series boundary

S-Series is defined as the live semantic-node scale family `S-50 → S-100 → S-200 → S-500`. It combines the existing Class-D network substrate with the existing seven-provider semantic path (GPT, Gemini, Grok, DeepSeek, Llama, Mistral, Kimi) without defining a second network protocol or replacing the D-Series.

The fixed scenario families are `ECON`, `MIX`, `XBORDER`, `CHAIN`, `CHURN`, `COST-ROUTING`, `CONTENTION`, `LANG`. Common gates retain routing >=99%, recovery p95 <=120 s, answer/retrieval >=99% where exercised, provenance/minimal-context 100%, zero block-ID leakage, zero acknowledged-write loss where exercised, zero invalid/stale/unauthorized acceptance and paired ECON token/provider-cost reduction >=90%.

The existing `SEMANTIC_SCALE_GATE_V3_2026-08-16.md` remains valid corpus/index-scale evidence but does not satisfy S-50/100/200/500 because those gates require real heterogeneous provider-backed nodes and the S-Series execution/evidence contract.

No S-Series workflow/run has been accepted yet. Canonical foundation: `SEMANTIC_SCALE_S_SERIES.md`, `../benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`, `../operations/S_SERIES_EXECUTION_AND_TELEMETRY.md`.

## Efficiency E-Series boundary

E-Series is defined as a separate efficiency-limit family over qualified TRUYN substrate. It does not replace D-Series network acceptance or S-Series semantic-node acceptance and cannot inherit PASS from either.

The four canonical benchmarks are:

```text
E/DECOMPOSE
E/PER-RESULT
E/KNEE
E/DEGRADE
```

Public methodology fixes canonical stage attribution, useful-result correctness/provenance/minimal-context gates, paired DIRECT comparison, dense knee scale grid, overload sustainability/recovery rules, telemetry schemas, evidence preservation and D/S/T/H/E isolation semantics.

The initial v1 profile is text/reasoning only. Comparable E campaigns freeze corpus/workload, oracle, provider mix, model/config class, routing/retrieval/verification policy, scale/load grids, warmup, sample minima, confidence method and billing/compute attribution mode before final runs.

No E instrumentation qualification, pilot or final campaign is accepted yet. Documentation/harness existence is not evidence of efficiency, bottleneck, knee or sustainable-load claims.

Canonical foundation: `../benchmarks/E_SERIES_EFFICIENCY.md`, `../benchmarks/E_DECOMPOSE_METHODOLOGY.md`, `../benchmarks/E_PER_RESULT_METHODOLOGY.md`, `../benchmarks/E_KNEE_METHODOLOGY.md`, `../benchmarks/E_DEGRADE_METHODOLOGY.md`, `../benchmarks/E_SERIES_TELEMETRY.md`, `../operations/E_SERIES_EXECUTION.md`.

## Repository boundary

Managed production authority, managed control plane, Cosmos-backed persistence, commercial entitlement/accounting/billing implementation and hosted authority runtime are owned by private `inn-media/truyn-platform`. This public repository retains protocol/open-edge behavior, public contracts/conformance, Node/Relay reference behavior, generic provider/BYOK/owner-funded behavior and explicit managed extension seams. Public code never depends on private code; private code consumes only immutable released/versioned public artifacts or explicitly pinned immutable public contracts.

For E-Series specifically, public TRUYN owns metric semantics, formulas and sanitized evidence. Exact cloud resources/topology, quotas/capacity, service identities, actual billing/credits/net cash, run budgets, active leases and secret-bearing raw traces remain private in `truyn-platform`.

## A2A / MCP boundary

Accepted bounded state includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 referenced artifacts, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb boundary

TRUYN Open has executable evidence for a **bounded pinned NLWeb protocol 0.5 interoperability profile** at upstream `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

Accepted bounded behavior includes client/provider normalization, exact profile negotiation, authorization-aware WHO discovery over the already visible/eligible TRUYN candidate universe, deterministic public/reference selection, `who → selection → ask` through canonical TRUYN authority/dispatch, structured correlation/provenance preservation, adversarial private-provider invisibility, unsupported-profile fail-closed behavior, and explicitly tested bridge mappings.

Independent S89 black-box run `35487917472`, attempt 1, completed **SUCCESS** against exact qualified SUT `a28cba182b9cddde34bc34894180d14cfa166d2b`; its evidence-only PR #667 was closed without merge.

This does **not** claim stable NLWeb v1, compatibility with later upstream revisions, or ownership of crawling/ingestion, indexing, vector search, RAG corpus ownership, brand/news/product content, publisher/content rights, campaign data or Data Graph business semantics. Those application/data concerns remain outside TRUYN's interoperability layer.

Canonical profile details and evidence boundary: `NLWEB_INTEROPERABILITY.md`.

## SDK / developer release boundary

Five first-party clients and shared executable conformance are implemented. PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2` have accepted immutable public evidence. npm alpha.1 remains immutable historical evidence but is superseded. Maven Central and NuGet remain open.

## Documentation hygiene

Historical evidence remains audit history. Current-status documents follow accepted evidence. Open PRs, public uploads and in-progress diagnostics do not become accepted production claims merely by existing. Operational network-scale status remains delegated to `../operations/NETWORK_SCALE_STATUS.md`.
