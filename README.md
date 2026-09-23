# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a logical network for agent-to-agent communication, decentralized AI, capability discovery, content-addressed objects/state, provider execution, provenance and contextual Trustability.

Website: https://truyn.org/

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md) · [Cross-Repo Routing](docs/architecture/CROSS_REPO_TASK_ROUTING.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [NLWeb](docs/architecture/NLWEB_INTEROPERABILITY.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md)

## Current factual status

**Snapshot:** 2026-09-23  
**Snapshot main:** `eb25f0f8ad5bedb643f007ddfb0da107dab44b89`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

| Area | Current state |
|---|---|
| Class C WAN | **Accepted / PASS** |
| Class D-100 | **Accepted / PASS** |
| Class D-200 | **Accepted / PASS; repeatability confirmed** |
| Class D-500 | **Active qualification / OPEN; no accepted terminal PASS** |
| Class D-1000 | **OPEN** |
| Semantic Scale S-Series | **Executed diagnostically; no accepted S PASS** |
| Efficiency E-Series | **Active qualification; no final E PASS claimed** |
| Account → Organization → Tenant | **Implemented / accepted; managed implementation owned by TRUYN Platform** |
| Managed authority runtime/accounting | **Implemented / accepted in TRUYN Platform; public repository exposes contracts/reference seams only** |
| Managed authority live production deployment | **OPEN** |
| A2A/MCP C1–C8 + P2-E1/E2/E3 | **Accepted bounded profile** |
| NLWeb interoperability | **Bounded pinned NLWeb 0.5 profile implemented / executable-evidence proven** |
| Five first-party SDK clients | **Implemented / executable conformance** |
| PyPI / Go / npm alpha.2 | **Accepted immutable public releases** |
| Maven Central | **OPEN** |
| NuGet.org `Truyn.Sdk 0.1.0-alpha.1` | **Accepted immutable public release** |
| Open 1.0 productization | **S01–S102 complete; S103 active; stable 1.0 not reached** |
| Governance | **G1 / bootstrap Founding Stewardship** |
| Stable mainnet | **Not yet** |

The canonical factual source is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Operational D-scale status remains delegated to [Network Scale Status](docs/operations/NETWORK_SCALE_STATUS.md). The latest documentation reconciliation is recorded in [Documentation Sanitation — 2026-09-23](docs/operations/DOCUMENTATION_SANITATION_2026-09-23.md).

### Status vocabulary

Repository documentation distinguishes:

- **implemented** — code/contracts exist and are test-covered;
- **exercised / diagnostic** — a real run happened but did not close the gate;
- **accepted** — immutable evidence satisfies the fixed acceptance contract;
- **open** — the acceptance boundary is not closed.

A failed/diagnostic attempt is evidence, not PASS.

## Current scale boundaries

D-200 is accepted and repeatability-confirmed. D-500 has dedicated qualification/launcher machinery and is actively being qualified, but remains OPEN until a fresh D-500 campaign emits its own terminal PASS and durable evidence. D-1000 remains separate.

S-Series has been exercised at S-50. Durable diagnostic state records a real 50-actor failure (`fast_socket_closed`) under repair/qualification; therefore the old wording “not yet executed” is obsolete. No S-50/S-100/S-200/S-500 PASS is currently claimed.

E-Series has active qualification/isolation/provider-smoke work. No final E/DECOMPOSE, E/PER-RESULT, E/KNEE or E/DEGRADE result is claimed.

## Authority boundary

TRUYN authority comes from authenticated identity plus authoritative account/tenant/provider/grant/entitlement state. Requester/provider metadata is not authority. Managed production authority and commercial control-plane implementation belong to private `inn-media/truyn-platform`; public TRUYN retains open protocol/reference behavior, contracts and conformance. Public code never depends on private code.

## A2A + MCP + TRUYN

Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 bidirectional referenced-artifact proof, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb + TRUYN

TRUYN Open implements a **bounded pinned NLWeb 0.5 interoperability profile** against exact upstream `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

The accepted surface covers authorization-aware semantic WHO discovery over eligible TRUYN candidates, deterministic public/reference selection, WHO→ASK composition through canonical TRUYN authority/dispatch, exact profile negotiation, structured correlation/provenance preservation, private-provider invisibility, fail-closed unsupported profiles and explicitly tested bounded bridge mappings.

This is not a stable NLWeb-v1 claim and does not make NLWeb a TRUYN transport or `TRUYN/1` dependency. Crawling/ingestion, indexing, vector search, RAG corpus ownership, publisher/content rights, advertising/campaign data and Data Graph business semantics remain outside the TRUYN NLWeb layer.

## SDK / developer experience

TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party clients participate in shared executable conformance. PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2` are accepted immutable public releases. Maven Central remains open; NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease.

Open 1.0 productization is still in progress. The durable task anchor records S01–S102 complete and S103 active; stable Open 1.0 is not declared until the remaining sequence and final independent reconciliation close.

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
5. `docs/operations/NETWORK_SCALE_STATUS.md` — current D-Series operational acceptance;
6. `docs/architecture/IMPLEMENTATION_STATUS.md` — repository-wide factual maturity;
7. `docs/operations/DOCUMENTATION_SANITATION_2026-09-23.md` — latest repository-wide documentation reconciliation;
8. `docs/benchmarks/` — immutable accepted/failed measured evidence;
9. `ROADMAP.md` — next gates.

Historical issues/PRs/docs remain audit history and do not override later accepted evidence. Historical benchmark evidence is append-only under the repository **redact-not-delete** policy.

## License

Apache License 2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
