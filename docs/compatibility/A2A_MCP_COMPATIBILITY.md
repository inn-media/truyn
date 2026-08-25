# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-08-25  
**TRUYN software:** `0.1.0-dev`  
**TRUYN protocol:** `TRUYN/1` draft

This document records factual compatibility status for the A2A and MCP interoperability edges. It is intentionally stricter than architecture intent: **defined is not implemented, and implemented is not the same as externally certified conformance.**

## Current matrix

| Surface | Target external line | Status | Evidence / limitation |
|---|---|---|---|
| TRUYN as MCP server, stdio | MCP `2026-07-28` + selected legacy behavior | **Implemented / bounded CI-proven current-contract slice** | `adapters/mcp/server.js`; `tests/mcp-current.test.js` proves self-describing modern requests, modern response shape/cache hints and legacy separation |
| TRUYN as MCP server, loopback HTTP | MCP `2026-07-28` + selected legacy behavior | **Implemented / bounded CI-proven current-contract slice** | POST-only loopback bridge; modern protocol/method/name header agreement, Base64-sentinel `Mcp-Name` decoding, JSON content-type gate, no modern session issuance, Origin guard; not claimed as complete ecosystem certification |
| MCP client/provider path | MCP `2026-07-28` | **Implemented / bounded CI-proven single-tool path** | `adapters/providers/mcp-http-tool.js`; complete modern request envelope + routing headers, Base64-sentinel `Mcp-Name` encoding, bounded JSON/SSE result handling, strict modern `resultType=complete` + content validation; configured tool only, not general discovery/import |
| General MCP tool discovery/import | MCP `2026-07-28` | **Not implemented** | C2 interoperability gate; includes remote schema-driven `x-mcp-header` import/forwarding work |
| MCP resources → TRUYN objects/state | MCP `2026-07-28` | **Defined only** | semantic mapping requires explicit immutability/publication rules |
| A2A Agent Card facade | A2A 1.x | **Defined only** | no `adapters/a2a/` implementation yet |
| A2A server task interface | A2A 1.x | **Defined only** | Send Message / Task / Artifact bridge not implemented |
| A2A client/provider adapter | A2A 1.x | **Defined only** | remote skills are not yet imported into TRUYN offers |
| A2A→TRUYN→MCP round trip | A2A 1.x + MCP current | **Not implemented / not proven** | required acceptance gate |
| MCP→TRUYN→A2A round trip | MCP current + A2A 1.x | **Not implemented / not proven** | required acceptance gate |
| Cross-protocol security negative matrix | A2A + MCP | **Partial MCP proof only** | C1 proves an unauthorized MCP requester sees zero private offers and causes zero provider execution; full A2A+MCP matrix remains open |
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

For the modern `2026-07-28` path, every request is self-describing with the protocol version and client capabilities in `_meta`; `clientInfo` is accepted as optional but validated when present. `server/discover` and cacheable list results carry explicit cache hints, server identity is projected through response `_meta`, and the HTTP binding enforces matched protocol/method/name routing headers without creating an `Mcp-Session-Id`. `Mcp-Name` follows the modern Base64-sentinel encoding rules when a name is not safely representable as a plain ASCII header value.

`tests/mcp-current.test.js` covers the modern discovery/list/tool path, legacy `initialize` separation, missing/mismatched protocol metadata and routing headers, unsupported versions, invalid HTTP content type, encoded routing names and owner-only provider non-disclosure/non-execution. `tests/adapters.test.js` retains the composed TRUYN integration path using the modern request envelope.

`adapters/providers/mcp-http-tool.js` can invoke one configured remote MCP tool as a TRUYN provider path. The outbound request carries the modern per-request envelope and routing headers, supports Base64-sentinel `Mcp-Name`, and accepts bounded JSON or SSE JSON-RPC results with response-ID validation. Since this path explicitly speaks `2026-07-28`, a successful tool response must include `resultType=complete` and a `content` array. `input_required` is rejected explicitly on this bounded single-tool path rather than being misreported as successful completion.

The boundary that remains open is **generalized interoperability**: generic MCP discovery/import, schema-driven `x-mcp-header` support for imported remote tools, broader optional MCP surfaces/extensions, A2A support and real bidirectional A2A↔TRUYN↔MCP proof.

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

## C1 bounded acceptance boundary

C1 closes the current-contract gap only for the MCP surfaces that already exist in TRUYN:

- TRUYN-as-MCP `server/discover`, `tools/list` and `tools/call`;
- stdio modern request envelopes plus selected explicit `2025-*` legacy initialization behavior;
- loopback Streamable HTTP POST routing/header validation;
- one configured remote MCP HTTP tool provider;
- JSON/SSE final tool results;
- owner-only provider non-disclosure/non-execution through the MCP facade.

C1 does **not** claim support for general remote tool discovery, resources/prompts/subscriptions, MRTR auto-fulfilment, MCP Apps/extensions, remote-schema `x-mcp-header` parameters or ecosystem-wide certification. Those capabilities must only be promoted after their own implementation and evidence.

## Acceptance evidence required for the complete A2A/MCP bridge

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
10. unauthorized discovery/execution negative tests across both external protocols proving provider execution count remains zero.

Architecture: `../architecture/A2A_MCP_INTEROPERABILITY.md`.
