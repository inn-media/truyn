# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical interoperability architecture synchronized with current `main`.  
**Snapshot:** 2026-08-27  
**Source baseline:** `63e54cbe30d363ef4609732b512fe64ab860cf9d`  
**Protocol state:** TRUYN/1 draft; A2A/MCP compatibility is bounded, not stable.

## Purpose

A2A and MCP are external interoperability edges around TRUYN. They do not redefine TRUYN identity, provider ownership, authorization, billing, settlement, provenance or Trustability.

```text
A2A / MCP endpoint
        ↓
adapter authentication + version/correlation validation
        ↓
TRUYN capability / OFFER / NEED / RESULT
        ↓
central provider authorization + billing boundary
        ↓
network/provider execution
```

The security rule is invariant across protocols:

> transport authentication proves access to the external interface; it never grants TRUYN provider authorization or billing authority.

## Current implementation state

The architecture is no longer A2A-server-only. The accepted in-repository implementation is:

| Gate | Current state | Evidence |
|---|---|---|
| C1 — MCP current-contract baseline | **Accepted / CI-proven** | current MCP server/configured provider tests |
| C2 — general MCP discovery/import | **Accepted / CI-proven** | PR `#332`, `adapters/mcp/client.js`, `adapters/providers/mcp-discovery.js` |
| C3 — A2A server facade | **Accepted / CI-proven** | `adapters/a2a/server.js`, `tests/a2a-server.test.js` |
| C4 — A2A client/provider adapter | **Accepted / CI-proven** | PR `#340`, merge `1735528461a04de60f9f8572b466a732a6f03c62` |
| C5 — bounded async polling lifecycle | **Accepted / CI-proven** | PR `#352`, merge `591d30d8f57fb7c661c847bb059cd437f437dd08` |
| C6 — artifact integrity mapping | **Accepted / CI-proven** | PR `#368`, merge `0e6e4119450e9de55fb9be32b993a28f98dda148` |
| C7 — bidirectional A2A↔MCP bridge composition | **Accepted / CI-proven** | PR `#357`, merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a`; `tests/interoperability-bidirectional.test.js` |
| C8 — complete cross-protocol adversarial matrix | **OPEN** | active PR `#369`; must not be described as accepted yet |

## A2A server edge

The A2A facade projects only intentionally visible and authorized TRUYN capabilities into Agent Card skills. It maps:

```text
Agent Card skill       ← authorized TRUYN capability/OFFER view
A2A Message            → TRUYN NEED input
A2A Task/context IDs   ↔ adapter-local correlation state
TRUYN RESULT           → A2A Artifact / terminal task state
```

The public Agent Card is not a public dump of private/BYOK providers. Authenticated Extended Agent Card behavior remains server-authorized.

## A2A client/provider edge

C4 implements the reverse edge:

```text
remote Agent Card
      ↓ discover + validate A2A 1.0 interface
explicit allowSkills/filter
      ↓
selected remote skill
      ↓ local signed TRUYN OFFER through TruynAdapterHost
TRUYN NEED
      ↓
A2A SendMessage / Task polling
      ↓
verified remote Message/Artifact
      ↓
TRUYN RESULT
```

Remote Agent Card provider/owner/security metadata remains descriptive. The local signed TRUYN provider identity and local provider access policy remain authoritative.

## Asynchronous lifecycle

C5 adds bounded polling semantics without duplicate side effects:

- `taskExecutionMode: "blocking"` remains available;
- polling mode submits one initial `SendMessage` with `returnImmediately:true`;
- subsequent progress uses bounded `GetTask` polling;
- task/context substitution fails closed;
- failed/rejected/canceled and input/auth-required states are explicit;
- polling never falls back to a second `SendMessage`.

Streaming token deltas, push notifications and full remote cancellation equivalence are separate features and must not be inferred from polling support.

## Artifact integrity

C6 owns cross-A2A artifact normalization and integrity requirements:

- SHA-256 and exact byte-size validation;
- deterministic canonical JSON (`truyn-json-c14n-v1`);
- canonical base64 validation;
- bounded artifact bytes/part counts;
- no implicit URL fetching or SSRF;
- referenced URLs require an explicit resolver before materialization;
- authoritative TRUYN provenance replaces spoofable remote provider provenance;
- corrupt or unverifiable artifacts do not become successful results.

This integrity layer is reusable by C7/C8 but is not itself a claim of external ecosystem certification.

## Bidirectional bridge composition

C7 proves both in-repository paths.

### A2A → TRUYN → MCP

```text
A2A client
→ TRUYN A2A facade
→ authorized NEED
→ imported MCP provider
→ remote MCP tools/call
→ RESULT
→ completed A2A Task/Artifact
```

The proof asserts exactly one remote MCP execution and preserves authoritative TRUYN provider identity.

### MCP → TRUYN → A2A

```text
MCP client
→ TRUYN MCP facade / truyn_need
→ authorized NEED
→ imported A2A provider
→ remote A2A SendMessage/Task/Artifact
→ RESULT
→ MCP truyn_poll result
```

The proof asserts exactly one remote A2A execution and preserves request/message/task correlation without promoting remote metadata into TRUYN authority.

## Authorization and authority invariants

Every bridge implementation MUST preserve these invariants:

1. unauthorized discovery hides private providers/capabilities;
2. unauthorized execution causes zero upstream provider execution;
3. remote A2A/MCP requester/owner/tenant/billing metadata cannot substitute signed TRUYN authority;
4. transport credentials remain adapter-local and are never emitted into TRUYN discovery/OFFER/NEED/RESULT payloads;
5. correlation mismatches fail closed;
6. retry/poll/fallback logic cannot duplicate remote side effects;
7. invalid artifacts and malformed external-protocol responses cannot be converted into success.

C8 is the bounded acceptance matrix intended to exercise these invariants systematically across both directions. Until C8 is merged and exact-main verification is green, the **complete negative matrix remains open**.

## MCP boundary

The implemented MCP profile covers the surfaces TRUYN currently claims: server discovery/tool calls, configured provider invocation and general explicitly selected tool discovery/import. Broader optional MCP resources, prompts, subscriptions, Apps/extensions and ecosystem-wide certification remain outside the accepted profile unless separately implemented and evidenced.

## Adoption boundary

C7 means the bidirectional bridge exists and is CI-proven inside the repository. It does **not** mean:

- independent A2A SDK/reference-server interoperability has been certified;
- independent MCP SDK/reference-server interoperability has been certified;
- every A2A/MCP optional feature is supported;
- the adapters have a stable-v1 compatibility guarantee.

The next adoption proof should therefore test the existing bridge against independent external implementations, not recreate C4–C7.

## Versioning

A2A, MCP and TRUYN are versioned independently. Unsupported external protocol versions fail explicitly. A2A/MCP changes belong in adapters unless they change TRUYN network semantics. Exact versions exercised by evidence must be recorded in compatibility/evidence documents.

See `../compatibility/A2A_MCP_COMPATIBILITY.md` for the factual matrix and `IMPLEMENTATION_STATUS.md` for repository-wide maturity.
