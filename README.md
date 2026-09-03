# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a logical network for agent-to-agent communication, decentralized AI, capability discovery, content-addressed objects/state, provider execution, provenance and contextual Trustability. It runs over the Internet that already exists: QUIC/UDP/IP, existing computers, clouds and networks.

**TRUYN — connects intelligence to intelligence.**

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md) · [Apache-2.0](LICENSE)

---

## What TRUYN changes

Traditional software usually starts with an address/API:

```text
address → server → API → request → response
```

TRUYN starts from the required intelligence outcome:

```text
NEED
  → discover authorized capability
  → verify eligibility
  → route / execute
  → RESULT + provenance / trust context
```

The requester should not always need to know the exact model, vendor, hostname or upstream API. TRUYN separates **what capability is needed** from **which authorized provider can satisfy it**.

## Open protocol ≠ open provider account

TRUYN is open source and designed for an open network, but that does not grant access to someone else's paid model quota or private provider.

```text
foreign requester
+ public relay
+ known private provider ID
+ custom client
= zero authorized right to execute that provider
```

Provider visibility, access and billing are explicit policy boundaries. Requester-controlled `ownerId`, tenant, billing or external-protocol metadata cannot assign provider ownership or cost responsibility.

BYOK — Bring Your Own Intelligence / Provider — is the normal private-provider model. Upstream credentials remain with the provider/runtime and do not travel through TRUYN network envelopes.

---

## Current factual status

**Snapshot:** 2026-09-03  
**Synchronized source:** `main@dd7c3574490e18cc002372d5eb9af704daf03bda`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`  
**Protocol:** `TRUYN/1` draft

| Area | Current state |
|---|---|
| Signed identity / core envelopes | **Implemented / CI-proven** |
| Real QUIC underlay / authenticated sessions / Kademlia | **Implemented / CI-proven** |
| Class C heterogeneous WAN | **Accepted / PASS** |
| Class D-100 | **Accepted / PASS** |
| Class D-1000 | **OPEN — latest full pinned campaign FAIL** |
| Provider ownership/visibility/BYOK safety | **Implemented fail-closed reference boundary** |
| Semantic/distributed retrieval + Trustability slices | **Implemented / bounded benchmark+CI proven** |
| MCP current contract + discovery/import | **Implemented / bounded CI-proven** |
| A2A server facade | **Implemented / bounded CI-proven — C3** |
| A2A client/provider adapter | **Implemented / bounded CI-proven — C4** |
| A2A polling lifecycle | **Implemented / bounded CI-proven — C5** |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** |
| A2A→TRUYN→MCP | **C7 + independent official MCP SDK black-box proven** |
| MCP→TRUYN→A2A | **C7 + independent official A2A SDK black-box proven** |
| Complete A2A/MCP adversarial matrix | **OPEN — C8 / PR #369** |
| Five first-party SDK clients | **Implemented / executable conformance proven** |
| Direct NEED cancellation | **Implemented / bounded CI-proven** |
| Signed generic PARTIAL streaming | **Implemented / bounded CI-proven** |
| Agent Descriptor | **Implemented bounded valid-profile serving/fetch/verify; refresh + malformed-endpoint parity OPEN** |
| Per-commit package builds + provenance | **Implemented / CI-proven verification artifacts** |
| Native public package publication | **OPEN — external release gate** |
| Live public developer site | **OPEN — activation/liveness gate** |
| Governance | **G1 / bootstrap Founding Stewardship** |
| x402/AP2 settlement adapters | **Defined, not implemented** |
| Stable mainnet / stable TRUYN/1 | **Not yet** |

The canonical status is [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Historical issues/docs can contain older snapshots; they are not current truth.

---

## A2A + MCP + TRUYN

A2A, MCP and TRUYN solve different layers:

```text
A2A   → agent discovery, messages, tasks, artifacts
MCP   → model/tool interoperability
TRUYN → network identity, capability routing, authorization,
        provider execution, provenance and Trustability
```

They are complementary.

### Implemented bidirectional bridge

TRUYN has both bounded in-repository compositions.

```text
A2A client
→ TRUYN A2A facade
→ NEED
→ imported MCP provider
→ MCP tools/call
→ RESULT
→ A2A Task/Artifact
```

and:

```text
MCP client
→ TRUYN MCP facade
→ NEED
→ imported A2A provider
→ A2A SendMessage/Task/Artifact
→ RESULT
→ MCP result/poll
```

`tests/interoperability-bidirectional.test.js` is the C7 evidence and asserts exactly one remote MCP execution in the first direction and exactly one remote A2A execution in the second.

Independent ecosystem-side black-box proofs also exist in both directions:

- **Sprint C:** `MCP→TRUYN→A2A` against official A2A Project `@a2a-js/sdk@1.0.1` in a separate process;
- **Sprint D:** `A2A→TRUYN→MCP` against official `@modelcontextprotocol/server@2.0.0` in a separate process.

These proofs establish bounded external interoperability; they do not imply ecosystem-wide certification.

### What is still open

C8 (PR `#369`) is the complete bounded adversarial acceptance matrix. An independent integrity-verified referenced file/artifact round trip, broader optional protocol surfaces and a stable compatibility promise remain adoption/stability work.

---

## Artifact and data integrity

The accepted C6 A2A mapping includes:

- SHA-256 + byte-size validation;
- canonical JSON and canonical base64 checks;
- bounded artifact size/part counts;
- explicit referenced-URL resolver only;
- **no implicit remote URL fetching / SSRF**;
- authoritative TRUYN provenance rather than remote spoofable provider metadata.

Invalid/corrupt remote artifacts must fail closed instead of becoming successful cross-protocol results.

---

## SDK / developer experience

The Developer Release implementation is source/build complete in current main. TypeScript/JavaScript, Python, Go, Java and C#/.NET are real first-party relay clients and share one executable five-language conformance path.

The accepted Developer Release surface includes:

- stable SDK API-v1 bounded primitives;
- local Ed25519 identity/signing and received-event verification;
- authenticated relay registration/session use;
- authorization-aware discovery and OFFER/NEED/RESULT flows;
- requester-owned **direct NEED cancellation** through signed `REVOKE`;
- authenticated relay event streaming;
- signed generic ordered `PARTIAL` delivery with correlation/backpressure/terminal ordering;
- portable reference-oriented object/artifact payloads;
- signed Agent Descriptor startup serving plus five-language HTTP fetch, expiry/schema validation, identity-key verification and valid-profile protocol/interface negotiation;
- npm/PyPI/Go/Maven/NuGet per-commit package builds with exact source SHA, byte size and SHA-256 provenance.

Important boundaries remain: chain-stage cancellation is not supported; `PARTIAL` does not standardize a universal tokenizer/token-ID vocabulary; delegated Descriptor-signing keys are not part of the alpha contract; the provider runtime does not yet refresh/re-sign a served Descriptor before expiry; complete malformed/missing-interface-endpoint rejection parity across all five clients is not yet accepted; ordinary CI artifacts under the fixed alpha coordinates are verification artifacts rather than immutable published releases; native registry publication and live public developer-site activation remain separate release/evidence gates.

See [SDK/DX Architecture](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md).

---

## Network maturity

### Accepted

Class C proves a bounded heterogeneous Azure/GCP WAN topology, direct cross-cloud QUIC, partition/heal, NAT/CGNAT-like cases, authenticated relay fallback/outage behavior and recovery.

Class D-100 proves 100 real processes, identities and QUIC endpoints under the accepted bounded testnet predicates.

### D-1000 is still open

The latest accepted-status negative record remains the pinned candidate `0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094` and full 20×50 campaign `32869078719`, which failed. Issue `#344` is retained as the current negative D-1000 acceptance record until a later full pinned campaign proves all canonical routing/recovery/adversarial/evaluator/terminal/cleanup predicates and produces immutable accepted evidence.

Current main contains later bounded D-200 diagnostic/remediation work from PRs `#417` and `#418`, plus the bounded packet-partition diagnostic patcher from PR `#419`. Later one-shot launcher cleanup does not change those diagnostic sources. None of this diagnostic progress promotes D-1000 or changes its strict acceptance boundary.

See [Roadmap](ROADMAP.md) and [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md) for exact gates.

---

## Core TRUYN/1 vocabulary

```text
IDENTITY
OFFER
NEED
OBJECT
CLAIM
ATTEST
STATE
DELTA
SUBSCRIBE
COMPUTE
RESULT
TRUST_RECEIPT
REVOKE
```

`CAPABILITY` is a descriptor used by execution/discovery primitives. A2A Agent Cards/Tasks/Artifacts and MCP Tools/Resources remain external adapter objects; they are not new TRUYN/1 top-level wire primitives.

---

## Trustability

A signature can prove who signed a statement; it cannot prove that the statement is true.

TRUYN therefore treats trust as contextual:

```text
Trust(claim, requester, purpose, domain, time)
```

Provenance, evidence, source independence, freshness, revocation and policy can contribute to a Trustability decision. Many copied claims from one source must not count as many independent confirmations.

**Trust must be computed and continuously earned — never assumed.**

---

## Network modes

Canonical modes are:

- `local` — isolated development/testing;
- `testnet` — public/controlled experimental network;
- `mainnet` — future stable public network.

Public reachability never overrides private-provider authorization.

---

## Governance

TRUYN treats governance as part of standard architecture, but it does not claim neutral/foundation governance before that exists.

Current factual state:

```text
G1 public governance/RFC/extension/decision process: defined
Operational governance: bootstrap Founding Stewardship
External maintainer cohort: not yet demonstrated
Multi-organization TSC: not yet constituted
Neutral legal stewardship: not yet established
```

Read [GOVERNANCE.md](GOVERNANCE.md) and [MAINTAINERS.md](MAINTAINERS.md).

---

## Settlement neutrality

TRUYN/1 does not prescribe a currency, blockchain, billing provider, payment processor or settlement rail. x402/AP2 are planned optional settlement adapters; they do not become authorization sources and they are not implemented merely because the architecture exists.

---

## Quick local verification

Current package requirements are defined by `package.json` (Node.js 22+).

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

Live provider calls require credentials/entitlements controlled by the operator. Deterministic/local tests are the default reproducible path.

---

## Documentation and evidence

Use these sources in this order for current facts:

1. [Protocol specification](spec/protocol/v1/README.md) for normative TRUYN/1 semantics;
2. [Architecture Contract](docs/architecture/ARCHITECTURE_CONTRACT.md) for ownership/invariants;
3. [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md) for factual maturity;
4. [Benchmark Evidence](docs/benchmarks/README.md) for measured accepted/failed campaigns;
5. [Roadmap](ROADMAP.md) for next gates;
6. this README for the public summary.

If an old PR/issue/document says a later-merged capability is “planned”, that historical statement does not override current main.

---

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
