# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**TRUYN protocol:** `TRUYN/1` draft  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1:** **not declared**

This matrix records the accepted bounded external A2A/MCP profile. It is not ecosystem-wide certification.

| Surface | Status | Boundary |
|---|---|---|
| MCP server/configured provider | **Implemented / CI-proven** | bounded current facade/provider paths |
| MCP discovery/import | **Accepted — C2** | generalized MCP resources→TRUYN state remains unsupported |
| A2A server/client/polling/artifact | **Accepted — C3–C6** | bounded profile only |
| A2A→TRUYN→MCP | **Accepted C7 + Sprint D** | independent official MCP evidence |
| MCP→TRUYN→A2A | **Accepted C7 + Sprint C** | independent official A2A evidence |
| C8 adversarial matrix | **Accepted — PR #423** | negative remote execution = 0; valid = exactly 1 |
| P2-E1 / Sprint E referenced artifact | **Accepted — PR #427** | explicit resolution + exact integrity |
| P2-E2 `a2a-mcp-pre-v1/g1` | **Accepted — PR #432** | executable negotiation/migration contract |
| P2-E3 canonical reconciliation | **Accepted / merged — PR #459** | documentation regression guard |
| Stable A2A/MCP v1 | **NOT DECLARED** | requires stable TRUYN generation + stable ecosystem evidence |

## P2-E1 / Sprint E

Deterministic proof artifact is `interop-proof.bin`, media type `application/octet-stream`, 29 bytes, SHA-256 `257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae`. Both directions use explicit resolvers; absent resolver or corrupt size/digest fails closed; arbitrary remote URLs are not implicitly fetched; valid remote application execution remains exactly once.

## P2-E2 generation `a2a-mcp-pre-v1/g1`

Unsupported/missing required versions and unknown required semantics fail closed. Correlation, artifact integrity, authorization, provider-owner, billing and exactly-once semantics cannot silently change inside the same generation.

## P2-E3

PR `#459` aligns canonical public/status documents with accepted P2-E1/P2-E2 facts and adds `tests/a2a-mcp-p2-documentation-status.test.js` to prevent regression.

Durable consolidated evidence: `A2A_MCP_P2_FINAL_ACCEPTANCE.md`.

The old external referenced-artifact and bounded compatibility-policy gaps are closed. **Stable A2A/MCP v1 is not declared.**
