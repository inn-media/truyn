# C7 Bidirectional A2A / MCP Bridge — Durable Acceptance Record

**Acceptance:** ACCEPTED / bounded CI-proven  
**Acceptance class:** in-repository bidirectional interoperability composition  
**C7 pull request:** `#357` — `test(interoperability): prove C7 bidirectional A2A MCP bridge`  
**Exact C7 base:** `0eb2bef87d1c44f56a143b28b226bc06ca1aca08`  
**Exact C7 source/head:** `b408ea9610e0a9547d04bb4cf609cd85516ca41a`  
**C7 merge commit:** `f04fcd1d4d72af85a6b97686c7c875388ef6038a`  
**Acceptance test:** `tests/interoperability-bidirectional.test.js`  
**A2A profile exercised:** `1.0`  
**MCP profile exercised:** `2026-07-28`  
**TRUYN protocol:** `TRUYN/1` draft

This record is the durable acceptance evidence for C7. Historical C1/C2/C3 documents describe the slices they closed, but their old future-work wording is not authoritative for the current bidirectional bridge state. C7 remains accepted unless later evidence explicitly supersedes or invalidates this bounded claim.

## Acceptance verdict

C7 proves both current cross-protocol directions as **Implemented / bounded CI-proven**:

1. `A2A → TRUYN → MCP`;
2. `MCP → TRUYN → A2A`.

The proof uses a real local TRUYN relay and executable adapters/facades. It verifies successful result propagation, correlation, authoritative TRUYN provider identity and exactly-once remote execution predicates on both routes.

## Route 1 — A2A → TRUYN → MCP

```text
A2A client
  → A2A 1.0 Agent Card discovery
  → A2A 1.0 SendMessage
  → TRUYN A2A facade
  → TRUYN NEED
  → C2 imported MCP provider
  → MCP 2026-07-28 tools/call
  → TRUYN RESULT
  → completed A2A Task / Artifact
```

The acceptance test imports remote MCP tool `bridge_lookup` as TRUYN capability `mcp.bridge_lookup`, exposes it through an A2A skill, sends an A2A message containing structured JSON, routes the resulting TRUYN NEED to the imported MCP provider, executes the remote MCP tool and maps the TRUYN RESULT back to a completed A2A Task/Artifact.

Accepted predicates include:

- A2A client protocol version equals the exercised A2A `1.0` profile;
- remote MCP requests carry the current MCP `2026-07-28` protocol version;
- output reaches the A2A artifact as structured JSON (`mcp:TRUYN` in the fixture);
- TRUYN request correlation survives into A2A artifact provenance;
- the authoritative provider node remains the imported MCP provider TRUYN identity;
- exactly one remote MCP `tools/call` execution occurs;
- exactly one backing TRUYN request exists for the A2A task;
- descriptive remote A2A `ownerId` and billing metadata are not promoted into authoritative MCP arguments.

The exactly-once acceptance assertion is implemented as:

```text
remoteMcp.toolCalls.length === 1
```

## Route 2 — MCP → TRUYN → A2A

```text
MCP client
  → MCP 2026-07-28 TRUYN MCP facade
  → truyn_need
  → TRUYN NEED
  → C4 imported A2A provider
  → A2A 1.0 SendMessage
  → remote A2A Task / Artifact
  → TRUYN RESULT
  → MCP truyn_poll result
```

The acceptance test exposes remote A2A skill `reason`, imports it as TRUYN capability `a2a.reason`, submits a NEED through the TRUYN MCP facade, routes that NEED to the imported A2A provider, executes the remote A2A skill, converts the remote Task/Artifact into a TRUYN RESULT and returns that result through MCP polling.

Accepted predicates include:

- MCP client protocol version equals the exercised MCP `2026-07-28` profile;
- imported A2A execution uses the exercised A2A `1.0` profile;
- the MCP submission returns a TRUYN request id and selected provider;
- the authoritative provider remains the local imported A2A provider TRUYN identity;
- RESULT verification is successful;
- output reaches MCP as the expected structured result (`a2a:TRUYN` in the fixture);
- remote A2A skill id, remote task id and A2A protocol version survive as interoperability correlation metadata;
- exactly one remote A2A execution occurs;
- A2A message correlation is preserved.

The exactly-once acceptance assertion is implemented as:

```text
remoteExecutions === 1
```

## Identity and authority boundary

C7 preserves the TRUYN authority boundary while translating protocol metadata.

The proof specifically demonstrates that remote A2A descriptive owner/billing metadata does not become authoritative MCP execution authority. Provider identity used for TRUYN RESULT provenance remains the selected TRUYN provider identity. Remote protocol/task/message identifiers are correlation data; they do not replace TRUYN requester identity, provider ownership or billing responsibility.

This is a positive bounded interoperability proof. The complete adversarial anti-spoofing/correlation/transport negative matrix belongs to C8 and is not retroactively claimed by this record.

## Exact CI acceptance evidence

All acceptance evidence below is pinned to exact C7 source/head:

```text
source/head: b408ea9610e0a9547d04bb4cf609cd85516ca41a
PR:          #357
merge:       f04fcd1d4d72af85a6b97686c7c875388ef6038a
```

### CI

Workflow run `32965890687` completed successfully on the exact C7 head.

```text
DCO                         PASS
npm install                 PASS
npm test                    PASS
git diff --check            PASS
CI job                      PASS
```

C7 changed exactly one file: `tests/interoperability-bidirectional.test.js`. Because the repository test command executes `tests/*.test.js`, this acceptance suite is part of the normal full `npm test` gate rather than a detached/manual test.

### CodeQL

CodeQL workflow run `32965887433` completed successfully on the exact C7 head.

```text
Analyze (actions)                  PASS
Analyze (python)                   PASS
Analyze (javascript-typescript)    PASS
```

The GitHub Advanced Security CodeQL check on the same head also concluded `success` with no new alerts in code changed by PR `#357`.

### Review state

```text
review threads: 0
changed files:  1
```

## What C7 does not claim

C7 is deliberately bounded. It does **not** claim:

- complete C8 adversarial cross-protocol security closure;
- independent third-party A2A SDK/reference implementation certification;
- independent third-party MCP SDK/reference implementation certification;
- universal file/artifact interoperability across external implementations;
- stable A2A/MCP compatibility guarantees while `TRUYN/1` remains draft.

The remote A2A side of the C7 proof uses the in-repository TRUYN A2A facade. The remote MCP side is a bounded protocol fixture. These are sufficient for the accepted in-repository composition claim, but not for ecosystem-wide certification.

## Durability rule

Canonical status documents should point to this record for the accepted C7 bidirectional bridge state. Historical C1/C2/C3 documents remain valid for their original slices but cannot downgrade C4–C7 by retaining old future-work language.

A later document may supersede this record only by naming the superseding evidence and exact source SHA. Until then, the accepted factual state is:

```text
A2A → TRUYN → MCP    Implemented / bounded CI-proven — C7
MCP → TRUYN → A2A    Implemented / bounded CI-proven — C7
```
