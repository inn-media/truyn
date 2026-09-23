# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-09-23  
**Snapshot main:** `eb25f0f8ad5bedb643f007ddfb0da107dab44b89`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical repository-wide factual maturity/status.
- [Network Scale Status](operations/NETWORK_SCALE_STATUS.md) — current D-Series operational acceptance.
- [Documentation Sanitation 2026-09-23](operations/DOCUMENTATION_SANITATION_2026-09-23.md) — latest repository-wide reconciliation and status vocabulary.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next work.
- [Semantic Scale S-Series](architecture/SEMANTIC_SCALE_S_SERIES.md) — live semantic-node scale architecture for S-50/100/200/500.
- [S-Series Open/Private Boundary](architecture/S_SERIES_OPEN_PRIVATE_BOUNDARY.md) — canonical repository ownership split for S-Series.
- [S-Series Benchmark Contract](benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md) — fixed scenarios, acceptance gates and evidence rules.
- [S-Series Execution & Telemetry](operations/S_SERIES_EXECUTION_AND_TELEMETRY.md) — D/S isolation, telemetry schemas and run closure.
- [E-Series Efficiency Contract](benchmarks/E_SERIES_EFFICIENCY.md) — DECOMPOSE / PER-RESULT / KNEE / DEGRADE definitions and public/private boundary.
- [E-Series Telemetry](benchmarks/E_SERIES_TELEMETRY.md) — recomputable request/stage/cost/load/interference evidence contract.
- [E-Series Execution](operations/E_SERIES_EXECUTION.md) — freeze, instrumentation, isolation, run and reconciliation procedure.
- [Benchmark Series Isolation](benchmarks/BENCHMARK_SERIES_ISOLATION.md) — common D/S/T/H/E R0/R1/R2 concurrency contract.
- [Production Authority](architecture/PRODUCTION_AUTHORITY_CONTROL_PLANE.md) — durable + managed-runtime authority boundary.
- [A2A/MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md), [Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md), [P2 Final Acceptance](compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md).
- [NLWeb Interoperability](architecture/NLWEB_INTEROPERABILITY.md) — bounded pinned 0.5 profile and explicit application/data non-goals.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md).
- [Governance](../GOVERNANCE.md), [Security](../SECURITY.md), [Benchmark Evidence](benchmarks/README.md).

## Current factual headline

- Class C heterogeneous WAN — **ACCEPTED**.
- Class D-100 — **ACCEPTED**.
- Class D-200 — **ACCEPTED / PASS + repeatability confirmed**.
- Class D-500 — **ACTIVE QUALIFICATION / OPEN**; execution machinery and immutable launcher generations exist, but no accepted terminal PASS is claimed.
- Class D-1000 — **OPEN**.
- D-Series execution architecture — **Swarm diagnostics/repair → full B01–B16 exact-SHA admission → live/collision gates → exactly one real scale run**; durable lock tracked in issue #737.
- Semantic Scale S-Series — **EXECUTED / DIAGNOSTIC; NO ACCEPTED S PASS**. S-50 Attempt 13 is immutable failure evidence (`fast_socket_closed`) under bounded public WebSocket repair/qualification tracked in issue #726.
- Efficiency E-Series — **ACTIVE QUALIFICATION / NO FINAL E PASS**; qualification/isolation/provider-smoke work does not substitute for final DECOMPOSE/PER-RESULT/KNEE/DEGRADE evidence.
- Account → Organization → Tenant — **IMPLEMENTED / accepted**.
- durable grants/entitlements/accounting/revocation — **IMPLEMENTED / accepted**.
- managed authority repository/runtime support — **IMPLEMENTED / accepted**.
- managed provider accounting wiring — **IMPLEMENTED / accepted** for managed modes; live managed deployment/reconciliation evidence remains open.
- live managed authority deployment — **OPEN**.
- production SLI/SLO — **DEFINED**.
- observability + alerting — **IMPLEMENTED contracts**; live production evidence open.
- recovery/DR — **IMPLEMENTED contract**; live backup/restore evidence open.
- C1–C8 A2A/MCP — **ACCEPTED bounded profile**.
- P2-E1 / Sprint E — **ACCEPTED**.
- P2-E2 `a2a-mcp-pre-v1/g1` — **ACCEPTED**.
- P2-E3 canonical documentation reconciliation — **ACCEPTED / merged**.
- **Stable A2A/MCP v1 is not declared**; `TRUYN/1` remains draft.
- NLWeb interoperability — **BOUNDED PINNED 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN**.
- five first-party SDK clients + shared conformance — **IMPLEMENTED**.
- PyPI alpha + Go alpha + npm alpha.2 — **accepted immutable public releases**.
- npm alpha.1 — immutable historical artifact with failed required clean-room ESM import.
- Maven Central — **accepted immutable public release** (`org.truyn:truyn-sdk:0.1.0-alpha.1`); NuGet — **status reconciled independently**.
- Open 1.0 productization — **S01–S102 complete; S103 active; stable 1.0 not reached**.
- Production Trust Authority — **OPEN** unless/until separately accepted by canonical evidence.
- governance — **G1 / bootstrap Founding Stewardship**.
- stable mainnet — **not yet**.

Accepted D-200 evidence: [`benchmarks/CLASS_D_200_2026-09-20.md`](benchmarks/CLASS_D_200_2026-09-20.md). Operational scale status: [`operations/NETWORK_SCALE_STATUS.md`](operations/NETWORK_SCALE_STATUS.md).

## Status vocabulary

Current-state documents must distinguish:

- **implemented** — code/contracts exist and are test-covered;
- **exercised / diagnostic** — a real run happened but did not close the gate;
- **accepted** — immutable evidence satisfies the fixed acceptance contract;
- **open** — acceptance remains unclosed.

Do not infer PASS from a workflow, launcher, task branch, diagnostic run or merged implementation alone.

## Semantic Scale scope reminder

S-Series is the **live semantic-node** benchmark family. It reuses the accepted TRUYN network, provider and semantic retrieval paths and adds no second network architecture. The earlier `SEMANTIC_SCALE_GATE_V3` remains corpus/index-scale evidence and does not by itself prove S-50/100/200/500 with real heterogeneous inference.

S-Series has now been exercised. That does not mean it has passed. Current factual state is diagnostic/open until fresh exact-qualified acceptance evidence exists.

S-Series and D-Series have separate workflow/concurrency/resource/evidence namespaces. A S run may execute beside a D run only when capacity/quota and resource isolation prevent either benchmark from altering the other's result.

Repository ownership is split by behavior: public S-Series contains the reproducible benchmark architecture/methodology, public/reference runner surfaces and sanitized evidence; managed cloud orchestration, private/raw telemetry, credentials/quota/spend controls, proprietary routing/cost intelligence and production operations remain in private `inn-media/truyn-platform`.

## E-Series scope reminder

E-Series measures **efficiency limits**, not protocol correctness by proxy. It keeps frozen workload/provider/correctness rules across comparable cells and separates stage bottlenecks, cost/time/compute per useful result, the scale knee, and overload/recovery behavior.

Current qualification/provider-smoke activity must not be described as a final E result. Final E claims require immutable comparable evidence and independent reconciliation.

E can execute concurrently with D/S/T/H only through the common benchmark isolation contract. Read-only immutable dependencies are R0; shared services may be R1 only with distinct attribution and active interference detection; capacity/cache/index/fault mutation is R2-exclusive.

## NLWeb scope reminder

TRUYN's NLWeb track is interoperability-only: eligible endpoint discovery, `ask`/`who`, routing/relay, auth-policy passthrough, health/capability advertisement and bounded bridges with MCP/A2A. Crawling, ingestion, indexing, vector search, RAG corpus ownership, brand/publisher content, content rights, campaign data and Data Graph semantics remain outside the TRUYN NLWeb layer.

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns remain failures; accepted campaigns remain accepted. Diagnostics and open PRs never become acceptance merely because code exists. Merged repository/runtime support must not be overstated as live production evidence.

Benchmark evidence follows **redact-not-delete**. Raw logs containing private operational details stay in immutable Actions artifacts or private operational storage; public reports retain safe structured telemetry, artifact identity and cryptographic digests.
