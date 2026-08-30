# TRUYN Roadmap

This roadmap records **current accepted maturity and the next bounded gates**. Normative protocol semantics live in `spec/`; canonical factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`; governance rules live in `GOVERNANCE.md` and `docs/governance/`.

**Snapshot:** 2026-08-30  
**Production/reference baseline:** `main@94c8253c8ce133919c6531805f16ef07ec7362ad` before active Developer Release PR `#399`  
**SDK/DX active head:** PR `#399` (`feat/developer-release-layer`)  
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
| SDK / DX | **Developer Release source/build layer implemented in active PR #399: five required clients, signed Descriptor lifecycle, five-language executable conformance, package builds/provenance, compatibility policy** | native registry publication + live developer-site activation/evidence |
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

The latest full pinned campaign is not accepted. A D-1000 PASS still requires all of:

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

Current accepted state:

- [x] **C1** — MCP current-contract baseline;
- [x] **C2** — general MCP discovery/import;
- [x] **C3** — A2A Agent Card/server task facade;
- [x] **C4** — A2A client/provider adapter + remote skill import, PR `#340`;
- [x] **C5** — bounded polling async lifecycle with exactly-one initial `SendMessage`, PR `#352`;
- [x] **C6** — artifact integrity/no-implicit-SSRF/provenance hardening, PR `#368`;
- [x] **C7** — both `A2A→TRUYN→MCP` and `MCP→TRUYN→A2A` bounded CI-proven by `tests/interoperability-bidirectional.test.js`, PR `#357`;
- [ ] **C8** — complete adversarial cross-protocol security matrix.

### C8 acceptance

C8 may close only with exact-head evidence for authorization/visibility, authority anti-spoofing, correlation attacks, protocol/transport negatives, artifact integrity/SSRF/provenance negatives, zero unauthorized remote executions, exactly-one valid remote execution, full tests/DCO/CodeQL, and post-merge exact-main security evidence.

### Adoption proof after C7

- [x] **Sprint C** — independent official A2A SDK/reference black-box proof;
- [x] **Sprint D** — independent official MCP SDK/server black-box proof, durable record `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`;
- [ ] carry at least one integrity-verified referenced artifact/file through the claimed external profile;
- [x] publish exact-version durable external interoperability evidence;
- [ ] define a compatibility/stability policy before claiming stable A2A/MCP support.

Sprint C + Sprint D do not close C8, prove ecosystem-wide certification or make `TRUYN/1` Stable.

---

## SDK / developer experience

### Closed / CI-proven implementation

- [x] SDK/DX architecture and five-language first-party program;
- [x] TypeScript/JavaScript Developer Release client;
- [x] Python Developer Release client;
- [x] Go Developer Release relay client parity;
- [x] Java Developer Release relay client parity;
- [x] C#/.NET Developer Release relay client parity;
- [x] stable SDK API-v1 bounded primitives;
- [x] authenticated relay event streaming and direct NEED cancellation;
- [x] signed compact generic `PARTIAL` runtime lifecycle;
- [x] portable reference-only object/artifact payload parity;
- [x] signed Agent Descriptor serving primitive at `/.well-known/truyn-agent.json`, default-off with explicit public capability allowlist;
- [x] Agent Descriptor HTTP fetch, schema/version/expiry validation, identity-key Ed25519 verification and protocol/interface negotiation across all five required SDK languages;
- [x] shared executable five-language conformance against one real local relay and one cryptographically identical signed Descriptor fixture;
- [x] package builds for npm, PyPI, Go, Maven and NuGet;
- [x] exact source SHA + byte size + SHA-256 release provenance manifest;
- [x] compatibility, semver, deprecation and migration policy;
- [x] Developer Pages source under `/docs`.

### External release/evidence gates still open

- [ ] native public registry publication for npm/PyPI/Go/Maven/NuGet after namespace ownership/trusted-publishing bootstrap and separate security-reviewed release-infrastructure PR;
- [ ] live public developer-site activation/liveness proof after accepted merge and Pages/domain settings activation.

### Optional / separate future contracts

- [ ] standardized cross-provider token-delta/tokenizer convention beyond generic `PARTIAL` only if ecosystem interoperability requires it;
- [ ] chain-stage cancellation only if a separate bounded protocol contract is defined and proven;
- [ ] delegated Agent Descriptor signing/revocation only after portable proof/conformance exists.

`PARTIAL` is intentionally generic; TRUYN does not prescribe provider tokenizer semantics. A public Agent Descriptor never grants provider authorization.

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
- [ ] **public** five-language package publication and released-version ecosystem evidence;
- [ ] production identity/tenant/entitlement/accounting operations appropriate to the deployment model;
- [ ] explicit stable TRUYN protocol/node compatibility contract.

Historical closed issues/PRs and failed benchmark records remain audit history. The current roadmap is determined by accepted code/evidence on main, not by stale issue titles or superseded snapshots.
