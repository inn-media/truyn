# Sprint C — Independent A2A Black-Box Acceptance Record

**Acceptance:** ACCEPTED / independent SDK black-box CI-proven  
**Direction:** `MCP → TRUYN → A2A`  
**Sprint C pull request:** `#380`  
**TRUYN baseline:** `main@83738302131e08d807bc0ac00f64268a38b46309`  
**Exact executable proof source:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Independent implementation:** `@a2a-js/sdk@1.0.1`  
**Upstream repository:** `a2aproject/a2a-js`  
**Upstream tag:** `v1.0.1`  
**Upstream tag commit:** `f5ca7d05945a69cbf3dcd357203d4ce99201494f`  
**A2A profile exercised:** `1.0` JSON-RPC  
**MCP profile exercised:** `2026-07-28`  
**Acceptance test:** `tests/interoperability-independent-a2a.test.js`  
**Independent server fixture:** `tests/fixtures/official-a2a-sdk-server.mjs`

This is the durable acceptance record for Sprint C. It upgrades the `MCP → TRUYN → A2A` adoption evidence from an in-repository integration proof to an independent A2A SDK black-box proof. It does not replace C7; it adds independent ecosystem-side evidence on the remote A2A boundary.

## Independence boundary

The remote A2A server is not built with TRUYN's `createA2aServer` or any TRUYN A2A server implementation.

The fixture runs as a separate Node process and imports the official A2A Project SDK server primitives:

```text
@a2a-js/sdk
@a2a-js/sdk/server
@a2a-js/sdk/server/express
express
```

The fixture uses the SDK's own `DefaultRequestHandler`, `InMemoryTaskStore`, `AgentEvent`, Agent Card handler and JSON-RPC handler. TRUYN interacts with that process only through the advertised Agent Card and HTTP JSON-RPC interface.

The acceptance test additionally reads the fixture source and fails if the black-box server imports `createA2aServer` or `adapters/a2a/server`.

## Accepted route

```text
MCP 2026-07-28 client
  → TRUYN MCP facade
  → truyn_need
  → signed TRUYN NEED
  → selected local imported-A2A TRUYN provider
  → A2A 1.0 Agent Card discovery
  → independent @a2a-js/sdk JSON-RPC SendMessage
  → independent SDK Task / Artifact
  → TRUYN RESULT
  → MCP truyn_poll result
```

The remote skill `reason` is discovered from the independent Agent Card and imported as local TRUYN capability `a2a.reason`.

## Acceptance predicates

Sprint C proves all of the following on the exact executable proof source:

- the external server identifies itself as `@a2a-js/sdk@1.0.1`;
- A2A negotiation is exactly protocol `1.0`;
- MCP negotiation is exactly `2026-07-28`;
- Agent Card discovery occurs over the external process boundary;
- the selected remote skill maps to `a2a.reason`;
- MCP `truyn_need` selects the local imported-A2A TRUYN provider identity;
- the RESULT is cryptographically verified and authored by that authoritative TRUYN provider identity;
- remote A2A Task id and context id survive as correlation metadata;
- the independent SDK executor runs exactly once;
- exactly one A2A JSON-RPC execution request reaches the external server;
- blocking mode produces `taskPollCount === 0`, so no second `GetTask` execution path is introduced;
- the final independent SDK output returns through TRUYN as `RESULT` and is visible through MCP polling.

The independent-process counters are intentionally outside the TRUYN adapter implementation, so the exactly-once claim is observed at the remote SDK execution boundary rather than inferred only from TRUYN state.

## Exact core CI evidence

The executable black-box proof was first green on:

```text
source/head: a435ed16e559226ed095959b7b95aa7067271302
PR:          #380
CI run:      33057289236
CodeQL run:  33057286765
```

CI `33057289236`:

```text
DCO                         PASS
npm install                 PASS
Compile Go SDK              PASS
Compile Java SDK            PASS
Compile .NET SDK            PASS
npm test                    PASS
git diff --check            PASS
```

CodeQL `33057286765` completed with conclusion `success` across the repository language matrix. The GitHub Advanced Security PR check on the same exact head also concluded `success` with no new alerts in the changed code.

Later documentation commits in PR `#380` do not replace this exact executable proof source; the PR itself must still pass the normal exact-head gates before merge, and post-merge `main` must pass ordinary CI and CodeQL.

## Relationship to C7

C7 remains the durable proof that both protocol directions compose inside the repository:

```text
A2A → TRUYN → MCP    Implemented / bounded CI-proven — C7
MCP → TRUYN → A2A    Implemented / bounded CI-proven — C7
```

Sprint C adds this stronger bounded statement for the second direction:

```text
MCP → TRUYN → A2A    independent official A2A SDK black-box CI-proven
```

The original C7 in-repository A2A facade fixture remains useful as a deterministic integration test; it is not the evidence source for the independent SDK claim.

## What Sprint C does not claim

Sprint C does **not** claim:

- independent MCP implementation proof for `A2A → TRUYN → MCP`;
- ecosystem-wide certification across all A2A implementations/transports;
- REST or gRPC A2A transport interoperability;
- stable A2A/MCP compatibility while `TRUYN/1` remains draft;
- completion of C8 adversarial cross-protocol security acceptance;
- independent referenced-file/artifact interoperability across ecosystem implementations.

The remaining symmetric external protocol proof is an independent MCP reference/SDK server on the `A2A → TRUYN → MCP` direction.
