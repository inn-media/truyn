# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`; governance rules live in `GOVERNANCE.md` and `docs/governance/`.

**Snapshot:** 2026-08-29  
**Production/reference baseline:** `main@05120db7435ab00807484aa9b7c3ecf80211f8b0`  
**SDK/DX synchronized through:** `main@ef61e4876617aa4099b5ddbdbbf3f24b1e6e7fcd` / PR `#378`  
**Sprint C exact executable proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact executable proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**Protocol:** `TRUYN/1` draft

The project has not evolved strictly in numerical version order. Network scale, semantic retrieval, Trustability, provider security, external interoperability and SDK/DX progress in parallel. A completed track does not promote an unrelated track.

## Maturity scale

1. **Defined** — architecture/specification exists.
2. **Implemented** — executable reference code exists.
3. **CI-proven** — bounded automated evidence exists.
4. **Bounded real-testnet proven** — real multi-process/host/network evidence exists.
5. **Productionized** — operational lifecycle/SLO/security gates are accepted for the intended class.
6. **Internet-scale proven** — large open/WAN/adversarial evidence exists.
7. **Stable** — compatibility promises are declared.

## Current top-level state

| Track | Current state | Immediate next gate |
|---|---|---|
| Network underlay | **Implemented / CI-proven; Class C and D-100 accepted** | accepted D-1000 |
| D-1000 | **OPEN; latest full pinned run FAIL** | repair + fresh exact-SHA immutable preflight + one new 20×50 accepted campaign |
| Semantic / distributed retrieval | **Implemented / benchmark-proven bounded slices** | broader decentralized operating scale |
| Trustability | **Implemented / benchmark-proven bounded slices** | production authority/revocation operations |
| Provider security / BYOK | **Implemented fail-closed reference boundary** | richer tenant/account/entitlement operations |
| A2A / MCP | **C1–C7 accepted; Sprint C independent A2A + Sprint D independent MCP black-box proven** | C8 security acceptance + integrity-verified external artifact/file profile + compatibility/stability policy |
| SDK / DX | **TS/JS + Python reference clients; five-language portable payload slice; direct NEED cancellation + signed PARTIAL runtime lifecycle implemented / CI-proven through #378** | broader Go/Java/.NET client parity + publication, Agent Descriptor lifecycle, optional cross-provider tokenization conventions |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers → multi-org TSC → neutral stewardship |
| Settlement x402/AP2 | **Defined only** | later optional adapter implementation |
| Mainnet | **Not productionized** | D-1000 + stabilization/operations/compatibility gates |

---

## Network productionization

### Closed

- [x] authenticated real QUIC underlay;
- [x] signed peer identity/session behavior;
- [x] Kademlia discovery/state RPC;
- [x] direct-first P2P with relay fallback;
- [x] bounded STUN/same-port hole punching;
- [x] Class C heterogeneous Azure/GCP WAN acceptance;
- [x] Class D-100 acceptance: 100 real processes/identities/QUIC endpoints.

### Class D-1000 — OPEN

The latest full pinned campaign is not accepted:

```text
tested source: 0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094
exact CI: 32867819485
exact CodeQL: 32867819162
immutable preflight: 32868395311 = PASS
preflight artifact digest: sha256:0beb64fd39ed59242113f66a1998a94ba406b5c055bbe6318a86e6bf61273795
runtime bundle sha256: 6bbb128ba568f6a7dca033dd3e0b3373809577249c28dd4c6c2a6d180ae67ee4
full run: 32869078719
negative terminal record: #344
result: FAIL
campaign_rc: 1
evaluator_rc: 99
terminal_rc: 99
recorded cleanup_confirmed: false
recorded remainingResources: -1
```

The old `ee0732b5` host0-install issue is historical and no longer the current blocker. Remediation after `0e7f16c1` includes bootstrap/readiness checkpoint repair and merged PR `#367`, which finalizes FAIL evidence before cleanup. PR `#372` is active bounded diagnostic sizing work and may not weaken the strict accepted 20×50 topology or any acceptance predicate.

A D-1000 PASS requires all of:

- [ ] 20 hosts × 50 = 1,000 real processes, identities and QUIC endpoints;
- [ ] baseline routing `>=99%`;
- [ ] healed routing `>=99%`;
- [ ] recovery/convergence p95 `<=120 s`;
- [ ] all adversarial predicates;
- [ ] zero safety violations;
- [ ] evaluator `PASS`;
- [ ] terminal verifier `PASS`;
- [ ] canonical `cleanup=true`;
- [ ] canonical `remainingResources=0`;
- [ ] immutable accepted artifact + digest;
- [ ] durable sanitized accepted evidence under `docs/benchmarks/`.

No threshold, topology, evaluator, adversarial or safety weakening is allowed to manufacture PASS.

---

## A2A / MCP interoperability — v0.5 gate

The old roadmap wording stopped at C3. Actual accepted state is now:

- [x] **C1** — MCP current-contract baseline;
- [x] **C2** — general MCP discovery/import;
- [x] **C3** — A2A Agent Card/server task facade;
- [x] **C4** — A2A client/provider adapter + remote skill import, PR `#340`, merge `1735528461a04de60f9f8572b466a732a6f03c62`;
- [x] **C5** — bounded polling async lifecycle with exactly-one initial `SendMessage`, PR `#352`;
- [x] **C6** — artifact integrity/no-implicit-SSRF/provenance hardening, PR `#368`;
- [x] **C7** — both `A2A→TRUYN→MCP` and `MCP→TRUYN→A2A` are **Implemented / bounded CI-proven** by `tests/interoperability-bidirectional.test.js`, PR `#357`, merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a`, with exactly-once remote execution assertions;
- [ ] **C8** — complete adversarial cross-protocol security matrix, active PR `#369`.

### C8 acceptance

C8 may close only with exact-head evidence for:

- authorization/visibility in both directions;
- requester/provider-owner/billing anti-spoofing;
- request/message/task/context/result correlation attacks;
- wrong versions, malformed JSON-RPC, response-id/cross-origin/redirect/header/timeout/size negatives;
- C6 artifact tampering/size/base64/URL/SSRF/provenance negatives;
- zero unauthorized remote executions for negative cases;
- exactly one remote execution for valid cases;
- full `npm test`, `git diff --check`, DCO and CodeQL PASS;
- post-merge exact-main ordinary CI + CodeQL PASS.

### Adoption proof after C7

C7 is real bounded bridge evidence. The independent SDK adoption proofs are now symmetric:

- [x] **Sprint C** — exercise `MCP→TRUYN→A2A` against an independent A2A SDK/reference implementation: official A2A Project `@a2a-js/sdk@1.0.1`, separate-process Agent Card + JSON-RPC black box, exact core source `a435ed16e559226ed095959b7b95aa7067271302`, CI `33057289236`, CodeQL `33057286765`, durable record `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`;
- [x] **Sprint D** — exercise `A2A→TRUYN→MCP` against official `@modelcontextprotocol/server@2.0.0` / MCP `2026-07-28` in a separate process using public `handler.fetch()` dispatch and `handler.close()` lifecycle. Positive execution is independently counted exactly once; TRUYN request correlation is exact; spoofed A2A requester/owner authority produces zero NEED and zero external execution; spoofed billing cannot override provider `prepaid` authority and is denied before `tools/call`; relay-level `trustedRequesterNodeIds` visibility remains authoritative. Exact executable source `0a40e635533f6a9623b19057b3320ba2a888f1f1`, CI `33262306180`, CodeQL `33262304786`, durable record `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`;
- [ ] carry at least one integrity-verified referenced artifact/file through the claimed external profile;
- [x] publish exact-version durable interoperability evidence for Sprint C and Sprint D external proofs;
- [ ] define a compatibility/stability policy before claiming stable A2A/MCP support.

Sprint C + Sprint D are symmetric bounded external SDK adoption evidence. They do not close C8, do not prove ecosystem-wide certification, and do not make `TRUYN/1` Stable.

---

## SDK / developer experience

### Closed/current

- [x] SDK/DX architecture and first-party language program;
- [x] TypeScript/JavaScript reference client;
- [x] Python reference client;
- [x] shared conformance fixtures and real local-node NEED→RESULT evidence for accepted slices;
- [x] Agent Descriptor parser/verifier conformance slice;
- [x] **DX-3 API/payload/developer slice, PR #373**:
  - stable API-v1 primitives for TypeScript/Python;
  - authenticated relay event streaming with abortable waits;
  - reference-only object/artifact payload support;
  - conformance markers;
  - external developer-site source;
- [x] **Portable payload parity slice, PR #374**:
  - object/artifact payload API alignment for Go/Java/.NET in addition to TypeScript/Python;
  - compiler gates for Go/Java/.NET;
- [x] **DX-3 runtime lifecycle, PR #378**, merged as `ef61e4876617aa4099b5ddbdbbf3f24b1e6e7fcd`:
  - requester-owned direct NEED cancellation with explicit OFFER/NEED revoke namespaces;
  - event-driven signed fast REVOKE on the same bounded fast lifecycle channel as NEED work;
  - provider `AbortSignal` propagation, including bounded-retry remote cancellation for persistent Azure Sora / Vertex Veo jobs;
  - signed compact `PARTIAL` (`T`) with correlation, strict ordering, idempotent retry, bounded queue/socket backpressure and terminal ordering;
  - host-authoritative `partialCount` and fail-closed late/cross-request/cross-provider output;
  - bounded provider concurrency/pending work/shutdown and visible fatal-loop semantics;
  - owner-only async compact request status plus expiry/release of abandoned terminal reservations.

### Open

- [ ] complete Agent Descriptor serving/discovery lifecycle;
- [ ] broader Go first-party client parity;
- [ ] broader Java first-party client parity;
- [ ] broader C#/.NET first-party client parity;
- [ ] package publication/release provenance for required languages;
- [ ] stable cross-language compatibility policy and migration contract;
- [ ] optional standardized cross-provider token-delta/tokenizer conventions beyond generic `PARTIAL`;
- [ ] chain-stage cancellation only if a separate bounded protocol contract is defined and proven.

Direct NEED cancellation is implemented, but custom adapter cancellation remains cooperative: an adapter that ignores its `AbortSignal` may keep computing while the relay still rejects its late output. `PARTIAL` is a generic ordered delta/chunk contract and may carry token deltas; TRUYN does not prescribe provider tokenizer semantics.

---

## Provider security / economics

### Closed/reference

- [x] signed provider ownership boundary;
- [x] authorization-aware discovery;
- [x] provider-host recheck before execution;
- [x] private/BYOK fail-closed behavior;
- [x] billing responsibility cannot be assigned by requester metadata;
- [x] sponsored mode requires explicit entitlement/accounting contract;
- [x] prepaid/subscription fail closed without resolver.

### Open

- [ ] rich account/organization tenant membership;
- [ ] production entitlement issuance/revocation;
- [ ] durable distributed accounting/usage operations;
- [ ] stable commercial control-plane integrations.

Settlement remains neutral to the core. x402/AP2 are optional later adapters, not TRUYN/1 wire dependencies.

---

## Trustability / semantic intelligence

Implemented bounded work includes content-addressed objects, semantic retrieval/index lifecycle, distributed holders, provenance/independence, Byzantine read-quorum reference behavior, claim-centric Trustability, active verification and trust receipts.

Open work is mainly operational scale, calibration and production authority/revocation—not redefinition of already implemented bounded semantics.

---

## Governance roadmap

Governance maturity is independent of software maturity.

- [x] **G1** public governance architecture, RFC process, extension lifecycle and decision rules;
- [ ] **G2** demonstrated external/independent maintainer cohort;
- [ ] **G3** operating multi-organization TSC;
- [ ] **G4** neutral legal stewardship/foundation-equivalent custody;
- [ ] **G5** demonstrated continuity/succession under the neutral model.

Current factual state remains bootstrap Founding Stewardship. Do not describe the project as already foundation-governed.

---

## Stable/mainnet gate

Before a stable mainnet claim, the project still needs at minimum:

- [ ] accepted D-1000;
- [ ] production lifecycle/restart/update/rollback and operational SLO closure;
- [ ] external interoperability profile and compatibility policy;
- [ ] required SDK parity/publication and migration policy;
- [ ] production identity/tenant/entitlement/accounting operations appropriate to the deployment model;
- [ ] explicit stable TRUYN protocol/node compatibility contract.

Historical closed issues/PRs and failed benchmark records remain audit history. The current roadmap is determined by accepted code/evidence on main, not by stale issue titles or superseded snapshots.
