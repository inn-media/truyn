# Adapters

Adapters connect external agents, models, runtimes and protocols to TRUYN. **Adapters are edges; they are not the TRUYN network itself.**

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## Implemented bounded surfaces

The repository contains provider/protocol adapters for OpenAI/OpenAI-compatible, Anthropic, Azure OpenAI, Vertex Gemini, generic HTTP, MCP server/client/discovery/import and A2A server/client/polling/artifact-integrity paths. Provider availability and entitlement remain independent from adapter implementation.

## A2A / MCP accepted profile

C1–C8, independent official A2A/MCP black-box proofs, **P2-E1 / Sprint E** referenced-artifact interoperability, **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1`, and **P2-E3** canonical documentation reconciliation are accepted.

Every execution-capable adapter must preserve TRUYN account/provider/grant/entitlement/billing authority, explicit protocol version handling, correlation integrity, bounded artifact handling, explicit-only reference resolution and exactly-once side effects where claimed.

A public adapter endpoint never implies public provider access.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

See `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`, `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`, `../docs/compatibility/A2A_MCP_STABILITY.md` and `../docs/architecture/IMPLEMENTATION_STATUS.md`.
