# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot:** 2026-09-05  
**Synchronized source:** `main@abd6bd95ecad8dc8d82bbf6d2983d96df80267d3`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

This document distinguishes accepted `main` facts from open PRs, diagnostics, planned work and live-production evidence that does not yet exist.

## Canonical matrix

| Subsystem | Current factual state | Next boundary |
|---|---|---|
| Signed identity / envelopes | **Implemented / CI-proven** | `TRUYN/1` remains draft |
| QUIC / authenticated sessions / Kademlia | **Implemented / CI-proven** | broader production/WAN evidence |
| Class C WAN | **ACCEPTED / PASS** | — |
| Class D-100 | **ACCEPTED / PASS** | — |
| Post-#458 D-200 | **Run `33959493680` IN PROGRESS** | must terminate on unchanged gates before PASS |
| Class D-1000 | **OPEN — canonical full pinned campaign FAIL** | exact 20×50 PASS |
| Semantic/distributed retrieval | **Implemented bounded CI/benchmark slices** | broader decentralized/adversarial scale |
| Claim-centric + active Trustability | **Implemented bounded slices** | Production Trust Authority remains open; `#438` unmerged |
| Account → Organization → Tenant | **Implemented / accepted** | PR `#425` |
| Durable Production Authority | **Implemented / accepted single-filesystem reference** | `#433` + correctness repair `#456` |
| Managed authority runtime support | **Implemented / accepted in repository/runtime** | PR `#457` merged |
| Managed provider accounting wiring | **Implemented / accepted in repository/runtime** | PR `#463` merged; live managed reconciliation evidence open |
| Live managed authority deployment | **OPEN** | provisioned Cosmos, migration/cutover, multi-region/backup/restore/propagation evidence |
| Provider grants / entitlements / accounting / terminal revocation | **Implemented durable authority** | live managed ops + reconciliation evidence |
| Production SLI/SLO | **Defined numerical contract** | `#424`; live 28-day compliance open |
| Observability / alerting | **Implemented repository/runtime** | `#434`; deployed backends/probes/pager evidence open |
| Rotation / on-call | **Implemented contracts** | `#440`; live drills/roster/test-fire open |
| Recovery / DR | **Implemented contract** | `#441`; real backup/restore evidence open |
| A2A/MCP C1–C8 | **ACCEPTED bounded profile** | broader optional surfaces separate |
| P2-E1 / Sprint E | **ACCEPTED / CLOSED** | PR `#427` |
| P2-E2 `a2a-mcp-pre-v1/g1` | **ACCEPTED / CLOSED** | PR `#432`; stable-v1 not claimed |
| P2-E3 canonical reconciliation | **ACCEPTED / MERGED** | PR `#459` |
| Five first-party SDK clients | **Implemented / conformance-proven** | release ecosystem completion |
| PyPI alpha | **Accepted immutable public release** | — |
| Go alpha | **Accepted immutable public release** | — |
| npm alpha.1 | **Immutable historical artifact; clean-room Node 22 ESM failed** | superseded, never overwritten |
| npm alpha.2 repair | **Merged / CI packaging repair accepted** | immutable public registry/provenance/clean-room evidence remains gated |
| Maven Central / NuGet | **OPEN** | public publication evidence |
| Agent Descriptor | **Bounded valid-profile implemented** | refresh/re-sign + full endpoint parity |
| Live developer site | **OPEN** | deployment/liveness evidence |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers/TSC/neutral stewardship |
| Mainnet | **Not productionized** | D-1000 + live ops + live managed authority + stable/release/governance gates |

## Network productionization

The canonical D-1000 negative record remains source `0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094`, run `32869078719`, issue `#344`. PR `#458` repairs target-readiness/discovery and bounded transient QUIC establishment while preserving exactly-once application NEED dispatch and unchanged D-scale thresholds. Fresh D-200 run `33959493680` against verified source `6f64c3dc6333044126916d3dd0a118e3cf8220d4` remains in progress and is not accepted PASS evidence yet.

## Production Authority boundary

Accepted authority has four stages:

1. PR `#425` — Account/Organization/Tenant hierarchy, roles, lifecycle and node/provider bindings;
2. PR `#433` + `#456` — durable single-filesystem grants, entitlements, accounting reservations/reconciliation, terminal revocation and correctness repairs;
3. PR `#457` — managed authority **repository/runtime support**: Cosmos DB NoSQL checkpoint adapter over managed identity/AAD, checkpoint digest/source/revision, optimistic ETag fencing, explicit digest-bound bootstrap, private authority role/API, monotonic relay snapshot cache and fail-closed staleness/readiness integration;
4. PR `#463` — managed provider accounting wiring: `sponsored`, `prepaid`, and `subscription` modes route reserve/reconcile through the managed authority runtime, await reserve before provider execution, reconcile actual usage before terminal success, release/reconcile failure/cancellation, preserve replay denial and suppress successful output when authoritative reconciliation fails. `owner-funded` and `byok` remain local/private semantics.

Stages 3–4 are not proof of a live managed deployment. They do not claim provisioned Cosmos, multi-region writes, continuous backup, migrated production state, relay cutover, accepted restore drill or long-window production reconciliation. Those remain deployment/operations gates.

## Production operations boundary

The repository has numerical SLI/SLO, observability, dashboards, error budgets/alerts, security rotation/on-call and recovery/DR contracts. Productionized status remains open until real telemetry/probes, pager delivery, roster, live rotations/restores and durable 28-day serving evidence are accepted.

## A2A / MCP boundary

Accepted bounded state includes C1–C8, independent official A2A/MCP black-box proofs, **P2-E1 / Sprint E** referenced artifacts in both directions with explicit resolution and exact integrity, and **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1` with fail-closed version/required-semantic negotiation and migration rules. PR `#459` closes **P2-E3** documentation reconciliation and adds a regression guard.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

Durable consolidated evidence: `../compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md`.

## SDK / developer release boundary

Five first-party clients and shared executable conformance are implemented. PyPI `truyn-sdk==0.1.0a1` and Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` have accepted immutable public evidence. npm `@truyn/sdk@0.1.0-alpha.1` remains immutable historical evidence but failed the required clean-room Node 22 ESM import. PR `#448` is now merged and repairs the packaging at the distinct `@truyn/sdk@0.1.0-alpha.2` coordinate; packed clean-room import is CI-proven, while immutable public registry/provenance/clean-room evidence remains the release acceptance gate. Maven Central and NuGet remain open.

Agent Descriptor refresh/re-sign, full endpoint parity, archive-member content scanning and live developer-site liveness remain open.

## Trustability boundary

Bounded Trustability is accepted. Production Trust Authority is not accepted on current main because PR `#438` remains open. Multi-region dissemination, transparency witnesses and WAN revocation-propagation evidence remain later production gates.

## Documentation hygiene

Historical evidence remains audit history. Current-status documents follow accepted `main`. Open PRs, public uploads and in-progress diagnostics do not become accepted production claims merely by existing; merged repository/runtime support does not become live production evidence without deployment proof.
