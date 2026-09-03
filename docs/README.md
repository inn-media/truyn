# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, setup, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-09-03  
**Current synchronized source:** `main@dd7c3574490e18cc002372d5eb9af704daf03bda`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — **canonical factual maturity/status**.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and cross-subsystem invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next bounded work.
- [Production SLI / SLO Contract](operations/PRODUCTION_SLO.md) — numerical production service targets, measurement windows, exclusions, error budgets and burn-rate policy.
- [A2A / MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md) — external protocol bridge architecture and authority boundary.
- [A2A / MCP Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md) — exact current compatibility matrix.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md) — five-language first-party developer surface and release boundary.
- [Governance](../GOVERNANCE.md) — governance roles/process/maturity.
- [Security Policy](../SECURITY.md) — public reporting/security baseline.
- [Benchmark Evidence](benchmarks/README.md) — durable sanitized evidence ledger.

## Current factual headline

The repository has moved beyond several older documentation snapshots:

- Class C heterogeneous WAN — **accepted**;
- Class D-100 — **accepted**;
- Class D-1000 — **OPEN**; the latest full pinned accepted-status record remains a failed 20×50 campaign, and later diagnostic/remediation work does not itself promote D-1000;
- current main includes bounded D-200 diagnostic/remediation work from PRs `#417` and `#418` plus the bounded packet-partition diagnostic patcher from PR `#419`; later one-shot launcher cleanup does not change those diagnostic sources, and none is D-1000 acceptance;
- production SLI/SLO numerical target contract — **defined** with a rolling 28-day window, explicit exclusions/error budgets and burn-rate policy; real production telemetry/dashboards/alerting/on-call compliance evidence remains **OPEN**;
- MCP current contract + general discovery/import — **implemented / bounded CI-proven**;
- A2A server facade, reverse client/provider adapter, bounded polling lifecycle and artifact integrity — **implemented / bounded CI-proven (C3–C6)**;
- both A2A→TRUYN→MCP and MCP→TRUYN→A2A in-repository round trips — **implemented / bounded CI-proven (C7)**;
- independent official A2A SDK black-box proof for MCP→TRUYN→A2A — **accepted bounded Sprint C evidence**;
- independent official MCP SDK black-box proof for A2A→TRUYN→MCP — **accepted bounded Sprint D evidence**;
- complete cross-protocol adversarial matrix — **OPEN (C8 / PR #369)**;
- TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party clients — **implemented Developer Release clients with shared executable conformance**;
- direct requester-owned NEED cancellation runtime contract — **implemented / bounded CI-proven**, with five-language E2E exercising owner cancellation and dedicated runtime negatives proving ownership/late-output behavior;
- signed generic ordered `PARTIAL` streaming — **implemented / bounded CI-proven**;
- Agent Descriptor default-off serving plus five-language canonical valid-profile fetch/verify/negotiation — **implemented bounded profile**; automatic refresh/re-sign before expiry and complete malformed/missing-endpoint parity remain open;
- per-commit package builds + exact source/digest provenance — **implemented / CI-proven verification artifacts**; ordinary CI does not make the fixed alpha coordinates immutable published releases;
- native public registry publication and live developer-site activation — **still open external release/evidence gates**;
- governance — **G1 / bootstrap Founding Stewardship**, not neutral/foundation governance;
- mainnet/stable TRUYN/1 — **not productionized/stable**.

When older docs or issue bodies say C4/C7, independent SDK interoperability, direct NEED cancellation, PARTIAL streaming or Go/Java/.NET parity are future work, treat those statements as historical context, not current status. Descriptor and package claims must still preserve the bounded limitations above.

## Architecture

- [Network Underlay](architecture/NETWORK_UNDERLAY_V01.md)
- [Network Productionization Gate](architecture/NETWORK_PRODUCTIONIZATION_GATE.md)
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md)
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md)
- [Relay Security](architecture/RELAY_SECURITY.md)
- [Billing Boundary](architecture/BILLING_BOUNDARY.md)
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md)
- [A2A / MCP Interoperability](architecture/A2A_MCP_INTEROPERABILITY.md)
- [SDK / Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md)
- [Governance Architecture](architecture/GOVERNANCE_ARCHITECTURE.md)
- [Settlement Adapters](architecture/SETTLEMENT_ADAPTERS.md)
- [Threat Model](architecture/THREAT_MODEL.md)
- [Public / Private Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md)

## Getting started

- [BYOK](getting-started/BYOK.md)
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md)
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md)
- [SDK Quickstart](getting-started/SDK_QUICKSTART.md)
- [DX-3 SDK Runtime Surface](getting-started/DX3_SDK.md)

`MVP_AI_INTEROP.md` reflects C1–C7 plus the independent Sprint C/D proof boundary rather than the obsolete pre-A2A snapshot.

## Compatibility

- [Protocol / Node Compatibility](compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](compatibility/ADAPTER_COMPATIBILITY.md)
- [A2A / MCP Compatibility Matrix](compatibility/A2A_MCP_COMPATIBILITY.md)
- [SDK Compatibility](compatibility/SDK_COMPATIBILITY.md)
- [SDK Packaging](compatibility/SDK_PACKAGING.md)

TRUYN/1 remains draft. Bounded external A2A/MCP SDK proofs and a source/build-complete five-language Developer Release do not imply ecosystem-wide certification, immutable public package publication or a stable-v1 protocol/mainnet promise.

## Trustability

- [Trustability index](trustability/README.md)
- [Claim-Centric Trustability v1](trustability/CLAIM_TRUSTABILITY_V1.md)
- [Active Trustability Lifecycle v2](trustability/ACTIVE_TRUST_LIFECYCLE_V2.md)

Cryptographic identity/integrity and contextual truth/trust remain distinct concerns.

## Operations and security

- [Operations](operations/README.md)
- [Production SLI / SLO Contract](operations/PRODUCTION_SLO.md)
- [Node Operations](operations/NODE_OPERATIONS.md)
- [Testnet Operations](operations/TESTNET_OPERATIONS.md)
- [Billing Operations](operations/BILLING_OPERATIONS.md)
- [Security docs](security/README.md)
- [Security Architecture Status](security/SECURITY_ARCHITECTURE_STATUS.md)
- [Operational Security](security/OPERATIONAL_SECURITY.md)

## Governance

Current governance architecture/process is public and defined (G1), while operation remains bootstrap Founding Stewardship. External maintainers, a multi-organization TSC and neutral legal stewardship are later factual gates.

- [GOVERNANCE.md](../GOVERNANCE.md)
- [MAINTAINERS.md](../MAINTAINERS.md)
- [RFC Process](governance/RFC_PROCESS.md)
- [Extension Governance](governance/EXTENSIONS.md)
- [Decision Process](governance/DECISION_PROCESS.md)

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns are retained as failures; accepted campaigns are retained as accepted evidence. Operational STARTED/probe/observer issues may be closed after their role is complete without deleting history.

A current status document should point to the latest relevant acceptance/negative record. It should not leave superseded diagnostics looking like active blockers.

## Documentation rule

Current-status docs must be synchronized after material accepted implementation changes. Historical changelog/benchmark/acceptance records remain historical; they should not be rewritten merely to make old wording sound current.
