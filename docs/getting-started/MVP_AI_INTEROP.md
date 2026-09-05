# TRUYN MVP — AI Interoperability

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

TRUYN's bounded interoperability MVP connects A2A and MCP through TRUYN identity, routing, provider authorization/billing and RESULT/provenance semantics.

## Accepted bounded evidence

- C1–C8 implementation/security profile;
- independent official A2A and MCP black-box processes;
- **P2-E1 / Sprint E** bidirectional external referenced artifact;
- **P2-E2** bounded compatibility generation `a2a-mcp-pre-v1/g1`;
- **P2-E3** canonical documentation reconciliation in PR `#459`.

Sprint E deterministic artifact is `interop-proof.bin`, media type `application/octet-stream`, 29 bytes, SHA-256 `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`.

Referenced content is materialized only through explicit resolvers and must pass exact integrity verification. Arbitrary URLs are not implicitly fetched. Unauthorized paths execute remotely zero times; valid accepted paths execute remotely exactly once.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

See `../architecture/IMPLEMENTATION_STATUS.md`, `../architecture/A2A_MCP_INTEROPERABILITY.md`, `../compatibility/A2A_MCP_STABILITY.md`, `../compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md` and `../../ROADMAP.md`.
