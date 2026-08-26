# Adapters

Adapters connect existing agents, models, runtimes and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

**Snapshot:** 2026-08-27

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
C8  complete cross-protocol adversarial matrix  OPEN (#369)
```

`tests/interoperability-bidirectional.test.js` proves the two C7 in-repository compositions and exactly-one remote MCP/A2A execution assertions.

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

## External certification boundary

The C7 bridge is real bounded in-repository evidence. It is not an ecosystem-wide A2A/MCP certification. Independent external A2A and MCP SDK/reference-server interoperability remains an adoption follow-up after the C8 acceptance matrix.

See:

- `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`;
- `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`;
- `../docs/architecture/IMPLEMENTATION_STATUS.md`.
