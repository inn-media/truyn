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

**Snapshot:** 2026-08-27  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`  
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
| A2A→TRUYN→MCP | **Implemented / bounded CI-proven — C7** |
| MCP→TRUYN→A2A | **Implemented / bounded CI-proven — C7** |
| Complete A2A/MCP adversarial matrix | **OPEN — C8 / PR #369** |
| TypeScript/JavaScript + Python SDK | **Implemented bounded reference clients** |
| DX-3 developer surface | **Merged / bounded implemented — PR #373** |
| Go / Java / .NET SDK parity | **Incomplete** |
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

TRUYN now has both bounded in-repository compositions.

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

This corrects older README/documentation snapshots that said the reverse A2A adapter and both round trips were not implemented.

### What is still open

C8 (PR `#369`) is the complete bounded adversarial acceptance matrix. Independent external A2A and MCP SDK/reference-server interoperability, broader optional protocol surfaces and a stable compatibility promise remain later adoption/stability work.

C7 proves the bridge exists; it does not claim ecosystem-wide certification.

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

Current main contains first-party TypeScript/JavaScript and Python reference SDK work.

Merged DX-3 (PR `#373`) adds a bounded runtime developer surface with:

- stable API-v1 primitives for TypeScript/Python;
- authenticated relay event streaming with abortable waits;
- reference-only object/artifact payloads;
- conformance markers;
- developer-site source.

Important boundary: abortable local waits/event streams do **not** yet mean remote provider-side NEED cancellation. Remote execution cancellation and token-delta streaming remain follow-up work. Go, Java and .NET parity/publication are also incomplete.

See [SDK/DX Architecture](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md).

---

## Network maturity

### Accepted

Class C proves a bounded heterogeneous Azure/GCP WAN topology, direct cross-cloud QUIC, partition/heal, NAT/CGNAT-like cases, authenticated relay fallback/outage behavior and recovery.

Class D-100 proves 100 real processes, identities and QUIC endpoints under the accepted bounded testnet predicates.

### D-1000 is still open

The latest pinned candidate before current remediation was `0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094`.

Its immutable preflight passed, but the full 20×50 campaign `32869078719` failed. Issue `#344` is intentionally retained as the current negative acceptance record. No documentation should describe D-1000 as accepted until one full pinned run proves all routing/recovery/adversarial/evaluator/terminal/cleanup predicates and produces immutable accepted evidence.

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
