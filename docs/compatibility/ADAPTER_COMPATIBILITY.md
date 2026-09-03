# TRUYN Adapter Compatibility

**Snapshot:** 2026-09-03  
**Status:** reference adapter compatibility map synchronized with `main@b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`.

An adapter being present does not imply cloud entitlement, public provider access, stable compatibility or ecosystem-wide external-protocol certification. External protocol objects remain adapter metadata, not TRUYN/1 wire vocabulary.

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
| A2A→TRUYN→MCP | **C7 + independent official MCP SDK black-box proven — Sprint D** |
| MCP→TRUYN→A2A | **C7 + independent official A2A SDK black-box proven — Sprint C** |
| Complete cross-protocol adversarial matrix | **ACCEPTED / bounded CI+CodeQL-proven — C8** |
| Independent external referenced file/artifact profile | **Not yet accepted** |
| Stable A2A/MCP compatibility guarantee | **Not available** |

The key correction is that the project has the reverse A2A adapter, both in-repository cross-protocol round trips, bounded independent official SDK black-box evidence in both claimed directions, and accepted bounded C8 adversarial security evidence. C8 closed in PR `#423` on exact main `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`; see `A2A_MCP_C8_SECURITY_EVIDENCE.md`. What remains open is the external referenced artifact/file profile, broader optional surfaces and stable compatibility — not C4/C7/C8 or independent basic interoperability.

See `A2A_MCP_COMPATIBILITY.md` for the detailed matrix.

## Artifact/reference handling

Large media/reference payloads must preserve integrity and credential locality. C6 requires bounded content, SHA-256/size checks, canonical encodings where applicable, authoritative provenance and no implicit remote URL fetch. A referenced artifact is not trusted merely because an adapter can parse its URL.

C8 proves the bounded artifact-security negatives for the claimed bridge profile, but the current external black-box proofs still exercise text/structured JSON boundaries; at least one integrity-verified referenced file/artifact round trip remains a separate adoption gate.

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

Current main contains implemented Developer Release clients for TypeScript/JavaScript, Python, Go, Java and C#/.NET, with shared five-language executable conformance, direct NEED cancellation and signed generic PARTIAL streaming. The Agent Descriptor profile is bounded: canonical valid-profile startup serving/fetch/verification is implemented, while automatic refresh before expiry and complete malformed/missing endpoint parity remain open. Ordinary package builds are per-commit verification artifacts with exact source/digest provenance; immutable tagged/native publication remains a separate SDK release gate.

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
