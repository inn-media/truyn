# TRUYN/1 P13 bounded migration and compatibility proof

## P13 bounded executable evidence (scope and limits)

- **Actual schema migration**: read a legacy BYOK config from disk and invoke `runtime/byok-profile-migration.js` schema1→schema2; unchanged requester/provider Node IDs and ownership/billing semantics.
- **Transactional rollback**: retain mode-0600 checkpoint with SHA-256 digests and byte-exact legacy payload, atomic fsync+rename of target; an unchanged target can be rolled back byte-for-byte. Checkpoint files are sensitive local configuration data and must not be publicly uploaded. The caller must quiesce the consuming process; no distributed lock is claimed.
- **Negative proof**: bad JSON, unknown schema, identity collapse, tampered checksum/target, symlink and unsupported network-state version fail closed. Existing `DurableNetworkState` persisted node ID/sequence reloaded unchanged.
- **Negotiation**: actual `negotiateProtocol()` overlaps `TRUYN/1` base semantics, rejects a missing required semantic and rejects `TRUYN/2` mismatch without downgrade. Historic five-language released-alpha 20/20 peer combinations are documented in `docs/compatibility/TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md` (PR #975); not repeated here.
- **Deprecation**: 180 calendar days public notice is canonical policy; no real stable deprecated features are announced by this test.

**Not proved:** managed production data migration, exact stable protocol or wire generation, all durable stores, live canary/rollback, an end-to-end stable five-language wire-generation bridge, or final P13 stable-v1 gate. This is deliberately bounded Open 1.0 RC evidence until those separate gates pass. Tests do not alter production assets or launch paid work.
