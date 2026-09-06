# P3-M2 MCP Prompt Semantics

**Status:** bounded pre-v1 runtime profile  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**TRUYN protocol:** `TRUYN/1` — draft  
**MCP protocol:** exactly `2026-07-28` for outbound/import Prompts  
**Independent SDK evidence:** exactly `@modelcontextprotocol/server@2.0.0`  
**Object profile:** `mcp-prompt-object/v1`

P3-M2 adds MCP Prompts as an explicit, bounded import surface without turning prompt content into execution authority and without declaring stable MCP/TRUYN v1.

## 1. Scope

P3-M2 implements:

- `server/discover` capability verification for Prompts;
- bounded `prompts/list` pagination and cache hints;
- explicit `prompts/get` retrieval;
- immutable content-addressed TRUYN `OBJECT` snapshots for complete prompt results;
- text, image, audio, `resource_link`, and embedded-resource prompt content normalization;
- `subscriptions/listen` with `promptsListChanged` opt-in;
- list-change notification as invalidation only;
- explicit caller-controlled continuation of `input_required` multi-round-trip results;
- negative/security coverage and an independent exact-version official SDK black-box.

P3-M2 does **not** implement:

- TRUYN -> arbitrary MCP Prompt publication through the facade/server;
- MCP Apps/extensions;
- prompt argument completion via `completion/complete`;
- automatic sampling or elicitation;
- automatic prompt execution;
- legacy MCP outbound/import Prompt support;
- a stable MCP/TRUYN v1 claim.

## 2. User-controlled prompt boundary

MCP Prompts are user-controlled reusable templates. P3-M2 preserves that boundary.

A prompt descriptor returned by `prompts/list` is discovery metadata only. It is not:

- an authorization grant;
- a TRUYN OFFER/NEED/RESULT;
- a provider execution instruction;
- a billing or entitlement decision;
- a reason to invoke another MCP tool;
- permission to dereference a URL or file URI.

`prompts/get` is issued only after the caller explicitly names the prompt and supplies its arguments.

## 3. Immutable prompt OBJECT

A complete `prompts/get` response is normalized into deterministic JSON and materialized as an immutable content-addressed TRUYN `OBJECT` using SHA-256.

The object records:

- profile `mcp-prompt-object/v1`;
- exact normalized prompt name;
- canonical argument map;
- optional description;
- ordered prompt messages;
- supported content blocks;
- exact content digest and byte size;
- selected MCP provider authority as provenance;
- argument digest;
- `executionAuthority: false`;
- `implicitResourceFetch: false`.

Provider authority is provenance, not executable authority. Identical prompt bytes from different providers may have the same content-addressed OBJECT ID while retaining different source authority metadata.

P3-M2 does not create a TRUYN `STATE` object for prompt content. The local importer may track observational revision numbers for an explicitly requested prompt+arguments pair, but those revisions are not protocol-level trusted STATE.

## 4. Content blocks

Accepted prompt messages are bounded and require role `user` or `assistant`.

Supported content types are the MCP `2026-07-28` Prompt content set:

- `text`;
- `image`;
- `audio`;
- `resource_link`;
- embedded `resource`.

Text is bounded by encoded bytes. Image/audio data must use valid bounded base64 with an explicit bounded MIME type. Embedded resources require an absolute MCP resource URI and exactly one of text or blob content.

Unknown content block types fail closed rather than being interpreted heuristically.

## 5. No implicit resource resolution

A `resource_link` or embedded-resource URI inside a prompt is data inside the returned template. It does not authorize network, file, or MCP resource resolution.

P3-M2 never performs an implicit fetch of a prompt-linked URI. If an application later wants the content of a linked MCP Resource, it must use the separately accepted P3-M1 explicit resource path and all of that path's bounds/authority rules.

This preserves the existing SSRF/integrity boundary:

```text
prompt resource link
  != fetch authority
  != tool authority
  != provider authority
```

## 6. `prompts/list` cache and pagination rules

For MCP `2026-07-28`, `prompts/list` is cache-aware.

P3-M2 requires:

- `resultType=complete`;
- non-negative integer `ttlMs`;
- `cacheScope` of `private` or `public`;
- bounded prompt descriptors;
- bounded unique argument descriptors per prompt;
- unique prompt names across pagination;
- non-repeating cursors;
- explicit page/prompt count limits.

A duplicate prompt name, duplicate argument name, malformed cursor, repeated cursor, oversized response, or malformed descriptor fails closed.

## 7. Prompt list subscriptions

For MCP `2026-07-28`, P3-M2 uses `subscriptions/listen` with:

```json
{
  "notifications": {
    "promptsListChanged": true
  }
}
```

The client accepts `notifications/prompts/list_changed` only after:

1. receiving `notifications/subscriptions/acknowledged`;
2. verifying the subscription ID equals the local listen request ID;
3. verifying the server honored `promptsListChanged: true`;
4. enforcing bounded event size/count.

A list-change notification marks the catalog as invalidated only. It cannot replace an accepted prompt OBJECT or create a new snapshot. The caller must explicitly re-run `prompts/list` and/or `prompts/get`.

Disconnect/re-listen establishes a fresh correlation ID. It must not duplicate accepted prompt revisions.

## 8. Multi-round-trip (`input_required`) rules

MCP `2026-07-28` permits `prompts/get` to return `resultType=input_required`.

P3-M2 treats this as a control return to the caller, not permission to call another model/service automatically.

Rules:

- bounded `inputRequests` / `requestState` are returned to the caller;
- no prompt OBJECT is materialized from `input_required`;
- no automatic sampling or elicitation request is issued;
- no automatic retry occurs;
- continuation requires explicit caller-provided `inputResponses`;
- continuation reissues the same explicit prompt name/arguments with bounded MRTR state;
- only a later `resultType=complete` can materialize an immutable prompt OBJECT.

## 9. Negative/security matrix

P3-M2 executable tests cover at least:

| Condition | Required result |
|---|---|
| duplicate prompt name across pages | FAIL |
| duplicate prompt argument descriptors | FAIL |
| repeated cursor | FAIL |
| malformed/oversized prompt response | FAIL |
| unsupported prompt role | FAIL |
| unknown content type | FAIL |
| malformed/oversized base64 content | FAIL |
| prompt-linked URI | preserved as data; implicit fetch = 0 |
| prompt text containing instructions | data only; execution authority = false |
| list-change before subscription acknowledgement | FAIL |
| forged subscription ID | FAIL |
| server does not honor `promptsListChanged` | FAIL |
| oversized subscription event | FAIL |
| failed explicit refresh | previous accepted OBJECT retained |
| `input_required` without caller response | no retry / no materialization |
| legacy MCP import version | FAIL |
| prompt facade publication required | FAIL |
| Apps/completion semantics required | FAIL |

## 10. Independent official SDK black-box

The independent fixture is:

- `tests/fixtures/official-mcp-sdk-prompt-server.mjs`;
- package `@modelcontextprotocol/server` exactly `2.0.0`;
- wire profile exactly MCP `2026-07-28`;
- no import of TRUYN MCP client/runtime implementation.

It uses official SDK `McpServer.registerPrompt(...)`, `createMcpHandler(...)`, and `handler.notify.promptsChanged()`.

The black-box proves:

```text
official server
  -> prompts/list
  -> explicit prompts/get
  -> immutable prompt OBJECT
  -> promptsListChanged notification
  -> accepted OBJECT unchanged
  -> explicit refresh
  -> changed immutable OBJECT
  -> disconnect/re-listen
  -> second explicit refresh
```

The fixture includes a remote-looking `resource_link` and an embedded resource. P3-M2 preserves them inside prompt data without dereferencing the linked URI.

## 11. Compatibility boundary

The compatibility generation remains `a2a-mcp-pre-v1/g1` because P3-M2 is additive and does not redefine previously accepted A2A, MCP tool, artifact, or P3-M1 Resource semantics.

Modern MCP import gains these declared semantics:

- `prompts-list`;
- `prompts-get`;
- `prompt-object-v1`;
- `prompt-list-subscriptions-listen-v1`;
- `prompt-explicit-refresh-v1`;
- `prompt-explicit-mrtr-v1`;
- `prompt-untrusted-data-boundary-v1`.

The MCP facade/server compatibility surface remains unchanged. `arbitrary-mcp-prompts`, prompt facade publication, prompt completion, Apps/extensions, and legacy outbound/import Prompt versions remain unsupported required semantics.

## 12. Executable evidence

P3-M2 evidence is enforced by:

- `tests/mcp-prompts.test.js`;
- `tests/mcp-prompts-security.test.js`;
- `tests/mcp-prompts-official.test.js`;
- `tests/mcp-prompts-compatibility.test.js`;
- `tests/fixtures/official-mcp-sdk-prompt-server.mjs`;
- existing P3-M1 Resource tests;
- existing A2A/MCP g1 tests;
- full repository `npm test`;
- exact-head DCO + hosted CodeQL;
- post-merge exact-main CI + hosted CodeQL.

A passing local Prompt test is not sufficient acceptance if the official black-box, g1/P3-M1 regression, DCO, full CI, CodeQL, or post-merge exact-main evidence fails.

## 13. Stability statement

P3-M2 proves a bounded production runtime profile for MCP Prompts; it does not declare MCP/TRUYN stable v1.

The correct claim remains:

> TRUYN supports an exact-version, fail-closed MCP `2026-07-28` Prompt import profile in which prompt templates are explicit user-controlled data, materialized as immutable content-addressed objects with no implicit execution or URI-fetch authority.
