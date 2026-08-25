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
| MCP configured single-tool provider path | MCP `2026-07-28` | **Implemented / bounded CI-proven** | `adapters/providers/mcp-http-tool.js`; complete modern request envelope + routing headers, Base64-sentinel `Mcp-Name` encoding, bounded JSON/SSE result handling, strict modern `resultType=complete` + content validation |
| General MCP tool discovery/import | MCP `2026-07-28` | **Implemented / bounded CI-proven C2 slice** | `adapters/mcp/client.js` + `adapters/providers/mcp-discovery.js`; `server/discover` → bounded paginated `tools/list` → explicit allowlist/filter → selected TRUYN capabilities/OFFERs; schema-driven `x-mcp-header` forwarding; `tests/mcp-discovery-import.test.js`; PR `#332` |
| MCP resources → TRUYN objects/state | MCP `2026-07-28` | **Defined only** | semantic mapping requires explicit immutability/publication rules |
| A2A Agent Card facade | A2A 1.x | **Defined only** | no `adapters/a2a/` implementation yet |
| A2A server task interface | A2A 1.x | **Defined only** | Send Message / Task / Artifact bridge not implemented |
| A2A client/provider adapter | A2A 1.x | **Defined only** | remote skills are not yet imported into TRUYN offers |
| A2A→TRUYN→MCP round trip | A2A 1.x + MCP current | **Not implemented / not proven** | required acceptance gate |
| MCP→TRUYN→A2A round trip | MCP current + A2A 1.x | **Not implemented / not proven** | required acceptance gate |
| Cross-protocol security negative matrix | A2A + MCP | **Partial MCP proof only** | C1 proves private native provider non-disclosure/non-execution through MCP; C2 proves unauthorized requesters see zero imported private MCP OFFERs and cause zero remote MCP execution; full A2A+MCP matrix remains open |
| Stable compatibility guarantee | A2A + MCP | **Not available** | TRUYN/1 remains draft and adapters evolve independently |

## What the existing MCP code proves

The repository now proves bounded MCP `2026-07-28` current-contract and general tool-import slices for the MCP features TRUYN actually implements. This is not a claim of complete MCP ecosystem certification or every optional MCP feature.

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

C2 adds `adapters/mcp/client.js` and `adapters/providers/mcp-discovery.js` for **general tool discovery/import**. The importer:

- performs modern `server/discover` before catalog import and requires the selected protocol version plus tools capability;
- walks `tools/list` with bounded page/tool counts, cursor-loop detection, duplicate-name rejection and cache-hint validation;
- is default-deny: an explicit exact-name allowlist and/or local filter is required, so there is no implicit import-all path;
- validates imported tool definitions before selection;
- excludes malformed `x-mcp-header` definitions rather than publishing them as TRUYN capabilities;
- supports statically reachable `x-mcp-header` bindings for `string`, `integer` and `boolean` values and forwards them as `Mcp-Param-*`, using the MCP Base64 sentinel where needed;
- maps selected tools to local TRUYN capability names, defaulting to `mcp.<remote-tool-name>`;
- executes selected tools with the TRUYN input object mapped directly to MCP tool arguments;
- keeps remote MCP authentication and server metadata adapter-local rather than treating them as TRUYN ownership, billing or requester identity.

Selected tools become TRUYN `OFFER`s only through `TruynAdapterHost`. The authoritative provider identity and access policy therefore remain the signed TRUYN provider identity and the existing provider authorization boundary. `tests/mcp-discovery-import.test.js` proves that an unauthorized requester sees zero imported private offers, creates zero provider events and causes zero remote MCP tool execution, while an authorized requester completes the imported MCP execution and receives a normal TRUYN `RESULT`.

The remaining generalized-interoperability boundary is broader optional MCP surfaces/extensions (resources, prompts, subscriptions, MRTR auto-fulfilment, MCP Apps/extensions), A2A support and real bidirectional A2A↔TRUYN↔MCP proof.

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

The implemented/target bridge contract is:

```text
MCP tool call           → TRUYN tool operation or provider execution
MCP discovered tool     → explicitly selected TRUYN capability / authorized OFFER
MCP structured content  → RESULT output
MCP resource            → OBJECT/STATE only when semantics are explicitly safe (not yet implemented)
MCP client/server meta  → correlation/descriptive metadata, not TRUYN ownership identity
```

## Version policy

A2A, MCP and TRUYN have independent release cadence.

- A bridge MUST report the external protocol version it actually implements.
- Unsupported versions MUST fail explicitly rather than silently changing semantics.
- Compatibility fallbacks must be separately tested.
- A2A/MCP version changes SHOULD be absorbed in adapters without changing `TRUYN/1` unless TRUYN network semantics change.
- Benchmark/evidence reports MUST name the exact external versions exercised.

## C1 bounded acceptance boundary

C1 closes the current-contract gap only for the MCP surfaces that already existed before generalized import:

- TRUYN-as-MCP `server/discover`, `tools/list` and `tools/call`;
- stdio modern request envelopes plus selected explicit `2025-*` legacy initialization behavior;
- loopback Streamable HTTP POST routing/header validation;
- one configured remote MCP HTTP tool provider;
- JSON/SSE final tool results;
- owner-only provider non-disclosure/non-execution through the MCP facade.

C1 does **not** by itself claim general remote tool discovery, resources/prompts/subscriptions, MRTR auto-fulfilment, MCP Apps/extensions or ecosystem-wide certification.

## C2 bounded acceptance boundary

C2 closes the **general MCP tool discovery/import** slice:

- remote `server/discover` validation;
- bounded paginated `tools/list` catalog retrieval;
- explicit allowlist/filter selection with no implicit import-all;
- deterministic local capability mapping;
- remote-schema `x-mcp-header` validation and `Mcp-Param-*` forwarding for supported primitive parameters;
- selected MCP tools becoming signed TRUYN `OFFER`s through the existing adapter-host authorization boundary;
- authorized NEED → remote MCP `tools/call` → TRUYN RESULT execution;
- negative proof that unauthorized requesters see zero imported private OFFERs and cause zero remote MCP execution.

C2 does **not** claim MCP resources/prompts/subscriptions, MRTR auto-fulfilment, MCP Apps/extensions, A2A, complete cross-protocol proof or ecosystem-wide MCP certification.

## Acceptance evidence required for the complete A2A/MCP bridge

Before this matrix can mark the complete A2A/MCP bridge compatibility gate as proven, the repository still needs a durable evidence report covering:

1. A2A Agent Card discovery and authenticated/private discovery behavior;
2. A2A task + artifact execution through TRUYN;
3. TRUYN execution of a remote A2A provider;
4. A2A→TRUYN→MCP round trip;
5. MCP→TRUYN→A2A round trip;
6. text/structured data and at least one referenced file/artifact case;
7. asynchronous task lifecycle;
8. version mismatch/fallback cases;
9. unauthorized discovery/execution negative tests across both external protocols proving provider execution count remains zero.

Architecture: `../architecture/A2A_MCP_INTEROPERABILITY.md`.
