# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a logical network for agent-to-agent communication, decentralized AI, capability discovery, content-addressed objects/state, provider execution, provenance and contextual Trustability.

Website: https://truyn.org/

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md) · [Cross-Repo Routing](docs/architecture/CROSS_REPO_TASK_ROUTING.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [NLWeb](docs/architecture/NLWEB_INTEROPERABILITY.md) · [P2 Final Acceptance](docs/compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md)

## Current factual status

**Snapshot:** 2026-09-09  
**Synchronized source:** `main@4a3a312877d14e9f0ee361a9356e7369cad04398`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

| Area | Current state |
|---|---|
| Class C WAN | **Accepted / PASS** |
| Class D-100 | **Accepted / PASS** |
| Class D-1000 | **OPEN — canonical full pinned campaign remains FAIL** |
| Post-#458 D-200 | **Run `33959493680` in progress; not a PASS** |
| Account → Organization → Tenant | **Implemented / accepted — #425; managed implementation now owned by TRUYN Platform** |
| Durable single-filesystem Production Authority | **Historical public acceptance — #433 + #456; managed implementation migrated to TRUYN Platform** |
| Managed authority runtime support | **Implemented / accepted in TRUYN Platform; public repository exposes contracts/reference seams only** |
| Managed provider accounting wiring | **Implemented / accepted in TRUYN Platform; public repository retains open-edge/reference behavior only** |
| Managed authority live production deployment | **OPEN — no accepted proof yet of provisioned Cosmos, multi-region writes, live migration/cutover or restore acceptance** |
| SLI/SLO | **Defined — #424** |
| Observability / alerting | **Implemented — #434; live evidence open** |
| Rotation / on-call | **Implemented contracts — #440; live drills/roster open** |
| Recovery / DR | **Implemented contract — #441; live backup/restore evidence open** |
| Production Trust Authority | **OPEN — #438 unmerged** |
| A2A/MCP C1–C8 | **Accepted** |
| P2-E1 / Sprint E | **Accepted — #427** |
| P2-E2 / `a2a-mcp-pre-v1/g1` | **Accepted — #432** |
| P2-E3 canonical reconciliation | **Accepted / merged — #459** |
| NLWeb interoperability | **Planned — NW-0 architecture/boundary defined; no compatibility claim yet** |
| Five first-party SDK clients | **Implemented / executable conformance** |
| PyPI alpha | **Accepted public immutable release** |
| Go alpha | **Accepted public immutable release** |
| npm alpha.1 | **Immutable historical artifact; clean-room Node 22 ESM import failed** |
| npm alpha.2 | **Accepted public immutable release** |
| Maven Central / NuGet | **OPEN** |
| Stable mainnet | **Not yet** |

The canonical factual source is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md).

## Authority boundary

TRUYN authority comes from authenticated identity plus authoritative account/tenant/provider/grant/entitlement state. Requester/provider fields such as `ownerId`, `tenantId` or billing metadata are not authority.

Historical public PRs `#425`, `#433`, `#456`, `#457`, and `#463` established authority and managed-accounting semantics. The managed production authority, managed control plane, Cosmos-backed persistence, commercial entitlement/accounting/billing implementation, and hosted authority runtime now live in the private `inn-media/truyn-platform` repository. This public repository retains protocol/open-edge behavior, public contracts and conformance, Node/Relay reference behavior, generic provider/BYOK/owner-funded behavior, and explicit managed extension seams. For managed `sponsored`, `prepaid`, and `subscription` modes, the accepted behavior still requires authoritative reserve before provider execution and awaited reconcile/release on success, failure or cancellation; the repository split changes ownership, not those semantics. These repository/runtime acceptances do **not** prove provisioned Cosmos, multi-region writes, continuous backup, production migration/cutover or restore/failover acceptance.

The permanent dependency rule is documented in [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md): public code never depends on private code; private code consumes only accepted immutable released/versioned public artifacts or explicitly pinned immutable public contracts.

## A2A + MCP + TRUYN

Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, **P2-E1 / Sprint E** bidirectional referenced-artifact proof and **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1`. **P2-E3** in PR `#459` reconciles canonical status docs and adds a regression guard.

Sprint E uses deterministic `interop-proof.bin` (`29` bytes, SHA-256 `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`) with explicit-only resolution and fail-closed size/digest verification.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb + TRUYN

NLWeb is now an explicit **planned interoperability track**. TRUYN should be able to discover eligible NLWeb-compatible endpoints, connect to them, route/relay bounded requests, support `ask` and `who` at the interoperability edge for a pinned upstream profile, pass authorization/policy through the normal TRUYN authority boundary, advertise health/capabilities, and provide bounded bridge profiles with MCP/A2A where semantics can be preserved.

NLWeb does **not** become a TRUYN transport protocol or a `TRUYN/1` dependency. TRUYN should transport and interoperate with NLWeb, not absorb the NLWeb application/data stack.

Therefore crawling/ingestion, indexing, vector search, RAG corpus ownership, brand/news/product content, publisher/content rights, campaign data and Data Graph business semantics are explicitly outside the TRUYN NLWeb layer.

Current status is architecture/roadmap only: **no NLWeb compatibility claim is accepted yet**. See [NLWeb Interoperability Architecture](docs/architecture/NLWEB_INTEROPERABILITY.md) and the NW-0→NW-6 development gates in [ROADMAP.md](ROADMAP.md).

## SDK / developer experience

TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party clients participate in shared executable conformance.

- PyPI `truyn-sdk==0.1.0a1` — accepted immutable public release;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` — accepted immutable public release;
- npm `@truyn/sdk@0.1.0-alpha.1` — immutable historical artifact whose required clean-room Node 22 ESM import failed;
- npm `@truyn/sdk@0.1.0-alpha.2` — accepted immutable public release with verified registry byte identity, provenance/signature evidence and independent clean-room Node 22 ESM import;
- Java Maven Central — open;
- .NET NuGet — open.

Agent Descriptor automatic refresh/re-sign, full endpoint-validation parity, archive-member content scanning and live developer-site liveness remain open.

## Network maturity

The canonical negative D-1000 record remains run `32869078719` on source `0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094` (issue `#344`). PR `#458` repairs target-readiness/transport establishment without weakening strict D-scale thresholds or exactly-once application dispatch. Fresh D-200 run `33959493680` is evidence in flight, not a PASS.

## Trustability

Bounded Trustability is implemented. Production Trust Authority is not accepted on current main because PR `#438` remains open. Multi-region dissemination, transparency witnesses and measured WAN revocation propagation remain later production gates.

## Governance / settlement

Governance remains G1 public-process/bootstrap Founding Stewardship. TRUYN/1 remains settlement-neutral. x402/AP2 are future optional adapters and cannot become authorization sources.

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
6. `docs/architecture/NLWEB_INTEROPERABILITY.md` — planned NLWeb interoperability boundary and development gates;
7. `docs/compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md` — P2 evidence;
8. `docs/benchmarks/` — accepted/failed measured evidence;
9. `ROADMAP.md` — next gates.

Historical issues/PRs/docs remain audit history and do not override later accepted main evidence.

## License

Apache License 2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Operational network-scale status: [docs/operations/NETWORK_SCALE_STATUS.md](docs/operations/NETWORK_SCALE_STATUS.md).
