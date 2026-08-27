# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-08-27  
**Production/reference baseline:** `main@83738302131e08d807bc0ac00f64268a38b46309`  
**Sprint C exact executable proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
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
| MCP resources → TRUYN OBJECT/STATE | **Defined only** | generalized resource mutability/publication semantics remain outside the accepted profile |
| A2A Agent Card/server facade | **Implemented / bounded CI-proven — C3** | `adapters/a2a/server.js`, `mapping.js`, `task-store.js`, `tests/a2a-server.test.js` |
| A2A client/provider adapter + remote Agent Card/skill import | **Implemented / bounded CI-proven — C4** | `adapters/a2a/client.js`, `adapters/providers/a2a-discovery.js`; PR `#340`, merge `1735528461a04de60f9f8572b466a732a6f03c62` |
| A2A polling async lifecycle | **Implemented / bounded CI-proven — C5** | exactly-one initial `SendMessage`, bounded `GetTask` polling, fail-closed task/context correlation; PR `#352`, merge `591d30d8f57fb7c661c847bb059cd437f437dd08` |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** | SHA-256, byte-size, canonical JSON/base64, bounded artifacts, explicit URL resolver/no implicit SSRF, authoritative provenance; PR `#368`, merge `0e6e4119450e9de55fb9be32b993a28f98dda148` |
| A2A→TRUYN→MCP round trip | **Implemented / bounded CI-proven — C7** | durable record: `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`; exact test `tests/interoperability-bidirectional.test.js`; PR `#357`, merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a` |
| MCP→TRUYN→A2A round trip | **Implemented / bounded CI-proven — C7; independent A2A SDK black-box CI-proven — Sprint C** | C7 record plus `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`; official `@a2a-js/sdk@1.0.1`; exact proof `tests/interoperability-independent-a2a.test.js`; PR `#380` |
| Cross-protocol adversarial security matrix | **OPEN — C8** | active PR `#369`; do not mark accepted until exact-head/full-suite/DCO/CodeQL and post-merge exact-main gates pass |
| Independent external A2A reference/SDK interoperability | **Proven for MCP→TRUYN→A2A — Sprint C** | official A2A Project `@a2a-js/sdk@1.0.1`, upstream tag `v1.0.1` / `f5ca7d05945a69cbf3dcd357203d4ce99201494f`; separate-process Agent Card + JSON-RPC black box; exact core source `a435ed16e559226ed095959b7b95aa7067271302` |
| Independent external MCP reference/SDK interoperability | **Not yet proven** | current C7 remote MCP side is a bounded protocol fixture, not an independent MCP implementation |
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

Sprint C adds independent ecosystem-side evidence to this route. The remote A2A server runs in a separate process using the official A2A Project `@a2a-js/sdk@1.0.1`, its own `DefaultRequestHandler` and task store. TRUYN sees only the external Agent Card and HTTP JSON-RPC interface. The external SDK executor and request instrumentation independently confirm one execution and one JSON-RPC execution request. Durable evidence is `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`.

## Security boundary

External transport authentication and metadata are adapter inputs, not TRUYN authorization facts.

The accepted profile requires:

- provider visibility/eligibility to remain authorization-aware;
- public Agent Cards/MCP discovery not to expose private TRUYN providers implicitly;
- remote requester/provider-owner/billing metadata not to become authoritative TRUYN identity or responsibility;
- correlation mismatches and invalid artifacts to fail closed;
- remote execution not to be duplicated by polling/fallback behavior;
- A2A/MCP credentials to remain inside adapter/runtime secret boundaries.

C1–C7 provide bounded positive and targeted negative evidence. Sprint C strengthens the positive remote-A2A interoperability boundary but does not substitute for C8. **C8 remains the complete cross-protocol adversarial matrix gate and is still open.**

## Artifact boundary

C6 proves the accepted A2A artifact-integrity mapping for text, canonical JSON, raw/base64 content and explicit referenced-URL resolution. It does not imply that arbitrary remote URLs are fetched. URL materialization is disabled unless an explicit resolver is configured, and integrity validation is required before a remote artifact becomes a successful TRUYN/A2A result.

C7 proves the bidirectional bridge primarily for text/structured JSON composition. Sprint C proves a text artifact round trip against the independent official A2A SDK. An independent external implementation round trip carrying a referenced file/artifact remains an adoption/evidence follow-up.

## What remains open for adoption

The next adoption-level proof should build on the already-accepted C4–C7 implementation and Sprint C rather than reimplement them:

1. finish and accept C8 on an exact head and exact post-merge main;
2. exercise `A2A→TRUYN→MCP` against an independent MCP SDK/reference implementation;
3. carry at least one integrity-verified referenced artifact/file through the claimed external profile;
4. publish exact-version durable interoperability evidence for each new external proof;
5. define a compatibility/stability policy before claiming stable A2A/MCP support.

## Version policy

A2A, MCP and TRUYN have independent release cadence. Unsupported versions fail explicitly. Adapter version changes should not require a new TRUYN protocol generation unless TRUYN network semantics change.

Historical C1/C2/C3 documents and tests remain valid evidence for the slices they originally closed, but their old “future work” wording must not be used as the current repository status after C4–C7 merged. For C7, the durable acceptance authority is `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`; for the independent remote-A2A proof, the authority is `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`.
