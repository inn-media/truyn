# TRUYN A2A / MCP Bounded Pre-v1 Compatibility Promise

**Status:** bounded pre-v1 compatibility promise; **not** a stable-v1 guarantee.  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**TRUYN protocol:** `TRUYN/1` — draft  
**A2A tested/supported profile:** `1.0` over JSON-RPC  
**MCP tested modern profile:** `2026-07-28`  
**MCP legacy inbound facade profiles:** `2025-11-25`, `2025-06-18`  
**Canonical machine-readable declaration:** `adapters/compatibility/a2a-mcp.js`

This document defines the interoperability-specific compatibility promise for the current pre-v1 TRUYN A2A/MCP adapters. It complements `SDK_COMPATIBILITY.md`; it does not replace SDK/package SemVer, Agent Descriptor versioning, or TRUYN protocol versioning.

The word **stable** is intentionally not used as a current product claim. `TRUYN/1` remains draft. Generation `a2a-mcp-pre-v1/g1` means that the tested profiles and migration rules below are declared and executable, while future incompatible profiles may still require a new compatibility generation before TRUYN protocol stable-v1.

## 1. Independent version dimensions

These dimensions remain independent:

```text
SDK package version
SDK API contract version
TRUYN protocol generation
Agent Descriptor version
A2A/MCP compatibility generation
external A2A/MCP protocol version
```

A package version alone never proves A2A/MCP compatibility. Interoperability is allowed only when the declared protocol/version/surface overlap exists and required semantics are understood.

## 2. Declared A2A profile

Generation `g1` promises the bounded A2A `1.0` JSON-RPC profile used by accepted C3-C7 and Sprint C/E evidence:

- Agent Card discovery/validation;
- JSON-RPC `SendMessage` execution;
- bounded `GetTask` polling lifecycle;
- bounded Artifact mapping;
- explicit referenced-artifact resolution with integrity verification;
- request/message/task correlation preservation;
- authoritative TRUYN provider provenance;
- fail-closed authorization/provider-owner/billing boundaries;
- exactly-once remote execution for the accepted bridge profile.

The core g1 promise does not silently expand to arbitrary future A2A versions or every optional extension. Extended lifecycle profiles require their own exact-version evidence.

## 3. Declared MCP profile

### Import/provider direction

The modern outbound/import profile is exactly MCP `2026-07-28`. It promises:

- discovery;
- `tools/list`;
- `tools/call`;
- explicitly selected TRUYN import/provider mapping;
- bounded Sprint E `resource_link` + explicit `resources/read` referenced-artifact resolution;
- P3-M1 bounded `resources/list` and `resources/templates/list` discovery;
- P3-M1 explicit general `resources/read` -> immutable TRUYN `OBJECT` materialization;
- P3-M1 stable provider-authority + resource-URI -> monotonic TRUYN `STATE` semantics;
- P3-M1 `subscriptions/listen` resource update correlation;
- P3-M1 update notification as invalidation only, followed by explicit reread before authoritative STATE advancement;
- P3-M2 bounded `prompts/list` discovery;
- P3-M2 explicit `prompts/get` -> immutable content-addressed prompt `OBJECT` materialization;
- P3-M2 `subscriptions/listen` `promptsListChanged` correlation and invalidation-only semantics;
- P3-M2 explicit-only multi-round-trip continuation for `input_required` without automatic sampling/elicitation;
- P3-M2 prompt content as untrusted data with no execution or URI-fetch authority.

The exact P3-M1 runtime/evidence contract is `MCP_GENERAL_RESOURCE_SEMANTICS.md`. The exact P3-M2 runtime/evidence contract is `MCP_PROMPT_SEMANTICS.md`.

Legacy MCP versions are **not** silently promoted into the outbound/import promise merely because the TRUYN MCP facade can accept them.

### TRUYN MCP facade/server direction

The existing facade continues to accept:

- `2026-07-28` — modern profile;
- `2025-11-25` — legacy initialize/tool profile;
- `2025-06-18` — legacy initialize/tool profile.

P3-M1 does not promise arbitrary TRUYN -> MCP Resource publication from the facade. P3-M2 also does not promise TRUYN -> MCP Prompt publication from the facade. The runtime declaration remains authoritative: `MCP_SUPPORTED_VERSIONS` and the compatibility manifest must stay aligned in CI.

### Still outside the promise

The compatibility promise still excludes:

- arbitrary MCP Resource publication from TRUYN;
- arbitrary or facade-published MCP Prompts outside the bounded P3-M2 import profile;
- automatic prompt execution, sampling, elicitation, or privilege interpretation;
- prompt argument completion via `completion/complete`;
- MCP Apps/extensions;
- undeclared future MCP versions in the outbound/import profile;
- implicit URI fetching or heuristic resource/prompt-link resolution;
- a claim that every third-party MCP implementation is certified.

Apps/extensions remain tracked separately as P3-M3.

## 4. P3-M1 general Resource -> OBJECT/STATE rules

`resources/list` and `resources/templates/list` are discovery only. A descriptor/template is not a trusted content object.

Only an explicit, bounded `resources/read` response can materialize content. Accepted bytes produce immutable content-addressed TRUYN `OBJECT` snapshots. Mutable knowledge uses stable `STATE` whose identity includes both the selected MCP provider authority and canonical MCP resource URI.

Rules inside `mcp-resource-object-state/v1`:

- first accepted snapshot -> STATE version 1;
- identical digest -> idempotent, version unchanged;
- changed digest -> new immutable OBJECT and STATE version +1;
- older resource `lastModified` -> deterministic rejection;
- different bytes at the same `lastModified` -> deterministic conflicting-update rejection;
- multiple contents -> immutable leaf OBJECTs plus deterministic manifest OBJECT;
- failed reread -> previous authoritative STATE remains intact;
- same URI from a different provider authority -> different STATE identity;
- identical immutable bytes may still deduplicate as the same OBJECT.

A resource URI is an MCP routing/identity value, not URL-fetch authority. P3-M1 never performs an implicit HTTP/file/network fetch from `resource.uri`.

## 5. P3-M1 subscription semantics

For MCP `2026-07-28`, P3-M1 uses `subscriptions/listen` with `notifications.resourceSubscriptions`.

The client fails closed unless:

1. `notifications/subscriptions/acknowledged` arrives before resource updates;
2. the subscription ID equals the local listen request ID;
3. the honored URI set is a subset of the requested URI set;
4. every `notifications/resources/updated` URI belongs to that honored set;
5. event size/count stay within configured bounds.

An update notification only invalidates the local snapshot. It cannot create a trusted OBJECT or advance STATE. The client must explicitly call `resources/read`, validate the returned correlation/content/bounds, and only then materialize the new OBJECT/STATE.

Disconnect/re-listen establishes a fresh bounded subscription correlation. It does not replay or duplicate trusted STATE transitions.

## 6. P3-M2 Prompt -> immutable OBJECT rules

`prompts/list` is discovery only. Prompt descriptors and argument descriptors are cacheable metadata, not executable authority.

Only explicit `prompts/get` can produce an accepted prompt snapshot. A complete result is normalized and content-addressed as an immutable `OBJECT` using profile `mcp-prompt-object/v1`.

Rules:

- prompt name and arguments are explicit caller input;
- argument maps are canonicalized before hashing;
- identical normalized prompt bytes -> same OBJECT ID and idempotent local revision;
- changed normalized prompt bytes -> new immutable OBJECT;
- prompt `user` / `assistant` roles are preserved;
- text/image/audio/resource-link/embedded-resource content is bounded and validated;
- unknown content types fail closed;
- prompt content never becomes authorization, provider ownership, billing authority, or automatic execution authority;
- `resource_link` / embedded-resource URIs stay opaque data and are never implicitly fetched;
- failed explicit refresh leaves the prior accepted OBJECT intact.

Provider authority is provenance only. It is recorded in the snapshot source but cannot turn identical prompt bytes into execution authority.

P3-M2 deliberately does not create TRUYN protocol-level `STATE` for prompt templates. Local revision counters are observational importer state, not trusted network STATE.

## 7. P3-M2 subscriptions and MRTR

P3-M2 listens for prompt catalog invalidation using `subscriptions/listen` with `promptsListChanged: true`.

The client fails closed unless the acknowledgement arrives first, the subscription ID matches exactly, and the server explicitly honors `promptsListChanged`. A later `notifications/prompts/list_changed` only marks the catalog stale. It cannot replace any previously accepted prompt OBJECT.

Disconnect/re-listen uses a fresh correlation ID and does not duplicate accepted prompt revisions.

If `prompts/get` returns `resultType=input_required`:

- no OBJECT is materialized;
- no automatic sampling or elicitation occurs;
- no automatic retry occurs;
- bounded `inputRequests` / `requestState` are returned to the caller;
- continuation requires explicit caller-provided `inputResponses`;
- only a later complete result can materialize a prompt OBJECT.

## 8. Version negotiation and immutable security rules

Compatibility negotiation remains fail closed:

| Input | Required behavior |
|---|---|
| supported version + supported required semantics | execute |
| unsupported required version | deterministic compatibility error |
| unknown optional semantic | may ignore without changing authority |
| unknown required semantic | deterministic fail closed |
| missing required version | deterministic compatibility error |
| MCP modern header/body mismatch | fail closed |
| legacy MCP used on undeclared import direction | fail closed |

Unknown optional metadata may never be interpreted as authorization, provider ownership, billing, provenance, resource-update authority, prompt execution authority, or execution grant.

Within generation g1, TRUYN must not silently weaken:

- correlation semantics;
- artifact integrity semantics;
- authorization boundary;
- provider ownership authority;
- billing authority;
- exactly-once remote execution guarantees.

P3-M1 and P3-M2 are additive because each introduces explicitly negotiated import semantics without redefining successful g1 tool/artifact behavior or those immutable security invariants.

## 9. Executable evidence

Compatibility is not Markdown-only. The machine-readable declaration is enforced by `tests/a2a-mcp-compatibility-promise.test.js` plus milestone-specific tests.

P3-M1 executable evidence:

- `tests/mcp-general-resources.test.js`;
- `tests/mcp-general-resources-security.test.js`;
- `tests/mcp-general-resources-official.test.js`;
- `tests/mcp-general-resources-compatibility.test.js`;
- independent fixture `tests/fixtures/official-mcp-sdk-resource-server.mjs`;
- exact external SDK `@modelcontextprotocol/server@2.0.0`;
- exact MCP protocol `2026-07-28`.

P3-M2 executable evidence:

- `tests/mcp-prompts.test.js`;
- `tests/mcp-prompts-security.test.js`;
- `tests/mcp-prompts-official.test.js`;
- `tests/mcp-prompts-compatibility.test.js`;
- independent fixture `tests/fixtures/official-mcp-sdk-prompt-server.mjs`;
- exact external SDK `@modelcontextprotocol/server@2.0.0`;
- exact MCP protocol `2026-07-28`;
- full repository `npm test` g1 + P3-M1 regression.

Required P3-M2 rows include:

| Gate | Expected |
|---|---|
| `prompts/list` descriptor discovery | PASS, no executable authority created |
| explicit `prompts/get` complete result | immutable content-addressed OBJECT |
| identical prompt refresh | same OBJECT / idempotent local revision |
| changed prompt refresh | new immutable OBJECT |
| malformed role/content | deterministic FAIL |
| duplicate names/arguments/cursors | deterministic FAIL |
| prompt-linked URI | preserved as data; implicit fetch = 0 |
| prompt instruction text | data only; execution authority = false |
| list change before acknowledgement | deterministic FAIL |
| forged subscription ID / unhonored filter | deterministic FAIL |
| notification without explicit refresh | accepted OBJECT unchanged |
| disconnect/re-listen | fresh correlation, no duplicate accepted revision |
| `input_required` initial result | return to caller; materialization = 0 |
| MRTR without explicit caller responses | no retry / deterministic FAIL on continuation API |
| legacy MCP outbound/import Prompt profile | deterministic FAIL |
| prompt facade publication/completion/Apps required | deterministic FAIL |

A green milestone unit test cannot substitute for a failing official-SDK black-box or repository-wide regression.

## 10. Referenced artifact compatibility remains unchanged

The accepted Sprint E referenced-artifact profile still preserves media type, filename, exact byte size, SHA-256 digest, authoritative TRUYN provenance and explicit resolution semantics. Referenced content is materialized only through an explicit resolver; absent resolver/digest mismatch/size mismatch fail closed.

The durable authority for that separate path remains `A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`. P3-M1 Resources and P3-M2 Prompts do not weaken it.

## 11. Breaking-change and migration rule

An incompatible A2A/MCP profile change must not be hidden inside the same immutable release/profile declaration. A breaking change requires a new declared compatibility generation or explicit supported-version/range change, migration notes, executable positive/negative evidence, exact external SDK/reference versions, and re-validation of authority, provenance, integrity and correlation.

Lossless dual-profile support is allowed when both profiles remain independently testable and security-equivalent. Silent heuristic translation of unknown required semantics is forbidden.

## 12. Evidence required for compatibility changes

Acceptance records must identify, where applicable:

- exact source SHA;
- compatibility generation;
- TRUYN protocol status/generation;
- external A2A/MCP versions;
- exact external SDK versions used for black-box evidence;
- CI run ID;
- CodeQL run ID;
- limitations and explicitly unsupported surfaces.

P3-M1 durable semantic evidence is `MCP_GENERAL_RESOURCE_SEMANTICS.md`. P3-M2 durable semantic evidence is `MCP_PROMPT_SEMANTICS.md`. Final authority remains exact merged-main CI/CodeQL evidence.

## 13. Graduation to stable compatibility

Generation `g1` is a **bounded pre-v1 compatibility promise**, not stable-v1.

The wording may be promoted to a stable A2A/MCP compatibility guarantee only after the repository separately declares the relevant TRUYN protocol generation stable and the stable ecosystem gates require the same version ranges, conformance matrix, migration/deprecation rules, immutable release provenance and accepted external interoperability evidence.

Until then, the correct claim remains:

> TRUYN declares and CI-enforces bounded pre-v1 A2A/MCP compatibility profiles with explicit fail-closed negotiation and migration rules.
