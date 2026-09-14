# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`.

**Snapshot:** 2026-09-09  
**Synchronized source:** `main@4a3a312877d14e9f0ee361a9356e7369cad04398`  
**P2-E1 / Sprint E:** accepted / PR `#427`  
**P2-E2:** `a2a-mcp-pre-v1/g1` accepted / PR `#432`  
**P2-E3:** canonical reconciliation merged / PR `#459`  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**

## Current top-level state

| Track | Current state | Immediate next gate |
|---|---|---|
| Network | **Class C + D-100 accepted** | complete post-#458 D-200 acceptance, then strict D-1000 |
| D-1000 | **OPEN; canonical full campaign remains FAIL** | one exact pinned 20×50 PASS |
| Production operations | **SLO/observability/alerting/rotation/on-call/DR contracts implemented** | live backends/probes/pager/roster/drills + 28-day evidence |
| Provider authority | **Durable authority + managed runtime + managed provider accounting wiring accepted** | provisioned/live managed deployment, migration/cutover, multi-region/backup/restore/propagation/reconciliation evidence |
| Trustability | **Bounded implementation accepted** | Production Trust Authority; PR `#438` remains open |
| A2A/MCP | **C1–C8 + P2-E1/E2/E3 accepted** | stable-v1 only after stable TRUYN + stable ecosystem evidence |
| NLWeb | **PLANNED; `who` defined as semantic discovery surface over TRUYN** | NW-1 adapter core + exact upstream profile/version pin |
| SDK/DX | **Five clients/conformance implemented; PyPI + Go + npm alpha.2 accepted** | Maven/NuGet + Descriptor/site completeness |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers → multi-org TSC → neutral stewardship |
| Mainnet | **Not productionized** | D-1000 + live ops + live managed authority + stable/release/governance gates |

## Network productionization

Class C and D-100 are accepted. The canonical D-1000 negative record remains source `0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094`, run `32869078719`, issue `#344`.

PR `#458` repairs target discovery/readiness and bounded transient QUIC establishment without weakening `>=99%` routing, `<=120s` recovery or exactly-once application dispatch. Fresh D-200 run `33959493680` against verified source `6f64c3dc6333044126916d3dd0a118e3cf8220d4` is currently **IN PROGRESS**. It is evidence in flight, not a PASS.

Strict D-1000 still requires 20×50 real nodes, baseline/healed routing `>=99%`, recovery p95 `<=120s`, all adversarial/safety predicates, evaluator PASS, terminal PASS, `cleanup=true`, `remainingResources=0`, immutable artifact/digest and durable accepted evidence.

## Production operations

Implemented repository/runtime contracts:

- [x] numerical SLI/SLO + 28-day error-budget model (`#424`);
- [x] metrics/traces/structured logs/dashboards + alert rules (`#434`);
- [x] security rotation + PRIMARY/SECONDARY on-call (`#440`);
- [x] recovery/DR contract (`#441`).

Still open: real telemetry backends/probes/retention, pager delivery/test-fire, private roster, live rotation/restore drills and durable 28-day production SLO evidence.

## Provider security / Production Authority

Accepted:

- [x] Account → Organization → Tenant hierarchy and authoritative bindings (`#425`);
- [x] durable fsync-backed grants/entitlements/accounting/terminal revocation (`#433`);
- [x] reservation finalization/replay, membership revocation and writer-lock correctness repairs (`#456`);
- [x] managed authority **repository/runtime support** (`#457`): Cosmos DB NoSQL checkpoint adapter over managed identity/AAD, SHA-256 checkpoint commitment, monotonic revision, optimistic ETag fencing, explicit digest-bound bootstrap, private authority runtime/admin surface, monotonic relay snapshot cache, fail-closed staleness/readiness integration;
- [x] managed provider accounting wiring (`#463`): `sponsored`/`prepaid`/`subscription` reserve through managed authority before execution, awaited reconcile/release on success/failure/cancellation, replay denial, and no successful unpaid terminal result when authoritative reconcile fails. `owner-funded`/`byok` retain local/private semantics.

PRs `#457` and `#463` are repository/runtime acceptance, not proof of provisioned Cosmos, multi-region writes/continuous backup, production authority migration, live relay cutover, restore/failover acceptance or long-window production reconciliation.

Remaining production authority gates are live provisioning/hardening, production migration/cutover, multi-instance/multi-region consistency and failover, continuous backup + restore drills, deployed operator/admin RBAC/audit, measured revocation/grant/entitlement propagation including partition/heal and long-window accounting reconciliation.

## A2A / MCP

Accepted bounded profile:

- [x] C1–C8;
- [x] independent official A2A + MCP black-box proofs;
- [x] **P2-E1 / Sprint E** bidirectional referenced artifact with explicit resolution and exact size/SHA-256 (`#427`);
- [x] **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1` with fail-closed negotiation/migration rules (`#432`);
- [x] **P2-E3** canonical public/status reconciliation and regression guard (`#459`).

The old referenced-artifact and bounded compatibility-policy gaps are closed. **Stable A2A/MCP v1 is not declared** because `TRUYN/1` remains draft.

## NLWeb interoperability and semantic discovery

NLWeb is a planned external interoperability profile around TRUYN, alongside A2A and MCP. It is **not** a TRUYN transport replacement and must not become a `TRUYN/1` wire dependency.

The strategic discovery composition is now explicit:

```text
NLWeb WHO
   ↓
TRUYN semantic/native discovery
   ↓
eligible providers / agents / endpoints
   ↓
reference or managed selection
   ↓
best eligible endpoint(s)
   ↓
NLWeb ASK
   ↓
TRUYN routing / relay / execution
   ↓
application/provider layer
```

Canonical principle:

> **NLWeb provides semantic discovery and interaction semantics; TRUYN provides distributed discovery, eligibility filtering, selection, execution and transport.**

`who` is therefore a semantic discovery **surface over** TRUYN, not a replacement for TRUYN's native discovery protocol. Native identity, Agent Descriptor/OFFER capability state, DHT/discovery, trust, health, policy and routing remain TRUYN responsibilities. Data Graph, Exchange, publisher systems and other application/data services may be selected destinations/providers but remain outside TRUYN core semantics.

The canonical architecture and scope are defined in `docs/architecture/NLWEB_INTEROPERABILITY.md`.

Development sequence:

- [x] **NW-0 — Architecture/boundary:** NLWeb belongs at the public interoperability edge; `who` is defined as a semantic discovery interface over TRUYN; TRUYN is the distributed discovery/selection/execution fabric behind `who`/`ask`; application/data/indexing/rights/Data Graph logic stays outside TRUYN;
- [ ] **NW-1 — Adapter core:** NLWeb client/provider adapter contracts, exact upstream profile/version pin, bounded request/response/error normalization;
- [ ] **NW-2 — Semantic discovery/advertisement:** discover eligible NLWeb endpoints, advertise compatibility through descriptor/capability metadata, map bounded `who` intent into native TRUYN discovery constraints, implement reference selection, health/profile reporting and authorization-aware visibility;
- [ ] **NW-3 — `who → selection → ask`:** return authorized candidate sets, select only from eligible endpoints, compose the selected endpoint into `ask`, preserve structured response/provenance/correlation and keep normal authority before dispatch;
- [ ] **NW-4 — Routing/relay/security:** normal TRUYN matching/dispatch, auth-policy passthrough, fail-closed profile negotiation, zero unauthorized provider enumeration and zero unauthorized execution;
- [ ] **NW-5 — Bridge profiles:** `NLWeb → TRUYN → MCP` plus bounded evaluation of `MCP/A2A → TRUYN → NLWeb` where semantics can be preserved without silent loss or duplicated side effects;
- [ ] **NW-6 — External conformance:** independent NLWeb black-box proof plus end-to-end `WHO → TRUYN discovery → selection → ASK → TRUYN execution` evidence and adversarial `NLWeb ↔ MCP ↔ A2A ↔ TRUYN` matrix.

TRUYN Open must retain a deterministic/reference selector so semantic discovery remains fully usable without the private platform. The private platform may later provide richer managed ranking over the already eligible candidate set using global/history/reputation/health signals; such ranking is an optimization and never an authorization source.

Explicit non-goals for this track: crawler/ingestion implementation, indexing, vector search, RAG corpus ownership, brand/news/product content models, publisher/content rights, advertising/campaign data and Data Graph business semantics. Those can exist in products outside TRUYN and be reached through explicit interfaces; TRUYN itself should transport/discover/authorize/select/route/verify interoperability rather than own that application/data layer.

NLWeb compatibility must remain **Planned** until executable evidence closes the relevant NW gates. The track is not currently a blocker for stable `TRUYN/1` unless a later accepted release contract explicitly makes it one.

## SDK / developer release

Implemented: TypeScript/JavaScript, Python, Go, Java and C#/.NET clients; shared conformance; direct NEED cancellation; signed generic `PARTIAL`; object/artifact references; bounded Agent Descriptor valid-profile support; per-build package provenance.

Public/release state:

- PyPI `truyn-sdk==0.1.0a1` — accepted;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` — accepted;
- npm `@truyn/sdk@0.1.0-alpha.1` — immutable historical artifact, but clean-room Node 22 ESM import failed;
- npm `@truyn/sdk@0.1.0-alpha.2` — **accepted immutable public release**; public registry byte identity, provenance/signature evidence and independent clean-room Node 22 ESM import are accepted, with permanent evidence in `sdk/release/evidence/npm-alpha2-2026-09-05.json`;
- Maven Central — open;
- NuGet — open.

Also open: Descriptor refresh/re-sign, full endpoint parity, archive-member content scanning and live developer-site liveness.

## Trustability

Bounded claim-centric/active Trustability is implemented. Production Trust Authority remains **OPEN** because PR `#438` is unmerged. Even after bounded acceptance, multi-region dissemination, independent witnesses and WAN revocation-propagation evidence remain production gates.

## Stable/mainnet gate

Before stable mainnet: accepted D-1000; live production SLO/operations evidence; live managed authority deployment with recovery/propagation/reconciliation evidence; Production Trust Authority if claimed; stable protocol/A2A-MCP compatibility; complete stable SDK release/Descriptor/site evidence; and appropriate governance maturity.

Historical failed campaigns and old snapshots remain audit history. Current status follows accepted `main`, not stale prose or open PR intent.

Operational network-scale status: [docs/operations/NETWORK_SCALE_STATUS.md](docs/operations/NETWORK_SCALE_STATUS.md).
