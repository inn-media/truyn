# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`.

**Snapshot:** 2026-09-20  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**

## Current top-level state

| Track | Current state | Immediate next gate |
|---|---|---|
| Network | **Class C + D-100 + D-200 accepted** | D-500 / D-1000 external scale qualification |
| Production operations | **contracts implemented** | live evidence |
| Provider authority | **repository/runtime semantics accepted** | live managed deployment evidence |
| A2A/MCP | **C1–C8 + P2-E1/E2/E3 accepted** | stable-v1 only after stable TRUYN + ecosystem evidence |
| NLWeb | **BOUNDED PINNED 0.5 PROFILE IMPLEMENTED / EXECUTABLE-EVIDENCE PROVEN** | later profiles require explicit requalification |
| SDK/DX | **Five clients/conformance implemented; PyPI + Go + npm alpha.2 accepted** | Maven/NuGet + Descriptor/site completeness |
| Commercial proof / T-series | **FOUNDATION ACTIVE / no result claim** | telemetry qualification → pilots → immutable final T/BREAK-EVEN, T/HEAD-TO-HEAD, T/PREDICT |
| Hidden-value / H-series | **FOUNDATION ACTIVE / no result claim** | telemetry + private runner qualification → isolated pilots → immutable H/CACHE-COMPOUND, H/SECOND-OPINION, H/ARBITRAGE, H/CHAOS-FUZZ |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers → multi-org TSC → neutral stewardship |
| Mainnet | **Not productionized** | larger D-scale + live ops + release/governance gates |

## Network scale

Accepted milestones:

- [x] Class C heterogeneous WAN — accepted.
- [x] Class D-100 — accepted.
- [x] **Class D-200 — accepted** on immutable single-shot run `35503894414`, attempt 1, strict terminal `TRUYN_D200_TERMINAL result=PASS`.
- [ ] Class D-500 — open.
- [ ] Class D-1000 — open.
- [ ] long-duration operational stability / mainnet-scale closure — open.

D-200 accepted evidence is frozen to source `e91c165c67c655deb80df4511ca346acb9f1f45b` / tree `3a402ba72502de12ed2277db3c9f472872f44b46`, with artifact ID `10603748497` and digest `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`.

The D-200 gate proved 20 hosts / 200 real processes, readiness 200/200, baseline routing 400/400, post-restart routing 100/100 first-attempt with zero application retries, healed routing 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, real packet-partition recovery `32,159 ms`, 100 acknowledged durable writes with zero loss, zero safety violations, and complete campaign + staging cleanup with zero remaining resources.

Evidence: [`docs/benchmarks/CLASS_D_200_2026-09-20.md`](docs/benchmarks/CLASS_D_200_2026-09-20.md).

## A2A / MCP

Accepted bounded profile includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1 referenced artifacts, P2-E2 compatibility generation `a2a-mcp-pre-v1/g1`, and P2-E3 canonical reconciliation. **Stable A2A/MCP v1 is not declared** because `TRUYN/1` remains draft.

## NLWeb interoperability and semantic discovery

NLWeb is an external interoperability profile around TRUYN, alongside A2A and MCP. It is **not** a TRUYN transport replacement and does not become a `TRUYN/1` wire dependency.

Accepted Open 1.0 scope is pinned to NLWeb protocol **0.5** at exact upstream source `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

```text
NLWeb WHO
   ↓
TRUYN semantic/native discovery
   ↓
authorized + eligible providers / agents / endpoints
   ↓
deterministic public/reference selection
   ↓
NLWeb ASK
   ↓
TRUYN authority / routing / relay / execution
```

Canonical principle:

> **NLWeb provides semantic discovery and interaction semantics; TRUYN provides distributed discovery, eligibility filtering, selection, execution and transport.**

Development sequence:

- [x] **NW-0 — Architecture/boundary:** public interoperability edge, semantic WHO over TRUYN, application/data concerns outside TRUYN, exact upstream pin;
- [x] **NW-1 — Adapter core:** bounded client/provider contracts, exact profile negotiation and request/response/error/correlation normalization;
- [x] **NW-2 — Semantic discovery/advertisement:** authorization-aware eligible discovery, capability/profile handling and deterministic public/reference selection;
- [x] **NW-3 — `who → selection → ask`:** eligible candidate selection, canonical authority before dispatch, structured response/provenance/correlation preservation;
- [x] **NW-4 — Routing/relay/security:** fail-closed negotiation, private-provider invisibility and zero unauthorized execution invariants;
- [x] **NW-5 — Bridge profiles:** claimed NLWeb/TRUYN/MCP/A2A mappings tested; unsupported/lossy mappings remain explicit failures/non-claims;
- [x] **NW-6 — External conformance:** independent pinned-profile NLWeb black-box run `35487917472` attempt 1 SUCCESS against exact qualified SUT `a28cba182b9cddde34bc34894180d14cfa166d2b`.

TRUYN Open retains deterministic/reference selection so this profile is useful without the private platform. Any private managed ranking is an optimization over an already eligible candidate set and never an authorization source.

Explicit non-goals: crawler/ingestion implementation, indexing, vector search, RAG corpus ownership, brand/news/product content models, publisher/content rights, advertising/campaign data and Data Graph business semantics.

The accepted claim is bounded to the pinned 0.5 profile. Stable NLWeb v1 and later upstream profiles are not claimed and require explicit compatibility work plus executable requalification.

## SDK / developer release

Implemented: TypeScript/JavaScript, Python, Go, Java and C#/.NET clients with shared conformance. Accepted immutable releases include PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2`. Maven Central and NuGet remain open.

## T-series commercial proof

The T-series converts existing technical evidence into reproducible commercial evidence without changing protocol acceptance criteria.

Canonical public contract: [`docs/benchmarks/T_SERIES_COMMERCIAL_PROOF.md`](docs/benchmarks/T_SERIES_COMMERCIAL_PROOF.md).

### T0 — Foundation — ACTIVE

- [x] define open/private benchmark boundary;
- [x] define normalized telemetry/evidence vocabulary;
- [x] define T/BREAK-EVEN methodology;
- [x] define T/HEAD-TO-HEAD methodology including NAIVE, bare MCP, bare A2A, NLWeb and NLWeb-over-TRUYN;
- [x] define T/PREDICT methodology including p99, guardrails and controlled stress;
- [ ] implement common telemetry emitters/exporters;
- [ ] implement immutable run/acceptance/price/workload manifests;
- [ ] qualify public-safe deterministic evidence export.

### T1 — Comparator and billing qualification

- [ ] pin exact comparator implementations/profiles;
- [ ] qualify provider-reported billed-usage capture;
- [ ] qualify public price-snapshot ingestion;
- [ ] prove all TRUYN setup/fixed/variable overhead is attributable;
- [ ] qualify paired-order randomization and cold/warm cache strata;
- [ ] validate deterministic/blinded quality scoring.

### T2 — T/BREAK-EVEN

- [ ] pilot three corpus classes;
- [ ] measured logarithmic volume sweep;
- [ ] low/mainstream/premium price snapshots where available;
- [ ] compute variable and fully-loaded `N*`;
- [ ] final immutable run only after telemetry + billing qualification;
- [ ] publish `$/request vs volume` curves and limitations.

### T3 — T/HEAD-TO-HEAD

- [ ] freeze multi-hop workload and comparator configs;
- [ ] paired randomized runs across NAIVE/MCP/A2A/NLWeb/TRUYN;
- [ ] separate NLWeb-over-TRUYN bridge run;
- [ ] report tokens, gross cost, E2E latency, context duplication, quality and evidence capability matrix;
- [ ] publish exact comparator pins/config and immutable evidence.

### T4 — T/PREDICT

- [ ] pilot >=1,000 samples/arm/condition;
- [ ] final p99 proof >=10,000 measured samples/arm/condition;
- [ ] baseline cost/latency distributions;
- [ ] provider slowdown, rate-limit and path/region degradation stress;
- [ ] max-cost/deadline/reroute/fail-closed guardrail proof;
- [ ] publish percentile-band and p99-shift evidence.

### T5 — Commercial evidence closure

- [ ] independent reconciliation of all three T-series reports against raw evidence and frozen manifests;
- [ ] safe public reports committed to append-only benchmark ledger;
- [ ] private operational/raw evidence retained under `truyn-platform` policy;
- [ ] no investor/client claim exceeds the exact measured scope.

No T-series gate may weaken existing safety, authorization, provenance or benchmark-evidence requirements. Foundation documents are not benchmark results.

## H-series hidden-value discovery

The H-series tests emergent network value and adversarial robustness that are not guaranteed merely because the protocol works.

Canonical public contract: [`docs/benchmarks/H_SERIES_HIDDEN_BENCHMARKS.md`](docs/benchmarks/H_SERIES_HIDDEN_BENCHMARKS.md).

### H0 — Foundation — ACTIVE

- [x] define OPEN/PRIVATE benchmark boundary;
- [x] define paired-control and frozen-manifest rules;
- [x] define common H telemetry/evidence schema;
- [x] define H/CACHE-COMPOUND methodology;
- [x] define H/SECOND-OPINION methodology;
- [x] define H/ARBITRAGE methodology;
- [x] define H/CHAOS-FUZZ methodology;
- [x] bind H to the common D/S/T/H series-isolation contract;
- [ ] implement H telemetry emitters and deterministic exporter;
- [ ] implement private hidden seed/dataset/config precommitment;
- [ ] qualify isolated private runner and evidence schemas.

### H1 — Instrumentation and isolation qualification

- [ ] dedicated H benchmark requester/provider attribution;
- [ ] per-run cache/artifact/index/budget namespaces;
- [ ] provider billed-usage and public price-snapshot capture;
- [ ] cross-series R0/R1/R2 preflight and interference detector;
- [ ] exact safe export from private raw evidence to public bundle;
- [ ] negative authorization controls prove zero unauthorized owner-funded calls.

### H2 — H/CACHE-COMPOUND

- [ ] immutable corpus + controlled Zipf overlap generator;
- [ ] 50/100/200-node cells with cold and steady-state strata;
- [ ] reuse-disabled paired control;
- [ ] same-node vs cross-node reuse attribution;
- [ ] pilot effect-size/variance qualification;
- [ ] immutable final campaign and independent metric recomputation.

### H3 — H/SECOND-OPINION

- [ ] hidden gold dataset with calibration/validation/holdout split;
- [ ] all seven single-vendor baselines;
- [ ] majority, trust-weighted and verify→dispute policies;
- [ ] disagreement-subset and error-diversity telemetry;
- [ ] accuracy lift, trust lift, cost multiplier and accuracy-per-dollar;
- [ ] immutable holdout campaign with no gold leakage.

### H4 — H/ARBITRAGE

- [ ] pinned public price snapshot ingestion;
- [ ] deterministic scripted price-shock timeline;
- [ ] STATIC / TRUYN_COST_AWARE / ORACLE arms;
- [ ] reaction-lag, misroute, regret and captured-arbitrage metrics;
- [ ] herd/rate-limit/oscillation scenario;
- [ ] separate live-price observational run when real price movement exists.

### H5 — H/CHAOS-FUZZ

- [ ] seeded generator families and invariant engine;
- [ ] exclusive R2 fault-target leases;
- [ ] protocol/provider/identity/timing/trust fault coverage matrix;
- [ ] deterministic reproduction + minimization pipeline;
- [ ] every confirmed defect becomes a permanent regression test;
- [ ] final closure requires zero critical safety-invariant violations and closure of all acceptance-blocking findings.

### H6 — Hidden-value evidence closure

- [ ] independent reconciliation against frozen manifests and raw evidence;
- [ ] preserve negative/failed campaigns under append-only evidence policy;
- [ ] publish safe reports, sanitized per-sample evidence and cryptographic digests;
- [ ] retain security-sensitive/raw operational material only in `truyn-platform`;
- [ ] no moat/accuracy/arbitrage/robustness claim exceeds the exact measured scope.

H-series lanes may progress in parallel with D, S and T on disjoint state/resources. H/CHAOS-FUZZ fault injection and any mutable shared capacity/cache operation require exclusive R2 ownership; waiting is `WAITING_SHARED_RESOURCE`, never a reason to cancel or contaminate another series.

Foundation documents are not benchmark results.

## Stable/mainnet gate

Stable/mainnet remains gated by the remaining external D-scale/security/reliability qualification, live production operations/authority evidence, stable protocol/ecosystem compatibility, complete stable SDK/Descriptor/site evidence and appropriate governance maturity. D-200 acceptance and NLWeb 0.5 bounded interoperability acceptance do not by themselves declare stable TRUYN or mainnet.

Operational network-scale status remains delegated to [docs/operations/NETWORK_SCALE_STATUS.md](docs/operations/NETWORK_SCALE_STATUS.md).
