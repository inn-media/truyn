# TRUYN Documentation

Human-facing documentation for TRUYN architecture, current implementation status, operations, interoperability, SDK/DX, security, governance and benchmark evidence.

**Documentation audit:** 2026-09-23  
**Audited public main:** `3a1f7e67b80cecf678d373e33db9ceb09098e8a4`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual current state.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — architecture invariants.
- [Repository Structure](../STRUCTURE.md) — source-of-truth hierarchy and ownership.
- [Roadmap](../ROADMAP.md) — next bounded gates, not evidence.
- [Network Scale Status](operations/NETWORK_SCALE_STATUS.md) — current D-Series execution state.
- [Semantic Scale S-Series](architecture/SEMANTIC_SCALE_S_SERIES.md) — S-50/100/200/500 architecture and current qualification boundary.
- [S-Series Execution & Telemetry](operations/S_SERIES_EXECUTION_AND_TELEMETRY.md) — execution/isolation contract.
- [E-Series Efficiency](benchmarks/E_SERIES_EFFICIENCY.md) and [Execution](operations/E_SERIES_EXECUTION.md) — methodology plus current implementation boundary.
- [Benchmark Series Isolation](benchmarks/BENCHMARK_SERIES_ISOLATION.md) — common D/S/T/H/E R0/R1/R2 contract.
- [A2A/MCP](architecture/A2A_MCP_INTEROPERABILITY.md), [NLWeb](architecture/NLWEB_INTEROPERABILITY.md).
- [SDK/DX](architecture/SDK_DEVELOPER_EXPERIENCE.md), [SDK runtime guide](getting-started/DX3_SDK.md).
- [Benchmark Evidence](benchmarks/README.md) — durable append-only evidence ledger.
- [Security](../SECURITY.md), [Governance](../GOVERNANCE.md).

## Current factual headline

- Class C WAN — **ACCEPTED**.
- Class D-100 — **ACCEPTED**.
- Class D-200 — **ACCEPTED / PASS + independent repeatability PASS**.
- Class D-500 — **OPEN**. Latest immutable acceptance run `35787480348` ended `cancelled`; no D-500 PASS is claimed.
- Class D-1000 — **OPEN**.
- S-Series — **IMPLEMENTATION / QUALIFICATION ACTIVE; no accepted S PASS**. The earlier “not yet executed” description is obsolete.
- E-Series — **methodology + public validator/recompute implementation qualified; no measured E benchmark PASS**.
- A2A/MCP — **accepted bounded pre-v1 profile**; stable v1 is not declared.
- NLWeb — **bounded pinned 0.5 profile implemented / executable-evidence proven**.
- five first-party SDK clients — **implemented / executable conformance**.
- npm alpha.2 + PyPI alpha + Go alpha — **accepted immutable public releases**.
- Java/.NET implementations — **present and conformance-aligned**; Maven Central / NuGet publication remain open.
- Agent Descriptor — **serving/fetch/signature + bounded automatic refresh/re-sign implemented**; complete usable-interface mapping/negative parity remains open.
- stable mainnet — **not declared**.

## Status vocabulary

Documentation uses four deliberately different states:

- **Implemented** — code exists and its bounded implementation tests/conformance exist.
- **Qualified** — a prerequisite/exact-head/compatibility gate is green.
- **Active / in qualification** — work or real attempts are underway, but acceptance evidence is incomplete.
- **Accepted / PASS** — the track's defined immutable acceptance evidence exists.

A lower state never silently implies a higher one.

## Evidence hygiene

`docs/benchmarks/` is append-only audit evidence. Historical PASS/FAIL reports are not rewritten to make them resemble current state. Sensitive fields are redacted; reports are not deleted merely because later architecture changed.

Open PRs, launch tokens, workflow existence, private execution intent, diagnostics, partial blockwise GREEN, or a cancelled run do not become benchmark acceptance claims.

## Public/private boundary

Public TRUYN owns protocol/reference behavior, generic SDKs/adapters, conformance, reproducible methodology and sanitized evidence. Private `inn-media/truyn-platform` owns managed cloud orchestration, private topology/identities/quotas, commercial authority/billing implementation and raw private telemetry.

Private may consume accepted/versioned public surfaces. Public must never depend on private code.
