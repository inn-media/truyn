# TRUYN Adapter Compatibility

**Snapshot:** 2026-08-27  
**Status:** reference adapter compatibility map synchronized with `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`.

An adapter being present does not imply cloud entitlement, public provider access, stable compatibility or complete external-protocol certification. External protocol objects remain adapter metadata, not TRUYN/1 wire vocabulary.

## Adapter security rule

All execution-capable adapters preserve the same central boundary:

```text
external protocol/provider
        ↓
adapter auth + version/correlation validation
        ↓
TRUYN requester/provider authorization
        ↓
billing/entitlement gate
        ↓
upstream execution
```

Transport authentication never substitutes for TRUYN authorization. Remote owner/requester/billing metadata is descriptive unless independently authorized by TRUYN policy.

## Current reference adapter surfaces

The repository contains bounded executable paths for combinations including:

- OpenAI and OpenAI-compatible providers;
- Anthropic;
- Azure OpenAI;
- Vertex Gemini;
- generic HTTP JSON providers;
- TRUYN-as-MCP stdio/loopback HTTP;
- configured MCP HTTP tool providers;
- general explicitly selected MCP tool discovery/import;
- A2A `1.0` server facade;
- A2A `1.0` client/provider discovery/import;
- bounded A2A polling lifecycle;
- integrity-validated A2A artifact mapping.

Provider/model deployment availability is independent of adapter implementation.

## A2A / MCP status

| Surface | Current factual state |
|---|---|
| MCP TRUYN-server path | **Implemented / bounded CI-proven** |
| MCP configured remote tool provider | **Implemented / bounded CI-proven** |
| General MCP discovery/import | **Implemented / bounded CI-proven — C2** |
| A2A Agent Card/server facade | **Implemented / bounded CI-proven — C3** |
| A2A client/provider adapter | **Implemented / bounded CI-proven — C4** |
| A2A polling task lifecycle | **Implemented / bounded CI-proven — C5** |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** |
| A2A→TRUYN→MCP | **Implemented / bounded CI-proven — C7** |
| MCP→TRUYN→A2A | **Implemented / bounded CI-proven — C7** |
| Complete cross-protocol adversarial matrix | **OPEN — C8 / PR #369** |
| Independent external A2A/MCP reference-SDK certification | **Not yet proven** |
| Stable A2A/MCP compatibility guarantee | **Not available** |

The key correction is that the project **does have** the reverse A2A adapter and both in-repository cross-protocol round trips. What remains open is C8 and broader independent external certification, not C4/C7 implementation.

See `A2A_MCP_COMPATIBILITY.md` for the detailed matrix.

## Artifact/reference handling

Large media/reference payloads must preserve integrity and credential locality. C6 requires bounded content, SHA-256/size checks, canonical encodings where applicable, authoritative provenance and no implicit remote URL fetch. A referenced artifact is not trusted merely because an adapter can parse its URL.

## SDKs versus adapters

```text
external AI/provider/protocol
          ↓
       adapter
          ↓
        TRUYN
          ↑
   first-party SDK
          ↑
application / agent code
```

Adapters bridge external ecosystems into TRUYN. SDKs let developers consume TRUYN directly. They are separate compatibility surfaces.

Current main contains TypeScript/JavaScript and Python reference SDK work plus merged DX-3 developer-surface primitives. Go/Java/.NET parity/publication remains incomplete.

## Compatibility requirements

Adapters should preserve:

- logical capability identity independent of vendor/model ID;
- explicit external protocol versions;
- normalized provenance/usage/latency metadata where available;
- central provider authorization/billing before upstream work;
- bounded response and artifact handling;
- explicit unsupported/error states rather than false success;
- credentials inside adapter/runtime secret boundaries;
- correlation integrity and exactly-once side-effect behavior where claimed;
- public discovery visibility no broader than TRUYN authorization permits.

Model catalogs and A2A/MCP versions can evolve independently of TRUYN/1. Adapter upgrades should not require a new TRUYN protocol generation unless TRUYN network semantics themselves change.
