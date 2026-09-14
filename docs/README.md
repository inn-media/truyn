# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-09-14  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual maturity/status.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next work.
- [HTTP / API Interoperability](architecture/HTTP_API_INTEROPERABILITY.md) — first-class HTTP/API interface architecture, current bounded implementation and HAPI completion gates.
- [A2A/MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md), [Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md), [P2 Final Acceptance](compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md).
- [NLWeb Interoperability](architecture/NLWEB_INTEROPERABILITY.md) — planned `ask`/`who` semantic-discovery/relay/bridge compatibility track and explicit application/data non-goals.
- [Production Authority](architecture/PRODUCTION_AUTHORITY_CONTROL_PLANE.md) — durable + managed-runtime authority boundary.
- [Managed Authority Runtime](operations/MANAGED_AUTHORITY_RUNTIME.md) — accepted repository/runtime support and live-deployment non-claims.
- [Production SLI/SLO](operations/PRODUCTION_SLO.md), [Operations](operations/README.md).
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md).
- [Governance](../GOVERNANCE.md), [Security](../SECURITY.md), [Benchmark Evidence](benchmarks/README.md).

## First-class interface model

TRUYN treats **HTTP/API, NLWeb, MCP and A2A** as peer first-class interoperability surfaces.

| Interface | Primary role |
|---|---|
| HTTP / REST API | classical programmatic request/response |
| NLWeb | natural-language discovery and information access |
| MCP | AI model invokes tools/resources |
| A2A | agent-to-agent interaction and task lifecycle |
| TRUYN | shared discovery, eligibility, routing and resilient delivery fabric |

Canonical positioning:

> **TRUYN connects services and agents across HTTP APIs, NLWeb, MCP and A2A through a shared discovery, routing and resilient delivery fabric.**

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
- HTTP/API interoperability — **FIRST-CLASS ARCHITECTURE DEFINED; bounded implementation exists** through generic HTTP provider, HTTP relay and HTTP adapter server; full generic REST method/path/schema interoperability remains open under HAPI gates.
- C1–C8 A2A/MCP — **ACCEPTED**.
- **P2-E1 / Sprint E** — **ACCEPTED** (`#427`).
- **P2-E2** `a2a-mcp-pre-v1/g1` — **ACCEPTED** (`#432`).
- **P2-E3** canonical documentation reconciliation — **ACCEPTED / merged** (`#459`).
- **Stable A2A/MCP v1 is not declared**; `TRUYN/1` remains draft.
- NLWeb interoperability — **PLANNED**; NW-0 architecture/boundary and `who` semantic-discovery role are defined, implementation/conformance is not yet accepted.
- five first-party SDK clients + shared conformance — **IMPLEMENTED**.
- PyPI alpha + Go alpha + npm alpha.2 — **accepted immutable public releases**.
- npm alpha.1 — immutable historical artifact with failed required clean-room ESM import.
- Maven Central / NuGet — **OPEN**.
- Production Trust Authority — **OPEN**; PR `#438` unmerged.
- governance — **G1 / bootstrap Founding Stewardship**.
- stable mainnet — **not yet**.

## HTTP/API scope reminder

TRUYN should be able to discover an HTTP/API capability, validate its interface constraints, route a bounded request and return a bounded response. The TRUYN core must not define application-domain meaning for routes or resources such as `/publishers`, `/licenses`, `/campaigns`, `/articles` or product-specific models.

Current bounded HTTP primitives are implementation foundations, not evidence of arbitrary REST support. See [HTTP / API Interoperability](architecture/HTTP_API_INTEROPERABILITY.md).

## NLWeb scope reminder

TRUYN's NLWeb track is interoperability-only: semantic `who` over native discovery, eligible endpoint selection, `ask`, routing/relay, auth-policy passthrough, health/capability advertisement and bounded bridges with MCP/A2A/HTTP where semantics can be preserved. Crawling, ingestion, indexing, vector search, RAG corpus ownership, brand/publisher content, content rights, campaign data and Data Graph semantics remain outside the TRUYN NLWeb layer.

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns remain failures; accepted campaigns remain accepted. Diagnostics and open PRs never become acceptance merely because code exists. Likewise, merged repository/runtime support must not be overstated as live production evidence.

Operational network-scale status: [operations/NETWORK_SCALE_STATUS.md](operations/NETWORK_SCALE_STATUS.md).
