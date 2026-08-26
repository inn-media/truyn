# TRUYN MVP — AI Interoperability

**Snapshot:** 2026-08-27  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`

TRUYN now has working bounded interoperability across native TRUYN, MCP and A2A edges. The old statement that A2A and the bidirectional A2A↔TRUYN↔MCP bridge are only planned is obsolete.

This is still reference/MVP interoperability: it is not a stable-v1 external-protocol certification, a public mainnet claim or permission to consume another participant's provider account.

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

PR `#340` closed this reverse edge.

### Polling async lifecycle — C5

Polling mode submits exactly one initial `SendMessage`, then uses bounded `GetTask` polling. Task/context substitution and invalid/interrupted states fail closed. Streaming/push and full remote cancellation equivalence are separate features.

### Artifact integrity — C6

Accepted A2A artifact handling includes SHA-256, byte-size validation, canonical JSON/base64, bounded size, explicit URL resolution/no implicit SSRF and authoritative TRUYN provenance. Invalid artifacts never become successful results.

## Bidirectional A2A ↔ TRUYN ↔ MCP proof — C7

Both required in-repository round trips are now implemented and CI-proven in `tests/interoperability-bidirectional.test.js`.

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

C7 was merged in PR `#357` (`f04fcd1d4d72af85a6b97686c7c875388ef6038a`).

## C8 security matrix — still open

The bridge implementation exists, but the complete bounded adversarial acceptance matrix is not yet accepted. Active PR `#369` owns C8.

C8 must prove, in both directions, authorization/visibility, anti-spoofing, correlation attacks, protocol/transport negatives, C6 artifact tampering/SSRF/provenance cases, zero unauthorized remote execution and exactly-once valid execution. It must pass full suite, DCO, diff check, CodeQL and post-merge exact-main verification.

Do not describe C8 as accepted until those gates pass.

## SDK / DX

The old “SDK scaffolding only” description is also obsolete. Current main contains first-party TypeScript/JavaScript and Python reference SDK work and merged DX-3 (PR `#373`). The current DX-3 bounded surface includes:

- stable API-v1 primitives for TypeScript/Python;
- authenticated relay event streaming with abortable waits;
- reference-only object/artifact payloads;
- conformance markers;
- developer-site source.

Remote provider-side NEED cancellation and token-delta streaming remain explicit follow-up work. Go, Java and .NET parity/publication are not yet complete.

## Adoption-level proof still open

After C8, the next interoperability proof should exercise the existing bridge against independent A2A and MCP SDK/reference implementations, plus an integrity-verified referenced artifact/file case. That is an adoption/certification step; it is not evidence that the C7 in-repository bridge is missing.

## Verify locally

Requirements follow the repository `package.json` (Node.js 22+ on current main).

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

Use deterministic/local fixtures for reproducible no-credential interoperability tests. Live provider tests require credentials controlled by the operator.

## Current boundary

Implemented/reference-proven areas include identity, signed requests/results, provider authorization/BYOK, MCP C1/C2, A2A C3–C6, both C7 cross-protocol round trips, TypeScript/Python SDK slices and the merged DX-3 developer surface.

Still open includes C8 complete adversarial acceptance, independent external A2A/MCP certification, broader optional protocol features, full SDK language parity/publication, richer production tenant/accounting operations, accepted D-1000 and stable mainnet/protocol compatibility.

See:

- `../architecture/IMPLEMENTATION_STATUS.md` — canonical factual status;
- `../architecture/A2A_MCP_INTEROPERABILITY.md` — architecture/invariants;
- `../compatibility/A2A_MCP_COMPATIBILITY.md` — exact compatibility matrix;
- `../../ROADMAP.md` — next gates.
