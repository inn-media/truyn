# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot date:** 2026-08-25  
**Software version:** `0.1.0-dev`  
**Protocol generation:** `TRUYN/1` draft

This document answers one question: **what is actually implemented and proven now, versus only designed, admitted for a later gate, attempted but not accepted, or planned?**

Architecture documents define contracts. Benchmark reports prove bounded claims. Governance documents define how the standard may change. GitHub Actions, temporary launcher workflows, diagnostic pull requests and operational issues are execution mechanisms; they are not substitutes for durable benchmark evidence.

## Status vocabulary

Technical maturity:

- **Defined** — architecture/spec exists.
- **Implemented** — executable reference code exists.
- **CI-proven** — bounded automated tests prove the contract.
- **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
- **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
- **Stable** — compatibility guarantees are declared.

An **admission/preflight PASS** means the exact source, immutable runtime and prerequisites are accepted to start the corresponding paid/real campaign. It does **not** promote the campaign itself to PASS. A failed full campaign remains failed even if its infrastructure cleanup succeeds.

Governance maturity uses the independent G0-G5 model defined in `../../GOVERNANCE.md` and `GOVERNANCE_ARCHITECTURE.md`.

## System status matrix

| Subsystem | Architecture | Implementation / operating state | Evidence | Current limitation / next gate |
|---|---|---|---|---|
| Node identity / signed envelopes | Defined | Implemented | CI-proven | protocol still draft |
| QUIC underlay | Defined | Implemented | CI-proven | Internet-scale lifecycle/SLO closure open |
| Authenticated peer sessions | Defined | Implemented | CI-proven | Internet churn/reachability scale open |
| Signed peer-record lifecycle | Defined | Implemented | CI-proven renewal, durable sequence-before-dissemination, authenticated announce/PING repair and stale-client invalidation | larger operational lifecycle evidence open |
| Kademlia discovery/state RPC | Defined | Implemented | CI-proven | larger durability/repair scale open |
| Direct-first P2P + relay fallback | Defined | Implemented | CI-proven + Class C real WAN proof | broader production SLO closure open |
| STUN / same-port hole punching | Defined | Implemented reference path | CI-proven bounded path | universal NAT traversal is not claimed |
| **Class C heterogeneous WAN/reachability** | Defined | **Accepted / PASS** | `CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`; real Azure/GCP, partition/heal, NAT, double-NAT/CGNAT-like, authenticated relay outage/recovery | carrier-operated CGNAT field validation and broader production SLOs are separate gates |
| **Class D-100 scale/resilience** | Defined | **Accepted / PASS — 100 real processes, identities and QUIC endpoints on 4 hosts** | `CLASS_D_100_2026-08-22.md`; canonical evaluator PASS, strict terminal PASS, cleanup confirmed, remaining resources 0 | does not prove D-1000 or Internet scale |
| **Class D-1000 scale/resilience** | Defined | **Admission/preflight PASS; latest full 20×50 attempt FAIL; acceptance OPEN** | exact CI `32853716543` PASS; CodeQL `32853711776` PASS; immutable preflight `#320` / run `32853975632` PASS; full run `32854968438`, start `#321`, terminal `#323` = FAIL during host0 install; campaign finalizer independently confirmed cleanup `remaining=0` | **active blocker `#325`: repair host0 install/bootstrap, then new exact-SHA CI/CodeQL + immutable bundle/preflight + one new pinned 20×50 run with evaluator PASS, terminal PASS and canonical cleanup evidence** |
| Semantic index lifecycle | Defined | Implemented | benchmark/CI proven | broader operational SLOs open |
| Semantic retrieval v2/v3 | Defined | Implemented | extensive benchmark evidence | infrastructure-block scale is not real-node scale |
| Distributed semantic retrieval | Defined | Implemented | benchmark/CI proven | larger decentralized holder networks open |
| Byzantine read-quorum placement | Defined | Implemented reference slice | benchmark/CI proven | open-network adversarial scale open |
| Claim-centric Trustability | Defined | Implemented | CI/benchmark proven | policy calibration/domain operations continue |
| Active trust lifecycle | Defined | Implemented | CI/benchmark proven | production authority/revocation operations open |
| Provider ownership | Defined | Implemented node-level reference boundary | negative-test proven | rich account/org tenant control plane open |
| Provider discovery authorization | Defined | Implemented | negative-test proven | richer grant policy open |
| Provider-host access control | Defined | Implemented | negative-test proven | stable account binding open |
| BYOK | Defined | Implemented reference CLI/runtime flow | tests present | OS-native secure-store integration incomplete |
| Owner-funded billing safety | Defined | Implemented | fail-closed tests | production accounting/tenant attribution open |
| Sponsored billing | Defined | Guard implementation exists | activation requires signed entitlement + durable atomic usage store | production entitlement issuance/store deployment open |
| Prepaid/subscription billing | Defined | fail-closed placeholder | denies without resolver | entitlement resolver/accounting not implemented |
| **Contribution provenance / DCO 1.1** | Accepted governance policy | **Implemented in CI for pull requests** | root `DCO`; decision `2026-08-23-mandatory-dco-1.1.md`; `DCO` job checks exact PR base SHA → head SHA; no manual `workflow_dispatch` path | repository ruleset/branch-policy enforcement is an operational setting and is not inferred by this document without separate proof |
| MCP interoperability edge | Defined | **Implemented bounded MCP `2026-07-28` current-contract + configured-tool + general tool-discovery/import paths** | PR `#324` + `#332`; `tests/mcp-current.test.js`, `tests/mcp-discovery-import.test.js` + composed adapter tests | broader optional MCP resources/prompts/subscriptions/MRTR/extensions and ecosystem certification remain open |
| A2A interoperability edge | **Defined** | **Not implemented** | none | Agent Card + task/artifact server/client bridges required |
| A2A↔TRUYN↔MCP bridge | **Defined** | **Not implemented** | none | bidirectional cross-protocol proof + security matrix required |
| Settlement adapters (x402/AP2) | **Defined** | **Not implemented** | none | deferred v0.9 milestone after higher-priority productionization/operations gates |
| TRUYN Agent Descriptor | **Defined draft** | **Not implemented as a served/discovered runtime contract** | none | implement well-known/native discovery, signature/expiry validation and scoped visibility |
| First-party SDK program | **Defined** | **Scaffolding/documentation only** | no cross-language SDK conformance evidence | implement TS/Python reference pair, then Go/Java/.NET parity and package publication |
| Governance architecture/process | **Defined (G1)** | **Bootstrap Founding Stewardship operating** | public `GOVERNANCE.md`, `MAINTAINERS.md`, RFC/extension/decision contracts | external maintainers (G2), multi-org TSC (G3), neutral stewardship (G4) remain unproven/not established |
| Origin guard / production relay edge perimeter | Defined | Reference controls implemented; current production relay deployment-proven | CI/security tests + `AZURE_ORIGIN_LOCK_2026-08-23.md` live HTTP/WS/spoof negative matrix | proof is deployment-specific; material edge/origin changes require re-acceptance |
| Protected-provider M2M guard | Defined | Implemented | regression proven | live token issuance/rotation is deployment-specific |
| Multi-cloud text/image/video adapters | Defined | Implemented reference paths | smoke/benchmark evidence for available deployments | cloud entitlement/quota can block individual models |
| Operations documentation | Defined | baseline implemented | docs layer + accepted benchmark records | production runbooks evolve with testnet/mainnet |
| Compatibility documentation | Defined | baseline implemented | docs layer | no stable `TRUYN/1`, A2A/MCP or SDK compatibility promise yet |
| Mainnet | Defined conceptually | Not productionized | none | requires D-1000 acceptance plus later productionization/stabilization gates |

## Network-productionization boundary

The roadmap has advanced beyond the 2026-08-23 wording that still described Class C and 100-real-node scale as future work.

### Closed durable gates

**Class C — ACCEPTED / PASS.** The durable report proves a heterogeneous Azure/GCP topology with real direct cross-cloud QUIC, a packet-path partition and heal, real Azure NAT, two-layer CGNAT-like traversal, authenticated relay fallback, relay outage fail-closed behavior, recovery and cleanup.

**Class D-100 V17 — ACCEPTED / PASS.** The durable report proves 100 real processes, 100 identities, 100 QUIC endpoints on four hosts; 100% baseline/healed routing; recovery/convergence p95 32,090 ms; all required adversarial classes; zero accepted safety violations; canonical evaluator PASS; strict terminal PASS; cleanup confirmed and zero remaining run resources.

### Current D-1000 state — admission PASS, latest full campaign FAIL, acceptance OPEN

Admitted source tuple:

```text
tested source: ee0732b57a602bea8df9f964bf5fe27d19ee77f8
pinned ref: d1000/pinned-ee0732b5
exact CI: 32853716543 = success
exact CodeQL: 32853711776 = success
immutable preflight: 32853975632 = PASS
immutable preflight issue: #320 (closed completed operational evidence)
artifact ID: 9565547060
artifact digest: sha256:cbcce8b42d52791799a50d18fe9313897fccba7725890badec82a006a9881b75
runtime bundle sha256: 3951f3a5bd3099ffd4bafe9cb13959e9cec06e07e464f62c5bdc3839691723bd
1-VM immutable guest smoke: PASS
preflight cleanup: true
preflight remaining resources: 0
```

The preflight includes a real Azure Ubuntu 22.04 / `Standard_E2as_v7` guest smoke and validates the portable immutable runtime bundle introduced by merged PR `#315`.

Latest full pinned attempt:

```text
run: 32854968438
launcher: 99e64ad27c8f51b4b616ca85cfb7b4709759a07e
start record: #321 (closed completed operational evidence)
terminal record: #323 (closed completed negative operational evidence)
target: 20 hosts × 50 = 1,000 real processes
result: FAIL
failure stage: host0 guest install
failure location: scripts/class-d-1000-final-acceptance.sh line 194
evaluator_rc: 99
terminal_rc: 99
terminal issue fields: cleanup=false, remainingResources=-1
actual campaign finalizer: TRUYN_CLASS_D_1000_CLEANUP confirmed=true remaining=0
active remediation: #325
```

The generated terminal record's `cleanup=false` / `remainingResources=-1` values do not mean Azure resources were left behind. The host0 install failure happened before `class-d-1000-evidence.json` existed, so the post-verifier emitted fail-closed placeholders. The campaign's finalizer independently confirmed cleanup with zero remaining resources. This distinction is operationally important but does **not** change the acceptance verdict: canonical evaluator and terminal acceptance were never reached, therefore D-1000 remains OPEN.

Promotion now requires:

- minimal repair of the host0 install/bootstrap failure without changing topology, thresholds, evaluator semantics, adversarial predicates or safety gates;
- ordinary CI + CodeQL PASS on the new exact source SHA;
- a fresh immutable runtime bundle + digest;
- a fresh immutable admission/preflight PASS for that exact SHA;
- one new pinned 20×50 run proving 1,000 real processes, 1,000 identities and 1,000 QUIC endpoints;
- baseline/healed routing `>=99%`;
- recovery/convergence p95 `<=120 s`;
- all required adversarial predicates and zero safety violations;
- canonical evaluator `PASS`;
- strict terminal verifier `PASS`;
- canonical `cleanup=true` and `remainingResources=0` evidence;
- immutable accepted-run artifact/digest;
- durable sanitized benchmark report under `docs/benchmarks/`.

Historical D-1000 starts, failures, capacity probes and diagnostic runs remain useful audit history, but once superseded they are closed operational records rather than current roadmap gates.

## DCO 1.1 status boundary

TRUYN adopted mandatory **Developer Certificate of Origin 1.1** contribution provenance on 2026-08-23.

The current repository CI contract is intentionally narrow and deterministic:

- the required job name in the workflow is `DCO`;
- it runs only when `github.event_name == 'pull_request'`;
- it verifies the full `pull_request.base.sha → pull_request.head.sha` commit range;
- `workflow_dispatch` is absent from the CI workflow;
- pushes to `main` run the normal test job; DCO is not re-evaluated against a synthetic `HEAD^` merge range;
- new cleanup/documentation commits created by project automation must also contain a valid `Signed-off-by` trailer when proposed through a PR.

DCO is contribution provenance, not a replacement for Apache-2.0 licensing, code review, security checks or governance review.

## Governance status boundary

Governance is an explicit architecture dimension rather than an implicit repository-owner policy.

What is **defined now (G1)**:

- `GOVERNANCE.md` with current bootstrap state, roles, TSC target, voting and maturity model;
- factual role roster in `MAINTAINERS.md`;
- public RFC lifecycle;
- Community → Experimental → Official → Core Candidate → Core extension lifecycle;
- decision classes A-D plus governance changes;
- future TSC quorum, ordinary and two-thirds supermajority rules;
- conflict/recusal/public decision-record expectations;
- architectural separation of protocol governance, repository ownership, infrastructure operation and commercial ownership.

What is **not yet factual**: a demonstrated external Maintainer cohort (G2), a multi-organization TSC (G3), neutral legal stewardship (G4), or demonstrated continuity/succession (G5).

Current state must therefore be described as:

> **Public governance architecture/process defined; operational governance remains bootstrap Founding Stewardship.**

## A2A / MCP interoperability status boundary

The repository now contains two bounded CI-proven MCP `2026-07-28` layers. C1 covers TRUYN-as-MCP over stdio/loopback HTTP and the configured single-tool remote provider path with self-describing modern metadata, routing-header agreement, bounded JSON/SSE result handling, explicit failure semantics and private-provider execution-denial coverage. C2 adds general remote tool discovery/import: `server/discover`, bounded paginated `tools/list`, default-deny allowlist/filter selection, supported schema-driven `x-mcp-header` forwarding, deterministic mapping to TRUYN capabilities, publication as signed TRUYN `OFFER`s through the existing provider authorization boundary, and authorized NEED → remote `tools/call` → TRUYN RESULT execution.

C2 negative tests prove that an unauthorized requester sees zero imported private MCP offers, creates zero provider events and causes zero remote MCP execution. Remote MCP server metadata or transport authentication never becomes authoritative TRUYN ownership, requester identity, billing responsibility or Trustability input.

Still open: broader optional MCP resources/prompts/subscriptions/MRTR/extensions, ecosystem-wide MCP certification, A2A Agent Card/server/client bridges, bidirectional A2A↔TRUYN↔MCP real round trips, artifact/provenance translation and complete cross-protocol negative provider-security evidence.

Transport authentication from A2A or MCP never substitutes for TRUYN provider authorization, billing responsibility or Trustability.

## Developer Experience status boundary

The required stable-v1 first-party SDK targets remain:

```text
JavaScript / TypeScript
Python
Go
Java
C# / .NET
```

Rust is optional and does not replace any required target. The architecture, common SDK semantics, security invariants, package targets, compatibility policy and draft TRUYN Agent Descriptor are defined, but the `sdk/` tree remains scaffolding/documentation until executable clients, package publication and shared cross-language conformance evidence exist.

## Settlement status boundary

TRUYN/1 remains settlement-neutral. The core does not define a currency, payment processor, blockchain, smart contract or settlement rail. x402 and AP2 remain planned external adapters; there is no live money-movement or production settlement claim.

## Implemented security baseline

The current reference implementation keeps the following invariants:

1. provider access defaults to `owner-only` at low-level policy and provider runtime;
2. unauthorized private providers are filtered before dispatch and checked again before adapter execution;
3. provider ownership is derived from authenticated/signed provider identity, not requester-controlled metadata;
4. owner-funded and BYOK execution remain private by default;
5. public provider execution requires explicit opt-in and cannot bypass billing policy;
6. local development mode hard-fails when combined with public/production relay markers;
7. oversized HTTP input closes the connection after 413;
8. origin proof is fail-closed and stripped before forwarding inward;
9. the accepted production relay sanitizes requester proof at Azure Front Door, injects trusted proof only from Cloudflare CIDRs, restricts Container Apps ingress to `AzureFrontDoor.Backend`, and denies direct Front Door/Container App HTTP and WebSocket bypass;
10. protected-provider M2M proof is transport-only and stripped before the inner relay;
11. sponsored mode cannot activate without actor-bound signed entitlement verification and a durable atomic usage store.

Future SDK, Agent Descriptor and A2A/MCP implementations must preserve these invariants.

## Evidence and repository-hygiene discipline

Durable measured evidence under `docs/benchmarks/` is append-only: **redact sensitive fields, do not delete the report.** Negative historical benchmark evidence remains part of the audit trail.

Operational hygiene follows a different lifecycle:

- temporary one-shot cloud workflows are removed from the default branch after their terminal evidence is pinned;
- temporary verification/diagnostic PRs are closed without merge once superseded;
- STARTED/FAIL/PASS operational issues are closed when the attempt is finished or superseded; closing preserves history and does not erase evidence;
- active remediation is consolidated into one actionable issue (`#325` for the current D-1000 blocker) rather than keeping generated status records open;
- a successful full D-1000 campaign must be promoted into a durable sanitized benchmark report before this document can say “D-1000 accepted.”

This distinction prevents temporary operational machinery from accumulating indefinitely while preserving the evidence ledger.

## Current priority

The primary architecture/engineering priority is now the **host0 D-1000 install/bootstrap repair tracked by `#325`**, followed by a fresh exact-SHA admission sequence and one new full pinned D-1000 acceptance campaign. Class C and D-100 are already accepted.

```text
Class C heterogeneous WAN/reachability — ACCEPTED
        ↓
Class D-100 — ACCEPTED
        ↓
D-1000 exact-source admission/preflight — PASS for ee0732b5
        ↓
latest D-1000 full 20×50 campaign — FAIL at host0 install
        ↓
repair host0 install/bootstrap — ACTIVE #325
        ↓
new exact SHA → ordinary CI + CodeQL → immutable bundle/digest → immutable preflight PASS
        ↓
one new pinned D-1000 full 20×50 campaign
        ↓
D-1000 factual promotion only after evaluator PASS + terminal PASS + canonical cleanup PASS
        ↓
long-duration / broader real-network durability + adversarial operations
        ↓
stable operational and compatibility contracts
        ↓
A2A/MCP bridge + negative interoperability evidence
        ↓
SDK DX-1/DX-2/DX-3 + five-language conformance
        ↓
TRUYN/1 + interoperability + Agent Descriptor + SDK compatibility stabilization
        ↓
optional settlement-adapter implementation
```

Governance evolves independently through G2 → G5.

Until the remaining technical gates are passed, TRUYN should be described as an advanced experimental/reference intelligence-network implementation with accepted bounded WAN and 100-real-node resilience evidence, a deployment-proven relay perimeter, and a D-1000 line with immutable admission PASS but no accepted 1,000-node campaign — **not** as a production Internet-scale mainnet.