# TRUYN Compatibility

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol generation:** `TRUYN/1` draft; A–I semantic registry does not add physical signed Envelope kinds  

**Canonical Wire Freeze references:** [expanded CORE registry](../../spec/registry/README.md), [exact-SHA qualification ledger](TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md), [SDK compatibility policy](SDK_COMPATIBILITY.md), [five-language conformance](../../sdk/README.md). Public PR #975 is merged; postmerge independent E2E PR #976 and private consumer PR #458 are distinct reviews. Public source merge ≠ immutable SDK release ≠ Mainnet admission.
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

Compatibility is tracked separately for protocol/node behavior, adapters/external protocols and SDK packages.

**Canonical migration/deprecation contract:** [`spec/protocol/v1/migration.md`](../../spec/protocol/v1/migration.md). Stable deprecated features have a uniform minimum **180 calendar days** of dated public notice; stricter major/generation constraints still apply. The P13 documentation policy is defined, but executable stable-v1 migration qualification remains outstanding in [`TRUYN1_RC_GAP_LEDGER.md`](TRUYN1_RC_GAP_LEDGER.md).

## Current boundaries

- `TRUYN/1` remains draft; stable mainnet/protocol compatibility is not claimed.
- A2A/MCP C1–C8 and P2-E1/P2-E2/P2-E3 are accepted as a bounded pre-v1 profile.
- **Stable A2A/MCP v1 is not declared.**
- SDK API-v1 bounded primitives are implemented across five first-party clients.
- PyPI, Go and npm alpha.2 have accepted immutable public evidence.
- npm alpha.1 remains immutable historical evidence whose required clean-room ESM import failed and is superseded without overwrite.
- Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease.

External evidence names concrete tested versions/source. Per-build provenance, immutable publication, clean-room usability and stable compatibility are separate concepts.

See `A2A_MCP_STABILITY.md`, `A2A_MCP_COMPATIBILITY.md`, `SDK_COMPATIBILITY.md`, `SDK_PACKAGING.md` and `../architecture/IMPLEMENTATION_STATUS.md`.
