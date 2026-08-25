# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-08-25  
**TRUYN software:** `0.1.0-dev`  
**TRUYN protocol:** `TRUYN/1` draft

This document records factual compatibility status for the A2A and MCP interoperability edges. It is intentionally stricter than architecture intent: **defined is not implemented, and implemented is not the same as externally certified conformance.**

## Current matrix

| Surface | Target external line | Status | Evidence / limitation |
|---|---|---|---|
| TRUYN as MCP server, stdio | MCP `2026-07-28` + selected legacy behavior | **Implemented / bounded CI-proven current-contract slice** | `adapters/mcp/server.js`; `tests/mcp-current.test.js` proves self-describing modern requests, modern response shape/cache hints and legacy separation |
| TRUYN as MCP server, loopback HTTP | MCP `2026-07-28` + selected legacy behavior | **Implemented / bounded CI-proven current-contract slice** | POST-only loopback bridge; modern protocol/method/name header agreement, JSON content-type gate, no modern session ID, Origin guard; not claimed as complete ecosystem certification |
| MCP client/provider path | MCP `2026-07-28` | **Implemented / bounded CI-proven single-tool path** | `adapters/providers/mcp-http-tool.js`; complete modern request envelope + routing headers and bounded JSON/SSE result handling; configured tool only, not general discovery/import |
| General MCP tool discovery/import | MCP `2026-07-28` | **Not implemented** | C2 interoperability gate |
| MCP resources → TRUYN objects/state | MCP `2026-07-28` | **Defined only** | semantic mapping requires explicit immutability/publication rules |
| A2A Agent Card facade | A2A 1.x | **Defined only** | no `adapters/a2a/` implementation yet |
| A2A server task interface | A2A 1.x | **Defined only** | Send Message / Task / Artifact bridge not implemented |
| A2A client/provider adapter | A2A 1.x | **Defined only** | remote skills are not yet imported into TRUYN offers |
| A2A→TRUYN→MCP round trip | A2A 1.x + MCP current | **Not implemented / not proven** | required acceptance gate |
| MCP→TRUYN→A2A round trip | MCP current + A2A 1.x | **Not implemented / not proven** | required acceptance gate |
| Cross-protocol security negative matrix | A2A + MCP | **Not implemented** | must prove zero unauthorized provider execution/discovery through both edges |
| Stable compatibility guarantee | A2A + MCP | **Not available** | TRUYN/1 remains draft and adapters evolve independently |

## What the existing MCP code proves

The repository now proves a bounded MCP `2026-07-28` current-contract slice for the MCP features TRUYN actually implements; this is not a claim of complete MCP ecosystem certification or every optional MCP feature.

`adapters/mcp/server.js` exposes:

- `truyn_identity`;
- `truyn_find`;
- `truyn_offer`;
- `truyn_need`;
- `truyn_poll`;
- `truyn_result`.

For the modern `2026-07-28` path, every request is self-describing with the protocol version and client capabilities in `_meta`; `clientInfo` is accepted as optional but validated when present. `server/discover` and cacheable list results carry explicit cache hints, server identity is projected through response `_meta`, and the HTTP binding enforces matched protocol/method/name routing headers without creating an `Mcp-Session-Id`.

`tests/mcp-current.test.js` covers the modern discovery/list/tool path, legacy `initialize` separation, missing/mismatched protocol metadata and routing headers, unsupported versions, invalid HTTP content type and modern no-session behavior. `tests/adapters.test.js` retains the composed TRUYN integration path using the modern request envelope.

`adapters/providers/mcp-http-tool.js` can invoke one configured remote MCP tool as a TRUYN provider path. That outbound request now carries the full modern per-request envelope and routing headers and accepts bounded JSON or SSE JSON-RPC results with response-ID validation.

The boundary that remains open is **generalized interoperability**: generic MCP discovery/import, broader optional MCP surfaces/extensions, A2A support and real bidirectional A2A↔TRUYN↔MCP proof.

## A2A mapping target

The initial bridge contract is:

```text
Agent Card skill        → TRUYN capability / authorized OFFER view
A2A Message             → NEED input / continuation metadata
A2A Task + context IDs  → adapter correlation state
A2A Artifact            → RESULT output / ArtifactRef
A2A security scheme     → adapter authentication, not provider authorization
```

Private TRUYN providers MUST NOT become public simply because an Agent Card is publicly retrievable.

## MCP mapping target

The initial bridge contract is:

```text
MCP tool call           → TRUYN tool operation or provider execution
MCP tool                → selected TRUYN capability
MCP structured content  → RESULT output
MCP resource            → OBJECT/STATE only when semantics are explicitly safe
MCP client metadata     → correlation/telemetry, not TRUYN ownership identity
```

## Version policy

A2A, MCP and TRUYN have independent release cadence.

- A bridge MUST report the external protocol version it actually implements.
- Unsupported versions MUST fail explicitly rather than silently changing semantics.
- Compatibility fallbacks must be separately tested.
- A2A/MCP version changes SHOULD be absorbed in adapters without changing `TRUYN/1` unless TRUYN network semantics change.
- Benchmark/evidence reports MUST name the exact external versions exercised.

## Acceptance evidence required

Before this matrix can mark the complete A2A/MCP bridge compatibility gate as proven, the repository still needs a durable evidence report covering:

1. A2A Agent Card discovery and authenticated/private discovery behavior;
2. A2A task + artifact execution through TRUYN;
3. TRUYN execution of a remote A2A provider;
4. general authorized MCP discovery/import for the selected feature set;
5. A2A→TRUYN→MCP round trip;
6. MCP→TRUYN→A2A round trip;
7. text/structured data and at least one referenced file/artifact case;
8. asynchronous task lifecycle;
9. version mismatch/fallback cases;
10. unauthorized discovery/execution negative tests proving provider execution count remains zero.

Architecture: `../architecture/A2A_MCP_INTEROPERABILITY.md`.
