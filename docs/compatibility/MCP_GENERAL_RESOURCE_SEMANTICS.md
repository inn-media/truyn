# P3-M1 General MCP Resource Semantics

**Status:** bounded pre-v1 runtime profile; acceptance evidence is exact-head CI/CodeQL gated.  
**Issue:** `#481`  
**Implementation PR:** `#483`  
**Compatibility generation:** `a2a-mcp-pre-v1/g1` (additive profile)  
**TRUYN protocol:** `TRUYN/1` — draft  
**MCP protocol:** `2026-07-28`  
**Independent black-box SDK:** `@modelcontextprotocol/server@2.0.0`  
**Runtime profile:** `mcp-resource-object-state/v1`

P3-M1 closes the previous “defined only” gap for **general MCP Resource import into TRUYN OBJECT/STATE semantics**. It does not declare stable MCP/TRUYN v1 and does not broaden the legacy MCP outbound/import promise.

## 1. Bounded mapping

| MCP surface/event | TRUYN behavior |
|---|---|
| `resources/list` | bounded descriptor discovery only; descriptors are not trusted OBJECTs |
| `resources/templates/list` | bounded template discovery only; templates are not trusted OBJECTs |
| explicit `resources/read` | validates correlation and materializes immutable content-addressed `OBJECT` snapshot(s) |
| one content entry | that verified entry is the STATE root OBJECT |
| multiple content entries | immutable leaf OBJECTs + deterministic manifest OBJECT used as STATE root |
| first accepted snapshot | stable provider+URI `STATE` identity, version `1` |
| identical reread | same OBJECT digest and same STATE version; idempotent |
| changed reread | new immutable OBJECT root and monotonic STATE version increment |
| `subscriptions/listen` acknowledgement | establishes only the bounded notification scope/correlation |
| `notifications/resources/updated` | invalidation hint only; does not create OBJECT and does not mutate STATE |
| explicit reread after notification | only successful verified reread may advance STATE |

A resource URI is an opaque MCP identity/routing name. P3-M1 never treats the URI itself as permission to issue an HTTP/file/network fetch. Materialization happens only from the bounded `resources/read` response of the already-selected MCP endpoint.

## 2. OBJECT semantics

Every accepted content snapshot derives SHA-256 over the exact materialized bytes and records:

- `objectId = sha256:<hex>`;
- `digestAlgorithm = sha256`;
- exact digest;
- content type;
- exact byte size;
- bounded inline base64 representation;
- source protocol `mcp`;
- selected provider authority;
- canonical resource URI;
- observation/creation time.

Text contents are hashed as UTF-8 bytes. Blob contents require valid canonical base64 before decoding. A multi-content resource gets one immutable OBJECT per content entry plus a deterministic manifest OBJECT referencing the leaf digests and sizes.

## 3. STATE semantics

Mutable resource identity is scoped by both:

```text
selected MCP provider authority
+
canonical MCP resource URI
```

The same URI exposed by a different MCP provider is therefore a different STATE authority/identity, while identical immutable bytes may still deduplicate to the same content-addressed OBJECT.

STATE advancement rules:

- first accepted snapshot -> version 1;
- same digest -> no version increment;
- changed digest -> version +1;
- older `annotations.lastModified` -> fail closed;
- changed digest at the same `lastModified` value -> fail closed as a conflicting update;
- failed refresh leaves the previous STATE intact and invalidated.

## 4. Subscription/update semantics

The modern P3-M1 client uses MCP `2026-07-28` `subscriptions/listen` with `notifications.resourceSubscriptions`.

It requires:

1. `notifications/subscriptions/acknowledged` before any resource update;
2. `_meta[io.modelcontextprotocol/subscriptionId]` to equal the local listen request ID;
3. honored resource URIs to be a subset of the requested URIs;
4. every `notifications/resources/updated` URI to belong to the honored set;
5. bounded SSE event size and bounded event count.

Disconnect and re-listen create a new bounded subscription correlation. They do not replay or mutate trusted TRUYN STATE by themselves. A notification only marks the local snapshot stale; an explicit verified reread is still required.

## 5. Security / negative matrix

The executable P3-M1 matrix proves fail-closed behavior for:

- cross-resource `resources/read` content URI injection;
- malformed base64;
- total resource materialization size overflow;
- content-entry count overflow;
- duplicate resource URIs across pagination;
- repeated pagination cursors;
- update before subscription acknowledgement;
- forged subscription ID;
- acknowledgement expanding the requested URI authority set;
- update for an unhonored resource URI;
- oversized SSE event;
- declared oversized HTTP response before parsing;
- stale mutable update;
- conflicting update at the same `lastModified` value;
- failed refresh retaining the previous authoritative STATE;
- provider-authority separation for identical resource URIs;
- no network read caused by an update notification.

The existing g1 authorization, provider-ownership, billing, correlation, artifact-integrity, and exactly-once invariants remain unchanged.

## 6. Independent exact-version black-box

`tests/fixtures/official-mcp-sdk-resource-server.mjs` is an independent server built with exact package:

```text
@modelcontextprotocol/server@2.0.0
```

It does not import TRUYN MCP adapters. It exposes a mutable standard MCP Resource through the official SDK, serves the MCP `2026-07-28` endpoint, and issues resource update notifications through the official handler.

`tests/mcp-general-resources-official.test.js` proves:

```text
official resources/list
  -> TRUYN descriptor discovery
explicit official resources/read
  -> immutable TRUYN OBJECT
  -> TRUYN STATE v1
same explicit reread
  -> idempotent STATE v1
subscriptions/listen
  -> correlated update hint
  -> STATE still v1
explicit reread
  -> verified OBJECT
  -> STATE v2
disconnect / re-listen
  -> new correlated update hint
  -> STATE still v2
explicit reread
  -> STATE v3
```

The black-box also records request method/header observations and exact SDK/protocol version in its stats endpoint.

## 7. Executable evidence

Primary tests:

- `tests/mcp-general-resources.test.js`
- `tests/mcp-general-resources-security.test.js`
- `tests/mcp-general-resources-official.test.js`
- `tests/mcp-general-resources-compatibility.test.js`
- existing `tests/a2a-mcp-compatibility-promise.test.js`
- full repository `npm test` g1 regression

Final acceptance is not inferred from this document. The merge gate remains one exact PR head, rebuilt as a single signed-off commit from current `main`, with `ahead=1`, `behind=0`, DCO + full CI + hosted CodeQL green on that same SHA. Post-merge exact-main CI/CodeQL remains the final repository evidence.

## 8. Explicitly not included

P3-M1 does **not** claim:

- arbitrary MCP Resource publication from the TRUYN facade/server;
- MCP Prompts;
- MCP Apps/extensions;
- legacy MCP versions in the outbound/import resource profile;
- implicit URI resolution/fetching;
- stable MCP v1 or stable TRUYN/1.

Prompts remain P3-M2. Apps/extensions remain P3-M3. External-version expansion requires its own bounded compatibility evidence.
