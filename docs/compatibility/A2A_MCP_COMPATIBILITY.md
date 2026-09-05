# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-09-05  
**Current fresh-base source:** `main@d9e49747531318890399dcf53f27eddcfd6f68b7`  
**Sprint C exact executable proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact executable proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**C8 exact accepted head:** `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`  
**C8 exact accepted main:** `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`  
**Sprint E repaired exact head:** `11892fb3f6a9dc8426958780fe244f26e624ff54`  
**Sprint E ordinary CI:** `33956255543` — PASS  
**Sprint E hosted CodeQL:** `33870132494` — PASS  
**TRUYN protocol:** `TRUYN/1` draft  
**A2A profile exercised:** `1.0`  
**MCP profile exercised:** `2026-07-28`

This document is the factual compatibility matrix for the A2A and MCP edges. It distinguishes **defined**, **implemented**, **bounded CI-proven**, **independent SDK black-box CI-proven**, **bounded external interoperability-proven**, and **stable**. Bounded evidence is not ecosystem-wide certification.

## Current matrix

| Surface | Status | Durable evidence / boundary |
|---|---|---|
| TRUYN as MCP server, stdio | **Implemented / bounded CI-proven** | `adapters/mcp/server.js`, `tests/mcp-current.test.js` |
| TRUYN as MCP server, loopback HTTP | **Implemented / bounded CI-proven** | exact MCP version/routing headers, JSON content gate, Origin guard, bounded responses |
| Configured MCP HTTP tool as TRUYN provider | **Implemented / bounded CI-proven** | `adapters/providers/mcp-http-tool.js` |
| General MCP tool discovery/import | **Implemented / bounded CI-proven — C2** | `adapters/mcp/client.js`, `adapters/providers/mcp-discovery.js`, PR `#332` |
| MCP resources → TRUYN OBJECT/STATE | **Defined only** | generalized resource mutability/publication semantics remain outside the accepted runtime profile |
| A2A Agent Card/server facade | **Implemented / bounded CI-proven — C3** | `adapters/a2a/server.js`, `mapping.js`, `task-store.js`, `tests/a2a-server.test.js` |
| A2A client/provider adapter + remote Agent Card/skill import | **Implemented / bounded CI-proven — C4** | PR `#340` |
| A2A polling async lifecycle | **Implemented / bounded CI-proven — C5** | exactly-one initial `SendMessage`, bounded `GetTask` polling, fail-closed task/context correlation |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** | SHA-256, byte-size, canonical JSON/base64, bounded artifacts, explicit URL resolver/no implicit SSRF, authoritative provenance |
| A2A→TRUYN→MCP round trip | **C7 + independent official MCP SDK black-box proven — Sprint D** | `@modelcontextprotocol/server@2.0.0`; separate process; `docs/compatibility/A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md` |
| MCP→TRUYN→A2A round trip | **C7 + independent official A2A SDK black-box proven — Sprint C** | `@a2a-js/sdk@1.0.1`; separate process; `docs/compatibility/A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md` |
| Cross-protocol adversarial security matrix | **ACCEPTED / bounded CI+CodeQL-proven — C8** | PR `#423`; exact head `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`; exact main `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`; `docs/compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md` |
| Independent external A2A reference/SDK interoperability | **Proven for MCP→TRUYN→A2A — Sprint C** | official `@a2a-js/sdk@1.0.1`, separate-process Agent Card + JSON-RPC black box |
| Independent external MCP reference/SDK interoperability | **Proven for A2A→TRUYN→MCP — Sprint D** | official `@modelcontextprotocol/server@2.0.0`, separate Node process, public handler lifecycle |
| External referenced file/artifact interoperability | **ACCEPTED / bounded bidirectional official-SDK black-box proof — Sprint E** | PR `#427`; `tests/interoperability-external-artifact.test.js`; `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`; deterministic artifact SHA-256 `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae` |
| Stable A2A/MCP compatibility guarantee | **Not available** | TRUYN/1 is draft; external adapters remain independently versioned |

## Accepted C1–C8 + Sprint E profile

The accepted in-repository profile composes both protocol directions, includes the bounded C8 adversarial security matrix, and now includes the bounded Sprint E external referenced-artifact profile. None of these proofs changes TRUYN wire semantics.

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

C7 asserts one backing TRUYN request and exactly one remote MCP tool execution. Sprint D adds independent official MCP SDK evidence. Sprint E extends the route with a standard `resource_link`, explicit `resources/read` resolution and C6 integrity verification. Positive execution is exactly one `tools/call` plus one `resources/read`; missing resolver produces zero resource reads; corrupt digest/size fails closed without duplicate tool execution.

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

C7 asserts exactly one remote A2A execution. Sprint C adds independent official A2A SDK evidence. Sprint E extends the route with an external URL Part, explicit resolver materialization and C6 integrity verification. Positive execution is exactly one external A2A execution plus one explicit file fetch; missing resolver produces zero fetches; corrupt digest/size fails closed without a second `SendMessage` fallback.

## Security boundary

External transport authentication and metadata are adapter inputs, not TRUYN authorization facts.

The accepted profile requires provider visibility/eligibility to remain authorization-aware; public Agent Cards/MCP discovery not to expose private TRUYN providers implicitly; remote requester/provider-owner/tenant/billing metadata not to become authoritative TRUYN identity or responsibility; correlation mismatches and invalid artifacts to fail closed; remote execution not to be duplicated; and credentials to remain inside adapter/runtime secret boundaries.

C8 supplies the complete bounded adversarial acceptance for the claimed surfaces. Sprint E does not replace C8; it adds external referenced-artifact adoption evidence through two independent SDK processes while preserving the same fail-closed authority/integrity boundary.

## Artifact boundary

C6 proves the accepted artifact-integrity mapping for text, canonical JSON, raw/base64 content and explicit referenced-URL resolution. Arbitrary remote URLs are never implicitly fetched.

Sprint E closes the previously open external referenced-file/artifact interoperability profile for one deterministic binary artifact:

```text
filename:    interop-proof.bin
media type:  application/octet-stream
size:        29 bytes
sha256:      257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
```

The A2A side uses an explicit URL resolver; the MCP side uses standard `resource_link + resources/read` through an explicit resolver. This does **not** promote generalized MCP resources into a supported TRUYN OBJECT/STATE import/publication surface.

## What remains open for adoption

1. define and accept a compatibility/stability policy before claiming stable A2A/MCP support;
2. add exact-version durable interoperability evidence whenever the claimed supported external profile expands;
3. keep generalized optional A2A/MCP surfaces outside the supported profile until separately implemented and evidenced.

## Version policy

A2A, MCP and TRUYN have independent release cadence. Unsupported versions fail explicitly. Adapter version changes should not require a new TRUYN protocol generation unless TRUYN network semantics change.

Durable authorities: C7 — `A2A_MCP_C7_BIDIRECTIONAL_BRIDGE.md`; Sprint C — `A2A_MCP_INDEPENDENT_A2A_BLACK_BOX.md`; Sprint D — `A2A_MCP_INDEPENDENT_MCP_BLACK_BOX.md`; C8 — `A2A_MCP_C8_SECURITY_EVIDENCE.md`; Sprint E — `A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`.
