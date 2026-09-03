# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-09-03  
**Sprint E base:** `main@476cc1333b2db7d85599c7e7f32c7b954b79611f`  
**Sprint C exact executable proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact executable proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**Sprint E exact executable proof:** `14984e4a1409dafe0e3a056128292d83895cc6f4`  
**TRUYN protocol:** `TRUYN/1` draft  
**A2A profile exercised:** `1.0`  
**MCP profile exercised:** `2026-07-28`

This document is the factual compatibility matrix for the A2A and MCP edges. It deliberately distinguishes **defined**, **implemented**, **bounded CI-proven**, **independent SDK black-box CI-proven**, **externally interoperability-proven**, and **stable**. In-repository composition is evidence, but it is not ecosystem-wide certification.

## Current matrix

| Surface | Status | Durable evidence / boundary |
|---|---|---|
| TRUYN as MCP server, stdio | **Implemented / bounded CI-proven** | `adapters/mcp/server.js`, `tests/mcp-current.test.js` |
| TRUYN as MCP server, loopback HTTP | **Implemented / bounded CI-proven** | exact MCP version/routing headers, JSON content gate, Origin guard, bounded responses |
| Configured MCP HTTP tool as TRUYN provider | **Implemented / bounded CI-proven** | `adapters/providers/mcp-http-tool.js` |
| General MCP tool discovery/import | **Implemented / bounded CI-proven — C2** | `adapters/mcp/client.js`, `adapters/providers/mcp-discovery.js`, `tests/mcp-discovery-import.test.js`, PR `#332` |
| MCP resources → TRUYN OBJECT/STATE | **Defined only** | generalized resource mutability/publication semantics remain outside the accepted profile; Sprint E's explicit `resource_link + resources/read` resolver does not broaden this runtime claim |
| A2A Agent Card/server facade | **Implemented / bounded CI-proven — C3** | `adapters/a2a/server.js`, `mapping.js`, `task-store.js`, `tests/a2a-server.test.js` |
| A2A client/provider adapter + remote Agent Card/skill import | **Implemented / bounded CI-proven — C4** | `adapters/a2a/client.js`, `adapters/providers/a2a-discovery.js`; PR `#340`, merge `1735528461a04de60f9f8572b466a732a6f03c62` |
| A2A polling async lifecycle | **Implemented / bounded CI-proven — C5** | exactly-one initial `SendMessage`, bounded `GetTask` polling, fail-closed task/context correlation; PR `#352`, merge `591d30d8f57fb7c661c847bb059cd437f437dd08` |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** | SHA-256, byte-size, canonical JSON/base64, bounded artifacts, explicit URL resolver/no implicit SSRF, authoritative provenance; PR `#368`, merge `0e6e4119450e9de55fb9be32b993a28f98dda148` |
| A2A→TRUYN→MCP round trip | **Implemented / bounded CI-proven — C7; independent official MCP SDK black-box CI-proven — Sprint D** | C7 record plus `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`; official `@modelcontextprotocol/server@2.0.0`; executable source `0a40e635533f6a9623b19057b3320ba2a888f1f1`; CI `33262306180`; CodeQL `33262304786` |
| MCP→TRUYN→A2A round trip | **Implemented / bounded CI-proven — C7; independent A2A SDK black-box CI-proven — Sprint C** | C7 record plus `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`; official `@a2a-js/sdk@1.0.1`; exact proof `tests/interoperability-independent-a2a.test.js`; PR `#380` |
| Cross-protocol adversarial security matrix | **OPEN — C8** | active PR `#369`; do not mark accepted until exact-head/full-suite/DCO/CodeQL and post-merge exact-main gates pass |
| Independent external A2A reference/SDK interoperability | **Proven for MCP→TRUYN→A2A — Sprint C** | official A2A Project `@a2a-js/sdk@1.0.1`, upstream tag `v1.0.1` / `f5ca7d05945a69cbf3dcd357203d4ce99201494f`; separate-process Agent Card + JSON-RPC black box; exact core source `a435ed16e559226ed095959b7b95aa7067271302` |
| Independent external MCP reference/SDK interoperability | **Proven for A2A→TRUYN→MCP — Sprint D** | official `@modelcontextprotocol/server@2.0.0`; separate Node process; public `handler.fetch()`/`handler.close()`; exact core source `0a40e635533f6a9623b19057b3320ba2a888f1f1`; durable record `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md` |
| External referenced file/artifact interoperability | **Accepted / bounded bidirectional independent SDK black-box CI-proven — Sprint E** | official A2A + MCP SDK processes; URL Part and MCP `resource_link + resources/read`; exact proof `14984e4a1409dafe0e3a056128292d83895cc6f4`; CI `33783686829`; CodeQL `33783681960`; durable record `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` |
| Stable A2A/MCP compatibility guarantee | **Not available** | TRUYN/1 is draft; external adapters remain independently versioned |

## Accepted C1–C7 profile

The accepted in-repository profile composes both protocol directions. C4 reverse A2A import/provider execution is implemented and bounded CI-proven by PR `#340` (merge `1735528461a04de60f9f8572b466a732a6f03c62`). C7 bidirectional composition is proved by `tests/interoperability-bidirectional.test.js` in PR `#357` (merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a`) and pinned independently in `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`.

### A2A → TRUYN → MCP

```text
A2A client
  → A2A 1.0 Agent Card / SendMessage facade
  → authorized TRUYN NEED
  → selected imported MCP provider
  → MCP 2026-07-28 tools/call
  → TRUYN RESULT
  → completed A2A Task / Artifact
```

C7 asserts one backing TRUYN request and exactly one remote MCP tool execution. A2A descriptive `ownerId` / billing metadata is not promoted into MCP authority; the signed TRUYN provider identity remains authoritative.

Sprint D adds independent ecosystem-side evidence to this route. The remote MCP server runs in a separate process using official `@modelcontextprotocol/server@2.0.0`, registers the tool through the public SDK API, receives traffic only through public `createMcpHandler(...).fetch()`, and is closed through public `handler.close()`. External counters independently confirm one positive tool execution and zero execution for owner/billing spoof negatives. Requester-scoped `node.find()` remains the single relay authority for authenticated provider visibility; a dedicated regression preserves relay-level trusted grants while public Agent Cards still hide owner-only providers. Durable evidence is `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`.

Sprint E extends this same independent MCP edge with a referenced binary artifact. The independent tool returns a standard MCP `resource_link`; an explicitly installed Sprint E resolver materializes it only through MCP `resources/read`, after which the existing C6 verifier enforces exact byte-size and SHA-256 before the result can become a successful TRUYN/A2A artifact. The resource URI uses `.invalid`, so it cannot become an implicit arbitrary HTTP fetch path.

### MCP → TRUYN → A2A

```text
MCP client
  → TRUYN MCP truyn_need
  → authorized TRUYN NEED
  → selected imported A2A provider
  → A2A 1.0 SendMessage / Task / Artifact
  → TRUYN RESULT
  → MCP truyn_poll result
```

C7 asserts exactly one remote A2A execution and preserves protocol/task/request correlation as descriptive interoperability metadata without replacing TRUYN requester/provider authority.

Sprint C adds independent ecosystem-side evidence to this route. The remote A2A server runs in a separate process using the official A2A Project `@a2a-js/sdk@1.0.1`, its own `DefaultRequestHandler` and task store. TRUYN sees only the external Agent Card and HTTP JSON-RPC interface. External SDK executor and request instrumentation independently confirm one execution and one JSON-RPC execution request. Durable evidence is `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`.

Sprint E extends this independent A2A edge with a referenced URL file. The external A2A process emits the file as a URL Part; only the explicitly configured resolver materializes the 29-byte proof file. No resolver fails closed with zero referenced-file fetches. Corrupt digest and size claims fail closed without duplicate `SendMessage` execution.

## Security boundary

External transport authentication and metadata are adapter inputs, not TRUYN authorization facts.

The accepted profile requires provider visibility/eligibility to remain authorization-aware; public Agent Cards/MCP discovery not to expose private TRUYN providers implicitly; remote requester/provider-owner/billing metadata not to become authoritative TRUYN identity or responsibility; correlation mismatches and invalid artifacts to fail closed; remote execution not to be duplicated; and credentials to remain inside adapter/runtime secret boundaries.

Sprint D adds production-boundary owner/requester and billing anti-spoof evidence on the independent MCP direction: spoofed A2A ownership is rejected before any TRUYN NEED or external execution, while legitimate relay-level trusted requester grants remain visible to authenticated A2A discovery. Spoofed billing cannot override provider `prepaid` policy or cause external `tools/call`. These targeted Sprint-D negatives do not substitute for C8. **C8 remains open.**

Sprint E adds artifact-specific negatives in both independent directions: missing explicit resolvers produce zero reference materialization; corrupt digest and byte-size claims fail closed; valid calls execute exactly once and fallback/retry does not duplicate remote side effects. These artifact negatives still do not substitute for the complete C8 adversarial matrix.

## Artifact boundary

C6 proves the accepted A2A artifact-integrity mapping for text, canonical JSON, raw/base64 content and explicit referenced-URL resolution. It does not imply arbitrary remote URLs are fetched. C7 proves bidirectional bridge composition primarily for text/structured JSON. Sprint C proves a text artifact against the independent official A2A SDK. Sprint D proves structured JSON through an independent official MCP SDK tool.

Sprint E now proves the bounded external referenced-artifact profile in both bridge directions with one deterministic binary file: `interop-proof.bin`, `application/octet-stream`, 29 bytes, SHA-256 `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`. The A2A direction uses an external URL Part plus an explicit resolver. The MCP direction uses standard `resource_link + resources/read` through an explicit Sprint E resolver. This does not promote generalized MCP resource publication/import into the accepted runtime profile.

## What remains open for adoption

1. finish and accept C8 on an exact head and exact post-merge main;
2. define and accept a compatibility/stability policy before claiming stable A2A/MCP support;
3. publish exact-version durable interoperability evidence whenever the claimed external profile expands.

## Version policy

A2A, MCP and TRUYN have independent release cadence. Unsupported versions fail explicitly. Adapter version changes should not require a new TRUYN protocol generation unless TRUYN network semantics change.

Historical C1/C2/C3 documents and tests remain valid evidence for the slices they originally closed, but old “future work” wording must not be used as current repository status after C4–C7 and Sprint C/D/E were accepted. For C7, the durable acceptance authority is `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`; for Sprint C it is `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`; for Sprint D it is `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`; for Sprint E it is `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`.
