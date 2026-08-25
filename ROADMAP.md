# TRUYN Roadmap

This roadmap describes intended engineering, ecosystem and governance milestones and factual maturity. Protocol semantics live in `spec/`; governance rules live in `GOVERNANCE.md` + `docs/governance/`; measured claims live in `docs/benchmarks/`. Canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`.

The implementation has not evolved strictly in version order: semantic, provider, Trustability and benchmark layers advanced faster than the physical peer-network underlay. The roadmap therefore reports **what is actually accepted now**, not what an old milestone ordering expected to happen next.

Developer experience, A2A/MCP interoperability, governance and settlement remain explicit tracks. They may progress in parallel, but none may be used to imply network/mainnet maturity that has not been proved.

## Maturity scale

1. **Defined** — architecture/specification exists.
2. **Implemented** — executable reference code exists.
3. **CI-proven** — automated tests prove the bounded contract.
4. **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
5. **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
6. **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
7. **Stable** — compatibility and upgrade guarantees are declared.

An immutable **preflight/admission PASS is not the same as the campaign PASS**. A real scale gate closes only when its canonical evaluator, strict terminal verifier, safety/adversarial predicates and cleanup contract all pass and durable evidence is preserved.

Governance uses its independent G0→G5 factual maturity axis.

## Current snapshot — 2026-08-25

| Area | Current maturity |
|---|---|
| TRUYN/1 logical protocol | Defined / partial implementation; still draft |
| v0.1 Connect underlay | Implemented + CI-proven |
| Signed peer-record lifecycle | Implemented + CI-proven |
| **Class C heterogeneous WAN/reachability** | **ACCEPTED / PASS — 2026-08-18**; real Azure/GCP, direct QUIC, packet partition/heal, NAT, double-NAT/CGNAT-like path, authenticated relay outage/recovery, cleanup |
| **Class D-100** | **ACCEPTED / PASS — 2026-08-22**; 100 real processes/identities/QUIC endpoints on 4 hosts, canonical evaluator + strict terminal PASS, all required adversarial classes, cleanup with 0 remaining resources |
| **Class D-1000** | **Admission/preflight PASS; latest full 20×50 attempt FAIL; acceptance OPEN.** Exact candidate `ee0732b57a602bea8df9f964bf5fe27d19ee77f8` passed immutable admission, but run `32854968438` / issue `#323` failed during host0 install before evaluator/terminal acceptance. Actual finalizer cleanup confirmed 0 remaining Azure resources. |
| Semantic retrieval/index/distributed retrieval | Implemented + extensive CI/benchmark evidence |
| Provider ownership/authorization/BYOK | Implemented reference baseline |
| Billing safety | BYOK/owner-funded implemented; sponsored guard requires external durable store/issuer; prepaid/subscription fail closed |
| **DCO 1.1 contribution provenance** | **Accepted + CI-implemented**; PR-only `DCO` job checks full PR base→head commit range; no manual DCO dispatch |
| A2A/MCP interoperability | MCP `2026-07-28` selected current-contract slice implemented/CI-proven; general MCP discovery/import remains open; A2A and bidirectional A2A↔TRUYN↔MCP bridge defined only |
| Settlement adapters | Defined only; implementation intentionally deferred; first targets x402 + AP2 |
| Trustability v1/v2 | Implemented + CI/benchmark proven; bounded real-network trust slice proven |
| Multi-cloud text/image/video providers | Implemented reference adapter paths; individual deployment availability varies |
| SDK / developer experience | Defined architecture; repository scaffolding only; required first-party targets: JavaScript/TypeScript, Python, Go, Java, C#/.NET |
| Governance / standardization | G1 public governance architecture/process defined; operational governance remains bootstrap Founding Stewardship |
| Production relay origin perimeter | Deployment-proven for the accepted Cloudflare → Azure Front Door → Container Apps path |
| Mainnet | Not productionized / not stable |

## Immediate repository and contribution hygiene

TRUYN separates **durable evidence** from **temporary operational machinery**:

- `docs/benchmarks/` is the append-only measured evidence ledger; sensitive fields are redacted rather than deleting reports;
- one-shot cloud launchers are removed from `main` after their terminal evidence is pinned;
- temporary diagnostic/verification PRs are closed without merge when superseded;
- completed/superseded STARTED/FAIL/PASS operational issues are closed while preserving their discussion and audit history;
- active remediation is represented by one actionable issue rather than a trail of stale generated status issues;
- stale operational artifacts must never remain open merely because they once participated in a historical run.

Contribution provenance is DCO 1.1. The current CI job named `DCO` runs only for pull requests and verifies `pull_request.base.sha → pull_request.head.sha`. Pushes to `main` run the ordinary test job; no synthetic `HEAD^` merge-commit DCO re-check is used.

## Network Productionization Gate — **PRIMARY CURRENT TRACK**

### Closed prerequisites

- [x] v0.1 real QUIC/Kademlia/P2P/NAT reference underlay;
- [x] repeatable Class B four-host public/private testnet proof;
- [x] crash/restart identity and durable routing/DHT state reference slice;
- [x] DHT replication, quorum and repair reference slice;
- [x] automatic signed peer-record renewal before expiry;
- [x] persistence before renewed-record dissemination;
- [x] authenticated peer-record announcement and later-contact PING repair;
- [x] stale P2P/DHT-RPC client invalidation on newer signed peer state;
- [x] durable bounded admission/backpressure process-restart reference slice;
- [x] **Class C heterogeneous WAN/reachability accepted** — multi-cloud/multi-region, direct QUIC, real packet partition/heal, Azure NAT, double-NAT/CGNAT-like path, authenticated relay fallback/outage/recovery;
- [x] **Class D-100 accepted** — 100 real processes, 100 identities, 100 QUIC endpoints, four hosts, baseline/healed routing 100%, recovery/convergence p95 32.09 s, required adversarial predicates, zero accepted safety violations, strict cleanup closure.

Durable evidence:

- `docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`
- `docs/benchmarks/CLASS_D_100_2026-08-22.md`

### Current D-1000 state — **admission PASS; latest full campaign FAIL; acceptance OPEN**

Current admitted exact candidate:

```text
tested source: ee0732b57a602bea8df9f964bf5fe27d19ee77f8
pinned ref: d1000/pinned-ee0732b5
exact CI run: 32853716543 = success
exact CodeQL run: 32853711776 = success
immutable preflight run: 32853975632 = PASS
immutable preflight issue: #320 (completed/closed operational evidence)
artifact ID: 9565547060
artifact digest: sha256:cbcce8b42d52791799a50d18fe9313897fccba7725890badec82a006a9881b75
runtime bundle sha256: 3951f3a5bd3099ffd4bafe9cb13959e9cec06e07e464f62c5bdc3839691723bd
real one-VM guest smoke: PASS
preflight cleanup: true
preflight remaining resources: 0
```

The candidate includes the portable immutable runtime correction merged by PR `#315`. The preflight proves exact green source, immutable runtime identity and successful execution/cleanup on a real Azure Ubuntu 22.04 `Standard_E2as_v7` guest.

The subsequent full pinned attempt did **not** pass:

```text
full run: 32854968438
start issue: #321 (completed/closed operational evidence)
terminal issue: #323 (completed/closed negative operational evidence)
launcher commit: 99e64ad27c8f51b4b616ca85cfb7b4709759a07e
hosts/nodes target: 20 × 50 = 1,000
result: FAIL
failure stage: host0 guest install
failure location: scripts/class-d-1000-final-acceptance.sh line 194
evaluator_rc: 99
terminal_rc: 99
terminal issue cleanup fields: cleanup=false, remainingResources=-1
actual campaign finalizer cleanup: confirmed=true, remaining=0
active remediation issue: #325
```

The `cleanup=false` / `remainingResources=-1` values in the generated terminal issue are fail-closed placeholders: the host0 install failure occurred before `class-d-1000-evidence.json` existed. The campaign job's finalizer independently recorded `TRUYN_CLASS_D_1000_CLEANUP confirmed=true remaining=0`, so this failed attempt left no Azure run-resource leak. That cleanup fact does **not** promote the attempt to PASS: evaluator/terminal acceptance was never reached.

The next accepted D-1000 must repair only the install/bootstrap failure and then repeat the exact-source admission and full pinned campaign without lowering the canonical contract:

- [ ] minimal host0 install/bootstrap repair on a new exact source SHA;
- [ ] ordinary CI + CodeQL PASS on that exact SHA;
- [ ] fresh immutable runtime bundle + digest;
- [ ] fresh immutable admission/preflight PASS for that exact SHA;
- [ ] 20 VM / host failure domains as defined by the D-1000 harness;
- [ ] 50 real processes per host = **1,000 real processes**;
- [ ] 1,000 distinct identities;
- [ ] 1,000 distinct QUIC sockets/endpoints;
- [ ] baseline routing `>=99%`;
- [ ] healed routing `>=99%`;
- [ ] recovery p95 `<=120 s`;
- [ ] convergence p95 `<=120 s`;
- [ ] all required adversarial predicates exercised and passing;
- [ ] zero safety violations;
- [ ] canonical evaluator `PASS`;
- [ ] strict terminal verifier `PASS`;
- [ ] `cleanup=true`;
- [ ] `remainingResources=0`;
- [ ] immutable accepted-run artifact + digest;
- [ ] durable sanitized `docs/benchmarks/CLASS_D_1000_*.md` evidence record.

Historical D-1000 attempts with `evaluator_rc=99`, `terminal_rc=99`, skipped/failing campaign state or incomplete canonical evidence remain historical negatives; they do not compete with or override a future accepted exact-source tuple.

### After D-1000 acceptance

The later network/operations work still includes:

- carrier-operated CGNAT field validation beyond the accepted CGNAT-like emulation;
- replicated accepted-work survival after underlying host/volume loss;
- long-duration randomized churn/fault campaigns;
- broader production relay degradation/outage/fallback SLO distributions;
- larger Byzantine/Sybil/eclipse/collusion pressure beyond bounded accepted gates;
- measured p50/p95/p99 convergence, packet/byte overhead and recovery across longer heterogeneous WAN runs;
- Internet-scale throughput and operational SLO closure.

## Immediate security baseline

The following reference boundaries are already implemented and must remain invariant:

1. provider ownership bound to authenticated/signed provider identity rather than requester-controlled metadata;
2. server-side authorization before dispatch and again at provider-host execution;
3. default-deny/fail-closed provider behavior;
4. authorization-aware discovery hiding unauthorized private providers;
5. BYOK-by-default onboarding and credential locality;
6. billing responsibility checks before chargeable calls;
7. authenticated protected-provider backchannel option and public/control-plane separation;
8. legacy/fast/WebSocket paths preserving equivalent authorization semantics;
9. owner-funded/public-provider misconfiguration denied;
10. negative tests proving foreign users cause zero provider execution;
11. local development cannot coexist with public/production relay markers;
12. production relay direct-origin bypass is denied for the accepted Cloudflare/Azure topology;
13. sponsored mode cannot activate without actor-bound signed entitlement verification and an atomic durable usage store.

This is not a claim that rich account/org tenancy, commercial entitlement issuance, deployed durable accounting or mainnet security operations are complete.

## Governance & Standardization Gate

### GOV-0 — Governance contract — **DEFINED**

- [x] `GOVERNANCE.md`;
- [x] Contributor / Maintainer / Subsystem Maintainer / TSC / Chair / Security Response Team roles;
- [x] bootstrap Founding Stewardship disclosed honestly;
- [x] protocol governance separated from repository ownership, infrastructure operation and commercial ownership;
- [x] decision classes and voting/quorum/recusal rules defined;
- [x] factual `MAINTAINERS.md` roster.

### GOV-1 — RFC + extension framework — **DEFINED**

- [x] public RFC lifecycle;
- [x] Community → Experimental → Official → Core Candidate → Core extension lifecycle;
- [x] permissionless third-party Community Extensions;
- [x] official namespace target and promotion/conformance rules;
- [x] durable rejected/superseded decision history policy;
- [x] **mandatory DCO 1.1 contribution provenance adopted and CI checker implemented.**

### GOV-2 — Open maintainer model — **OPEN / ORGANIZATIONAL**

- [ ] earned external/independent Maintainers;
- [ ] routine review/merge without Founding Steward as the only practical reviewer;
- [ ] at least one real normative RFC handled through the public process.

### GOV-3 — Multi-organization TSC — **OPEN / ORGANIZATIONAL**

- [ ] at least three independent organizations/constituencies;
- [ ] no single organization voting majority;
- [ ] real decision/minutes/quorum/recusal evidence;
- [ ] Founding Steward no longer sole final normative authority.

### GOV-4 — Neutral stewardship — **OPEN / LEGAL + ORGANIZATIONAL**

- [ ] neutral legal/stewardship structure selected and executed;
- [ ] protocol/spec/marks/namespaces stewardship defined where applicable;
- [ ] neutral charter and required infrastructure independence established.

### GOV-5 — Stable ecosystem governance — **OPEN**

- [ ] succession, inactivity/removal, appeals, release/deprecation and security-emergency continuity demonstrated.

Technical release maturity and governance maturity remain separate dimensions.

## v0.1 — Connect — **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**

Closed: **2026-08-17**.

Implemented/CI-proven: cryptographic node identity independent of IP, real QUIC/UDP underlay, signed HELLO/ACCEPT sessions, signed peer/bootstrap records, Kademlia XOR routing, iterative discovery, networked `PING`/`FIND_NODE`/`STORE`/`FIND_VALUE`, direct signed envelopes, relay fallback, STUN, same-port UDP hole punching, bounded backpressure, `OFFER`/`NEED`/`RESULT`, minimal `REVOKE`, local/testnet profiles and composed `TruynNetworkNode` lifecycle.

Evidence: `docs/architecture/NETWORK_UNDERLAY_V01.md` and `docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`.

## v0.2 — Verify — **SUBSTANTIALLY IMPLEMENTED / LARGER SCALE OPERATIONS OPEN**

Claim-centric Trustability, provenance/independence, active lifecycle and receipts have executable implementations and CI/benchmark evidence. A bounded real trust-network slice is proven. The accepted D-100 campaign additionally exercises Byzantine, Sybil, eclipse and collusion predicates at 100-real-process scale.

Remaining: larger/longer adversarial network operations, stronger operational authority/revocation lifecycle and stable protocol guarantees.

## v0.3 — Synchronize — **PARTIAL / MIXED**

Content-addressed context techniques, persistent semantic index lifecycle, immutable-vector reuse, invalidation and distributed retrieval are implemented and benchmarked. Full generic `STATE`/`DELTA`/`SUBSCRIBE` runtime behavior across the decentralized network remains broader than the productionized slices.

## v0.4 — Execute & Route — **PARTIAL / MIXED**

Multiple-provider routing, authorization-before-dispatch, provider-host security/billing gates, semantic routing and provider usage/latency metadata are implemented reference slices. General `COMPUTE` sandboxing, resource isolation, complete compute-near-data execution and durable commercial attribution remain incomplete.

## v0.5 — Interoperate & Developer Experience — **PARTIAL / ACTIVE**

### A2A / MCP bridge gate — **OPEN**

Implemented:

- [x] TRUYN-as-MCP server over stdio;
- [x] loopback MCP HTTP bridge;
- [x] configured remote MCP HTTP tool provider reference;
- [x] selected MCP `2026-07-28` current-contract conformance slice with explicit version/header/content-type failures and private-provider execution-denial coverage — PR `#324`, CI `32858272119`.

Open:

- [ ] implement authorized general MCP discovery/import;
- [ ] implement A2A server facade with authorized Agent Card projection and Message/Task/Artifact handling;
- [ ] implement A2A client/provider adapter;
- [ ] prove A2A→TRUYN→MCP and MCP→TRUYN→A2A real round trips;
- [ ] prove artifact/provenance integrity and asynchronous A2A lifecycle;
- [ ] negative-test private-provider non-disclosure/execution across bridges beyond the bounded C1 MCP edge;
- [ ] publish complete cross-protocol exact-version interoperability evidence.

### Developer Experience Gate — **REQUIRED PRE-v1**

DX-0 — **DEFINED / CLOSED**:

- [x] five required first-party targets: JavaScript/TypeScript, Python, Go, Java, C#/.NET;
- [x] Rust optional secondary track;
- [x] common semantic/security surface defined;
- [x] TRUYN Agent Descriptor draft defined;
- [x] SDK compatibility/conformance policy and scaffolds created.

DX-1 — **OPEN**: TypeScript/JavaScript + Python SDKs, shared golden fixtures, Agent Descriptor parser/verifier, runnable core-path examples.

DX-2 — **OPEN**: Go + Java + C#/.NET parity and idiomatic async/cancellation/streaming.

DX-3 — **OPEN**: npm/PyPI/Go/Maven/NuGet publication, reproducible releases, compatibility matrix, copy-paste quickstarts and five-language CI.

DX-4 — **OPEN**: stable-v1 conformance/security/compatibility gate across all five required SDKs.

## v0.6 — Resist & Scale Trust — **IMPLEMENTED SLICES / LARGER REAL-NETWORK GATE OPEN**

Provenance/independence, active trust lifecycle, receipts, decentralized placement/read-quorum work, signed transparency/revocation state, fork/equivocation semantics and bounded adversarial evidence exist. D-100 adds accepted 100-process adversarial coverage. D-1000 and later long-duration/open-network pressure remain open.

## v0.7 — Measure — **ACTIVE / STRONG EVIDENCE LEDGER**

- [x] token, latency, request-body, semantic, trust and infrastructure benchmarks;
- [x] reproducible public reports under `docs/benchmarks/`;
- [x] provider-security negative evidence;
- [x] production relay origin-lock evidence;
- [x] **100 simultaneously running real network processes/nodes accepted in Class D-100**;
- [ ] **1,000 simultaneously running real network processes/nodes accepted in Class D-1000**;
- [ ] A2A/MCP interoperability evidence after bridge implementation;
- [ ] larger real-WAN/long-duration adversarial distributions.

Semantic block counts or simulations must never be described as simultaneously running real network nodes.

## v0.8 — Operate — **PARTIAL / DOCUMENTATION BASELINE ESTABLISHED**

Executable node/relay/provider/testnet paths and cloud test exercises exist; `docs/operations/`, `docs/security/` and `docs/compatibility/` document the current boundary. Production installers, signed updater/rollback, broader perimeter automation and stable mainnet operations remain open.

## v0.9 — Settle — **DEFINED / IMPLEMENTATION DEFERRED**

TRUYN remains settlement-neutral. Planned external scope includes x402, AP2, AP2+x402 composition, opaque external receipt/reference binding, replay/substitution resistance, durable accounting/reconciliation, sandbox-first testing and negative tests proving settlement cannot bypass provider authorization or fall back to owner-funded quota.

Non-goals remain: no TRUYN currency/token, no mandatory blockchain, no mandatory smart contract and no mandatory payment processor.

## v1.0 — Stabilize — **NOT REACHED**

Stable v1 requires, at minimum:

- stable `TRUYN/1` contracts and network semantics;
- production-grade authorization/tenant/BYOK and upgrade/rollback boundaries;
- productionized network/operations gates, including accepted D-1000 plus later required durability/SLO closure;
- stable A2A/MCP adapter compatibility boundary;
- stable TRUYN Agent Descriptor;
- published first-party JavaScript/TypeScript, Python, Go, Java and C#/.NET SDKs;
- shared five-language SDK conformance suite green;
- stable SDK compatibility/deprecation policy;
- public governance process in force with governance maturity reported independently.

No technical version may imply GOV-3 multi-organization governance or GOV-4 neutral legal stewardship unless those gates are actually factual.

## Current execution order

The high-level order has changed because Class C and D-100 are already accepted:

```text
Class C heterogeneous WAN/reachability — ACCEPTED
        ↓
Class D-100 — ACCEPTED
        ↓
D-1000 exact-source immutable admission — PASS
        ↓
latest full pinned D-1000 20×50 attempt — FAIL at host0 install
        ↓
repair host0 install/bootstrap on new exact SHA — ACTIVE #325
        ↓
ordinary CI + CodeQL → fresh immutable bundle/digest → fresh admission PASS
        ↓
one new pinned D-1000 20×50 acceptance campaign
        ↓
durable D-1000 benchmark evidence + factual status promotion only after PASS
        ↓
long-duration / broader operational durability + adversarial SLO closure
        ↓
operations + compatibility stabilization
        ↓
A2A/MCP bridge + negative interoperability evidence
        ↓
DX-1/DX-2/DX-3 + five-language conformance
        ↓
TRUYN/1 + interoperability + Agent Descriptor + SDK stabilization
        ↓
optional settlement-adapter implementation / capability-economy expansion
```

In parallel:

```text
GOV-0/GOV-1 public process + DCO — defined/implemented baseline
        ↓
GOV-2 external/earned maintainers
        ↓
GOV-3 multi-organization TSC
        ↓
GOV-4 neutral stewardship
        ↓
GOV-5 demonstrated governance continuity
```

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`), TRUYN protocol generations (`TRUYN/1`, `TRUYN/2`), A2A/MCP external protocol versions, SDK package versions and governance maturity (G0-G5) are independent compatibility dimensions. A newer node may support multiple protocol generations simultaneously. Current software remains `0.1.0-dev`; `TRUYN/1` remains draft until explicitly stabilized.
