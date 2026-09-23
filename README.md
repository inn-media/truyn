# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN provides signed agent identity, capability discovery, OFFER / NEED / RESULT exchange, relay/network transport, provider execution, semantic context retrieval, provenance, interoperability adapters and Trustability-oriented evidence surfaces.

Website: https://truyn.org/

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [NLWeb](docs/architecture/NLWEB_INTEROPERABILITY.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Benchmarks](docs/benchmarks/README.md) · [Security](SECURITY.md)

## Current factual status

**Documentation audit:** 2026-09-23  
**Audited public main:** `3a1f7e67b80cecf678d373e33db9ceb09098e8a4`  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**  
**Stable mainnet:** **not declared**

| Area | Current state |
|---|---|
| Class C WAN | **ACCEPTED / PASS** |
| Class D-100 | **ACCEPTED / PASS** |
| Class D-200 | **ACCEPTED / PASS + repeatability confirmed** |
| Class D-500 | **OPEN** — six immutable attempts exist; attempt 6 run `35787480348` ended `cancelled`, so no acceptance PASS is claimed |
| Class D-1000 | **OPEN** |
| S-Series | **IMPLEMENTATION / QUALIFICATION ACTIVE; NO S-SERIES PASS** |
| E-Series | **FOUNDATION + public validator/recompute IMPLEMENTED / QUALIFIED; NO E-BENCHMARK PASS** |
| Semantic retrieval | **Implemented and benchmark-proven on bounded published workloads** |
| Seven text-provider path | **Implemented / live-smoke and multi-actor evidence exists** |
| A2A/MCP | **Accepted bounded pre-v1 profile** |
| NLWeb | **Bounded pinned 0.5 profile implemented / executable-evidence proven** |
| Five first-party SDK clients | **Implemented / shared executable conformance** |
| npm / PyPI / Go prereleases | **Accepted immutable public releases** |
| Maven Central / NuGet | **OPEN publication gates** |
| Agent Descriptor | **Serving/fetch/signature + bounded automatic refresh/re-sign implemented; complete usable-interface parity still open** |
| Managed/commercial control plane | **Private `inn-media/truyn-platform`; public repo keeps contracts/reference seams only** |

The canonical status source is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Current D-scale execution status is [Network Scale Status](docs/operations/NETWORK_SCALE_STATUS.md). Measured evidence belongs in [docs/benchmarks](docs/benchmarks/README.md); historical reports are audit records and are not rewritten to match later state.

## Core boundary

TRUYN is open protocol/reference infrastructure. A public relay or public protocol does **not** make an owner's paid AI provider public. Authorization and billing authority remain server-side; provider credentials never become TRUYN discovery metadata.

Managed production authority, commercial entitlement/billing state, cloud orchestration, private topology and private/raw benchmark telemetry belong to `inn-media/truyn-platform`. Public TRUYN must not depend on private code.

## Interoperability

A2A, MCP, NLWeb and conventional REST/HTTP are interfaces around TRUYN; none replaces the TRUYN network or becomes authorization authority.

Accepted bounded A2A/MCP evidence includes **P2-E1** bidirectional referenced-artifact proof and **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1` (with P2-E3 canonical reconciliation). **Stable A2A/MCP v1 is not declared** while `TRUYN/1` remains draft. The NLWeb implementation is intentionally pinned to the accepted 0.5 profile; later upstream profiles require explicit compatibility work and requalification.

## SDK / developer experience

First-party clients exist for JavaScript/TypeScript, Python, Go, Java and C#/.NET and participate in one executable conformance path. Accepted public prereleases are:

- npm `@truyn/sdk@0.1.0-alpha.2`;
- PyPI `truyn-sdk==0.1.0a1`;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`.

Java and .NET implementations are present and conformance-aligned; Maven Central and NuGet publication evidence remain open.

The Agent Descriptor runtime can serve `/.well-known/truyn-agent.json` only by explicit opt-in. It is identity-signed, bounded by TTL, filtered to public capabilities, and now refreshes/re-signs before expiry. Descriptor metadata never grants provider authorization.

## Quick local verification

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

## Documentation truth order

1. `spec/protocol/v1/` — normative draft protocol semantics;
2. `docs/architecture/ARCHITECTURE_CONTRACT.md` — architecture invariants;
3. `docs/architecture/IMPLEMENTATION_STATUS.md` — canonical current factual state;
4. `docs/operations/NETWORK_SCALE_STATUS.md` — current D-scale operational state;
5. subsystem architecture / execution contracts;
6. `docs/benchmarks/` — immutable measured evidence ledger;
7. `ROADMAP.md` — next gates, never evidence by itself;
8. `README.md` / `docs/README.md` — summaries only.

If summary prose conflicts with accepted code/evidence, the summary must be corrected. Open PRs, launch intent, diagnostics and in-progress qualification are not PASS.

## License

Apache License 2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
