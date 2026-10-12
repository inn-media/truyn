# Documentation sanitation: public TRUYN protocol + SDK (2026-10-12)

**Scope:** documentation and current release metadata only. TRUYN/1 and all five SemVer 1.0.0 SDK packages are NOT declared stable or published. Production WAN and Mainnet are separate programs.

## Accepted source of truth

- [Immutable 2026-10-11 five-SDK release ledger](../releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md): frozen source `57971b134a41c3e3ea4b42f68e86a7d117036006`; npm alpha.5, PyPI 0.1.0a2, Go/Maven/NuGet alpha.2; 6/6 independent source/registry proofs PASS.
- Wire Freeze public PRs #975 and #976: complete A–I 80-row semantic registry, unchanged five physical signed Envelope kinds, TCJ1/Ed25519 and bounded Node/Relay/HTTP/compact negatives; existing 20/20 published-alpha mixed-peer matrix.
- P1–P5/P10/P11 in `TRUYN1_RC_GAP_LEDGER.md`: normative specifications, implementations and targeted tests now recorded as present (rather than incorrectly missing). Exact-head full five-SDK/Protobuf compatibility certification remains pending. P6–P9/G5 cross-replica durable semantics remain OPEN; P12 bounded profile accepted, P13 normative 180-day and bounded BYOK local migration exists.
- `sdk/release/public-coordinates.json` is the CURRENT public distribution manifest, updated along with Maven/NuGet conformance expectations. Earlier immutable alpha.1/alpha.2 evidence remains historical and unchanged.
- Public issue #615 historical S103 active status is stale after merged PR #823; do not infer S104–S200 or G1–G34 completion without independent reconciliation.
- Private `config/public-dependencies.json` is a consumer approval pin allowlist, not an inventory of the newest public prereleases; intentionally no automatic upgrades or empty Maven/NuGet allowlist changes.

## Full Markdown-tree inventory and prevention

`scripts/docs-release-status-gate.mjs` scans every public Markdown file in the checked-out repository, verifies the key current SDK/protocol entrypoints and the accepted frozen release coordinates, and saves `.docs-audit/public-release-status.json`. It separates dated/historical alpha references from review-required occurrences in active pages. The PR/main workflow `docs-release-consistency.yml` retains this report for 14 days; it does not silently rewrite immutable historical content.

**Non-goals:** no SDK package publishing, no wire-format changes, no production cloud resources, no paid inference, no WAN admission, no Mainnet launch.
