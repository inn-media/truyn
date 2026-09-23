# TRUYN Implementation Status

**Status:** canonical factual status index  
**Documentation audit:** 2026-09-23  
**Audited public main:** `3a1f7e67b80cecf678d373e33db9ceb09098e8a4`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

This file records what is implemented, what has accepted evidence, what is merely being qualified, and what remains open. Code existence, launch intent, a diagnostic run, or an open/private campaign does not by itself become an accepted public claim.

## Canonical matrix

| Subsystem | Current factual state | Next boundary |
|---|---|---|
| Signed identity / envelopes | **Implemented / CI-proven** | protocol remains draft |
| QUIC / authenticated sessions / Kademlia / relay | **Implemented / CI-proven** | broader operational evidence |
| Class C WAN | **ACCEPTED / PASS** | — |
| Class D-100 | **ACCEPTED / PASS** | — |
| Class D-200 | **ACCEPTED / PASS + independent repeatability PASS** | — |
| Class D-500 | **OPEN; execution attempted, no accepted PASS** | repair/requalification → fresh immutable acceptance run |
| Class D-1000 | **OPEN** | real accepted D-1000 evidence |
| Semantic Scale S-Series | **IMPLEMENTATION / QUALIFICATION ACTIVE; no accepted S PASS** | exact-head/blockwise GREEN → immutable S-50 acceptance evidence |
| Efficiency E-Series | **Methodology + public validator/recompute implementation qualified; no E benchmark PASS** | exact-head/isolation/provider qualification → measured E campaign |
| Semantic/distributed retrieval | **Implemented / bounded benchmark evidence accepted** | broader multilingual/adversarial/internet-scale scope |
| Seven text-provider path | **Implemented / live-smoke + seven-actor evidence accepted** | scale campaigns remain separate |
| Claim-centric / Trustability surfaces | **Implemented bounded slices** | managed/live production evidence separate |
| Public provider authorization boundary | **Implemented fail-closed owner/BYOK semantics** | live managed reconciliation evidence separate |
| Managed authority / commercial control plane | **Owned by private TRUYN Platform** | public repo exposes contracts/reference seams only |
| Production SLI/SLO | **Defined numerical contract** | live compliance evidence |
| Observability / alerting / rotation / DR | **Repository contracts implemented** | deployed drills / production evidence |
| A2A/MCP C1–C8 + P2-E1/E2/E3 | **ACCEPTED bounded pre-v1 profile** | stable-v1 only after protocol/ecosystem gates |
| NLWeb interoperability | **Pinned 0.5 profile implemented / executable-evidence proven** | later profiles require requalification |
| Five first-party SDK clients | **Implemented / five-language conformance** | ecosystem release completion |
| npm `@truyn/sdk@0.1.0-alpha.2` | **Accepted immutable public release** | — |
| TypeScript source package | **`0.1.0-alpha.4` release candidate on current main; not accepted as public npm release** | exact-main trusted publication + independent registry verification |
| PyPI `truyn-sdk==0.1.0a1` | **Accepted immutable public release** | — |
| Go `sdk/go@v0.1.0-alpha.1` | **Accepted immutable public release** | — |
| Maven Central / NuGet | **OPEN publication gates** | observed registry publication/provenance |
| Agent Descriptor serving/fetch/signature | **Implemented** | — |
| Agent Descriptor automatic refresh/re-sign | **Implemented / regression-covered (S102)** | complete usable-interface mapping/negative parity |
| Live developer site | **OPEN** | deployment/liveness evidence |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers → TSC → neutral stewardship |
| Stable mainnet | **Not productionized / not claimed** | D-scale + live ops + release/governance closure |

## Network-scale acceptance boundary

### Accepted

Class D-200 is accepted on immutable run `35503894414`, attempt 1, with strict terminal `TRUYN_D200_TERMINAL result=PASS`. Independent repeatability run `35517248924`, attempt 1, also PASSed the frozen source/runtime contract.

Durable public evidence:

- `../benchmarks/CLASS_D_200_2026-09-20.md`
- `../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`
- `../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`
- `../operations/NETWORK_SCALE_STATUS.md`

### Open

D-500 is **not accepted**. Six immutable launch generations have existed. The latest public D-500 acceptance run, `35787480348` (run number 6, source `64ce333f77ac82d4d8d10106d36bcba0dd8e810a`), finished with GitHub conclusion `cancelled`; therefore it supplies no D-500 PASS. Historical attempts remain immutable evidence and are never retroactively promoted.

D-1000 also remains open. D-200 acceptance does not imply D-500, D-1000, long-duration stability or mainnet acceptance.

## S-Series boundary

The old status **“DEFINED / NOT YET EXECUTED” is obsolete**.

S-Series architecture, telemetry/isolation contracts and managed execution machinery now exist. S-50 has entered real qualification/attempt cycles, including blockwise B01–B16 preflight work and WebSocket reconnect/backpressure diagnosis. Public `main` at the audited SHA contains the current reconnect/backpressure diagnostic coverage.

What is **not** true yet:

- no S-50 immutable acceptance report has been merged as PASS;
- S-100/S-200/S-500 are not accepted;
- qualification success for a subset of blocks is not an S-Series benchmark result.

Canonical architecture/methodology remains:

- `SEMANTIC_SCALE_S_SERIES.md`
- `S_SERIES_OPEN_PRIVATE_BOUNDARY.md`
- `../benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`
- `../operations/S_SERIES_EXECUTION_AND_TELEMETRY.md`

## E-Series boundary

The old blanket status **“FOUNDATION DEFINED / NOT YET EXECUTED” is obsolete**.

Public E-Series validator/recompute implementation exists under `benchmarks/e-series/` and was qualified on public main by commit `cdb1164f45b23c4335559e73edfea9cd71a07adb` with exact-head CI and Class-D Five-Patch preflight GREEN. This proves the public-safe telemetry validation/recompute layer, not an E benchmark result.

Private managed qualification has progressed through exact-head/isolation/provider-smoke preparation. No E/DECOMPOSE, E/PER-RESULT, E/KNEE or E/DEGRADE final PASS is claimed until measured immutable evidence is independently reconciled and published safely.

Canonical methodology:

- `../benchmarks/E_SERIES_EFFICIENCY.md`
- `../benchmarks/E_SERIES_TELEMETRY.md`
- `../operations/E_SERIES_EXECUTION.md`
- `../benchmarks/BENCHMARK_SERIES_ISOLATION.md`

## SDK / Developer Release boundary

Five required first-party SDK clients are implemented: TypeScript/JavaScript, Python, Go, Java and C#/.NET. They participate in shared executable conformance. Rust remains optional.

Accepted immutable public coordinates remain npm alpha.2, PyPI alpha and Go alpha. **The TypeScript package in current source is versioned `0.1.0-alpha.4` as a release candidate, not as an accepted registry release.** The repository tag `sdk/npm/v0.1.0-alpha.3` is preserved as immutable bootstrap/release-process evidence and is not promoted here to accepted npm publication. Java and .NET implementations/stable contracts exist, but Maven Central and NuGet public registry publication evidence remains open.

The Agent Descriptor is no longer “startup-only”. Runtime serving is still explicit opt-in and default-off, but the runtime now performs bounded refresh/re-sign before expiry while preserving identity binding, TTL and public-capability filtering. Complete usable-interface validation/mapping parity remains a separate open compatibility gate.

## Interoperability boundary

A2A and MCP remain adapters, not TRUYN/1 primitives. Accepted bounded evidence includes C1–C8, P2-E1, compatibility generation `a2a-mcp-pre-v1/g1`, and canonical P2 reconciliation. Stable A2A/MCP v1 is not declared while TRUYN/1 is draft.

TRUYN Open also has executable evidence for a bounded pinned NLWeb protocol 0.5 interoperability profile. That does not claim stable NLWeb v1 or make crawling/ingestion/indexing/RAG corpus ownership/content rights/advertising/Data Graph semantics part of TRUYN.

## Public / private repository boundary

Public `inn-media/truyn` owns protocol/open-edge behavior, reference Node/Relay/SDK/adapter surfaces, public contracts, conformance, generic BYOK/owner-isolated provider behavior, reproducible methodology and sanitized evidence.

Private `inn-media/truyn-platform` owns managed production authority/control plane, cloud orchestration, commercial entitlements/billing, private topology/identities/quotas/budgets, proprietary managed optimization and raw private telemetry. Public code must never depend on private code; private code consumes accepted/versioned public surfaces.

## Documentation hygiene

Current-state documents must follow accepted code/evidence, not old sprint wording. Historical benchmark reports, failures and immutable artifacts remain audit history and are not rewritten during documentation sanitation.

Rules:

1. **Implemented** means code/conformance exists.
2. **Qualified** means a bounded implementation gate is green.
3. **Accepted / PASS** requires the benchmark/release/acceptance evidence defined by that track.
4. **Active / in qualification** is not PASS.
5. Security sanitation is **redact-not-delete** for benchmark evidence.
6. `README.md`, `docs/README.md` and `ROADMAP.md` are summaries; this file is the canonical current factual status index.
