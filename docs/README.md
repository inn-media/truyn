# TRUYN Documentation

Human-facing documentation for TRUYN architecture, implementation status, governance, operations, security, Trustability, compatibility, SDK/DX and benchmark evidence.

**Snapshot:** 2026-10-08  
**Canonical D-1000 runtime main:** `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Start here

- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical repository-wide factual maturity/status.
- [Network Scale Status](operations/NETWORK_SCALE_STATUS.md) — current D-Series operational acceptance.
- [Documentation Sanitation 2026-09-23](operations/DOCUMENTATION_SANITATION_2026-09-23.md) — latest repository-wide reconciliation and status vocabulary.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source ownership and invariants.
- [Roadmap](../ROADMAP.md) — accepted gates and next work.
- [Semantic Scale S-Series](architecture/SEMANTIC_SCALE_S_SERIES.md) — live semantic-node scale architecture for S-50/100/200/500.
- [S-Series Open/Private Boundary](architecture/S_SERIES_OPEN_PRIVATE_BOUNDARY.md) — canonical repository ownership split for S-Series.
- [S-Series Benchmark Contract](benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md) — fixed scenarios, acceptance gates and evidence rules.
- [S-Series Execution & Telemetry](operations/S_SERIES_EXECUTION_AND_TELEMETRY.md) — D/S isolation, telemetry schemas and run closure.
- [N-Series Emergent Network Architecture](architecture/N_SERIES_EMERGENT_NETWORK.md) — capability economy, sovereignty, adaptive trust and sustained churn.
- [N-Series Open/Private Boundary](architecture/N_SERIES_OPEN_PRIVATE_BOUNDARY.md) — canonical public/private ownership split for N-Series.
- [N-Series Benchmark Contract](benchmarks/N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md) — fixed metrics, acceptance and false-PASS traps.
- [N-Series Telemetry](benchmarks/N_SERIES_TELEMETRY.md) — normalized event vocabulary and recomputable formulas.
- [N-Series Execution & Isolation](operations/N_SERIES_EXECUTION_AND_ISOLATION.md) — full run procedure and cross-series R0/R1/R2 rules.
- [N-Series Roadmap](roadmap/N_SERIES_ROADMAP.md) — bounded N0→N7 implementation/evidence sequence.
- [E-Series Efficiency Contract](benchmarks/E_SERIES_EFFICIENCY.md) — DECOMPOSE / PER-RESULT / KNEE / DEGRADE definitions and public/private boundary.
- [E-Series Telemetry](benchmarks/E_SERIES_TELEMETRY.md) — recomputable request/stage/cost/load/interference evidence contract.
- [E-Series Execution](operations/E_SERIES_EXECUTION.md) — freeze, instrumentation, isolation, run and reconciliation procedure.
- [Benchmark Series Isolation](benchmarks/BENCHMARK_SERIES_ISOLATION.md) — common D/S/T/H/E/N R0/R1/R2 concurrency contract.
- [Production Authority](architecture/PRODUCTION_AUTHORITY_CONTROL_PLANE.md) — durable + managed-runtime authority boundary.
- [A2A/MCP Architecture](architecture/A2A_MCP_INTEROPERABILITY.md), [Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md), [P2 Final Acceptance](compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md).
- [NLWeb Interoperability](architecture/NLWEB_INTEROPERABILITY.md) — bounded pinned 0.5 profile and explicit application/data non-goals.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md).
- [Governance](../GOVERNANCE.md), [Security](../SECURITY.md), [Benchmark Evidence](benchmarks/README.md).

## Current factual headline

- Class C heterogeneous WAN — **ACCEPTED**.
- Class D-100 — **ACCEPTED**.
- Class D-200 — **ACCEPTED / PASS + repeatability confirmed**.
- Class D-500 — **ACCEPTED / PASS / REPEATABILITY CONFIRMED** by Attempt 22 run `37666768998` and exact-frozen Double-Check run `37676472133`; both used the same tested source/tree, 20 hosts / 500 real processes, zero acknowledged-write loss, strict terminal PASS and complete cleanup.
- Class D-1000 — **ACCEPTED / PASS** on Attempt 1 workflow run `37687469411`, `run_attempt=2`: 20 hosts / 1,000 real processes, baseline 100%, post-restart 99%, healed 100%, zero acknowledged-write loss, strict terminal PASS and complete cleanup.
- D-Series execution architecture — **Swarm diagnostics/repair → full B01–B16 exact-SHA admission → live/collision gates → exactly one real scale run**; durable lock tracked in issue #737.
- Semantic Scale S-Series — **S-10 + S-20 + S-50 + S-100 ACCEPTED / PASS; S-200+ OPEN**. S-50 Attempt 3 run `37782488279` is the canonical 50-node eight-scenario acceptance; historical failed S-50 attempts remain immutable audit evidence.
- Efficiency E-Series — **ACTIVE QUALIFICATION / NO FINAL E PASS**; qualification/isolation/provider-smoke work does not substitute for final DECOMPOSE/PER-RESULT/KNEE/DEGRADE evidence.
- N-Series emergent network behavior — **FOUNDATION DEFINED / NOT YET EXECUTED**; N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY and N/SUSTAINED-CHURN have no PASS claim.
- Account → Organization → Tenant — **IMPLEMENTED / accepted**.
- durable grants/entitlements/accounting/revocation — **IMPLEMENTED / accepted**.
- managed authority repository/runtime support — **IMPLEMENTED / accepted**.
- managed provider accounting wiring — **IMPLEMENTED / accepted** for managed modes; live managed deployment/reconciliation evidence remains open.
- live managed authority deployment — **OPEN**.
- production SLI/SLO — **DEFINED**.
- observability + alerting — **IMPLEMENTED contracts**; live production evidence open.
- recovery/DR — **IMPLEMENTED contract**; live backup/restore evidence open.
- C1–C8 A2A/MCP — **ACCEPTED bounded profile**.
- P2-E1 / Sprint E — **ACCEPTED**.
- P2-E2 `a2a-mcp-pre-v1/g1` — **ACCEPTED**.
- P2-E3 canonical documentation reconciliation — **ACCEPTED / merged**.
- **Stable A2A/MCP v1 is not declared**; `TRUYN/1` remains draft.
- NLWeb interoperability — **BOUNDED PINNED 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN**.
- five first-party SDK clients + shared conformance — **IMPLEMENTED**.
- PyPI alpha + Go alpha + npm alpha.2 — **accepted immutable public releases**.
- npm alpha.1 — immutable historical artifact with failed required clean-room ESM import.
- Maven Central — **accepted immutable public release** (`org.truyn:truyn-sdk:0.1.0-alpha.1`); NuGet — **status reconciled independently**.
- Open 1.0 productization — **S01–S102 complete; S103 active; stable 1.0 not reached**.
- Production Trust Authority — **OPEN** unless/until separately accepted by canonical evidence.
- governance — **G1 / bootstrap Founding Stewardship**.
- stable mainnet — **not yet**.

Accepted D-200 evidence: [`benchmarks/CLASS_D_200_2026-09-20.md`](benchmarks/CLASS_D_200_2026-09-20.md). Accepted D-500 evidence: [`benchmarks/CLASS_D_500_2026-10-07.md`](benchmarks/CLASS_D_500_2026-10-07.md). Accepted D-1000 evidence: [`benchmarks/CLASS_D_1000_2026-10-08.md`](benchmarks/CLASS_D_1000_2026-10-08.md). Operational scale status: [`operations/NETWORK_SCALE_STATUS.md`](operations/NETWORK_SCALE_STATUS.md).

## Status vocabulary

Current-state documents must distinguish:

- **implemented** — code/contracts exist and are test-covered;
- **exercised / diagnostic** — a real run happened but did not close the gate;
- **accepted** — immutable evidence satisfies the fixed acceptance contract;
- **open** — acceptance remains unclosed.

Do not infer PASS from a workflow, launcher, task branch, diagnostic run or merged implementation alone.

## Semantic Scale scope reminder

S-Series is the **live semantic-node** benchmark family. It reuses the accepted TRUYN network, provider and semantic retrieval paths and adds no second network architecture. The earlier `SEMANTIC_SCALE_GATE_V3` remains corpus/index-scale evidence and does not by itself prove S-50/100/200/500 with real heterogeneous inference.

S-Series has accepted S-10, S-20, S-50 and S-100 checkpoints. S-200 and S-500 remain open and require their own immutable acceptance evidence.

S-Series and D-Series have separate workflow/concurrency/resource/evidence namespaces. A S run may execute beside a D run only when capacity/quota and resource isolation prevent either benchmark from altering the other's result.

Repository ownership is split by behavior: public S-Series contains the reproducible benchmark architecture/methodology, public/reference runner surfaces and sanitized evidence; managed cloud orchestration, private/raw telemetry, credentials/quota/spend controls, proprietary routing/cost intelligence and production operations remain in private `inn-media/truyn-platform`.

## E-Series scope reminder

E-Series measures **efficiency limits**, not protocol correctness by proxy. It keeps frozen workload/provider/correctness rules across comparable cells and separates stage bottlenecks, cost/time/compute per useful result, the scale knee, and overload/recovery behavior.

Current qualification/provider-smoke activity must not be described as a final E result. Final E claims require immutable comparable evidence and independent reconciliation.

E can execute concurrently with D/S/T/H only through the common benchmark isolation contract. Read-only immutable dependencies are R0; shared services may be R1 only with distinct attribution and active interference detection; capacity/cache/index/fault mutation is R2-exclusive.

## N-Series scope reminder

N-Series tests emergent behavior rather than basic transport: sovereignty/data residency, capability-directed specialist discovery, trust adaptation and long-window convergence under continuous membership churn.

The common substrate is D-200 plus the heterogeneous provider path, but N never inherits a PASS from either. Every N result uses its own frozen source/run/acceptance identity and the common [Benchmark Series Isolation Contract](benchmarks/BENCHMARK_SERIES_ISOLATION.md).

Public N-Series owns reproducible methodology, public-safe telemetry/formulas and sanitized evidence. Real managed topology, packet/flow evidence, hidden oracle material, provider identities/quota/spend and proprietary trust/routing intelligence remain in private `inn-media/truyn-platform`.

## NLWeb scope reminder

TRUYN's NLWeb track is interoperability-only: eligible endpoint discovery, `ask`/`who`, routing/relay, auth-policy passthrough, health/capability advertisement and bounded bridges with MCP/A2A. Crawling, ingestion, indexing, vector search, RAG corpus ownership, brand/publisher content, content rights, campaign data and Data Graph semantics remain outside the TRUYN NLWeb layer.

## Evidence hygiene

`docs/benchmarks/` is a durable evidence ledger. Failed campaigns remain failures; accepted campaigns remain accepted. Diagnostics and open PRs never become acceptance merely because code exists. Merged repository/runtime support must not be overstated as live production evidence.

Benchmark evidence follows **redact-not-delete**. Raw logs containing private operational details stay in immutable Actions artifacts or private operational storage; public reports retain safe structured telemetry, artifact identity and cryptographic digests.


## Native clients

- [Native Client Architecture](architecture/NATIVE_CLIENTS.md)
- [Native Client Quickstart](getting-started/NATIVE_CLIENTS.md)

## D-1000 exact-frozen Double-Check — 2026-10-08 (authoritative update)

**Class D-1000 status: ACCEPTED / PASS / REPEATABILITY CONFIRMED / CLOSED (defined scale gate only).** The primary accepted Attempt 1 remains workflow run [37687469411](https://github.com/inn-media/truyn/actions/runs/37687469411), successful GitHub run_attempt=2. The independent exact-frozen Double-Check is [37785777704](https://github.com/inn-media/truyn/actions/runs/37785777704), GitHub run_attempt=1, `completed/success`, strict `TRUYN_D1000_TERMINAL result=PASS`. It is **not** a second attempt of the original GitHub run and does not overwrite the primary immutable evidence.

Both successful executions checked out the **identical source** `c1d3fa087716dbf24d0b3b65bceae303e907160a`, **identical tree** `266c83c8520d486cc6f1d44f63c8bd9b6e185c38` and identical runtime digest `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`. Double-Check launcher SHA: `e5c957123efa449e14fb225fd8be5df2d0e6e995`; Azure placement: `southcentralus / Standard_E8as_v7`; **20 real hosts × 50 processes = 1,000 processes**.

| Verified metric | Primary PASS | Double-Check PASS |
|---|---:|---:|
| Baseline routing | 1.000 | 1.000 |
| Post-restart routing | 0.990 | 1.000 |
| Healed routing | 1.000 | 1.000 |
| Convergence routing | 1.000 | 1.000 |
| Convergence p95 (ms) | 285.988 | 251.139 |
| Restart recovery p95 (ms) | 26,627 | 10,950 |
| Packet-partition recovery (ms) | 32,696 | 32,901 |
| Acknowledged durable writes | 100 | 100 |
| Acknowledged-write losses | 0 | 0 |
| Campaign / staging remaining resources | 0 / 0 | 0 / 0 |
| Strict terminal | PASS | PASS |

Double-Check `CAMPAIGN_RC=0`, `EVALUATOR_RC=0`, `TERMINAL_RC=0`, `cleanup=true`, `staging_cleanup=true`; evidence artifact **11557320070** and digest **sha256:3b84a2acf39ad34735a069e5a3e62f84be675f11636f68812eb0b78a64959a32**. Launcher-only changes were isolated from frozen benchmark source. Historical branch-OIDC failure [37784820939](https://github.com/inn-media/truyn/actions/runs/37784820939) happened before provisioning (`AADSTS700213`) and is **not** a D-1000 network regression. The prior primary run_attempt=1 quota failure also remains immutable pre-provision evidence. No tests, thresholds, network source, old reports, or negative evidence are weakened or deleted.

**Scope boundary:** this demonstrates repeatability of the specified 1,000-process Class-D scale acceptance. It does not establish long-duration production SLO compliance, private managed-production acceptance, or mainnet readiness. Public repository remains the authoritative source of benchmark/evaluator/evidence; private repository consumes only immutable identifiers and sanitized public metrics.
