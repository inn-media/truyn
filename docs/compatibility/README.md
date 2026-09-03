# TRUYN Compatibility

**Snapshot:** 2026-09-03  
**Protocol generation:** `TRUYN/1` draft  
**Synchronized source:** `main@dd7c3574490e18cc002372d5eb9af704daf03bda`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`

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

The old “A2A is architecture-only” and “independent SDK/reference-server interoperability is future work” statements are obsolete.

Current accepted bounded profile:

```text
C1  MCP current contract                       accepted / CI-proven
C2  MCP general discovery/import              accepted / CI-proven
C3  A2A server facade                         accepted / CI-proven
C4  A2A client/provider adapter               accepted / CI-proven
C5  A2A bounded polling lifecycle             accepted / CI-proven
C6  A2A artifact integrity                    accepted / CI-proven
C7  both A2A↔TRUYN↔MCP round trips           accepted / CI-proven
Sprint C official A2A SDK black box           accepted / bounded external proof
Sprint D official MCP SDK black box           accepted / bounded external proof
C8  complete cross-protocol security matrix   OPEN (#369)
```

Independent SDK/reference-server interoperability has therefore been proven in both claimed directions, but this is not ecosystem-wide certification. The external referenced file/artifact profile and a stable compatibility declaration remain open.

## SDK compatibility boundary

The five required first-party SDKs — TypeScript/JavaScript, Python, Go, Java and C#/.NET — have implemented Developer Release clients and share one executable conformance path. Direct NEED cancellation, signed generic `PARTIAL` streaming and portable object/artifact references are implemented. Agent Descriptor support is a bounded valid-profile implementation: startup serving plus five-language canonical valid-fixture fetch/signature/expiry/negotiation are proven, while refresh/re-signing before expiry and complete malformed/missing-interface-endpoint parity remain open.

Ordinary CI package builds and exact source/digest provenance are implemented as **per-commit verification artifacts**. The fixed alpha coordinates are not yet immutable tagged/native public releases. What remains open includes immutable public registry publication, public released-version ecosystem evidence and the stable protocol/package compatibility gate. Stable SDK API contract `1` does not make `TRUYN/1` stable.

Compatibility claims must distinguish:

```text
Defined
Implemented
CI-proven
Bounded interoperability-proven
Independent externally interoperable/evidenced
Per-commit built verification artifact
Immutable public pre-release package/tag
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
- Descriptor valid-profile evidence must not be generalized to untested refresh or malformed-endpoint parity;
- per-commit package build/provenance, immutable tagged/native publication and stable API compatibility are separate gates;
- mainnet compatibility is not promised until the mainnet/stability gates close.

See `A2A_MCP_COMPATIBILITY.md`, `SDK_COMPATIBILITY.md` and `../architecture/IMPLEMENTATION_STATUS.md` for the current factual boundary.
