# Sprint D — Independent MCP Black-Box Acceptance Record

**Executable proof:** ACCEPTED / independent official MCP SDK black-box CI-proven  
**Sprint D repository closure:** pending PR `#389` merge and post-merge exact-`main` verification  
**Direction:** `A2A → TRUYN → MCP`  
**Sprint D pull request:** `#389`  
**TRUYN baseline:** `main@afe77b8415bb58039da6a85b45566e1348b164c5`  
**Exact executable proof source:** `3aa37c29b3410c08aae53df4e0037b2d1d3c564a`  
**Independent implementation:** `@modelcontextprotocol/server@2.0.0`  
**MCP profile exercised:** `2026-07-28`  
**A2A profile exercised:** `1.0` JSON-RPC  
**Acceptance test:** `tests/interoperability-independent-mcp.test.js`  
**Independent server fixture:** `tests/fixtures/official-mcp-sdk-server.mjs`

This is the durable executable acceptance record for Sprint D. It upgrades the `A2A → TRUYN → MCP` adoption evidence from the in-repository C7 protocol fixture to an independent official MCP SDK black-box process. It complements Sprint C's independent A2A proof in the opposite direction. It does not replace C8 and does not claim ecosystem-wide or stable interoperability while `TRUYN/1` remains draft.

## Independence boundary

The remote MCP server is not built with TRUYN's MCP server or discovery implementations.

The fixture runs as a separate Node process and imports the official MCP server SDK:

```text
@modelcontextprotocol/server@2.0.0
```

It registers `bridge_lookup` with the SDK's public `McpServer.registerTool()` API. Node HTTP requests are translated to Web `Request` objects and dispatched only through the public `createMcpHandler(...).fetch(request)` surface. Deterministic teardown calls the public `handler.close()` and closes the Node HTTP server before the external child exits.

The acceptance test reads the fixture source and fails if it reaches into `_registeredTools` or imports TRUYN's MCP server/discovery implementation.

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

The independent MCP tool `bridge_lookup` is discovered over HTTP and imported as local TRUYN capability `mcp.bridge_lookup`.

## Acceptance predicates

Sprint D proves all of the following on exact executable source `3aa37c29b3410c08aae53df4e0037b2d1d3c564a`:

- the external process identifies itself as `@modelcontextprotocol/server@2.0.0`;
- MCP negotiation is exactly `2026-07-28`;
- A2A negotiation is exactly `1.0`;
- the fixture uses public `handler.fetch(request)` dispatch and public `handler.close()` lifecycle cleanup;
- the fixture never reads the SDK-private `_registeredTools` registry;
- discovery selects `bridge_lookup` and maps it to `mcp.bridge_lookup`;
- the positive route creates exactly one backing TRUYN NEED;
- A2A artifact provenance `requestId` identifies that exact stored TRUYN request, with no fallback correlation lookup;
- the authoritative requester is the real signed TRUYN A2A-facade node identity, not A2A metadata;
- the authoritative provider is the matched imported-MCP TRUYN node identity, not remote metadata;
- the independent MCP executor runs exactly once;
- the external process observes exactly `server/discover`, `tools/list`, `tools/call` for the positive route;
- the `tools/call` request names `bridge_lookup` and uses MCP `2026-07-28` headers;
- arbitrary A2A `ownerId`, `billingMode`, and `billingResponsibility` metadata is not copied into authoritative TRUYN/MCP input metadata.

The external `executionCount` and request counters live in the independent child process, outside the TRUYN adapter implementation, so the exactly-once claim is observed at the remote SDK boundary.

## Authority and billing negative proof

Sprint D also proves the production trust boundary rather than simulating it by overwriting converted data after mapping.

### Owner / requester spoof

An authenticated A2A transport principal requests an authenticated skill backed by an owner-only imported MCP OFFER. The A2A message falsely claims the allowlisted owner's node id in `metadata.ownerId`.

The production A2A operational-visibility gate checks the actual facade `node.identity.nodeId` against the provider-published `allowedRequesterIds`. Because the real requester is not allowlisted, the explicitly requested skill fails closed with an intentionally opaque `Invalid parameters` response.

The security predicates remain:

```text
TRUYN NEED count        = 0
external MCP execution = 0
MCP tools/call         = 0
```

Transport authentication therefore never becomes TRUYN authorization, and spoofed descriptive A2A authority never becomes the signed TRUYN requester.

### Billing spoof

A public imported MCP provider publishes server-side billing mode `prepaid`. The A2A message falsely claims `owner-funded` billing and requester responsibility.

The real signed TRUYN NEED is matched to the provider, but the provider's production billing policy rejects execution with `PROVIDER_BILLING_DENIED` before adapter execution. The provider-published `prepaid` mode remains authoritative.

The security predicates are:

```text
TRUYN NEED count        = 1
requester               = actual A2A-facade TRUYN node
provider                = actual imported-MCP TRUYN node
provider billing mode   = prepaid
external MCP execution = 0
MCP tools/call         = 0
```

A2A metadata therefore cannot assign billing responsibility or downgrade provider billing policy.

## Deterministic external lifecycle

The independent process has an explicit lifecycle contract:

- bind loopback on an ephemeral port;
- emit a single structured ready record;
- serve MCP only through the public handler;
- count executions independently;
- on `SIGTERM`/`SIGINT`, stop accepting HTTP work, close idle connections, await `handler.close()`, await HTTP close, then exit;
- test teardown treats either an exit code or terminating signal as a completed child lifecycle and escalates to `SIGKILL` only after the bounded graceful deadline.

External HTTP 500 responses are deliberately opaque (`mcp_fixture_error`); fixture exception details are not reflected to the remote caller.

## Exact executable CI evidence

The executable proof first reached the required core green state on:

```text
source/head: 3aa37c29b3410c08aae53df4e0037b2d1d3c564a
PR:          #389
CI run:      33261868862
CodeQL run:  33261867022
```

CI `33261868862`:

```text
DCO                         PASS
npm install                 PASS
Compile Go SDK              PASS
Compile Java SDK            PASS
Compile .NET SDK            PASS
npm test                    PASS
git diff --check            PASS
```

The GitHub Advanced Security CodeQL PR check on the same exact head concluded `success` with **No new alerts in code changed by this pull request**. The language CodeQL matrix completes independently of the core CI workflow.

The repository's Cloudflare Workers GitHub App build is not an acceptance gate for this interoperability proof: it is also red on the already accepted Sprint C executable proof source `a435ed16e559226ed095959b7b95aa7067271302`, while Sprint C's required DCO/core-CI/CodeQL gates are green. Sprint D therefore uses the same bounded acceptance scope and does not reinterpret that unrelated deployment integration as protocol evidence.

Documentation commits do not replace `3aa37c29b3410c08aae53df4e0037b2d1d3c564a` as the exact executable proof. PR `#389` must still pass the normal exact-head DCO/core-CI/CodeQL gates after this record is added, then merge, then pass post-merge exact-`main` verification before Sprint D itself is called closed.

## Relationship to C7 and Sprint C

C7 remains the bounded in-repository proof that both protocol directions compose:

```text
A2A → TRUYN → MCP    Implemented / bounded CI-proven — C7
MCP → TRUYN → A2A    Implemented / bounded CI-proven — C7
```

Sprint C adds independent official A2A SDK evidence for:

```text
MCP → TRUYN → A2A    independent official A2A SDK black-box CI-proven
```

Sprint D adds the symmetric independent official MCP SDK evidence for:

```text
A2A → TRUYN → MCP    independent official MCP SDK black-box CI-proven
```

Together these are bounded two-direction external-SDK adoption evidence. They are not a claim that every A2A or MCP implementation, transport, extension, resource type or future version is certified.

## What Sprint D does not claim

Sprint D does **not** claim:

- completion or replacement of the C8 adversarial cross-protocol security matrix;
- ecosystem-wide certification across arbitrary MCP implementations/transports;
- arbitrary MCP resources/prompts interoperability;
- independent referenced-file/artifact interoperability across ecosystem implementations;
- a compatibility guarantee for future A2A/MCP versions;
- `TRUYN/1` Stable status;
- Sprint E/artifact adoption completion.

Those remain separate gates and must not be inferred from this bounded black-box proof.
