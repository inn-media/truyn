# TRUYN Compatibility

**Current package-status reconciliation:** 2026-10-12 (historical 2026-09-05 snapshot retained)  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol generation:** `TRUYN/1` draft; A–I semantic registry does not add physical signed Envelope kinds  

**Canonical Wire Freeze references:** [expanded CORE registry](../../spec/registry/README.md), [exact-SHA qualification ledger](TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md), [SDK compatibility policy](SDK_COMPATIBILITY.md), [five-language conformance](../../sdk/README.md). Public PRs #975 and #976 are merged. Five immutable Wire Freeze public prereleases were subsequently accepted 6/6 with independent private shadow-only staging. Source merge ≠ stable SemVer 1.0.0 ≠ Mainnet admission.
**Current SDK prereleases:** npm `@truyn/sdk@0.1.0-alpha.5`; PyPI `truyn-sdk==0.1.0a2`; Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2`; Maven `org.truyn:truyn-sdk:0.1.0-alpha.2`; NuGet `Truyn.Sdk 0.1.0-alpha.2`. Independent 6/6 [release ledger](../releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md); historical alpha.1/alpha.2 below do not supersede these coordinates. **Not Stable 1.0.0.**

**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

Compatibility is tracked separately for protocol/node behavior, adapters/external protocols and SDK packages.

**Canonical migration/deprecation contract:** [`spec/protocol/v1/migration.md`](../../spec/protocol/v1/migration.md). Stable deprecated features have a uniform minimum **180 calendar days** of dated public notice; stricter major/generation constraints still apply. The P13 documentation policy is defined, but executable stable-v1 migration qualification remains outstanding in [`TRUYN1_RC_GAP_LEDGER.md`](TRUYN1_RC_GAP_LEDGER.md).

**P11 version negotiation:** [frozen RC decision matrix](../../spec/compatibility/P11_VERSION_NEGOTIATION_MATRIX.md) + [executable JSON vectors](../../spec/compatibility/p11-negotiation-matrix.json). This is a release-candidate matrix revision, not a Stable TRUYN/1 claim.

## Current boundaries

- `TRUYN/1` remains draft; stable mainnet/protocol compatibility is not claimed.
- A2A/MCP C1–C8 and P2-E1/P2-E2/P2-E3 are accepted as a bounded pre-v1 profile.
- **Stable A2A/MCP v1 is not declared.**
- SDK API-v1 bounded primitives are implemented across five first-party clients.
- All five CURRENT Wire Freeze prereleases have accepted immutable 6/6 public evidence; the previous npm alpha.2 is historical.
- npm alpha.1 remains immutable historical evidence whose required clean-room ESM import failed and is superseded without overwrite.
- Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.2` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.2` is an accepted immutable public prerelease.

External evidence names concrete tested versions/source. Per-build provenance, immutable publication, clean-room usability and stable compatibility are separate concepts.

See `A2A_MCP_STABILITY.md`, `A2A_MCP_COMPATIBILITY.md`, `SDK_COMPATIBILITY.md`, `SDK_PACKAGING.md` and `../architecture/IMPLEMENTATION_STATUS.md`.
