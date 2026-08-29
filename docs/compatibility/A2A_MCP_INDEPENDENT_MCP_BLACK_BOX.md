# Sprint D — Independent MCP Black-Box Acceptance Record

**Executable proof:** ACCEPTED / independent official MCP SDK black-box CI-proven  
**Sprint D repository closure:** pending PR `#389` merge and post-merge exact-`main` verification  
**Direction:** `A2A → TRUYN → MCP`  
**Sprint D pull request:** `#389`  
**TRUYN baseline:** `main@afe77b8415bb58039da6a85b45566e1348b164c5`  
**Exact executable proof source:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**Exact executable CI:** `33262306180`  
**Exact executable CodeQL:** `33262304786`  
**Independent implementation:** `@modelcontextprotocol/server@2.0.0`  
**MCP profile exercised:** `2026-07-28`  
**A2A profile exercised:** `1.0` JSON-RPC  
**Acceptance test:** `tests/interoperability-independent-mcp.test.js`  
**Relay-visibility regression:** `tests/a2a-relay-authorized-visibility.test.js`  
**Independent server fixture:** `tests/fixtures/official-mcp-sdk-server.mjs`

This is the durable executable acceptance record for Sprint D. It upgrades the `A2A → TRUYN → MCP` adoption evidence from the in-repository C7 fixture to an independent official MCP SDK black-box process. It complements Sprint C's independent A2A proof in the opposite direction. It does not replace C8 and does not claim ecosystem-wide or stable interoperability while `TRUYN/1` remains draft.

## Independence boundary

The remote MCP server runs as a separate Node process and is not built with TRUYN's MCP server or discovery implementations. It imports exact-pinned official `@modelcontextprotocol/server@2.0.0`, registers `bridge_lookup` with public `McpServer.registerTool()`, dispatches HTTP requests only through public `createMcpHandler(...).fetch(request)`, and deterministically tears down through public `handler.close()` plus HTTP-server close.

The proof fails if the fixture reaches into SDK-private `_registeredTools` or imports TRUYN's MCP server/discovery implementation.

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

Exact executable source `0a40e635533f6a9623b19057b3320ba2a888f1f1` proves:

- external SDK identity `@modelcontextprotocol/server@2.0.0`;
- MCP negotiation exactly `2026-07-28` and A2A exactly `1.0`;
- public `handler.fetch(request)` dispatch and public `handler.close()` lifecycle;
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

The companion regression `tests/a2a-relay-authorized-visibility.test.js` prevents an overcorrection: when the relay itself authorizes the actual facade node through `trustedRequesterNodeIds`, an authenticated extended Agent Card preserves that relay-authorized owner-only OFFER even if raw `allowedRequesterIds` does not list the facade. The public Agent Card still hides the owner-only provider. Thus relay authority is preserved while spoofed transport metadata remains non-authoritative.

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

## Deterministic external lifecycle

The independent process binds loopback on an ephemeral port, emits one structured ready record, serves MCP only through the public handler, counts executions independently, and on `SIGTERM`/`SIGINT` stops HTTP work, closes idle connections, awaits `handler.close()`, awaits HTTP close, then exits. Test teardown treats either exit code or terminating signal as a completed child lifecycle and escalates only after a bounded graceful deadline.

External HTTP 500 responses are deliberately opaque (`mcp_fixture_error`); fixture exception details are not reflected to the remote caller.

## Exact executable CI evidence

```text
source/head: 0a40e635533f6a9623b19057b3320ba2a888f1f1
PR:          #389
CI run:      33262306180
CodeQL run:  33262304786
```

CI `33262306180`:

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

The repository's Cloudflare Workers GitHub App build is not an interoperability acceptance gate. It is also red on the already accepted Sprint C executable proof source `a435ed16e559226ed095959b7b95aa7067271302`; Sprint C's bounded acceptance uses DCO/core CI/CodeQL. Sprint D applies the same scope and does not reinterpret that unrelated deployment integration as protocol evidence.

Documentation commits after `0a40e635533f6a9623b19057b3320ba2a888f1f1` do not replace it as the exact executable proof. PR `#389` must still pass normal exact-head DCO/core-CI/CodeQL after this final record is synchronized, then merge, then pass post-merge exact-`main` verification before Sprint D itself is called closed.

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
