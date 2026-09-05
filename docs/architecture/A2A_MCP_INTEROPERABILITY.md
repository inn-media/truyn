# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical interoperability architecture synchronized through accepted C8 + Sprint E bounded evidence.  
**Snapshot:** 2026-09-05  
**Fresh-base source:** `main@d9e49747531318890399dcf53f27eddcfd6f68b7`  
**Sprint C exact proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**C8 exact accepted head:** `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`  
**C8 exact accepted main:** `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`  
**Sprint E repaired exact head:** `11892fb3f6a9dc8426958780fe244f26e624ff54`  
**Sprint E ordinary CI:** `33956255543` — PASS  
**Sprint E hosted CodeQL:** `33870132494` — PASS  
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

| Gate | Current state | Evidence |
|---|---|---|
| C1 — MCP current-contract baseline | **Accepted / CI-proven** | current MCP server/configured provider tests |
| C2 — general MCP discovery/import | **Accepted / CI-proven** | PR `#332`, `adapters/mcp/client.js`, `adapters/providers/mcp-discovery.js` |
| C3 — A2A server facade | **Accepted / CI-proven** | `adapters/a2a/server.js`, `tests/a2a-server.test.js` |
| C4 — A2A client/provider adapter | **Accepted / CI-proven** | PR `#340` |
| C5 — bounded async polling lifecycle | **Accepted / CI-proven** | PR `#352` |
| C6 — artifact integrity mapping | **Accepted / CI-proven** | PR `#368` |
| C7 — bidirectional A2A↔MCP bridge composition | **Accepted / CI-proven** | PR `#357`, `tests/interoperability-bidirectional.test.js` |
| Sprint C — independent remote A2A | **Accepted / official SDK black-box CI-proven** | `@a2a-js/sdk@1.0.1`, separate process |
| Sprint D — independent remote MCP | **Accepted / official SDK black-box CI-proven** | `@modelcontextprotocol/server@2.0.0`, separate process |
| C8 — complete cross-protocol adversarial matrix | **Accepted / exact-head + exact-main CI/CodeQL** | PR `#423`; `docs/compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md` |
| Sprint E — external referenced artifact profile | **Accepted / bidirectional official SDK black-box CI-proven** | PR `#427`; `tests/interoperability-external-artifact.test.js`; `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` |
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

A2A polling support is distinct from native TRUYN direct-NEED cancellation and generic `PARTIAL` streaming. Full semantic equivalence to every optional A2A cancellation/push/stream feature is not claimed.

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

Sprint E proves this boundary against two independent external SDK processes with one deterministic referenced binary artifact:

```text
filename:   interop-proof.bin
mediaType:  application/octet-stream
size:       29 bytes
sha256:     257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
```

For `MCP → TRUYN → A2A`, the independent A2A process emits a URL Part and only an explicitly configured resolver materializes it. Missing resolver produces zero referenced-file fetches. Digest or size corruption fails closed.

For `A2A → TRUYN → MCP`, the independent MCP process emits a standard `resource_link`; an explicit Sprint E resolver materializes it through MCP `resources/read` before C6 verification. The `.invalid` resource URI is never used as an implicit HTTP target.

The Sprint E MCP resolver is a bounded interoperability profile. It does **not** turn generalized MCP resources, mutability or publication into an accepted `MCP resources → TRUYN OBJECT/STATE` runtime feature.

## Bidirectional bridge composition

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

C7 proves in-repository composition and exactly one remote MCP execution. Sprint D proves the remote MCP side as an independent official `@modelcontextprotocol/server@2.0.0` process.

Sprint E extends that boundary with a standard MCP `resource_link`. The accepted positive path is `server/discover → tools/list → tools/call → resources/read`; there is exactly one tool execution and one resource read before verified bytes become a successful A2A Artifact.

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

C7 proves in-repository composition and exactly one remote A2A execution. Sprint C proves the remote A2A side as an independent official `@a2a-js/sdk@1.0.1` process.

Sprint E extends that boundary with a referenced URL file. The external A2A executor runs once; the explicit resolver fetches the file once; absent resolver produces zero file fetches; corrupt digest or size fails closed without a second `SendMessage` fallback.

## Authorization and authority invariants

Every bridge implementation MUST preserve these invariants:

1. unauthorized discovery hides private providers/capabilities;
2. unauthorized execution causes zero upstream provider execution;
3. remote A2A/MCP requester/owner/tenant/billing metadata cannot substitute signed TRUYN authority;
4. transport credentials remain adapter-local and are never emitted into TRUYN discovery/OFFER/NEED/RESULT payloads;
5. correlation mismatches fail closed;
6. retry/poll/fallback logic cannot duplicate remote side effects;
7. invalid artifacts and malformed external-protocol responses cannot be converted into success.

C8 is the accepted bounded adversarial matrix exercising these invariants across both directions, including current account/tenant authority, replay/correlation attacks, bounded MCP reads/timeouts, artifact integrity/SSRF/provenance negatives, zero unauthorized remote execution and exactly-one valid execution. Durable exact-head and exact-main evidence is in `../compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md`.

Sprint E is complementary evidence: it closes the referenced-artifact adoption profile but does not weaken or replace C8.

## MCP boundary

The implemented MCP profile covers server discovery/tool calls, configured provider invocation and general explicitly selected tool discovery/import. Broader optional MCP resources, prompts, subscriptions, Apps/extensions remain outside the accepted runtime profile unless separately implemented and evidenced.

Sprint E exercises one standard `resource_link + resources/read` sequence only as an explicit artifact-resolution profile. That does not broaden generalized MCP resource support.

## Adoption boundary

TRUYN has crossed four distinct bounded evidence levels:

1. **C7:** in-repository bidirectional composition;
2. **Sprint C/D:** independent official SDK/reference-server black-box interoperability in both directions;
3. **C8:** adversarial cross-protocol security acceptance on exact head and exact merged main;
4. **Sprint E:** bidirectional external referenced-artifact interoperability with exact integrity verification and explicit materialization.

This still does **not** mean:

- ecosystem-wide certification across all A2A/MCP implementations/transports;
- every optional A2A/MCP feature is supported;
- generalized MCP resources are a supported TRUYN OBJECT/STATE import/publication surface;
- arbitrary remote URLs may be fetched;
- the adapters have a stable-v1 compatibility guarantee.

The remaining adoption/stability work is the explicit compatibility/stability declaration and new exact-version evidence whenever the claimed external profile expands.

## Versioning

A2A, MCP and TRUYN are versioned independently. Unsupported external protocol versions fail explicitly. A2A/MCP changes belong in adapters unless they change TRUYN network semantics. Exact versions exercised by evidence must be recorded in compatibility/evidence documents.

See `../compatibility/A2A_MCP_COMPATIBILITY.md` for the factual matrix, `../compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md` for C8, `../compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` for Sprint E and `IMPLEMENTATION_STATUS.md` for repository-wide maturity.
