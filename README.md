# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a logical network for agent-to-agent communication, decentralized AI, capability discovery, content-addressed objects/state, provider execution, provenance and contextual Trustability.

Website: https://truyn.org/

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md) · [Cross-Repo Routing](docs/architecture/CROSS_REPO_TASK_ROUTING.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [NLWeb](docs/architecture/NLWEB_INTEROPERABILITY.md) · [P2 Final Acceptance](docs/compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md)

## Current factual status

**Snapshot:** 2026-09-20  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

| Area | Current state |
|---|---|
| Class C WAN | **Accepted / PASS** |
| Class D-100 | **Accepted / PASS** |
| Account → Organization → Tenant | **Implemented / accepted; managed implementation owned by TRUYN Platform** |
| Managed authority runtime/accounting | **Implemented / accepted in TRUYN Platform; public repository exposes contracts/reference seams only** |
| Managed authority live production deployment | **OPEN** |
| SLI/SLO | **Defined** |
| Observability / alerting | **Implemented contracts; live evidence open** |
| Rotation / on-call | **Implemented contracts; live drills/roster open** |
| Recovery / DR | **Implemented contract; live backup/restore evidence open** |
| A2A/MCP C1–C8 + P2-E1/E2/E3 | **Accepted bounded profile** |
| NLWeb interoperability | **Bounded pinned NLWeb 0.5 profile implemented / executable-evidence proven** |
| Five first-party SDK clients | **Implemented / executable conformance** |
| PyPI / Go / npm alpha.2 | **Accepted immutable public releases** |
| Maven Central / NuGet | **OPEN** |
| Stable mainnet | **Not yet** |

The canonical factual source is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Operational D-scale status remains delegated to [Network Scale Status](docs/operations/NETWORK_SCALE_STATUS.md).

## Authority boundary

TRUYN authority comes from authenticated identity plus authoritative account/tenant/provider/grant/entitlement state. Requester/provider metadata is not authority. Managed production authority and commercial control-plane implementation belong to private `inn-media/truyn-platform`; public TRUYN retains open protocol/reference behavior, contracts and conformance. Public code never depends on private code.

## A2A + MCP + TRUYN

Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 bidirectional referenced-artifact proof, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb + TRUYN

TRUYN Open now implements a **bounded pinned NLWeb 0.5 interoperability profile** against exact upstream `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

The accepted surface covers authorization-aware semantic WHO discovery over eligible TRUYN candidates, deterministic public/reference selection, WHO→ASK composition through canonical TRUYN authority/dispatch, exact profile negotiation, structured correlation/provenance preservation, private-provider invisibility, fail-closed unsupported profiles and explicitly tested bounded bridge mappings. Independent external black-box run `35487917472` completed SUCCESS against the exact qualified implementation.

This is not a stable NLWeb-v1 claim and does not make NLWeb a TRUYN transport or `TRUYN/1` dependency. Crawling/ingestion, indexing, vector search, RAG corpus ownership, publisher/content rights, advertising/campaign data and Data Graph business semantics remain outside the TRUYN NLWeb layer. See [NLWeb Interoperability Architecture](docs/architecture/NLWEB_INTEROPERABILITY.md).

## SDK / developer experience

TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party clients participate in shared executable conformance. PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2` are accepted immutable public releases. Maven Central and NuGet remain open.

## Quick local verification

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

## Documentation order

1. `spec/protocol/v1/` — normative TRUYN/1 semantics;
2. `docs/architecture/ARCHITECTURE_CONTRACT.md` — architecture invariants;
3. `docs/architecture/OPEN_PRIVATE_BOUNDARY.md` — repository ownership/dependency boundary;
4. `docs/architecture/CROSS_REPO_TASK_ROUTING.md` — OPEN / PRIVATE / BOTH routing contract;
5. `docs/architecture/IMPLEMENTATION_STATUS.md` — current factual maturity;
6. `docs/architecture/NLWEB_INTEROPERABILITY.md` — accepted bounded NLWeb 0.5 profile and evidence boundary;
7. `docs/compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md` — P2 evidence;
8. `docs/benchmarks/` — accepted/failed measured evidence;
9. `ROADMAP.md` — next gates.

Historical issues/PRs/docs remain audit history and do not override later accepted evidence.

## License

Apache License 2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
