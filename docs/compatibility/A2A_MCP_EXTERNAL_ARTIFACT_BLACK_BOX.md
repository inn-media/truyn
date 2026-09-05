# A2A / MCP External Referenced Artifact Black-Box — Sprint E

**Status:** ACCEPTED bounded executable evidence  
**Original executable proof date:** 2026-09-03  
**Shutdown-race repair verification:** 2026-09-05  
**PR:** `#427`  
**Original base:** `main@476cc1333b2db7d85599c7e7f32c7b954b79611f`  
**Fresh-base parent used for closure rebuild:** `main@d9e49747531318890399dcf53f27eddcfd6f68b7`  
**Exact executable proof source:** `14984e4a1409dafe0e3a056128292d83895cc6f4`  
**Exact repaired head:** `11892fb3f6a9dc8426958780fe244f26e624ff54`  
**Original ordinary CI:** `33783686829` — PASS  
**Original hosted CodeQL:** `33783681960` — PASS  
**Repair ordinary CI:** `33956255543` — PASS  
**Repair hosted CodeQL:** `33870132494` — PASS  
**A2A SDK:** `@a2a-js/sdk@1.0.1`  
**A2A protocol:** `1.0`  
**MCP SDK:** `@modelcontextprotocol/server@2.0.0`  
**MCP protocol:** `2026-07-28`

This record closes the bounded external referenced file/artifact adoption proof that remained open after C6, C7, Sprint C/D and the later accepted C8 security matrix. It proves both claimed bridge directions with official external SDK implementations running in separate processes and one deterministic referenced binary artifact. It does not change TRUYN wire semantics.

## Deterministic proof artifact

The same logical artifact is used in both directions:

```text
filename:    interop-proof.bin
media type:  application/octet-stream
size:        29 bytes
sha256:      257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
content:     "TRUYN Sprint E interop proof\n"
```

The SHA-256 above is the durable proof-artifact digest. Sprint E does not depend on a separately uploaded binary Actions artifact: the repository test, exact workflow evidence and deterministic content digest are the acceptance evidence.

## Direction 1 — MCP → TRUYN → independent A2A referenced file

```text
TRUYN MCP client
  → TRUYN MCP facade / truyn_need
  → authorized TRUYN NEED
  → imported A2A provider
  → independent @a2a-js/sdk@1.0.1 process
  → A2A Artifact URL part
  → explicit TRUYN resolver
  → exact byte materialization
  → C6 SHA-256 + byte-size verification
  → verified TRUYN RESULT
  → MCP truyn_poll
```

The independent process is implemented by `tests/fixtures/official-a2a-sdk-artifact-server.mjs`. It imports official A2A SDK server primitives and does not import TRUYN's A2A server implementation.

The external process emits a URL reference rather than embedding the binary bytes. The resolver is explicitly supplied to the A2A discovery/import provider and accepts only the fixture artifact URL within the C6 byte budget.

### Accepted positive predicates

- official external A2A SDK runs in a separate process;
- artifact crosses the external boundary as a URL reference;
- filename remains `interop-proof.bin`;
- MIME remains `application/octet-stream`;
- materialized size is exactly `29` bytes;
- SHA-256 is exactly `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`;
- C6 integrity metadata is marked verified only after materialization;
- source URL remains descriptive metadata;
- imported provider's signed TRUYN identity remains authoritative;
- independent A2A executor executes exactly once;
- referenced file is fetched exactly once by the explicit resolver;
- no retry/fallback creates a duplicate remote execution.

### Accepted negatives

- no `resolveArtifactUrl` → fail closed;
- missing resolver → referenced-file fetch count remains exactly `0`;
- corrupt digest → fail closed after one explicit materialization;
- corrupt size → fail closed after one explicit materialization;
- each corrupt request executes the independent A2A agent exactly once; there is no second `SendMessage` fallback.

## Direction 2 — A2A → TRUYN → independent MCP referenced resource

```text
A2A client
  → TRUYN A2A facade
  → authorized TRUYN NEED
  → imported MCP provider
  → independent @modelcontextprotocol/server@2.0.0 process
  → tools/call
  → standard MCP resource_link
  → explicit Sprint E resolver
  → MCP resources/read
  → exact byte materialization
  → C6 SHA-256 + byte-size verification
  → TRUYN artifact bundle / RESULT
  → completed A2A Artifact
```

The independent process is implemented by `tests/fixtures/official-mcp-sdk-artifact-server.mjs`. It uses official `McpServer` and `createMcpHandler` APIs and does not import TRUYN MCP server/client implementations.

The tool result contains a standard MCP `resource_link` with deterministic metadata. The URI deliberately uses the `.invalid` top-level domain. Materialization occurs only through an explicitly installed resolver that calls the same independent MCP process with `resources/read` using protocol `2026-07-28`.

### Accepted positive predicates

- official external MCP SDK runs in a separate process;
- tool result crosses the external boundary as `resource_link`, not inline bytes;
- materialization path is `server/discover → tools/list → tools/call → resources/read`;
- exactly one `tools/call` and one `resources/read` occur for the positive transaction;
- filename remains `interop-proof.bin`;
- MIME remains `application/octet-stream`;
- materialized size is exactly `29` bytes;
- SHA-256 is exactly `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`;
- verified bytes pass the existing C6 integrity verifier before successful TRUYN result creation;
- final A2A Artifact carries authoritative TRUYN provenance;
- independent MCP tool executes exactly once;
- no bridge retry duplicates `tools/call`.

### Accepted negatives

- explicit MCP artifact resolver disabled → A2A Task fails closed with zero artifacts;
- resolver disabled → `resources/read` count remains exactly `0`;
- corrupt digest → fail closed after exactly one `tools/call` and one `resources/read`;
- corrupt size → fail closed after exactly one `tools/call` and one `resources/read`;
- `.invalid` resource URI is never used as an implicit HTTP fetch target.

## Shutdown lifecycle hardening

The acceptance contract requires the external fixture processes to terminate cleanly after `SIGTERM` with exactly:

```text
{ code: 0, signal: null }
```

The exact SDK dependency declarations remain pinned:

```text
@a2a-js/sdk                    1.0.1
@modelcontextprotocol/server   2.0.0
```

The original hardened contract exposed an intermittent shutdown race. The repair on exact head `11892fb3f6a9dc8426958780fe244f26e624ff54` preserves all acceptance semantics and removes only the race windows:

1. A2A and MCP fixtures install `SIGTERM` / `SIGINT` handlers **before** publishing `ready`;
2. the lifecycle contract creates the child `exit` promise **before** sending `SIGTERM`;
3. timeout `SIGKILL` remains cleanup-only and still fails the test;
4. strict `code === 0` and `signal === null` assertions remain unchanged.

Ordinary CI run `33956255543` on exact repaired head `11892fb3f6a9dc8426958780fe244f26e624ff54` passed DCO, Go/Java/.NET compile, five-language executable SDK conformance, SDK release package build/verification, full `npm test` and `git diff --check`. Hosted CodeQL run `33870132494` passed on the same exact repaired head.

## Executable cases

The Sprint E cases are in `tests/interoperability-external-artifact.test.js` and the fixture-lifecycle/pin regression is in `tests/interoperability-external-artifact-fixture-contract.test.js`.

The bounded interoperability cases cover:

1. MCP → TRUYN → independent A2A referenced-file positive;
2. independent A2A referenced file with no resolver;
3. independent A2A corrupt digest and corrupt size;
4. A2A → TRUYN → independent MCP `resource_link` positive;
5. independent MCP `resource_link` with no resolver;
6. independent MCP corrupt digest and corrupt size.

## Boundary and limitations

This proof establishes:

- one deterministic binary file profile;
- two independent official SDK processes;
- both claimed A2A↔TRUYN↔MCP bridge directions;
- explicit referenced-artifact materialization;
- C6 digest/size enforcement across the external boundary;
- exactly-once external execution for valid transactions and no duplicate side effects in negative cases;
- clean external-fixture shutdown under the exact pinned SDK versions.

It does **not** claim:

- ecosystem-wide certification across every A2A or MCP implementation;
- support for arbitrary optional A2A/MCP features or transports;
- generalized `MCP resources → TRUYN OBJECT/STATE` publication/import semantics;
- arbitrary remote URL fetching;
- stable-v1 A2A/MCP compatibility while `TRUYN/1` remains draft.

C8 adversarial-security acceptance is separate and already accepted in PR `#423`; Sprint E neither replaces nor weakens that evidence.

## Adoption result

With Sprint E accepted, the previously open **external referenced file/artifact interoperability** gate is closed for this bounded bidirectional profile.

Remaining A2A/MCP adoption/stability work is separate:

1. define and accept the A2A/MCP compatibility/stability declaration before any stable-v1 support claim;
2. add new exact-version/profile evidence when the claimed supported external profile expands;
3. keep generalized optional surfaces outside the supported profile until separately implemented and evidenced.
