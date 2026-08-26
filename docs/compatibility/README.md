# TRUYN Compatibility

**Snapshot:** 2026-08-27  
**Protocol generation:** `TRUYN/1` draft  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`

TRUYN separates compatibility dimensions instead of pretending one version controls everything:

1. software release;
2. TRUYN network protocol generation;
3. wire schema generation;
4. Agent Descriptor version;
5. first-party SDK semantic/API/package version;
6. local storage/config formats;
7. external A2A/MCP versions;
8. provider/model API versions behind adapters.

A new adapter/SDK build does not automatically create a new TRUYN protocol generation. TRUYN/1 remains draft and does not yet carry a stable-v1 compatibility promise.

## Documents

- [Protocol and Node Compatibility](PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](ADAPTER_COMPATIBILITY.md)
- [A2A / MCP Compatibility Matrix](A2A_MCP_COMPATIBILITY.md)
- [SDK Compatibility](SDK_COMPATIBILITY.md)
- [SDK Packaging and Versioning](SDK_PACKAGING.md)
- [A2A / MCP Architecture](../architecture/A2A_MCP_INTEROPERABILITY.md)

## Current A2A / MCP boundary

The old “A2A is architecture-only” compatibility statement is obsolete.

Current accepted bounded profile:

```text
C1  MCP current contract                       accepted / CI-proven
C2  MCP general discovery/import              accepted / CI-proven
C3  A2A server facade                         accepted / CI-proven
C4  A2A client/provider adapter               accepted / CI-proven
C5  A2A bounded polling lifecycle             accepted / CI-proven
C6  A2A artifact integrity                    accepted / CI-proven
C7  both A2A↔TRUYN↔MCP round trips           accepted / CI-proven
C8  complete cross-protocol security matrix   OPEN (#369)
```

C7 is in-repository interoperability evidence, not independent external ecosystem certification. Independent A2A/MCP SDK/reference-server proof and a stable compatibility declaration remain open.

## SDK compatibility boundary

Current main contains TypeScript/JavaScript and Python reference SDK clients and the merged DX-3 bounded developer surface. Go, Java and .NET parity/publication remains incomplete. Public stable package compatibility is not claimed merely because API-v1 primitives exist in the repository.

Compatibility claims must distinguish:

```text
Defined
Implemented
CI-proven
Bounded interoperability-proven
Independent externally interoperable/evidenced
Public pre-release package
Stable
```

## Current policy

Before a stable TRUYN/1 release:

- compatibility remains explicitly versioned and may evolve;
- unsupported TRUYN/A2A/MCP versions fail explicitly;
- external protocol authentication never replaces TRUYN provider authorization;
- request/provider/billing authority cannot be taken from remote metadata;
- SDKs/adapters must not guess unknown required semantics;
- migrations must be explicit where persisted state/config changes;
- evidence must name concrete tested source and external protocol versions;
- package publication and stable API compatibility are separate gates from in-repository implementation;
- mainnet compatibility is not promised until the mainnet/stability gates close.

See `A2A_MCP_COMPATIBILITY.md` and `../architecture/IMPLEMENTATION_STATUS.md` for the current factual boundary.
