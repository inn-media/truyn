# Adapters

Adapters connect existing agents, models, runtimes and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

**Snapshot:** 2026-09-02  
**Synchronized source:** `main@44c8aee6789b98a29bca385586387e0c435d071c`

## Implemented bounded surfaces

The repository contains executable provider/protocol adapters including:

- OpenAI/OpenAI-compatible provider paths;
- Anthropic;
- Azure OpenAI;
- Vertex Gemini;
- generic HTTP/provider adapters used by reference/demo work;
- TRUYN-as-MCP server surfaces;
- configured and discovered/imported MCP tool providers;
- A2A Agent Card/server facade;
- A2A remote client/provider discovery/import;
- bounded A2A task polling;
- A2A artifact integrity normalization.

Provider availability/entitlement is independent from adapter code.

## MCP ownership

```text
adapters/mcp/server.js
    TRUYN-facing MCP server/current protocol surface

adapters/mcp/client.js
    bounded remote MCP client/discovery/call handling

adapters/providers/mcp-http-tool.js
    configured remote MCP tool provider

adapters/providers/mcp-discovery.js
    explicit allowlisted/filtered tool discovery/import
```

General MCP discovery/import is implemented; old documentation that calls it future work is stale.

## A2A ownership

```text
adapters/a2a/server.js
    Agent Card + SendMessage/GetTask facade

adapters/a2a/client.js
    remote Agent Card discovery + RPC/task execution

adapters/a2a/task-store.js
    task/request/context correlation state

adapters/a2a/artifact-integrity.js
    artifact/reference integrity boundary

adapters/providers/a2a-discovery.js
    explicit remote skill discovery/import as TRUYN provider capabilities
```

A2A is implemented in both directions. It is no longer an architecture-only placeholder.

## Accepted interoperability slices

```text
C1  MCP current contract                         accepted / bounded CI-proven
C2  general MCP discovery/import                accepted / bounded CI-proven
C3  A2A server facade                           accepted / bounded CI-proven
C4  A2A client/provider import                  accepted / bounded CI-proven
C5  bounded polling lifecycle                   accepted / bounded CI-proven
C6  artifact integrity                          accepted / bounded CI-proven
C7  bidirectional A2A↔TRUYN↔MCP composition     accepted / bounded CI-proven
Sprint C independent A2A black box              accepted / official SDK CI-proven
Sprint D independent MCP black box              accepted / official SDK CI-proven
C8  complete cross-protocol adversarial matrix  OPEN (#369)
```

`tests/interoperability-bidirectional.test.js` proves the two C7 in-repository compositions and exactly-one remote MCP/A2A execution assertions.

Independent ecosystem-side evidence is also implemented in both directions:

- `tests/interoperability-independent-a2a.test.js` runs a separate-process official A2A Project `@a2a-js/sdk@1.0.1` server for `MCP→TRUYN→A2A`;
- `tests/interoperability-independent-mcp.test.js` runs a separate-process official `@modelcontextprotocol/server@2.0.0` server for `A2A→TRUYN→MCP`.

These are bounded external interoperability proofs, not ecosystem-wide certification.

## Security rules

Every adapter that can reach paid/private upstream work must preserve:

- requester/provider authorization before upstream execution;
- provider-host recheck where applicable;
- billing responsibility independent from requester-controlled metadata;
- credentials inside adapter/runtime secret boundaries;
- explicit external protocol version validation;
- correlation integrity;
- bounded response/artifact handling;
- no implicit remote URL materialization;
- no protocol fallback/polling behavior that silently duplicates side effects.

A public adapter endpoint does not imply public provider access.

## External adoption boundary

The bridge now has both bounded in-repository C7 proof and bounded independent official A2A/MCP SDK black-box proof. What remains open is:

- C8 complete adversarial acceptance;
- at least one integrity-verified referenced file/artifact through the external profile;
- broader optional protocol surfaces only when separately implemented/evidenced;
- a stable A2A/MCP compatibility declaration while `TRUYN/1` remains draft.

See:

- `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`;
- `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`;
- `../docs/architecture/IMPLEMENTATION_STATUS.md`.
