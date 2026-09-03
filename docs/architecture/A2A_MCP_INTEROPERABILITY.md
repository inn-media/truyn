# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical interoperability architecture synchronized through Sprint E.  
**Snapshot:** 2026-09-03  
**Sprint E base:** `main@476cc1333b2db7d85599c7e7f32c7b954b79611f`  
**Sprint C exact proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**Sprint E exact proof:** `14984e4a1409dafe0e3a056128292d83895cc6f4`  
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
| Sprint E — external referenced artifact profile | **Accepted / bidirectional official SDK black-box CI-proven** | PR `#427`; exact proof `14984e4a1409dafe0e3a056128292d83895cc6f4`; `tests/interoperability-external-artifact.test.js`; durable record `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` |
| C8 — complete cross-protocol adversarial matrix | **OPEN** | PR `#369`; exact-head/full-suite/DCO/CodeQL + post-merge acceptance still required |
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

Sprint E proves this existing integrity boundary survives two independent external SDK processes and both claimed bridge directions with one deterministic referenced binary artifact:

```text
filename:   interop-proof.bin
mediaType:  application/octet-stream
size:       29 bytes
sha256:     257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
```

For `MCP → TRUYN → A2A`, the independent A2A process emits a URL Part and only an explicitly configured resolver materializes it. For `A2A → TRUYN → MCP`, the independent MCP process emits a standard `resource_link`; an explicit Sprint E resolver materializes it through MCP `resources/read` before C6 verification. Missing resolvers produce zero reference materialization. Digest/size corruption fails closed.

The Sprint E MCP resolver is a bounded adoption harness. It does **not** turn generalized MCP resources, mutability or publication into an accepted `MCP resources → TRUYN OBJECT/STATE` runtime feature.

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

Sprint E extends the same independent MCP boundary with a referenced binary artifact. The accepted positive path is exactly `server/discover → tools/list → tools/call → resources/read`; the tool executes once, the resource is read once, and the verified final A2A Artifact preserves authoritative imported-provider provenance. The `.invalid` resource URI cannot become an implicit arbitrary HTTP fetch target.

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

Sprint E extends this independent A2A boundary with a referenced URL file. The external A2A executor runs once; the explicit resolver fetches the file once; absent resolver produces zero file fetches; corrupt digest or size fails closed without a second execution.

## Authorization and authority invariants

Every bridge implementation MUST preserve these invariants:

1. unauthorized discovery hides private providers/capabilities;
2. unauthorized execution causes zero upstream provider execution;
3. remote A2A/MCP requester/owner/tenant/billing metadata cannot substitute signed TRUYN authority;
4. transport credentials remain adapter-local and are never emitted into TRUYN discovery/OFFER/NEED/RESULT payloads;
5. correlation mismatches fail closed;
6. retry/poll/fallback logic cannot duplicate remote side effects;
7. invalid artifacts and malformed external-protocol responses cannot be converted into success.

C8 is the bounded acceptance matrix intended to exercise these invariants systematically across both directions. Sprint C/D targeted authority negatives and Sprint E artifact negatives strengthen the evidence but do not substitute for C8. Until C8 is merged and exact-main verification is green, the **complete negative matrix remains open**.

## MCP boundary

The implemented MCP profile covers the surfaces TRUYN currently claims: server discovery/tool calls, configured provider invocation and general explicitly selected tool discovery/import. Broader optional MCP resources, prompts, subscriptions, Apps/extensions remain outside the accepted runtime profile unless separately implemented and evidenced.

Sprint E exercises one standard MCP `resource_link + resources/read` sequence only as an explicit artifact-resolution profile in the interoperability proof. That sequence establishes external referenced-artifact compatibility; it does not broaden the general MCP runtime-support claim above.

## Adoption boundary

TRUYN has now crossed three distinct evidence levels:

1. **C7:** bounded in-repository bidirectional composition;
2. **Sprint C/D:** bounded independent official SDK/reference-server black-box interoperability in both directions;
3. **Sprint E:** bounded bidirectional external referenced-artifact interoperability with exact integrity verification and explicit materialization.

This still does **not** mean:

- ecosystem-wide certification across all A2A/MCP implementations/transports;
- every A2A/MCP optional feature is supported;
- generalized MCP resources are a supported TRUYN OBJECT/STATE import/publication surface;
- arbitrary remote URLs may be fetched;
- the adapters have a stable-v1 compatibility guarantee.

The remaining adoption/stability work is therefore C8 security closure plus the explicit compatibility/stability declaration—not re-proving independent A2A/MCP composition or the bounded external artifact profile.

## Versioning

A2A, MCP and TRUYN are versioned independently. Unsupported external protocol versions fail explicitly. A2A/MCP changes belong in adapters unless they change TRUYN network semantics. Exact versions exercised by evidence must be recorded in compatibility/evidence documents.

See `../compatibility/A2A_MCP_COMPATIBILITY.md` for the factual matrix, `../compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` for Sprint E evidence and `IMPLEMENTATION_STATUS.md` for repository-wide maturity.
