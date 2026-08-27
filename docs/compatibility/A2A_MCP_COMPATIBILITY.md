# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-08-27  
**Production/reference source synchronized from:** `main@52f44fa014becb17f2d1c3e7bf71b7ba1fa595a4`  
**TRUYN protocol:** `TRUYN/1` draft  
**A2A profile exercised:** `1.0`  
**MCP profile exercised:** `2026-07-28`

This document is the factual compatibility matrix for the A2A and MCP edges. It deliberately distinguishes **defined**, **implemented**, **bounded CI-proven**, **externally interoperability-proven**, and **stable**. In-repository composition is evidence, but it is not ecosystem-wide certification.

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
| MCP→TRUYN→A2A round trip | **Implemented / bounded CI-proven — C7** | durable record: `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`; exact test `tests/interoperability-bidirectional.test.js`; PR `#357`, merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a` |
| Cross-protocol adversarial security matrix | **OPEN — C8** | active PR `#369`; do not mark accepted until exact-head/full-suite/DCO/CodeQL and post-merge exact-main gates pass |
| Independent external A2A reference/SDK interoperability | **Not yet proven** | current C7 remote A2A side is an in-repository TRUYN A2A facade fixture |
| Independent external MCP reference/SDK interoperability | **Not yet proven** | current C7 remote MCP side is a bounded protocol fixture, not an ecosystem certification |
| Stable A2A/MCP compatibility guarantee | **Not available** | TRUYN/1 is draft; external adapters remain independently versioned |

## Accepted C1–C7 profile

The accepted in-repository profile now composes both protocol directions. C4 reverse A2A import/provider execution is implemented and bounded CI-proven by PR `#340` (merge `1735528461a04de60f9f8572b466a732a6f03c62`). C7 bidirectional composition is proved by `tests/interoperability-bidirectional.test.js` in PR `#357` (merge `f04fcd1d4d72af85a6b97686c7c875388ef6038a`) and pinned independently in `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`.

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

## Security boundary

External transport authentication and metadata are adapter inputs, not TRUYN authorization facts.

The accepted profile requires:

- provider visibility/eligibility to remain authorization-aware;
- public Agent Cards/MCP discovery not to expose private TRUYN providers implicitly;
- remote requester/provider-owner/billing metadata not to become authoritative TRUYN identity or responsibility;
- correlation mismatches and invalid artifacts to fail closed;
- remote execution not to be duplicated by polling/fallback behavior;
- A2A/MCP credentials to remain inside adapter/runtime secret boundaries.

C1–C7 provide bounded positive and targeted negative evidence. **C8 is the remaining complete cross-protocol adversarial matrix gate and is still open.**

## Artifact boundary

C6 proves the accepted A2A artifact-integrity mapping for text, canonical JSON, raw/base64 content and explicit referenced-URL resolution. It does not imply that arbitrary remote URLs are fetched. URL materialization is disabled unless an explicit resolver is configured, and integrity validation is required before a remote artifact becomes a successful TRUYN/A2A result.

C7 currently proves the bidirectional bridge primarily for text/structured JSON composition. A broader independent external implementation round trip carrying referenced file/artifact payloads remains an adoption/evidence follow-up; it is not required to pretend that C7 itself did not happen.

## What remains open for adoption

The next adoption-level proof should build on the already-accepted C4–C7 implementation rather than reimplement it:

1. finish and accept C8 on an exact head and exact post-merge main;
2. exercise `MCP→TRUYN→A2A` against an independent A2A SDK/reference implementation;
3. exercise `A2A→TRUYN→MCP` against an independent MCP SDK/reference implementation;
4. carry at least one integrity-verified referenced artifact/file through the claimed external profile;
5. publish durable exact-version evidence without claiming stable compatibility until a stability policy exists.

## Version policy

A2A, MCP and TRUYN have independent release cadence. Unsupported versions fail explicitly. Adapter version changes should not require a new TRUYN protocol generation unless TRUYN network semantics change.

Historical C1/C2/C3 documents and tests remain valid evidence for the slices they originally closed, but their old “future work” wording must not be used as the current repository status after C4–C7 merged. For C7, the durable acceptance authority is `docs/compatibility/A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`.
