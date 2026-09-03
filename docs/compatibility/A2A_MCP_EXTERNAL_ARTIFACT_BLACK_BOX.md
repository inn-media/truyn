# A2A / MCP External Referenced Artifact Black-Box — Sprint E

**Status:** ACCEPTED bounded executable evidence  
**Acceptance date:** 2026-09-03  
**PR:** `#427`  
**Base:** `main@476cc1333b2db7d85599c7e7f32c7b954b79611f`  
**Exact executable proof source:** `14984e4a1409dafe0e3a056128292d83895cc6f4`  
**Ordinary CI:** `33783686829` — PASS  
**Hosted CodeQL:** `33783681960` — PASS across Actions, JavaScript/TypeScript, Python, Go, Java/Kotlin and C#  
**A2A SDK:** `@a2a-js/sdk@1.0.1`  
**A2A protocol:** `1.0`  
**MCP SDK:** `@modelcontextprotocol/server@2.0.0`  
**MCP protocol:** `2026-07-28`

This record closes the bounded external referenced file/artifact adoption proof that remained open after C6, C7 and the independent Sprint C/D protocol proofs. It proves both claimed bridge directions with official external SDK implementations running in separate processes and a deterministic referenced binary artifact. It does not change TRUYN wire semantics.

## Deterministic proof artifact

The same logical artifact is used in both directions:

```text
filename:    interop-proof.bin
media type:  application/octet-stream
size:        29 bytes
sha256:      257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
content:     "TRUYN Sprint E interop proof\n"
```

The SHA-256 above is the durable proof-artifact digest. Sprint E does not upload a separate GitHub Actions artifact archive; the executable repository test plus exact workflow IDs and this deterministic content digest are the acceptance evidence.

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

The independent process is implemented by `tests/fixtures/official-a2a-sdk-artifact-server.mjs`. It imports the official A2A SDK server primitives and does not import TRUYN's A2A server implementation.

The external A2A process emits a referenced URL part rather than embedding the binary bytes in the Artifact. The resolver is explicitly supplied to the A2A discovery/import provider. The resolver accepts only the fixture artifact URL and obeys the C6 byte budget.

### Accepted positive predicates

- official external A2A SDK runs in a separate process;
- the artifact crosses the external boundary as a URL reference;
- filename remains `interop-proof.bin`;
- MIME remains `application/octet-stream`;
- materialized size is exactly `29` bytes;
- SHA-256 is exactly `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`;
- C6 integrity metadata is marked verified only after byte materialization;
- the source URL remains descriptive metadata;
- the imported provider's signed TRUYN identity remains authoritative;
- the independent A2A executor executes exactly once;
- the referenced file is fetched exactly once by the explicit resolver;
- no retry/fallback creates a duplicate remote execution.

### Accepted negatives

- no `resolveArtifactUrl` → fail closed;
- no resolver → external A2A execution may have already produced the untrusted reference, but referenced-file fetch count remains exactly `0`;
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

The independent process is implemented by `tests/fixtures/official-mcp-sdk-artifact-server.mjs`. It uses the official `McpServer` and `createMcpHandler` APIs and does not import TRUYN MCP server/client implementations.

The tool result contains a standard MCP `resource_link` with the deterministic file metadata. The URI is deliberately under the `.invalid` top-level domain so there is no valid arbitrary HTTP origin to fetch. Sprint E materializes the reference only through an explicitly installed resolver that calls the same independent MCP process with `resources/read` using protocol `2026-07-28`.

### Accepted positive predicates

- official external MCP SDK runs in a separate process;
- the tool result crosses the external boundary as `resource_link`, not inline artifact bytes;
- the materialization path is exactly `server/discover → tools/list → tools/call → resources/read`;
- there is exactly one `tools/call` and one `resources/read` for the positive transaction;
- filename remains `interop-proof.bin`;
- MIME remains `application/octet-stream`;
- materialized size is exactly `29` bytes;
- SHA-256 is exactly `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`;
- verified bytes are normalized through the existing C6 integrity verifier before becoming a successful TRUYN result;
- the final A2A Artifact carries authoritative TRUYN provenance, including the imported provider node identity;
- the independent MCP tool executes exactly once;
- no duplicate `tools/call` is introduced by bridge fallback/retry.

### Accepted negatives

- explicit MCP artifact resolver disabled → A2A Task fails closed with zero artifacts;
- resolver disabled → `resources/read` count remains exactly `0`;
- corrupt digest → fail closed after exactly one `tools/call` and one `resources/read`;
- corrupt size → fail closed after exactly one `tools/call` and one `resources/read`;
- the `.invalid` resource URI is never used as an implicit HTTP fetch target.

## Exact executable gate

The exact source `14984e4a1409dafe0e3a056128292d83895cc6f4` was rebuilt directly on `main@476cc1333b2db7d85599c7e7f32c7b954b79611f` using the exact three Sprint E executable blobs previously proven on the candidate head.

On CI run `33783686829`:

- DCO — PASS;
- Go SDK compile — PASS;
- Java SDK compile — PASS;
- .NET SDK compile — PASS;
- five-language executable SDK conformance — PASS;
- SDK package build/verification — PASS;
- full `npm test` including all six Sprint E cases — PASS;
- `git diff --check` — PASS.

Hosted CodeQL run `33783681960` completed PASS for all six configured analyses: Actions, JavaScript/TypeScript, Python, Go, Java/Kotlin and C#.

The six Sprint E executable cases are in `tests/interoperability-external-artifact.test.js`:

1. MCP → TRUYN → independent A2A referenced-file positive;
2. independent A2A referenced file with no resolver;
3. independent A2A corrupt digest and corrupt size;
4. A2A → TRUYN → independent MCP `resource_link` positive;
5. independent MCP `resource_link` with no resolver;
6. independent MCP corrupt digest and corrupt size.

## Boundary and limitations

This proof is deliberately bounded.

It proves:

- one deterministic binary file profile;
- two independent official SDK processes;
- both claimed A2A↔TRUYN↔MCP bridge directions;
- explicit referenced-artifact materialization;
- C6 digest/size enforcement across the external boundary;
- exact-once external execution for the valid transactions and no duplicate side effects in the negative cases.

It does **not** claim:

- ecosystem-wide certification across every A2A or MCP implementation;
- support for arbitrary optional A2A/MCP features or transports;
- generalized `MCP resources → TRUYN OBJECT/STATE` publication/import semantics;
- arbitrary remote URL fetching;
- stable-v1 A2A/MCP compatibility while `TRUYN/1` remains draft;
- C8 adversarial-security acceptance.

The MCP `resource_link + resources/read` path in this proof is an explicit Sprint E interoperability resolver profile. It must not be read as a claim that the broader MCP resource model is now a general TRUYN runtime feature.

## Adoption result

With Sprint E accepted, the previously open **external referenced file/artifact interoperability** gate is closed for this bounded bidirectional profile.

Remaining A2A/MCP adoption/stability work is separate:

1. complete C8 adversarial-security acceptance on an exact head and exact merged main;
2. define and accept the A2A/MCP compatibility/stability declaration before any stable-v1 support claim;
3. add new external-version/profile evidence when the claimed supported profile expands.
