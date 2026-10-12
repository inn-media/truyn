# G5 bounded shared OFFER directory and non-recycling compaction

Candidate source for issue #990. No live Azure acceptance or production activation.

`createDurableOfferDirectory` uses one bounded versioned shared CAS document. Publication verifies the canonical signed OFFER and authenticated owner. Revocation verifies a signed explicit `REVOKE targetKind=offer`; replay cannot replace the owner or signed commitment. Compaction drops only the envelope of already withdrawn entries. Their IDs, owner, fingerprints, revoked timestamps and occupied record slots are permanent. No DELETE, TTL recycling or capacity reset exists. At 256 entries or the byte bound this reference profile refuses new publication; scaling beyond it requires a separately versioned migration, not increasing a replica-local setting.

The concrete `createCosmosDirectoryStore` requires Microsoft Entra and Strong reads, bounded body/auth/transport deadlines, and exact create-if-absent/ETag CAS. It fails closed on unavailable or Session-configured accounts rather than weakening consistency. Configuration, record limits and authority identity are pinned in the document and checked on each read. Missing state is an error; initialization is a separate explicit operator/bootstrap operation and never runs automatically from runtime startup.

## Runtime integration

Default is off. Explicit opt-in uses `TRUYN_G5_OFFER_DIRECTORY=cosmos-strong-v1`, `TRUYN_G5_OFFER_DIRECTORY_CONTAINER` (different from the lifecycle container), and `TRUYN_G5_OFFER_DIRECTORY_AUTHORITY`. A previously initialized directory must be readable during relay startup. The factory supplies the directory through the existing lifecycle ledger; legacy deployments are unchanged.

Relay discovery and NEED matching consult shared signed offers, but still require fresh provider registration on that relay and current canonical provider-policy authorization. A provider can re-register on a peer and rediscover its offer without re-announcing a new ID. This does not forward work to a host where the provider has not registered or reconstruct a lost socket. Normal HTTP publication preserves duplicate-ID rejection. Explicit OFFER revocation is shared; automatic ambiguous namespace targeting remains rejected by the Cosmos lifecycle profile.

Only new isolated deployments with all participating relays using this profile are eligible. Legacy per-offer records are not silently imported; known legacy IDs remain rejected on publication. Mixed old/new writers, cross-document atomic admission versus concurrent withdrawal, migration authority and high-scale directory sharding require separate qualification. This is not an internet-scale or mainnet declaration.

## Evidence boundary

Tests cover signed verification, two-replica CAS races, restart, private visibility, immutable identity conflict, bounded capacity, lost write responses, Strong/Entra transport and retained tombstones. HTTP integration tests use actual relay/client/protocol code with an explicit storage model. No mocked result is a live Cosmos partition, region failover, PITR or provider invoice. Need/effect record compaction, independent billing settlement and full G5 acceptance remain separate outstanding work.
