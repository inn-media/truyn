# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a logical network for agent-to-agent communication, decentralized AI, capability discovery, content-addressed objects/state, provider execution, provenance and contextual Trustability.

Website: https://truyn.org/

[A-Series Assurance](docs/assurance/README.md) · [Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [Open/Private Boundary](docs/architecture/OPEN_PRIVATE_BOUNDARY.md) · [Cross-Repo Routing](docs/architecture/CROSS_REPO_TASK_ROUTING.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [NLWeb](docs/architecture/NLWEB_INTEROPERABILITY.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Native Clients](docs/architecture/NATIVE_CLIENTS.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md)

## Current factual status

**Snapshot:** 2026-10-10 (H/CACHE-COMPOUND closure reconciliation)  
**Canonical D-1000 runtime main:** `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

| Area | Current state |
|---|---|
| Class C WAN | **Accepted / PASS** |
| Class D-100 | **Accepted / PASS** |
| Class D-200 | **Accepted / PASS; repeatability confirmed** |
| Class D-500 | **Accepted / PASS; repeatability-confirmed by two consecutive exact-frozen runs** |
| Class D-1000 | **Accepted / PASS; 20 hosts / 1,000 real processes** |
| Semantic Scale S-Series | **S-10 + S-20 + S-50 + S-100 accepted / PASS; S-200+ remain OPEN** |
| A-Series Assurance | **Public foundation merged / real A-SOAK Attempt 1 not launched** |
| D-5000 | **NOT ACCEPTED**; live Attempt 3 run `37908203516` was in progress at the documentation snapshot |
| Efficiency E-Series | **Active qualification; no final E PASS claimed** |
| Hidden-value H-Series | **H/CACHE-COMPOUND + H/SECOND-OPINION + H/ARBITRAGE PASS/CLOSED; H/CHAOS-FUZZ OPEN** |
| Account → Organization → Tenant | **Implemented / accepted; managed implementation owned by TRUYN Platform** |
| Managed authority runtime/accounting | **Implemented / accepted in TRUYN Platform; public repository exposes contracts/reference seams only** |
| Managed authority live production deployment | **OPEN** |
| A2A/MCP C1–C8 + P2-E1/E2/E3 | **Accepted bounded profile** |
| NLWeb interoperability | **Bounded pinned NLWeb 0.5 profile implemented / executable-evidence proven** |
| Five first-party SDK clients | **Implemented / executable conformance** |
| Native GUI clients (`.exe/.dmg/.deb/.apk`) | **Implemented / exact-head four-platform build-qualified** |
| PyPI / Go / npm alpha.2 | **Accepted immutable public releases** |
| Maven Central | **Accepted immutable public release — `org.truyn:truyn-sdk:0.1.0-alpha.1`** |
| NuGet.org | **Accepted immutable public release — `Truyn.Sdk 0.1.0-alpha.1`** |
| Open 1.0 productization | **S01–S102 complete; S103 active; stable 1.0 not reached** |
| Governance | **G1 / bootstrap Founding Stewardship** |
| Stable mainnet | **Not yet** |

The canonical factual source is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Operational D-scale status remains delegated to [Network Scale Status](docs/operations/NETWORK_SCALE_STATUS.md). The latest H-Series closure sanitation is [H/CACHE-COMPOUND publication sanitation — 2026-10-10](docs/operations/H_CACHE_COMPOUND_SANITATION_2026-10-10.md). A-Series reconciliation remains recorded in [Documentation Sanitation — 2026-10-09 A-Series](docs/operations/DOCUMENTATION_SANITATION_2026-10-09_A_SERIES.md).

### Status vocabulary

Repository documentation distinguishes:

- **implemented** — code/contracts exist and are test-covered;
- **exercised / diagnostic** — a real run happened but did not close the gate;
- **accepted** — immutable evidence satisfies the fixed acceptance contract;
- **open** — the acceptance boundary is not closed.

A failed/diagnostic attempt is evidence, not PASS.

A-Series public foundation [PR #922](https://github.com/inn-media/truyn/pull/922) was merged at `64fc6e845339880da19f43298a3f863122759496`; public runtime release controller [PR #925](https://github.com/inn-media/truyn/pull/925) at `480d70442b4044057399a031f895f6f9ab97231d`. Neither merge is real A-SOAK acceptance. [Assurance contract](docs/assurance/README.md) defines A-SOAK → A-OPS → A-SLO → A-WIRE → A-NET; private A-MGMT belongs to TRUYN Platform. No published immutable A-SOAK runtime or paid SOAK Attempt 1 was verified at this snapshot.

## Current scale boundaries

D-200 is accepted and repeatability-confirmed. **D-500 is accepted and repeatability-confirmed**. **D-1000 is accepted** on Attempt 1 workflow run `37687469411`, GitHub `run_attempt=2`, with strict `TRUYN_D1000_TERMINAL result=PASS` on frozen source `c1d3fa087716dbf24d0b3b65bceae303e907160a` / tree `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`: 20 hosts / 1,000 real processes, baseline 100%, post-restart 99%, healed 100%, convergence 100%, zero acknowledged-write loss and complete cleanup. The successful D-1000 scale floor is canonical in `main` at `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`. See `docs/benchmarks/CLASS_D_1000_2026-10-08.md`.

S-Series now has four accepted checkpoints: the bounded **S-10 ECON/MIX integration baseline**, the **S-20 five-scenario gate**, the full **S-50 eight-scenario 50-node scale gate**, and the full **S-100 eight-scenario 100-node scale gate**. S-100 Attempt 1 passed `ECON`, `MIX`, `XBORDER`, `CHAIN`, `CHURN`, `COST-ROUTING`, `CONTENTION` and `LANG` at 100 simultaneously live semantic nodes. Headline evidence includes 98.903% input-token reduction, 98.682% comparable GPT/Gemini provider-cost reduction, CHURN recovery p95 54.002 s, 100/100 contention completion with maxInFlight 100, and 100/100 multilingual cases across EN/TR/ZH/RU/AZ. S-200+ remain independent OPEN gates. See `docs/benchmarks/S_SERIES_S10_2026-10-07.md`, `docs/benchmarks/S_SERIES_S20_2026-10-07.md` and `docs/benchmarks/S_SERIES_S50_2026-10-08.md`.

E-Series has active qualification/isolation/provider-smoke work. No final E/DECOMPOSE, E/PER-RESULT, E/KNEE or E/DEGRADE result is claimed.

## Authority boundary

TRUYN authority comes from authenticated identity plus authoritative account/tenant/provider/grant/entitlement state. Requester/provider metadata is not authority. Managed production authority and commercial control-plane implementation belong to private `inn-media/truyn-platform`; public TRUYN retains open protocol/reference behavior, contracts and conformance. Public code never depends on private code.

## A2A + MCP + TRUYN

Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 bidirectional referenced-artifact proof, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## NLWeb + TRUYN

TRUYN Open implements a **bounded pinned NLWeb 0.5 interoperability profile** against exact upstream `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

The accepted surface covers authorization-aware semantic WHO discovery over eligible TRUYN candidates, deterministic public/reference selection, WHO→ASK composition through canonical TRUYN authority/dispatch, exact profile negotiation, structured correlation/provenance preservation, private-provider invisibility, fail-closed unsupported profiles and explicitly tested bounded bridge mappings.

This is not a stable NLWeb-v1 claim and does not make NLWeb a TRUYN transport or `TRUYN/1` dependency. Crawling/ingestion, indexing, vector search, RAG corpus ownership, publisher/content rights, advertising/campaign data and Data Graph business semantics remain outside the TRUYN NLWeb layer.

## SDK / developer experience

TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party clients participate in shared executable conformance. PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2` are accepted immutable public releases. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease.

Open 1.0 productization is still in progress. The durable task anchor records S01–S102 complete and S103 active; stable Open 1.0 is not declared until the remaining sequence and final independent reconciliation close.

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
5. `docs/operations/NETWORK_SCALE_STATUS.md` — current D-Series operational acceptance;
6. `docs/architecture/IMPLEMENTATION_STATUS.md` — repository-wide factual maturity;
7. `docs/operations/DOCUMENTATION_SANITATION_2026-10-09_A_SERIES.md` — latest A-Series documentation reconciliation; `docs/operations/DOCUMENTATION_SANITATION_2026-10-08.md` retains D-1000 acceptance sanitation;
8. `docs/operations/S_SERIES_SANITATION_S100_2026-10-08.md` — current S-Series reconciliation;
9. `docs/benchmarks/` — immutable accepted/failed measured evidence;
10. `ROADMAP.md` — next gates.

Historical issues/PRs/docs remain audit history and do not override later accepted evidence. Historical benchmark evidence is append-only under the repository **redact-not-delete** policy.

## License

Apache License 2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).

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

**D-5000 current update:** Attempt 1 was later executed and failed; additional attempts followed. At this snapshot [Attempt 3 run #37908203516](https://github.com/inn-media/truyn/actions/runs/37908203516) was in progress. Do not treat the dated preparation passage below as current status or any offline pass as final D-5000 acceptance.

## Historical D-5000 Attempt 1 preparation snapshot (2026-10-08; superseded)

D-1000 Attempt 1 and independent exact-frozen Double-Check are **PASS / REPEATABILITY CONFIRMED** (runs `37687469411` and `37785777704`). The next planned gate is **D-5000 Attempt 1: 20 hosts × 250 real processes = 5,000**. Exact D-1000 launchers and original launch marker are preserved on public branch [`d5000/attempt1-preparation-20261008`](https://github.com/inn-media/truyn/tree/d5000/attempt1-preparation-20261008), without changing frozen D-1000 evidence. Azure quota-only workflow run [`37795027151`](https://github.com/inn-media/truyn/actions/runs/37795027151) was dispatched separately with a provisional 800-vCPU regional/family quota target in `southcentralus`; do not infer approval or usable VM capacity from dispatch. D-5000 benchmark **has not been launched**. Work remains: adapt 50-node cap to 250 per host, exact 5,000-node evaluator, runtime qualification, live Azure quota/capacity, security/durability/recovery/cleanup gates. Never run D-5000 without a new explicit launch authorization. Authority: [`docs/operations/class-d/D5000_ATTEMPT1_PREPARATION_2026-10-08.md`](https://github.com/inn-media/truyn/blob/main/docs/operations/class-d/D5000_ATTEMPT1_PREPARATION_2026-10-08.md).

### Verified real T-Series benchmark

The independently audited [T/BREAK-EVEN-REAL-BENCHMARK Attempt 6 results](docs/benchmarks/T_BREAK_EVEN_REAL_ATTEMPT6_ACCEPTED_RESULTS.md) are **PASS** (57/57 HTTP 200, 57/57 exact-answer, all A–E scenarios). This establishes valid measured execution, **not** a universal USD cost break-even.
