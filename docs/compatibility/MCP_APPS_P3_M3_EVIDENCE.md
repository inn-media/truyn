# MCP Apps P3-M3 evidence

**Status:** bounded pre-v1 P3-M3 implementation evidence  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable MCP v1:** **not declared by this evidence**  
**Task anchor:** `#526`  
**Implementation PR:** `#527`

This document records the repository-tracked evidence for the P3-M3 MCP Apps import extension. It does not promote TRUYN/1, A2A, the aggregate A2A/MCP generation, or MCP itself to stable-v1. Stable MCP promotion remains a separate post-P3-M3 phase and PR.

## Exact upstream identity

The accepted independent Apps source identity is:

- package/source: `@modelcontextprotocol/ext-apps`
- source version: `2.0.0`
- upstream commit: `4cd427394755ee0964172df5760852aa053a5c99`
- pin record: `docs/compatibility/MCP_APPS_UPSTREAM_PIN.json`
- independent fixture: `tests/fixtures/mcp-apps-upstream-server.mjs`

The modern MCP transport profile used by the Apps import path is exactly `2026-07-28`. The transport version and the Apps source version are distinct compatibility identities.

## Implemented bounded surface

The machine-readable authority is `adapters/compatibility/a2a-mcp.js`. P3-M3 adds only a bounded MCP Apps **import** extension surface:

- extension id: `io.modelcontextprotocol/ui`
- absolute App resource URI scheme: `ui://`
- `_meta.ui.resourceUri` maximum: `2048` UTF-8 bytes
- `_meta.ui` maximum: `4096` serialized UTF-8 bytes
- visibility values: `model`, `app`
- App resource MIME: exactly `text/html;profile=mcp-app`
- App resource maximum: `512 KiB` cumulative decoded/UTF-8 bytes
- App resource contents maximum: `32`
- UI resource resolution: explicit, same-provider only
- arbitrary HTTP/file/DNS/URL fetching: not permitted
- UI classification: untrusted presentation data
- UI authority for authorization/provider selection/billing/entitlement/execution: none
- Host/App browser lifecycle, sandbox and CSP enforcement: outside this P3-M3 promise

The compatibility manifest update was introduced by commit `efb3c5992b616a2f73b537e6332877c8ba057ff4` on `p3/m3-mcp-apps`.

## Executable evidence

P3-M3 repository coverage includes:

- `tests/mcp-apps-capability.test.js` — extension declaration/capability behavior
- `tests/mcp-apps-metadata.test.js` — metadata parsing and bounds
- `tests/mcp-apps-visibility.test.js` — model/app visibility isolation
- `tests/mcp-apps-ui-resolution.test.js` — explicit UI resource resolution
- `tests/mcp-apps-ui-mime.test.js` — exact App MIME enforcement
- `tests/mcp-apps-resource-bounds.test.js` — payload/content bounds
- `tests/mcp-apps-untrusted-ui.test.js` — no UI authority expansion
- `tests/mcp-apps-cross-provider-isolation.test.js` — provider ownership isolation
- `tests/mcp-apps-tool-result-linkage.test.js` — tool-result/resource linkage
- `tests/mcp-apps-optional-fallback.test.js` — unknown optional extension fallback
- `tests/mcp-apps-required-fail-closed.test.js` — unknown required extension fail-closed
- `tests/mcp-apps-negative-matrix-a.test.js` — negative/security matrix A
- `tests/mcp-apps-negative-matrix-b.test.js` — app-only leakage, forged visibility, required-extension and capability mismatch rejection with zero remote execution
- `tests/mcp-apps-negative-matrix-c.test.js` — remaining missing/mismatched/spoofed/re-resolution negative cases
- `tests/mcp-apps-independent-black-box.test.js` — independent process-level Apps black-box path
- `tests/mcp-apps-no-apps-fallback.test.js` — ordinary MCP behavior without Apps capability inflation
- `tests/mcp-apps-version-matrix.test.js` — supported/unsupported transport, direction and extension rows

The independent positive black-box path exercises discovery -> `tools/list` -> `tools/call` -> `resources/read` against the pinned independent fixture and verifies same-provider binding plus exact App MIME/resource linkage.

## Regression checkpoint already executed

Before the compatibility-manifest/evidence commits, the branch exact head
`1d33793c8e3a41b69f9c172876052db88632883a` completed the required Sprint 23/24 regression checkpoint:

- full repository CI run `34274379979`: `SUCCESS`
- hosted CodeQL run `34274377755`: `SUCCESS`

That evidence is valid only for `1d33793c8e3a41b69f9c172876052db88632883a` and proves the g1/P3-M1/P3-M2 regression checkpoint. It is **not** reused as final qualification for later heads.

## Security/status boundaries

P3-M3 preserves the existing immutable interoperability security invariants:

- correlation semantics
- referenced-artifact integrity semantics
- authorization boundary
- provider ownership authority
- billing authority
- exactly-once remote execution

Rejected Apps paths must not cause implicit fetch, cross-provider substitution, app-only capability leakage, remote execution, or UI-driven authority expansion.

The current declaration remains:

- TRUYN/1: `draft`
- aggregate A2A/MCP generation: `a2a-mcp-pre-v1/g1`, `bounded-pre-v1`
- MCP Apps P3-M3: bounded pre-v1 import extension
- stable MCP v1: not declared in this implementation PR

## Qualification discipline

This evidence document intentionally makes no CI/CodeQL success claim for commits newer than the recorded regression checkpoint until those checks actually complete. Final P3-M3 qualification requires one fresh exact PR head with:

- branch freshness `behind=0`
- full repository CI success
- DCO success
- hosted CodeQL success
- required unresolved review threads = `0`
- all qualifying evidence bound to the same exact SHA

Any repair or freshness commit changes the qualifying SHA and requires exact-head requalification. P3-M3 must be merged and receive post-merge exact-main CI/CodeQL proof before a separate promotion-only MCP stable-v1 PR may begin.
