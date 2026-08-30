# Sprint D — Independent MCP Black-Box Acceptance Record

**Executable proof:** ACCEPTED / independent official MCP SDK black-box CI-proven  
**Sprint D repository closure:** D-4 exact-head closure accepted; pending PR `#389` merge and post-merge exact-`main` verification  
**Direction:** `A2A → TRUYN → MCP`  
**Sprint D pull request:** `#389`  
**TRUYN baseline:** `main@05120db7435ab00807484aa9b7c3ecf80211f8b0`  
**Final exact closure source:** `8e72ae54d029572539d3aa857c0e48385084e5db`  
**Final exact CI:** `33308824923`  
**Final CodeQL check:** `99250115376`  
**Independent implementation:** `@modelcontextprotocol/server@2.0.0`  
**MCP profile exercised:** `2026-07-28`  
**A2A profile exercised:** `1.0` JSON-RPC  
**Acceptance test:** `tests/interoperability-independent-mcp.test.js`  
**Relay-visibility regression:** `tests/a2a-relay-authorized-visibility.test.js`  
**Independent server fixture:** `tests/fixtures/official-mcp-sdk-server.mjs`

This is the durable executable acceptance record for Sprint D. It upgrades the `A2A → TRUYN → MCP` adoption evidence from the in-repository C7 fixture to an independent official MCP SDK black-box process. It complements Sprint C's independent A2A proof in the opposite direction. It does not replace C8 and does not claim ecosystem-wide or stable interoperability while `TRUYN/1` remains draft.

## Independence boundary

The remote MCP server runs as a separate Node process and is not built with TRUYN's MCP server or discovery implementations. It imports exact-pinned official `@modelcontextprotocol/server@2.0.0`, registers `bridge_lookup` with public `McpServer.registerTool()`, dispatches HTTP requests only through public `createMcpHandler(...).fetch(request)`, and deterministically tears down through public `handler.close()` plus HTTP-server close.

The proof fails if the fixture reaches into SDK-private `_registeredTools` or imports TRUYN's MCP server/discovery implementation. Test teardown now also fails if the child process acknowledges `SIGTERM` with a nonzero exit or a signal, so dirty fixture shutdown cannot silently pass the acceptance lifecycle.

## Accepted route

```text
A2A 1.0 client
  → TRUYN A2A facade
  → signed TRUYN NEED
  → authoritative matched imported-MCP TRUYN provider
  → MCP 2026-07-28 server/discover
  → MCP 2026-07-28 tools/list
  → MCP 2026-07-28 tools/call bridge_lookup
  → independent official MCP SDK tool executor
  → TRUYN RESULT
  → completed A2A Task / Artifact
```

The independent MCP tool is discovered over HTTP and imported as `mcp.bridge_lookup`.

## Positive acceptance predicates

Final exact closure source `8e72ae54d029572539d3aa857c0e48385084e5db` proves:

- external SDK identity `@modelcontextprotocol/server@2.0.0`;
- MCP negotiation exactly `2026-07-28` and A2A exactly `1.0`;
- public `handler.fetch(request)` dispatch and public `handler.close()` lifecycle;
- fixture teardown fails on dirty/nonzero external process shutdown;
- no `_registeredTools` access;
- discovery selects `bridge_lookup` → `mcp.bridge_lookup`;
- exactly one backing TRUYN NEED;
- artifact provenance `requestId` resolves by exact `relay.state.requests.get(requestId)`, with no fallback correlation;
- authoritative requester is the real signed A2A-facade TRUYN node identity;
- authoritative provider is the matched imported-MCP TRUYN node identity;
- spoofed A2A owner/billing metadata does not become TRUYN authority;
- the independent external executor runs exactly once;
- the external process sees exactly `server/discover`, `tools/list`, `tools/call` on the positive route;
- the `tools/call` names `bridge_lookup` and carries MCP `2026-07-28` headers.

The external `executionCount` lives in the independent child process, outside TRUYN adapter implementation, so exactly-once is observed at the remote SDK boundary.

## Authority negative proof

An authenticated A2A transport principal requests an authenticated skill backed by an owner-only imported MCP OFFER and falsely claims the allowlisted owner's node id in A2A metadata.

Operational discovery remains bound to `node.find()`, whose relay `matchingOffers({ requesterNodeId })` uses the authenticated TRUYN node session and normalized provider policy. Descriptive A2A metadata never supplies that requester identity. An explicitly requested unavailable skill therefore fails closed with the deliberately opaque `Invalid parameters` response.

Security predicates:

```text
TRUYN NEED count        = 0
external MCP execution = 0
MCP tools/call          = 0
```

The companion regression `tests/a2a-relay-authorized-visibility.test.js` prevents two opposite regressions:

1. over-restricting legitimate relay-level `trustedRequesterNodeIds` grants for authenticated skills;
2. advertising a non-dispatchable own-offer fallback as an operational authenticated skill when the relay would reject `/v1/needs` with `provider_access_denied`.

Public Agent Cards still hide owner-only providers. Thus relay authority is preserved while spoofed transport metadata remains non-authoritative and own-offer discovery fallback cannot become execution evidence.

## Billing negative proof

A public imported MCP provider publishes server-side billing mode `prepaid`. The A2A message falsely claims `owner-funded` billing and requester responsibility.

The real signed TRUYN NEED is matched to the provider, but the provider's production billing policy rejects execution with `PROVIDER_BILLING_DENIED` before adapter execution. Provider-published `prepaid` remains authoritative.

```text
TRUYN NEED count        = 1
requester               = actual A2A-facade TRUYN node
provider                = actual imported-MCP TRUYN node
provider billing mode   = prepaid
external MCP execution = 0
MCP tools/call          = 0
```

A2A metadata therefore cannot assign billing responsibility or downgrade provider billing policy.

## D-4 exact-head closure evidence

```text
source/head: 8e72ae54d029572539d3aa857c0e48385084e5db
PR:          #389
CI run:      33308824923
CodeQL:      check-run 99250115376
```

CI `33308824923`:

```text
DCO                         PASS
npm install                 PASS
Compile Go SDK              PASS
Compile Java SDK            PASS
Compile .NET SDK            PASS
npm test                    PASS
git diff --check            PASS
```

GitHub Advanced Security CodeQL on the same exact source concluded `success` with **No new alerts in code changed by this pull request**.

All PR review threads are resolved. The final two D-3 blockers were closed only after code changes landed and CI passed:

- `adapters/a2a/server.js` excludes non-dispatchable own-offer fallback from authenticated operational visibility;
- `tests/interoperability-independent-mcp.test.js` fails teardown on dirty/nonzero external MCP fixture shutdown.

## Cloudflare Workers GitHub App scope

The repository ruleset `Protect main` requires only GitHub Actions contexts `DCO` and `test` for merge. The external `Workers Builds: truyn` check is produced by the installed Cloudflare GitHub App and is not a Sprint D acceptance, security or merge gate.

The Cloudflare check currently fails before producing repository-visible logs because this repository is not a Worker deployment package: it has no `wrangler.toml` or Cloudflare Worker entrypoint. Adding a placeholder Worker only to make the external app green would risk changing/deploying the `truyn` Worker service without proving Sprint D protocol behavior. Therefore Sprint D closure removes Cloudflare from the release gate and leaves Cloudflare remediation to Cloudflare-side configuration: disconnect the `truyn` Worker Git integration, limit the integration to the actual Worker source repository/path, or add a real Worker deployment config in a separate deployment PR.

## Relationship to C7 and Sprint C

C7 remains the bounded in-repository two-direction composition proof. Sprint C adds independent official A2A SDK evidence for `MCP → TRUYN → A2A`. Sprint D adds symmetric independent official MCP SDK evidence for `A2A → TRUYN → MCP`.

Together these are bounded two-direction external-SDK adoption evidence. They are not certification of every A2A/MCP implementation, transport, extension, resource type or future protocol version.

## What Sprint D does not claim

Sprint D does **not** claim:

- completion or replacement of C8 adversarial cross-protocol security acceptance;
- ecosystem-wide MCP certification;
- arbitrary MCP resources/prompts interoperability;
- independent referenced-file/artifact interoperability;
- compatibility guarantees for future A2A/MCP versions;
- `TRUYN/1` Stable status;
- Sprint E/artifact adoption completion.
