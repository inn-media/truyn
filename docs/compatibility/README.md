# TRUYN Compatibility

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol generation:** `TRUYN/1` draft  
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

Compatibility is tracked separately for protocol/node behavior, adapters/external protocols and SDK packages.

## Current boundaries

- `TRUYN/1` remains draft; stable mainnet/protocol compatibility is not claimed.
- A2A/MCP C1–C8 and P2-E1/P2-E2/P2-E3 are accepted as a bounded pre-v1 profile.
- **Stable A2A/MCP v1 is not declared.**
- SDK API-v1 bounded primitives are implemented across five first-party clients.
- PyPI and Go alphas have accepted immutable public evidence.
- npm alpha.1 remains immutable historical evidence whose required clean-room ESM import failed; the distinct alpha.2 packaging repair is merged in `#448`, with public registry/provenance/clean-room evidence still gated.
- Maven Central and NuGet remain open.

External evidence names concrete tested versions/source. Per-build provenance, immutable publication, clean-room usability and stable compatibility are separate concepts.

See `A2A_MCP_STABILITY.md`, `A2A_MCP_COMPATIBILITY.md`, `SDK_COMPATIBILITY.md`, `SDK_PACKAGING.md` and `../architecture/IMPLEMENTATION_STATUS.md`.
