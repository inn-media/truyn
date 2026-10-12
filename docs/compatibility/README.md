# TRUYN Compatibility

**Snapshot:** 2026-10-12 (live release/RC reconciliation)  
**Historical initial source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1` (not current HEAD)  
**Protocol generation:** `TRUYN/1` draft; A–I semantic registry does not add physical signed Envelope kinds  

**Canonical Wire Freeze references:** [expanded CORE registry](../../spec/registry/README.md), [exact-SHA qualification ledger](TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md), [SDK compatibility policy](SDK_COMPATIBILITY.md), [five-language conformance](../../sdk/README.md). Public PR #975 is merged; postmerge independent E2E PR #976 and private consumer PR #458 are distinct reviews. Public source merge ≠ immutable SDK release ≠ Mainnet admission.
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

Compatibility is tracked separately for protocol/node behavior, adapters/external protocols and SDK packages.

**Canonical migration/deprecation contract:** [`spec/protocol/v1/migration.md`](../../spec/protocol/v1/migration.md). Stable deprecated features have a uniform minimum **180 calendar days** of dated public notice; stricter major/generation constraints still apply. P13 is now tracked as two independent gates: [P13-FORMAT](P13_FORMAT_COMPATIBILITY.md) owns public stable format/SDK compatibility (currently pre-stable), while [P13-OPS](../operations/P13_PRODUCTION_CUTOVER_READINESS.md) owns production migration and cutover (currently BLOCKED). Neither lane inherits PASS from the other; see the [RC gate ledger](TRUYN1_RC_GAP_LEDGER.md).

**P11 version negotiation:** [frozen RC decision matrix](../../spec/compatibility/P11_VERSION_NEGOTIATION_MATRIX.md) + [executable JSON vectors](../../spec/compatibility/p11-negotiation-matrix.json). This is a release-candidate matrix revision, not a Stable TRUYN/1 claim.

**Joint P1–P5 bounded RC:** [final exact-SHA certification and five-SDK evidence](TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md). CORE, Envelope, TCJ1/Ed25519 signatures, Ed25519 SPKI Node IDs and signed-registration replay/freshness were jointly qualified on merged `main`. This is **not** a new freeze or full Stable `TRUYN/1` declaration.

## Current RC and prerelease facts

The canonical five-SDK Wire Freeze release is publicly verified **6/6** (npm `@truyn/sdk@0.1.0-alpha.5`, PyPI `truyn-sdk==0.1.0a2`, Go/Maven/NuGet `0.1.0-alpha.2`); see [immutable registry ledger](../releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md) and [machine coordinates](../../sdk/release/public-coordinates.json). Previous alpha.1/alpha.2 Developer Releases are immutable historical packages.

Bounded RC acceptance: [P1–P5 joint conformance](TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md), [P10 five-SDK error parity](P10_ERROR_PARITY_ACCEPTANCE_2026-10-12.md), [P12 strict object references](TRUYN1_P12_OBJECT_ARTIFACT_CERTIFICATION.md). The [P11 version negotiation decision matrix](../../spec/compatibility/P11_VERSION_NEGOTIATION_MATRIX.md) is frozen as RC but not a stable-v1 signoff. P6–P9/G5, final release and Stable SDK 1.0.0 remain OPEN; WAN/Mainnet admission is independent.

## Current boundaries

- `TRUYN/1` remains draft; stable mainnet/protocol compatibility is not claimed.
- A2A/MCP C1–C8 and P2-E1/P2-E2/P2-E3 are accepted as a bounded pre-v1 profile.
- **Stable A2A/MCP v1 is not declared.**
- SDK API-v1 bounded primitives are implemented across five first-party clients.
- PyPI, Go and npm alpha.2 have accepted immutable public evidence.
- npm alpha.1 remains immutable historical evidence whose required clean-room ESM import failed and is superseded without overwrite.

External evidence names concrete tested versions/source. Per-build provenance, immutable publication, clean-room usability and stable compatibility are separate concepts.

See `A2A_MCP_STABILITY.md`, `A2A_MCP_COMPATIBILITY.md`, `SDK_COMPATIBILITY.md`, `SDK_PACKAGING.md` and `../architecture/IMPLEMENTATION_STATUS.md`.

## Stable release targets

[Release-scope contract](../../spec/compatibility/stable-release-scopes.json): Stable TRUYN/1 **Protocol** is gated by public protocol/SDK/P13-FORMAT conformance and exact-SHA release certification, **not** Azure/Cosmos/P13-OPS production migration. Stable Service and Mainnet additionally require live P13-OPS recovery/cutover and reliability evidence. All three declarations remain NOT DECLARED. The read-only contract audit is `node scripts/p13-release-scopes-readiness.mjs`.
