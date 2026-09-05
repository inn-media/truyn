# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`.

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@abd6bd95ecad8dc8d82bbf6d2983d96df80267d3`  
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
| SDK/DX | **Five clients/conformance implemented; PyPI + Go accepted; npm alpha.2 packaging repair merged** | npm alpha.2 public registry acceptance + Maven/NuGet + Descriptor/site completeness |
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

## SDK / developer release

Implemented: TypeScript/JavaScript, Python, Go, Java and C#/.NET clients; shared conformance; direct NEED cancellation; signed generic `PARTIAL`; object/artifact references; bounded Agent Descriptor valid-profile support; per-build package provenance.

Public/release state:

- PyPI `truyn-sdk==0.1.0a1` — accepted;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` — accepted;
- npm `@truyn/sdk@0.1.0-alpha.1` — immutable historical artifact, but clean-room Node 22 ESM import failed;
- npm `@truyn/sdk@0.1.0-alpha.2` — packaging repair merged in `#448`; packed clean-room import is CI-proven, while immutable public registry/provenance/clean-room evidence remains the acceptance gate;
- Maven Central — open;
- NuGet — open.

Also open: Descriptor refresh/re-sign, full endpoint parity, archive-member content scanning and live developer-site liveness.

## Trustability

Bounded claim-centric/active Trustability is implemented. Production Trust Authority remains **OPEN** because PR `#438` is unmerged. Even after bounded acceptance, multi-region dissemination, independent witnesses and WAN revocation-propagation evidence remain production gates.

## Stable/mainnet gate

Before stable mainnet: accepted D-1000; live production SLO/operations evidence; live managed authority deployment with recovery/propagation/reconciliation evidence; Production Trust Authority if claimed; stable protocol/A2A-MCP compatibility; complete stable SDK release/Descriptor/site evidence; and appropriate governance maturity.

Historical failed campaigns and old snapshots remain audit history. Current status follows accepted `main`, not stale prose or open PR intent.
