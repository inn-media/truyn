# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, setup, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-08-27  
**Current synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — **canonical factual maturity/status**.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and cross-subsystem invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next bounded work.
- [A2A / MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md) — external protocol bridge architecture and authority boundary.
- [A2A / MCP Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md) — exact current compatibility matrix.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md) — first-party developer surface.
- [Governance](../GOVERNANCE.md) — governance roles/process/maturity.
- [Security Policy](../SECURITY.md) — public reporting/security baseline.
- [Benchmark Evidence](benchmarks/README.md) — durable sanitized evidence ledger.

## Current factual headline

The repository has moved beyond several older documentation snapshots:

- Class C heterogeneous WAN — **accepted**;
- Class D-100 — **accepted**;
- Class D-1000 — **OPEN**, latest full pinned `0e7f16c1` campaign failed; issue `#344` is the current negative record;
- MCP current contract + general discovery/import — **implemented / bounded CI-proven**;
- A2A server facade — **implemented / bounded CI-proven**;
- A2A client/provider adapter — **implemented / bounded CI-proven**;
- bounded A2A polling lifecycle and artifact integrity — **implemented / bounded CI-proven**;
- both A2A→TRUYN→MCP and MCP→TRUYN→A2A in-repository round trips — **implemented / bounded CI-proven (C7)**;
- complete cross-protocol adversarial matrix — **OPEN (C8 / PR #369)**;
- TypeScript/JavaScript + Python SDK reference work — **implemented bounded slices**;
- DX-3 — **merged in PR #373**: stable API-v1 primitives for TS/Python, authenticated relay event streaming with abortable waits, reference-only object/artifact payloads, conformance markers and developer-site source;
- remote provider-side NEED cancellation and token-delta streaming — **not implemented**;
- governance — **G1 / bootstrap Founding Stewardship**, not neutral/foundation governance;
- mainnet/stable TRUYN/1 — **not productionized/stable**.

When older docs or issue bodies say C4/C7 are future work, treat those statements as historical context, not current status.

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

`MVP_AI_INTEROP.md` reflects the accepted C1–C7 implementation rather than the obsolete pre-A2A snapshot.

## Compatibility

- [Protocol / Node Compatibility](compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](compatibility/ADAPTER_COMPATIBILITY.md)
- [A2A / MCP Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md)
- [SDK Compatibility](compatibility/SDK_COMPATIBILITY.md)

TRUYN/1 remains draft. No stable mainnet, A2A/MCP ecosystem certification or universal SDK compatibility promise is implied by bounded CI evidence.

## Trustability

- [Trustability index](trustability/README.md)
- [Claim-Centric Trustability v1](trustability/CLAIM_TRUSTABILITY_V1.md)
- [Active Trustability Lifecycle v2](trustability/ACTIVE_TRUST_LIFECYCLE_V2.md)

Cryptographic identity/integrity and contextual truth/trust remain distinct concerns.

## Operations and security

- [Operations](operations/README.md)
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

Current-status docs must be synchronized after material accepted implementation changes. Historical changelog/benchmark records remain historical; they should not be rewritten merely to make old wording sound current.
