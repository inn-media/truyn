# MCP Interoperability Baseline — 2026-09-08

**Purpose:** immutable pre-P3-M3 reference point for MCP interoperability expansion and later promotion work.  
**Frozen source:** `main@5daaac4a06b9573523f50caef7fc5c04175247b8`  
**Frozen tree:** `df88b4f4300ff5c064c6e94edb69396e466180b1`  
**Machine-readable manifest:** `adapters/compatibility/a2a-mcp.js`  
**Manifest blob:** `2bd2e574776024d98ef1ec8c03ab1953c4b24f37`  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Compatibility status:** `bounded-pre-v1`  
**TRUYN protocol:** `TRUYN/1` — `draft`

This baseline records the exact state immediately before P3-M3 MCP Apps/extensions work. It does **not** declare stable MCP, A2A, or TRUYN v1.

## Frozen interoperability surface

At the frozen source SHA:

- MCP modern import/tested profile: `2026-07-28`;
- MCP facade profiles: `2026-07-28`, `2025-11-25`, `2025-06-18`;
- declared MCP surface includes discovery, `tools/list`, `tools/call`, referenced-artifact integrity, P3-M1 Resources, P3-M2 Prompts, resource/prompt subscription invalidation, explicit reread/refresh, and explicit-only Prompt MRTR continuation;
- immutable security invariants include correlation, artifact integrity, authorization, provider ownership, billing authority, and exactly-once remote execution;
- `mcp-apps-extensions` remains explicitly excluded and is therefore the P3-M3 delta from this baseline.

## MCP executable test inventory

Inventory rule: executable JavaScript tests under `tests/` that either contain `mcp` in their path or contain an MCP reference at this frozen source SHA. GitHub code search returns **24 executable `.test.js` files** under that rule. The first 16 are directly MCP-named; the remaining 8 are broader interoperability/security regression tests that exercise or assert MCP behavior.

### Direct MCP-named tests — 16

1. `tests/a2a-mcp-compatibility-promise.test.js`
2. `tests/a2a-mcp-p2-documentation-status.test.js`
3. `tests/byok-custom-mcp-cli.test.js`
4. `tests/byok-custom-mcp.test.js`
5. `tests/interoperability-independent-mcp.test.js`
6. `tests/mcp-current.test.js`
7. `tests/mcp-discovery-import.test.js`
8. `tests/mcp-general-resources-compatibility.test.js`
9. `tests/mcp-general-resources-official.test.js`
10. `tests/mcp-general-resources-security.test.js`
11. `tests/mcp-general-resources.test.js`
12. `tests/mcp-prompts-arguments.test.js`
13. `tests/mcp-prompts-compatibility.test.js`
14. `tests/mcp-prompts-official.test.js`
15. `tests/mcp-prompts-security.test.js`
16. `tests/mcp-prompts.test.js`

### Additional MCP-relevant executable regressions — 8

17. `tests/adapters.test.js`
18. `tests/c8-review-hardening.test.js`
19. `tests/interoperability-bidirectional.test.js`
20. `tests/interoperability-external-artifact-fixture-contract.test.js`
21. `tests/interoperability-external-artifact.test.js`
22. `tests/interoperability-independent-a2a.test.js`
23. `tests/interoperability-security-matrix.test.js`
24. `tests/observability.test.js`

## Official MCP black-box fixtures — 4

1. `tests/fixtures/official-mcp-sdk-artifact-server.mjs`
2. `tests/fixtures/official-mcp-sdk-prompt-server.mjs`
3. `tests/fixtures/official-mcp-sdk-resource-server.mjs`
4. `tests/fixtures/official-mcp-sdk-server.mjs`

`tests/README.md` also contains MCP references but is documentation, not an executable test. Together, the 24 executable tests, 4 fixtures, and that README account for the 29 `path:tests mcp` code-search matches at the frozen snapshot.

## Freeze rule

The source SHA, tree SHA, manifest blob SHA, declared status/profile, and inventory above are historical baseline evidence and must not be silently rewritten by P3-M3 or promotion work.

P3-M3 may add Apps/extensions semantics, tests, fixtures, and exact upstream-version evidence. A later promotion may change compatibility status only through an explicit promotion record and exact-head acceptance evidence. Neither step may retroactively redefine what `a2a-mcp-pre-v1/g1` meant at `main@5daaac4a06b9573523f50caef7fc5c04175247b8`.
