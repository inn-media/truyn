# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-09-20  
**Current synchronized source:** `main` at this documentation revision  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual maturity/status.
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
- [Managed Authority Runtime](operations/MANAGED_AUTHORITY_RUNTIME.md) — accepted repository/runtime support and live-deployment non-claims.
- [Production SLI/SLO](operations/PRODUCTION_SLO.md), [Operations](operations/README.md).
- [A2A/MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md), [Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md), [P2 Final Acceptance](compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md).
- [NLWeb Interoperability](architecture/NLWEB_INTEROPERABILITY.md) — bounded pinned 0.5 profile and explicit application/data non-goals.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md).
- [Governance](../GOVERNANCE.md), [Security](../SECURITY.md), [Benchmark Evidence](benchmarks/README.md).

## Current factual headline

- Class C heterogeneous WAN — **ACCEPTED**.
- Class D-100 — **ACCEPTED**.
- Class D-200 — **ACCEPTED / PASS** on immutable run `35503894414`, attempt 1; strict terminal marker `TRUYN_D200_TERMINAL result=PASS`.
- Class D-500 — **OPEN**.
- Class D-1000 — **OPEN**; D-200 acceptance does not imply the 1,000-process gate.
- Semantic Scale S-Series — **DEFINED / NOT YET EXECUTED**; S-50/100/200/500 remain open and do not inherit PASS from D-Series or earlier semantic corpus-scale gates.
- Efficiency E-Series — **FOUNDATION DEFINED / NOT YET EXECUTED**; E/DECOMPOSE, E/PER-RESULT, E/KNEE and E/DEGRADE have methodology/telemetry/execution contracts but no measured E PASS.
- Account → Organization → Tenant — **IMPLEMENTED / accepted** (`#425`).
- durable grants/entitlements/accounting/revocation — **IMPLEMENTED / accepted** (`#433` + `#456`).
- managed authority repository/runtime support — **IMPLEMENTED / accepted** (`#457`).
- managed provider accounting wiring — **IMPLEMENTED / accepted** (`#463`) for `sponsored`/`prepaid`/`subscription`; live managed deployment/reconciliation evidence remains open.
- live managed authority deployment — **OPEN**: no accepted proof yet of provisioned Cosmos, multi-region writes, continuous backup, production migration/cutover or restore/failover drill.
- production SLI/SLO — **DEFINED** (`#424`).
- observability + alerting — **IMPLEMENTED** (`#434`); live production evidence open.
- rotation/on-call — **IMPLEMENTED contracts** (`#440`); live drills/roster open.
- recovery/DR — **IMPLEMENTED contract** (`#441`); live backup/restore evidence open.
- C1–C8 A2A/MCP — **ACCEPTED**.
- **P2-E1 / Sprint E** — **ACCEPTED** (`#427`).
- **P2-E2** `a2a-mcp-pre-v1/g1` — **ACCEPTED** (`#432`).
- **P2-E3** canonical documentation reconciliation — **ACCEPTED / merged** (`#459`).
- **Stable A2A/MCP v1 is not declared**; `TRUYN/1` remains draft.
- NLWeb interoperability — **BOUNDED PINNED 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN**.
- five first-party SDK clients + shared conformance — **IMPLEMENTED**.
- PyPI alpha + Go alpha + npm alpha.2 — **accepted immutable public releases**.
- npm alpha.1 — immutable historical artifact with failed required clean-room ESM import.
- Maven Central / NuGet — **OPEN**.
- Production Trust Authority — **OPEN**; PR `#438` unmerged.
- governance — **G1 / bootstrap Founding Stewardship**.
- stable mainnet — **not yet**.

Accepted D-200 evidence: [`benchmarks/CLASS_D_200_2026-09-20.md`](benchmarks/CLASS_D_200_2026-09-20.md). Operational scale status: [`operations/NETWORK_SCALE_STATUS.md`](operations/NETWORK_SCALE_STATUS.md).

## Semantic Scale scope reminder

S-Series is the **live semantic-node** benchmark family. It intentionally reuses the accepted TRUYN network, provider and semantic retrieval paths and adds no second network architecture. The earlier `SEMANTIC_SCALE_GATE_V3` remains corpus/index-scale evidence and does not by itself prove S-50/100/200/500 with real heterogeneous inference.

S-Series and D-Series have separate workflow/concurrency/resource/evidence namespaces. A S run may execute beside a D run only when capacity/quota and resource isolation prevent either benchmark from altering the other's result.

Repository ownership is split by behavior: public S-Series contains the reproducible benchmark architecture/methodology, public/reference runner surfaces and sanitized evidence; managed cloud orchestration, private/raw telemetry, credentials/quota/spend controls, proprietary routing/cost intelligence and production operations remain in private `inn-media/truyn-platform`. See [S-Series Open/Private Boundary](architecture/S_SERIES_OPEN_PRIVATE_BOUNDARY.md).

## E-Series scope reminder

E-Series measures **efficiency limits**, not protocol correctness by proxy. It keeps the same frozen workload/provider/correctness rules across comparable cells and separates four questions: stage bottlenecks, cost/time/compute per useful result, the scale knee, and overload/recovery behavior.

E can execute concurrently with D/S/T/H only through the common benchmark isolation contract. Read-only immutable dependencies are R0; shared services such as provider endpoints may be R1 only with distinct attribution and active interference detection; capacity/cache/index/fault mutation is R2-exclusive.

Public E documentation owns formulas, metric semantics and sanitized evidence. Exact resource names, cloud topology, quotas/capacity, net billing, run budgets, leases and raw traces stay in private `inn-media/truyn-platform`.

## NLWeb scope reminder

TRUYN's NLWeb track is interoperability-only: eligible endpoint discovery, `ask`/`who`, routing/relay, auth-policy passthrough, health/capability advertisement and bounded bridges with MCP/A2A. Crawling, ingestion, indexing, vector search, RAG corpus ownership, brand/publisher content, content rights, campaign data and Data Graph semantics remain outside the TRUYN NLWeb layer.

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns remain failures; accepted campaigns remain accepted. Diagnostics and open PRs never become acceptance merely because code exists. Likewise, merged repository/runtime support must not be overstated as live production evidence.

Raw diagnostic logs that can carry operational details stay in immutable Actions artifacts. Public reports retain sanitized structured telemetry, artifact identity and cryptographic digests.
