# TRUYN Semantic Scale S-Series Architecture

Status: **DEFINED / NOT YET EXECUTED**  
Track: **S-Series (Semantic Scale)**  
Target ladder: **S-50 → S-100 → S-200 → S-500**

## Purpose

The S-Series is the live semantic-node scale benchmark family for TRUYN. It combines two already-proven layers without redefining either of them:

1. the real network/resilience substrate proven by the Class-D line; and
2. the live seven-actor semantic/provider path proven with GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi.

The S-Series exists to measure whether those two layers remain correct and economically useful when many independently identified TRUYN nodes are simultaneously backed by real AI inference.

This track is intentionally separate from the existing **Semantic Retrieval Scale Gate v3**, which scaled immutable corpus/index size and included functional identity exercises but explicitly did not prove real WAN-node scale with live heterogeneous inference.

## Repository ownership boundary

S-Series follows the permanent two-repository rule **Private may depend on Public; Public must never depend on Private**.

Public `inn-media/truyn` owns the reproducible benchmark architecture/methodology, node/scenario acceptance contract, generic/reference runner using only public TRUYN surfaces, public-safe configuration/telemetry schemas, evaluator/conformance logic and sanitized benchmark evidence.

Private `inn-media/truyn-platform` owns managed cloud orchestration, real cloud account/subscription/project topology, provider credentials/service identities/deployments/private endpoints/allowlists, quota/entitlement/spend controls, raw/private telemetry, tenant state, proprietary routing/ranking/trust/cost intelligence, private analytics/historical data and production operations.

Cross-repository S-Series work is `BOTH` only when a public contract/reference surface changes and the private managed executor must adapt. Such work uses independent linked PRs; private automation never writes to public, and private code consumes public only through accepted immutable/versioned surfaces.

Canonical ownership contract: `docs/architecture/S_SERIES_OPEN_PRIVATE_BOUNDARY.md`.

## Reuse-only rule

S-Series must not create a second TRUYN network architecture.

It reuses, as-is unless a measured defect requires an independently qualified repair:

- TRUYN identity and signed envelopes;
- `OFFER` / `NEED` / `RESULT` semantics;
- the current Node/Relay/adapter runtime;
- the accepted Class-D sparse `host-stratified-xor` bootstrap model;
- periodic peer refresh and readiness barriers;
- the semantic contract `question + root CID → retrieval → provenance verification → minimal context → provider`;
- existing provider adapters and provider isolation/authorization;
- existing telemetry primitives and append-only benchmark evidence policy.

A S-Series benchmark is not a place to introduce a new protocol, discovery algorithm, trust model, billing model, provider transport or retrieval algorithm.

## Existing evidence used as the foundation

The S-Series starts from existing bounded evidence, not from assumptions:

- **Class D-200 accepted:** 20 hosts / 200 real processes / 200 identities / 200 endpoints, sparse bootstrap, readiness 200/200, routing gates at 100%, restart recovery p95 28,717 ms, real packet-partition recovery 32,159 ms, zero acknowledged-write loss and zero unauthorized provider execution. Canonical evidence: `docs/benchmarks/CLASS_D_200_2026-09-20.md`.
- **Seven live semantic actors accepted:** GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi; 7 distinct TRUYN identities; 56/56 provider stages; 100% answer/provenance/minimal-context correctness; 97.313% mean provider input-token reduction. Canonical evidence: `docs/benchmarks/SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`.
- **Semantic retrieval/index scale accepted:** the separate v3 gate proves the requester/provenance/minimal-context contract at 600 / 10,000 / 100,000 immutable blocks, but does not substitute for a live S-Series WAN benchmark. Canonical evidence: `docs/benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md`.

S-Series results must preserve these boundaries and must not retrospectively broaden any earlier claim.

## Node definition

For S-Series, a counted semantic node is a **real independently identified TRUYN runtime process** that participates in the real network and is assigned a real text inference provider path from this set:

- OpenAI GPT;
- Google Gemini;
- xAI Grok;
- DeepSeek;
- Meta Llama;
- Mistral;
- Moonshot Kimi.

A counted S-node must have:

- a unique TRUYN identity;
- a real network endpoint/process;
- an eligible provider assignment;
- provider authorization that passes before execution;
- independently attributable request/latency/token/cost telemetry;
- no synthetic replacement for the provider execution being measured.

Provider transport implementation may be shared where TRUYN already shares it; vendor identity remains separate in telemetry.

## S-Series ladder

| Gate | Semantic nodes | Primary purpose |
|---|---:|---|
| **S-50** | 50 | integration baseline: real network + real seven-vendor inference; establish clean telemetry and A/B economics |
| **S-100** | 100 | confirm invariance as semantic node count doubles; produce comparable scale curves |
| **S-200** | 200 | semantic counterpart at the already-proven D-200 network scale |
| **S-500** | 500 | large live semantic-network benchmark for economics, cross-border operation, contention and policy routing |

Passing S-50 does not imply S-100/S-200/S-500. Each gate requires its own immutable run identity and evidence.

## Provider assignment profiles

The same seven vendor families are exercised through three assignment profiles already defined for the S-Series:

1. **balanced** — assignments are as even as the node count permits;
2. **skewed** — 60% of nodes use one selected vendor and the remainder are distributed across the others;
3. **per-request randomized** — eligible vendor assignment/selection changes per request according to the benchmark seed and recorded policy.

The benchmark must record the exact assignment map and seed. Vendor mix is benchmark input, not an undocumented runtime variable.

## Scenario families

The S-Series scenario names are fixed:

| Scenario | Purpose |
|---|---|
| `ECON` | paired DIRECT vs TRUYN economics at node scale |
| `MIX` | vendor-mix invariance under balanced, 60%-skewed and randomized assignment |
| `XBORDER` | multi-region / multi-cloud cross-border path, partition and heal behavior |
| `CHAIN` | multi-hop research → review → synthesize with different vendors across hops |
| `CHURN` | provider/node loss, partition and credential/provider revocation during active work |
| `COST-ROUTING` | eligible-provider selection under max-cost / min-trust / max-latency constraints |
| `CONTENTION` | concurrent NEED burst, provider rate-limit pressure, backpressure and cancellation behavior |
| `LANG` | multilingual semantic behavior for EN / TR / ZH plus RU / AZ |

Scenario execution contracts and metrics are defined in `docs/benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`.

## DIRECT vs TRUYN boundary

Every economic claim must be paired on the same task/workload:

```text
DIRECT
  same task
  + full comparison context
  → selected provider

TRUYN
  same task
  + question/root reference
  → TRUYN retrieval/routing
  → minimal verified context
  → eligible provider
```

The TRUYN arm includes TRUYN routing/retrieval overhead. One-time reusable publication/index costs are reported separately and amortized explicitly; they are never silently removed from the accounting.

Gross provider list-price-equivalent cost and current net cash cost/credits must remain separate fields.

## D-Series non-interference contract

S-Series and D-Series are separate benchmark tracks and may run in parallel only when isolation is preserved.

The S-Series must use:

- its own GitHub workflow names and paths;
- its own concurrency groups (`truyn-s-series-*`);
- its own launch-token namespace if single-shot launch tokens are used;
- its own cloud resource prefixes/resource groups/projects or other independently attributable ephemeral namespaces;
- its own artifacts and evidence filenames;
- its own run/task identifiers;
- independent cleanup verification.

S-Series must **not**:

- modify a frozen D-Series tested source, evaluator, launcher or accepted evidence;
- use a D-Series launch token or concurrency group;
- reuse ephemeral D-Series resource identities;
- change D-Series acceptance thresholds;
- consume shared quota/capacity in a way that can alter a contemporaneous D-Series result.

If quota/capacity isolation cannot be demonstrated before launch, the S-Series run fails closed or waits; it must not make a D-Series run ambiguous.

Conversely, a D-Series result is not allowed to satisfy an S-Series semantic/provider gate merely because the node count is equal.

## Cross-border claim boundary

`XBORDER` is not satisfied by labels alone. A run that makes a cross-border claim must record enough sanitized evidence to prove the participating topology spans the declared regions/clouds and the declared country/jurisdiction boundary, while withholding private addresses and resource identifiers.

The target topology is at least:

- **3 cloud regions**;
- **2 cloud providers**;
- **2 countries/jurisdictions** for an actual cross-border claim.

Network path, region/cloud placement, partition/heal and provider execution telemetry must remain attributable to the same immutable run.

## Security boundary

The existing invariant remains unchanged:

```text
public TRUYN reachability != permission to spend an owner's AI quota
```

S-Series owner-funded benchmark providers remain owner-authorized benchmark resources. Unauthorized requests must be denied before provider execution; the required measured value remains zero unauthorized provider calls.

## Evidence boundary

Each executed S gate must produce a durable report under `docs/benchmarks/` and retain, when safe:

- tested source SHA/tree;
- workflow/run/attempt identity;
- scenario/profile/seed;
- node/provider/region distribution;
- fixed gates before launch;
- measured raw/normalized telemetry or cryptographic identities for withheld raw artifacts;
- model/version identifiers used for the run;
- methodology and calculation definitions;
- failures, corrections and limitations;
- artifact IDs/digests;
- cleanup result.

Benchmark evidence remains append-only and follows the repository rule: **redact sensitive values, do not delete measured evidence**.

Private raw telemetry and managed operational detail remain in `inn-media/truyn-platform`; public reports contain only sanitized, reproducible evidence or cryptographic identities for withheld raw artifacts.

## Current status

Architecture and measurement contract are being defined. **No S-50, S-100, S-200 or S-500 PASS is claimed by this document.**
