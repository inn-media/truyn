# TRUYN Architecture Contract

This document prevents architecture, implementation status, public documentation, governance and benchmark evidence from silently diverging.

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@abd6bd95ecad8dc8d82bbf6d2983d96df80267d3`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Source ownership

- `spec/protocol/<generation>/` — normative protocol semantics.
- `proto/<generation>/` — machine-readable wire schema.
- `GOVERNANCE.md` + `docs/governance/` — normative change process.
- this document + subsystem architecture files — architecture invariants.
- `IMPLEMENTATION_STATUS.md` — current factual maturity.
- `docs/benchmarks/` — measured accepted/failed evidence.
- `ROADMAP.md` — sequencing and next gates.

Accepted `main` evidence overrides stale current-status prose. Historical evidence remains historical.

## Identity and authority

TRUYN authority comes from authenticated/signed identities plus server-side authority state. Requester/provider payload metadata, A2A/MCP/NLWeb metadata and transport credentials are never implicit account, tenant, provider-owner, entitlement or billing authority.

Accepted authority layers:

1. PR `#425` — Account → Organization → Tenant hierarchy, scoped memberships/roles and authoritative node/provider bindings;
2. PR `#433` + `#456` — durable single-filesystem provider grants, entitlements, atomic accounting and terminal revocation;
3. PR `#457` — managed authority repository/runtime support: Cosmos DB NoSQL checkpoint adapter using managed identity/AAD, checkpoint digest/source/revision, optimistic ETag fencing, digest-bound bootstrap, private authority role/API, monotonic relay snapshot cache and fail-closed staleness/readiness integration;
4. PR `#463` — managed provider accounting wiring: managed `sponsored`, `prepaid`, and `subscription` modes await authoritative reserve before provider execution and authoritative reconcile/release on success, failure or cancellation; `owner-funded` and `byok` preserve local/private semantics.

Layers 3–4 are repository/runtime acceptance, not live production acceptance. Provisioning, multi-region writes, continuous backup, production migration/cutover, restore/failover drills, deployed operational controls and long-window reconciliation evidence remain deployment gates.

## Authorization / billing / revocation

Provider compatibility, visibility, authorization and billing are separate decisions. Execution-capable surfaces converge on the same authoritative provider/access/billing boundary before side effects. Requester metadata cannot assign ownership or billing responsibility. Chargeable managed paths reserve durable usage before execution and reconcile/release after terminal outcome; authoritative reconcile failure cannot be converted into a successful unpaid terminal result.

Production Trust Authority is separate. PR `#438` remains unmerged, so its delegated roots/rotation/revocation/transparency behavior is not accepted main fact yet.

## A2A / MCP interoperability

A2A and MCP are adapters, not TRUYN/1 wire dependencies. Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, **P2-E1 / Sprint E** referenced-artifact interoperability, **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1`, and **P2-E3** canonical documentation reconciliation in PR `#459`.

Accepted artifact translation requires explicit resolution, bounded content, exact digest/byte-size checks, no implicit arbitrary URL fetch and authoritative TRUYN provenance. Polling/retry/fallback must not duplicate remote application side effects.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb interoperability

NLWeb is a planned external interoperability edge, not a TRUYN transport primitive and not a `TRUYN/1` wire dependency. The canonical planned architecture is `NLWEB_INTEROPERABILITY.md`.

The public/open scope is limited to compatibility mechanics: client/provider adapters, eligible endpoint discovery, `ask`/`who` support for an explicitly pinned upstream profile, routing/relay, auth-policy passthrough, health/capability advertisement and explicit bounded bridges with MCP/A2A where semantics can be preserved.

NLWeb metadata is non-authoritative. It cannot assign account, tenant, provider ownership, entitlement or billing responsibility. Endpoint reachability cannot imply execution permission. Unauthorized NLWeb-originated work must cause zero provider execution.

TRUYN does not own the NLWeb application/data layer. Crawling/ingestion, indexing, vector search, RAG corpus ownership, brand/news/product content, publisher/content rights, campaign data and Data Graph business semantics remain outside this interoperability contract.

No NLWeb compatibility claim is accepted until an exact upstream profile/version is pinned and executable conformance/black-box evidence closes the corresponding roadmap gates.

## Network scale

Class C and D-100 are accepted. D-1000 is not. PR `#458` repairs target-readiness/transport establishment without weakening strict D-scale thresholds. Fresh D-200 run `33959493680` remains in progress and cannot be promoted to PASS until its unchanged predicates terminate green.

## Production operations

The repository implements numerical SLI/SLO (`#424`), observability/alerts (`#434`), rotation/on-call (`#440`) and recovery/DR (`#441`) contracts. Productionized status still requires real deployed telemetry/probes/pager/roster, live rotation/restore evidence and durable 28-day SLO evidence.

## SDK / DX

Five first-party SDKs, shared conformance, direct NEED cancellation, signed generic `PARTIAL`, object/artifact references and bounded Agent Descriptor valid-profile verification are implemented. PyPI, Go and npm alpha.2 public alphas are accepted immutable releases. npm alpha.1 is immutable historical evidence whose required clean-room Node 22 ESM import failed and is superseded without overwrite. Maven Central and NuGet remain open.

## Governance

Current governance is G1 public-process/bootstrap Founding Stewardship. Neutral-governance maturity must be demonstrated before it is claimed.

## Status update discipline

A material accepted subsystem change should update current-status prose in the same release window. Open PRs remain candidates; merged repository/runtime support must not be overstated as live production evidence; historical benchmark/changelog/acceptance records remain audit history.

Operational network-scale status: [../operations/NETWORK_SCALE_STATUS.md](../operations/NETWORK_SCALE_STATUS.md).
