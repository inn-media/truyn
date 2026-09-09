# P3-M3 MCP Apps Extension Semantics

**Status:** bounded pre-v1 contract; runtime implementation pending  
**Compatibility generation:** `a2a-mcp-pre-v1/g1` (additive profile)  
**TRUYN protocol:** `TRUYN/1` — draft  
**MCP protocol:** exactly `2026-07-28` for outbound/import Apps semantics  
**Baseline:** `main@5daaac4a06b9573523f50caef7fc5c04175247b8`

P3-M3 defines the minimum MCP Apps/extensions surface TRUYN may add without changing previously accepted A2A, MCP Tools, referenced-artifact, P3-M1 Resource, or P3-M2 Prompt semantics.

This document is the implementation contract. It does **not** itself declare Apps support complete and does **not** declare stable MCP, A2A, or TRUYN v1.

## 1. Minimum accepted surface

P3-M3 is limited to the following modern MCP import semantics:

1. **Extension capability recognition** for MCP Apps on the exact MCP `2026-07-28` import profile.
2. **Tool UI metadata parsing** for bounded `_meta.ui` data, including:
   - `resourceUri`;
   - `visibility` values `model` and/or `app`.
3. **Tool-to-UI-resource linkage** where a tool explicitly references one MCP UI Resource.
4. **Explicit UI Resource resolution** through the already accepted P3-M1 MCP Resource path.
5. **Same-provider authority binding**: a tool may resolve its UI Resource only from the same selected MCP provider authority.
6. **Initial MCP App HTML resource type** `text/html;profile=mcp-app`.
7. **Fail-closed validation and bounds** for Apps metadata, resource URI, MIME type, resource bytes, and linkage.
8. **Visibility isolation** so an `app`-only tool is not exposed as model-callable merely because it exists in the provider catalog.
9. **Untrusted-UI boundary**: Apps metadata and UI bytes are data/presentation metadata, never authorization, provider, billing, provenance, or execution authority.
10. **Independent exact-version upstream black-box evidence**, negative/security coverage, g1/P3-M1/P3-M2 regression, and exact-head acceptance evidence before P3-M3 can be called implemented.

The minimal relationship is:

```text
MCP tool
  -- _meta.ui.resourceUri -->
explicit MCP resources/read
  -- same provider -->
text/html;profile=mcp-app UI resource
```

No other network or file resolution is implied by that relationship.

## 2. Tool UI metadata boundary

P3-M3 recognizes only bounded `_meta.ui` fields required for the minimum profile.

`_meta.ui.resourceUri` is a routing/linkage value. It is not:

- fetch authority for arbitrary HTTP/file URLs;
- an authorization grant;
- provider-selection authority;
- billing or entitlement authority;
- evidence that a call originated from an App;
- permission to execute another tool.

`_meta.ui.visibility` is a caller-class/discovery constraint only. It is not an identity or provenance signal for a particular `tools/call`.

TRUYN must therefore never trust custom UI metadata, client-supplied markers, or `visibility` as proof that a specific call was initiated by an App rather than a model/agent.

## 3. Visibility rules

For the bounded P3-M3 profile:

- absent `visibility` is treated as the upstream default of model + app visibility;
- `visibility: ["model"]` is model-visible;
- `visibility: ["app"]` is app-only and must not be surfaced through the model-callable/provider capability path;
- `visibility: ["model", "app"]` is dual-visible;
- an empty, duplicate, malformed, or unknown visibility value fails closed.

Visibility filtering cannot weaken the existing TRUYN authorization, provider ownership, billing, correlation, or exactly-once execution rules.

## 4. UI Resource rules

A UI-enabled tool must reference an explicit absolute MCP UI Resource URI. The minimum P3-M3 profile accepts the MCP Apps `ui://` resource form and resolves it only through explicit MCP Resource operations against the same provider.

Required rules:

- no implicit HTTP, file, DNS, or arbitrary URL fetch;
- no cross-provider UI Resource resolution;
- resource lookup uses the accepted P3-M1 bounded Resource machinery;
- the returned resource must match the requested UI URI;
- the resource must have the accepted MCP App HTML media type `text/html;profile=mcp-app`;
- UI bytes are bounded before acceptance;
- malformed, missing, oversized, mismatched, or ambiguous UI resources fail closed.

A UI Resource is presentation data. Accepting it must not create a TRUYN OFFER, NEED, RESULT, grant, entitlement, provider credential, or execution instruction.

## 5. Same-provider isolation

The selected MCP provider authority for a tool is authoritative for that tool's UI linkage.

P3-M3 must reject any attempt to resolve or substitute the referenced UI Resource from another provider, even if the URI text is identical.

```text
provider A tool -> provider A UI resource   ACCEPTABLE
provider A tool -> provider B UI resource   FAIL
```

This prevents UI metadata from becoming a cross-provider confused-deputy path.

## 6. Untrusted App content

HTML, scripts, styles, CSP declarations, domain hints, display hints, and any future UI metadata carried by an MCP App are untrusted content.

For the minimum P3-M3 importer:

- TRUYN may validate and preserve bounded metadata required by the accepted profile;
- TRUYN must not interpret UI content as protocol authority;
- UI content must not modify TRUYN authorization, provider selection, billing, ownership, settlement, or trust state;
- UI content must not trigger implicit resource/tool/network operations.

If a downstream Host renders the accepted App resource, sandbox/CSP/browser enforcement remains a Host responsibility unless a later TRUYN profile explicitly adds such a Host runtime.

## 7. Required fail-closed cases

Executable P3-M3 tests must cover at least:

| Condition | Required result |
|---|---|
| Apps required on unsupported MCP version | FAIL |
| Apps required on legacy MCP facade/import direction | FAIL |
| unknown required extension semantic | FAIL |
| unknown optional extension semantic | ignored without authority change |
| malformed `_meta.ui` | FAIL |
| malformed/unknown/empty `visibility` | FAIL |
| `app`-only tool exposed to model path | FAIL |
| malformed/non-`ui://` App resource URI | FAIL |
| missing referenced UI Resource | FAIL |
| UI Resource URI mismatch | FAIL |
| cross-provider UI Resource substitution | FAIL |
| wrong App resource MIME type | FAIL |
| oversized UI metadata/resource | FAIL |
| UI URI interpreted as arbitrary network/file fetch | FAIL; implicit fetch = 0 |
| UI metadata used as authorization/provider/billing authority | FAIL |
| custom caller marker treated as App-origin proof | FAIL |
| failed UI refresh/re-resolution | previously accepted trusted runtime state unchanged |

## 8. Explicitly out of scope

P3-M3 does **not** implement or promise:

- a browser renderer or iframe Host runtime;
- sandbox creation/enforcement inside TRUYN;
- the full MCP App bridge or `ui/*` Host<->App lifecycle;
- App-initiated per-call provenance beyond what MCP normatively supplies;
- display-mode, theme, styling, model-context, clipboard, download, navigation, or other optional Host UI APIs;
- automatic execution of App-visible tools;
- arbitrary external URL/file loading from App HTML or metadata;
- cross-provider App composition;
- arbitrary TRUYN -> MCP App publication through the facade/server;
- legacy MCP outbound/import Apps support;
- future undeclared MCP protocol versions;
- stable MCP/A2A/TRUYN v1 promotion.

Any of those requires a separate additive contract and executable evidence.

## 9. Compatibility boundary

P3-M3 must remain additive to `a2a-mcp-pre-v1/g1`.

Until implementation and acceptance are complete:

- `mcp-apps-extensions` remains an excluded optional surface in the machine-readable compatibility manifest;
- existing MCP Tools, referenced-artifact, P3-M1 Resource, and P3-M2 Prompt semantics remain unchanged;
- existing legacy MCP facade versions remain legacy facade-only and do not gain Apps import support;
- unknown required semantics continue to fail closed;
- unknown optional semantics may be ignored only without changing authority or security behavior.

After exact-head P3-M3 acceptance, the manifest may add only the specific Apps semantics proven by executable evidence. Promotion to a stable MCP profile is a separate decision and must not be bundled into this implementation contract.

## 10. Acceptance contract

P3-M3 is implemented only when one exact head SHA proves all of the following:

- positive Apps metadata/resource interoperability;
- visibility isolation;
- negative/security matrix;
- same-provider resource authority;
- no implicit URI fetching;
- independent upstream MCP Apps black-box with an exact pinned version/commit;
- full existing g1 + P3-M1 + P3-M2 regression;
- full repository CI;
- DCO;
- hosted CodeQL;
- branch freshness/compatibility against the intended merge base;
- post-merge exact-main CI + hosted CodeQL.

A documentation-only contract commit is not implementation evidence.
