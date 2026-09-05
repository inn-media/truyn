# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-09-05  
**Current synchronized source:** `main@abd6bd95ecad8dc8d82bbf6d2983d96df80267d3`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual maturity/status.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next work.
- [Production Authority](architecture/PRODUCTION_AUTHORITY_CONTROL_PLANE.md) — durable + managed-runtime authority boundary.
- [Managed Authority Runtime](operations/MANAGED_AUTHORITY_RUNTIME.md) — accepted repository/runtime support and live-deployment non-claims.
- [Production SLI/SLO](operations/PRODUCTION_SLO.md), [Operations](operations/README.md).
- [A2A/MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md), [Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md), [P2 Final Acceptance](compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md).
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md).
- [Governance](../GOVERNANCE.md), [Security](../SECURITY.md), [Benchmark Evidence](benchmarks/README.md).

## Current factual headline

- Class C heterogeneous WAN — **ACCEPTED**.
- Class D-100 — **ACCEPTED**.
- Class D-1000 — **OPEN**; canonical full pinned campaign remains failed.
- post-#458 D-200 run `33959493680` — **IN PROGRESS**, not PASS.
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
- five first-party SDK clients + shared conformance — **IMPLEMENTED**.
- PyPI alpha + Go alpha — **accepted immutable public releases**.
- npm alpha.1 — immutable historical artifact with failed required clean-room ESM import.
- npm alpha.2 — packaging repair **merged in #448**; immutable public registry/provenance/clean-room acceptance evidence remains gated.
- Maven Central / NuGet — **OPEN**.
- Production Trust Authority — **OPEN**; PR `#438` unmerged.
- governance — **G1 / bootstrap Founding Stewardship**.
- stable mainnet — **not yet**.

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns remain failures; accepted campaigns remain accepted. Diagnostics and open PRs never become acceptance merely because code exists. Likewise, merged repository/runtime support must not be overstated as live production evidence.
