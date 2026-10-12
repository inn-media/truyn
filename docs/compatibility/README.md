# TRUYN Compatibility

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol generation:** `TRUYN/1` draft; A–I semantic registry does not add physical signed Envelope kinds  

**Canonical Wire Freeze references:** [expanded CORE registry](../../spec/registry/README.md), [exact-SHA qualification ledger](TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md), [SDK compatibility policy](SDK_COMPATIBILITY.md), [five-language conformance](../../sdk/README.md). Public PR #975 is merged; postmerge independent E2E PR #976 and private consumer PR #458 are distinct reviews. Public source merge ≠ immutable SDK release ≠ Mainnet admission.
**A2A/MCP generation:** `a2a-mcp-pre-v1/g1`

Compatibility is tracked separately for protocol/node behavior, adapters/external protocols and SDK packages.

**Canonical migration/deprecation contract:** [`spec/protocol/v1/migration.md`](../../spec/protocol/v1/migration.md). Stable deprecated features have a uniform minimum **180 calendar days** of dated public notice; stricter major/generation constraints still apply. P13 is now tracked as two independent gates: [P13-FORMAT](P13_FORMAT_COMPATIBILITY.md) owns public stable format/SDK compatibility (currently pre-stable), while [P13-OPS](../operations/P13_PRODUCTION_CUTOVER_READINESS.md) owns production migration and cutover (currently BLOCKED). Neither lane inherits PASS from the other; see the [RC gate ledger](TRUYN1_RC_GAP_LEDGER.md).

**P11 version negotiation:** [frozen RC decision matrix](../../spec/compatibility/P11_VERSION_NEGOTIATION_MATRIX.md) + [executable JSON vectors](../../spec/compatibility/p11-negotiation-matrix.json). This is a release-candidate matrix revision, not a Stable TRUYN/1 claim.

**Joint P1–P5 bounded RC:** [final exact-SHA certification and five-SDK evidence](TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md). CORE, Envelope, TCJ1/Ed25519 signatures, Ed25519 SPKI Node IDs and signed-registration replay/freshness were jointly qualified on merged `main`. This is **not** a new freeze or full Stable `TRUYN/1` declaration.

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

## Stable release targets

[Release-scope contract](../../spec/compatibility/stable-release-scopes.json): Stable TRUYN/1 **Protocol** is gated by public protocol/SDK/P13-FORMAT conformance and exact-SHA release certification, **not** Azure/Cosmos/P13-OPS production migration. Stable Service and Mainnet additionally require live P13-OPS recovery/cutover and reliability evidence. All three declarations remain NOT DECLARED. The read-only contract audit is `node scripts/p13-release-scopes-readiness.mjs`.

**Current Wire Freeze five-language prerelease pins:** [machine manifest](../../spec/compatibility/truyn1-five-sdk-freeze.json), with [accepted frozen source/registry proof](../releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md). The old `sdk/release/public-coordinates.json` lists a historical Developer Release family and must not be used as evidence of the latest frozen five-SDK generation. P13-FORMAT remains PRE-STABLE and P14 draft labels remain intact.
