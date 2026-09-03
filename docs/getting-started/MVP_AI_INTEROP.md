# TRUYN MVP — AI Interoperability

**Snapshot:** 2026-09-03  
**Synchronized source:** `main@dd7c3574490e18cc002372d5eb9af704daf03bda`

TRUYN has working bounded interoperability across native TRUYN, MCP and A2A edges. The old statements that A2A, the bidirectional A2A↔TRUYN↔MCP bridge or independent external SDK/reference-server interoperability are only planned are obsolete.

This remains reference/bounded interoperability: it is not a stable-v1 ecosystem certification, a public mainnet claim or permission to consume another participant's provider account.

## Core execution model

```text
agent / SDK / A2A / MCP / HTTP
            ↓
        TRUYN Node
            ↓
authenticated identity + authorization-aware discovery
            ↓
 signed OFFER / NEED / RESULT
            ↓
      TRUYN network
            ↓
provider adapter / remote A2A / remote MCP
            ↓
       result + provenance
```

Capability compatibility and authorization are separate. A compatible provider can remain invisible and unusable to an unauthorized requester.

## Provider-security baseline

The reference path is fail closed:

```text
authenticate requester
      ↓
authorization-aware discovery
      ↓
provider ownership / visibility policy
      ↓
billing responsibility / entitlement gate
      ↓
dispatch
      ↓
provider-host recheck
      ↓
upstream execution
```

Remote A2A/MCP authentication is a transport/interface concern. It never replaces signed TRUYN requester/provider authority or assigns billing responsibility.

## BYOK rule

Normal private provider operation is BYOK — Bring Your Own Intelligence / Provider. Provider API keys, bearer tokens and privileged remote A2A/MCP credentials remain inside the adapter/runtime secret boundary. They are not TRUYN `OFFER`, `NEED`, `RESULT`, Agent Descriptor, public Agent Card or public MCP-discovery payloads.

## MCP — implemented bounded profile

TRUYN exposes MCP tools including identity, discovery, offers, needs, polling and results. Current bounded implementation includes:

- TRUYN-as-MCP stdio/loopback HTTP server;
- configured remote MCP HTTP tool provider;
- current MCP `2026-07-28` discovery/tool path;
- general explicitly selected remote MCP tool discovery/import;
- authorization-aware imported OFFER publication;
- bounded response/version/routing/correlation validation.

General arbitrary MCP resources/prompts/subscriptions/apps are not implicitly supported merely because tools are implemented.

## A2A — implemented bounded profile

### Server facade — C3

TRUYN can expose authorized capabilities as an A2A `1.0` Agent Card/task interface:

```text
Agent Card skill
→ authorized TRUYN capability
A2A Message
→ TRUYN NEED
TRUYN RESULT
→ A2A Task / Artifact
```

Public projection fails closed for private providers.

### Client/provider adapter — C4

TRUYN can also import explicitly selected remote A2A skills:

```text
remote Agent Card
→ validate/select skill
→ local signed TRUYN OFFER
TRUYN NEED
→ A2A SendMessage / Task
remote Artifact/Message
→ TRUYN RESULT
```

### Polling async lifecycle — C5

Polling mode submits exactly one initial `SendMessage`, then uses bounded `GetTask` polling. Task/context substitution and invalid/interrupted states fail closed. Full semantic equivalence to every external A2A push/stream/cancellation feature is not implied.

### Artifact integrity — C6

Accepted A2A artifact handling includes SHA-256, byte-size validation, canonical JSON/base64, bounded size, explicit URL resolution/no implicit SSRF and authoritative TRUYN provenance. Invalid artifacts never become successful results.

## Bidirectional A2A ↔ TRUYN ↔ MCP proof — C7

Both required in-repository round trips are implemented and CI-proven in `tests/interoperability-bidirectional.test.js`.

### A2A → TRUYN → MCP

```text
A2A client
→ TRUYN A2A facade
→ NEED
→ imported MCP provider
→ remote tools/call
→ RESULT
→ A2A completed Task/Artifact
```

The test requires exactly one remote MCP tool execution.

### MCP → TRUYN → A2A

```text
MCP client
→ TRUYN MCP facade / truyn_need
→ NEED
→ imported A2A provider
→ remote SendMessage/Task/Artifact
→ RESULT
→ MCP truyn_poll result
```

The test requires exactly one remote A2A execution.

## Independent external SDK black-box proofs — Sprint C/D

The repository has also proved the claimed bridge against independent official SDK implementations running in separate processes.

### Sprint C — independent A2A

`MCP→TRUYN→A2A` is exercised against official A2A Project `@a2a-js/sdk@1.0.1`. The external process owns its own Agent Card/JSON-RPC request handler/task store; TRUYN does not substitute its own A2A server implementation.

### Sprint D — independent MCP

`A2A→TRUYN→MCP` is exercised against official `@modelcontextprotocol/server@2.0.0` through the SDK's public handler lifecycle. Targeted owner/requester/billing spoof negatives cause zero unauthorized external execution.

These are bounded external interoperability proofs. They are not ecosystem-wide certification across all versions/transports/implementations.

## C8 security matrix — still open

The bridge implementation and independent positive proofs exist, but the complete bounded adversarial acceptance matrix is not yet accepted. PR `#369` owns C8.

C8 must prove, in both directions, authorization/visibility, anti-spoofing, correlation attacks, protocol/transport negatives, C6 artifact tampering/SSRF/provenance cases, zero unauthorized remote execution and exactly-once valid execution. It must pass full suite, DCO, diff check, CodeQL and post-merge exact-main verification.

Do not describe C8 as accepted until those gates pass.

## SDK / Developer Release

The old “SDK scaffolding only”, “TypeScript/Python only”, “direct cancellation is future work” and “Go/Java/.NET parity is incomplete” descriptions are obsolete.

Current main contains implemented Developer Release clients for TypeScript/JavaScript, Python, Go, Java and C#/.NET. The bounded Developer Release surface includes:

- stable SDK API-v1 primitives;
- signed identity/envelope handling;
- authenticated relay registration/session use;
- authorization-aware discovery and OFFER/NEED/RESULT flows;
- requester-owned direct NEED cancellation through signed `REVOKE`;
- authenticated relay event streaming;
- signed generic ordered `PARTIAL` streaming;
- portable reference-oriented object/artifact payloads;
- default-off Agent Descriptor startup serving plus five-language canonical valid-profile HTTP fetch/schema/expiry/signature verification and protocol/interface negotiation;
- shared five-language executable conformance against the canonical valid signed Descriptor fixture;
- npm/PyPI/Go/Maven/NuGet per-commit verification builds with exact source/digest provenance.

The five-language E2E exercises a cancellation call from the owning requester; dedicated runtime negatives establish non-owner rejection and late-output behavior. The current provider runtime does not automatically refresh/re-sign its served Descriptor before expiry, and complete malformed/missing `interfaces[].endpoint` parity across all five clients is still open. Ordinary CI package artifacts are per-commit verification artifacts under the fixed alpha coordinates, not immutable tagged/native public releases.

Native public registry publication and live public developer-site activation remain separate release/evidence gates. Chain-stage cancellation and a standardized universal tokenizer/token-ID convention are not part of the accepted alpha profile.

## Adoption-level proof still open

Independent A2A and MCP SDK/reference-server interoperability is already proven for the claimed bounded directions. The remaining adoption work is:

- finish C8;
- carry at least one integrity-verified referenced file/artifact through the external profile;
- preserve exact-version durable evidence for future external proofs;
- define/accept stable compatibility policy before claiming stable A2A/MCP support.

## Verify locally

Requirements follow the repository `package.json` (Node.js 22+ on current main).

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

Five-language Developer Release E2E:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Use deterministic/local fixtures for reproducible no-credential interoperability tests. Live provider tests require credentials controlled by the operator.

## Current boundary

Implemented/reference-proven areas include identity, signed requests/results, provider authorization/BYOK, MCP C1/C2, A2A C3–C6, both C7 cross-protocol round trips, independent official A2A/MCP SDK black-box proofs, and the source/build-complete five-language Developer Release client layer.

Still open includes C8 complete adversarial acceptance, external referenced file/artifact proof, Descriptor refresh and malformed-endpoint parity closure, immutable public package publication, live developer-site evidence, richer production tenant/accounting operations, accepted D-1000 and stable mainnet/protocol compatibility.

See:

- `../architecture/IMPLEMENTATION_STATUS.md` — canonical factual status;
- `../architecture/A2A_MCP_INTEROPERABILITY.md` — architecture/invariants;
- `../compatibility/A2A_MCP_COMPATIBILITY.md` — exact compatibility matrix;
- `../architecture/SDK_DEVELOPER_EXPERIENCE.md` — Developer Release boundary;
- `../../ROADMAP.md` — next gates.
