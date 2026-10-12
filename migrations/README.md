# Migrations

Explicit migration ownership for configuration, storage and protocol-adjacent local state.

Migrations MUST be versioned, testable and compatible with updater rollback policy. A migration MUST NOT silently rotate cryptographic node identity. Protocol-generation migration is negotiated compatibility work, not a blind local data rewrite.

## Implemented bounded pre-stable path

`p13-byok-file.js` provides a real offline, source-preserving BYOK local configuration schema1→schema2 upgrade via the production migration function and a mode-0600 checksum-verified rollback checkpoint. Call only after **quiescing the owner**. Keep checkpoint access restricted and never treat rollback as permission to bypass security gates; authorization must be revalidated before serving. See `tests/p13-migration-rollback-interoperability.test.js` for positive and negative evidence. Network node state/protocol cutovers and managed production migration remain separate, unproven gates.

## Ownership boundary

The BYOK file migrator is **P13-FORMAT bounded local persisted-format evidence** only. Its success neither certifies a Stable TRUYN/1 wire/SDK generation nor authorizes deployed storage migrations. The public format qualification inventory is in [P13-FORMAT](../docs/compatibility/P13_FORMAT_COMPATIBILITY.md). Managed/live recovery and cutover remain the independent, currently BLOCKED [P13-OPS](../docs/operations/P13_PRODUCTION_CUTOVER_READINESS.md) gate.
