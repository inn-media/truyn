# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`.

**Snapshot:** 2026-09-20  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**

## Current top-level state

| Track | Current state | Immediate next gate |
|---|---|---|
| Network | **Class C + D-100 accepted** | external D-scale qualification continues independently |
| Production operations | **contracts implemented** | live evidence |
| Provider authority | **repository/runtime semantics accepted** | live managed deployment evidence |
| A2A/MCP | **C1–C8 + P2-E1/E2/E3 accepted** | stable-v1 only after stable TRUYN + ecosystem evidence |
| NLWeb | **BOUNDED PINNED 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN** | qualify and merge canonical profile head; later profiles require explicit requalification |
| SDK/DX | **Five clients/conformance implemented; PyPI + Go + npm alpha.2 accepted** | Maven/NuGet + Descriptor/site completeness |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers → multi-org TSC → neutral stewardship |
| Mainnet | **Not productionized** | external qualification + live ops + release/governance gates |

## A2A / MCP

Accepted bounded profile includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 referenced artifacts, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared** because `TRUYN/1` remains draft.

## NLWeb interoperability and semantic discovery

NLWeb is an external interoperability profile around TRUYN, alongside A2A and MCP. It is **not** a TRUYN transport replacement and does not become a `TRUYN/1` wire dependency.

Accepted Open 1.0 scope is pinned to NLWeb protocol **0.5** at exact upstream source `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

```text
NLWeb WHO
   ↓
TRUYN semantic/native discovery
   ↓
authorized + eligible providers / agents / endpoints
   ↓
deterministic public/reference selection
   ↓
NLWeb ASK
   ↓
TRUYN authority / routing / relay / execution
```

Canonical principle:

> **NLWeb provides semantic discovery and interaction semantics; TRUYN provides distributed discovery, eligibility filtering, selection, execution and transport.**

Development sequence:

- [x] **NW-0 — Architecture/boundary:** public interoperability edge, semantic WHO over TRUYN, application/data concerns outside TRUYN, exact upstream pin;
- [x] **NW-1 — Adapter core:** bounded client/provider contracts, exact profile negotiation and request/response/error/correlation normalization;
- [x] **NW-2 — Semantic discovery/advertisement:** authorization-aware eligible discovery, capability/profile handling and deterministic public/reference selection;
- [x] **NW-3 — `who → selection → ask`:** eligible candidate selection, canonical authority before dispatch, structured response/provenance/correlation preservation;
- [x] **NW-4 — Routing/relay/security:** fail-closed negotiation, private-provider invisibility and zero unauthorized execution invariants;
- [x] **NW-5 — Bridge profiles:** claimed NLWeb/TRUYN/MCP/A2A mappings tested; unsupported/lossy mappings remain explicit failures/non-claims;
- [x] **NW-6 — External conformance:** independent pinned-profile NLWeb black-box run `35487917472` attempt 1 SUCCESS against exact qualified SUT `a28cba182b9cddde34bc34894180d14cfa166d2b`.

TRUYN Open retains deterministic/reference selection so this profile is useful without the private platform. Any private managed ranking is an optimization over an already eligible candidate set and never an authorization source.

Explicit non-goals: crawler/ingestion implementation, indexing, vector search, RAG corpus ownership, brand/news/product content models, publisher/content rights, advertising/campaign data and Data Graph business semantics.

The accepted claim is bounded to the pinned 0.5 profile. Stable NLWeb v1 and later upstream profiles are not claimed and require explicit compatibility work plus executable requalification.

## SDK / developer release

Implemented: TypeScript/JavaScript, Python, Go, Java and C#/.NET clients with shared conformance. Accepted immutable releases include PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2`. Maven Central and NuGet remain open.

## Stable/mainnet gate

Stable/mainnet remains gated by the separately defined external D-scale/security/reliability qualification, live production operations/authority evidence, stable protocol/ecosystem compatibility, complete stable SDK/Descriptor/site evidence and appropriate governance maturity. NLWeb 0.5 bounded interoperability acceptance does not by itself declare stable TRUYN or mainnet.

Operational network-scale status remains delegated to [docs/operations/NETWORK_SCALE_STATUS.md](docs/operations/NETWORK_SCALE_STATUS.md).
