# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical interoperability architecture synchronized with current `main`.  
**Snapshot:** 2026-09-03  
**Source baseline:** `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`  
**Sprint C exact proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**C8 exact accepted head:** `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`  
**C8 exact accepted main:** `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`  
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

The accepted implementation/adoption profile is:

| Gate | Current state | Evidence |
|---|---|---|
| C1 — MCP current-contract baseline | **Accepted / CI-proven** | current MCP server/configured provider tests |
| C2 — general MCP discovery/import | **Accepted / CI-proven** | PR `#332`, `adapters/mcp/client.js`, `adapters/providers/mcp-discovery.js` |
| C3 — A2A server facade | **Accepted / CI-proven** | `adapters/a2a/server.js`, `tests/a2a-server.test.js` |
| C4 — A2A client/provider adapter | **Accepted / CI-proven** | PR `#340` |
| C5 — bounded async polling lifecycle | **Accepted / CI-proven** | PR `#352` |
| C6 — artifact integrity mapping | **Accepted / CI-proven** | PR `#368` |
| C7 — bidirectional A2A↔MCP bridge composition | **Accepted / CI-proven** | PR `#357`, `tests/interoperability-bidirectional.test.js` |
| Sprint C — independent remote A2A | **Accepted / official SDK black-box CI-proven** | `@a2a-js/sdk@1.0.1`, separate process, `tests/interoperability-independent-a2a.test.js` |
| Sprint D — independent remote MCP | **Accepted / official SDK black-box CI-proven** | `@modelcontextprotocol/server@2.0.0`, separate process, `tests/interoperability-independent-mcp.test.js` |
| C8 — complete cross-protocol adversarial matrix | **Accepted / exact-head + exact-main CI/CodeQL** | PR `#423`; `docs/compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md` |
| External referenced file/artifact profile | **OPEN** | integrity-verified external round trip still required |
| Stable A2A/MCP compatibility guarantee | **OPEN** | TRUYN/1 remains draft |

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

A2A polling support is distinct from the native TRUYN direct-NEED cancellation and generic `PARTIAL` streaming implemented in the Developer Release runtime. Full semantic equivalence to every external A2A cancellation/push/stream feature is not claimed.

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

This integrity layer is reusable by C7/C8. The remaining external-artifact gate is not C6 or C8 implementation; it is a black-box adoption proof carrying a referenced file/artifact through the claimed external profile.

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

The C7 proof asserts exactly one remote MCP execution and preserves authoritative TRUYN provider identity.

Sprint D additionally runs the remote MCP side as a separate process using official `@modelcontextprotocol/server@2.0.0`, through the SDK's public handler lifecycle. External counters prove the positive execution path and targeted owner/requester/billing spoof negatives produce zero unauthorized external tool calls.

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

The C7 proof asserts exactly one remote A2A execution and preserves request/message/task correlation without promoting remote metadata into TRUYN authority.

Sprint C additionally runs the remote A2A side as a separate process using official A2A Project `@a2a-js/sdk@1.0.1`, with its own request handler/task store. TRUYN sees only the external Agent Card and JSON-RPC interface; external instrumentation confirms the independent execution path.

## Authorization and authority invariants

Every bridge implementation MUST preserve these invariants:

1. unauthorized discovery hides private providers/capabilities;
2. unauthorized execution causes zero upstream provider execution;
3. remote A2A/MCP requester/owner/tenant/billing metadata cannot substitute signed TRUYN authority;
4. transport credentials remain adapter-local and are never emitted into TRUYN discovery/OFFER/NEED/RESULT payloads;
5. correlation mismatches fail closed;
6. retry/poll/fallback logic cannot duplicate remote side effects;
7. invalid artifacts and malformed external-protocol responses cannot be converted into success.

C8 is the accepted bounded adversarial matrix exercising these invariants systematically across both directions, including the current account/tenant authority layer, replay/correlation attacks, bounded MCP response reads/timeouts, artifact integrity/SSRF/provenance negatives, zero unauthorized remote execution and exactly-one valid execution. Exact-head CI/DCO/CodeQL and exact-main CI/CodeQL evidence is durable in `../compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md`.

## MCP boundary

The implemented MCP profile covers the surfaces TRUYN currently claims: server discovery/tool calls, configured provider invocation and general explicitly selected tool discovery/import. Broader optional MCP resources, prompts, subscriptions, Apps/extensions remain outside the accepted profile unless separately implemented and evidenced.

## Adoption boundary

TRUYN has now crossed three distinct evidence levels:

1. **C7:** bounded in-repository bidirectional composition;
2. **Sprint C/D:** bounded independent official SDK/reference-server black-box interoperability in both directions;
3. **C8:** bounded adversarial cross-protocol security acceptance on exact head and exact merged main.

This still does **not** mean:

- ecosystem-wide certification across all A2A/MCP implementations/transports;
- every A2A/MCP optional feature is supported;
- independent referenced file/artifact interoperability has been accepted;
- the adapters have a stable-v1 compatibility guarantee.

The next adoption work is an integrity-verified external referenced artifact/file profile and later stability/version policy—not re-proving the already accepted C8 security matrix or that independent A2A/MCP implementations can interoperate at all.

## Versioning

A2A, MCP and TRUYN are versioned independently. Unsupported external protocol versions fail explicitly. A2A/MCP changes belong in adapters unless they change TRUYN network semantics. Exact versions exercised by evidence must be recorded in compatibility/evidence documents.

See `../compatibility/A2A_MCP_COMPATIBILITY.md` for the factual matrix and `IMPLEMENTATION_STATUS.md` for repository-wide maturity.
