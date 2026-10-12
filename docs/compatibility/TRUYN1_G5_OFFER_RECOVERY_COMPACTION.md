# G5: signed OFFER recovery and payload-only compaction

Issue #990. **Bounded implementation candidate, not G5 live/production admission.**

## Explicit configuration and compatibility

`TRUYN_G5_LIFECYCLE_MAINTENANCE=1` enables authenticated provider OFFER restoration
and owner-only HTTP compaction when the relay already uses the shared Cosmos
lifecycle ledger. The default is off. SQLite, absent backends or incomplete ledger
interfaces cannot enable this profile. Existing five signed kinds, TCJ1 bytes,
SDK package identities, provider calls and billing paths are unchanged.

A newly published OFFER in this profile stores its exact signed JSON string with
its existing SHA-256 fingerprint, owner and capability in the same durable OFFER
record. Legacy fingerprint-only rows are retained but never fabricated into a
signed advertisement. Existing active offers need an explicit new advertisement
under a new ID to gain a recoverable snapshot; revoked IDs are never recycled.

## Recovery after moving to another relay

The provider re-registers its original cryptographic identity on the surviving
relay. Signature, freshness and node-admission checks run first. Before any new
session is granted, an owner-parameterized directory query retrieves only that
provider's signed snapshots. Empty pages and continuation are handled, duplicates
are deduplicated, and at most 128 unique candidates / 50 pages are scanned.
Capacity or incomplete-query failures return an error, not a truncated success.
Each query row is only a hint: an ETag CAS on the authoritative OFFER row fences a
stale active projection against a concurrently committed REVOKE. Every restored
signature, owner, ID, capability and exact signed JSON fingerprint is rechecked.

Restoration rebuilds local availability only for the reauthenticated provider.
Current requester ACLs, policy authorities, freshness and routing remain in use;
stored metadata grants no entitlement. This is shared durable owner recovery,
**not** transparent dispatch to providers attached only to a different relay,
physical-host placement proof or a linearizable cross-partition listing. Session
consistency can omit recently written directory entries; missed entries require
retry. A globally authoritative complete directory/placement service still needs
its own admission evidence and cannot inherit this bounded PASS.

## Payload-only compaction

Explicit authenticated endpoints (available only with this profile enabled):

- `POST /v1/lifecycle/needs/{id}/compact`: original requester only, terminal NEED.
- `POST /v1/lifecycle/offers/{id}/compact`: original owner only, revoked OFFER.

Foreign actors get no existence disclosure. NEED compaction replaces only an
already-ACKed event payload with null plus its SHA-256 and compaction timestamp.
The event ID, recipient, kind and ACK timestamp remain. Pending signed payloads,
terminal state, requester/provider, policy/scope commitment, PARTIAL counters and
all ID/fingerprint tombstones remain unchanged. Repeated ACK stays idempotent;
repeated NEED and late PARTIAL/RESULT stay rejected. OFFER compaction removes the
signed body only after revocation while retaining owner/fingerprint/revoked state.
Receipt and effect records are not compacted; UNKNOWN is not promoted or resent.
All mutations retain `ttl=-1` and use the existing single-document ETag CAS.

This bounds per-document payload pressure, not the total lifetime number of
Cosmos tombstones. The existing per-document and per-NEED event limits still
apply; no automatic TTL, unsafe bulk delete or ID-reuse window is introduced.
Global container capacity/admission, retention horizon and tombstone indexing
remain open under #990. This is NOT unrestricted long-term compaction.

## Evidence and remaining work

`tests/g5-directory-compaction.test.js` exercises signed recovery, corrupted
records, stale-query/revocation CAS, pagination, capacity, outage, ACK preservation,
late-output rejection, compaction replay and ambiguous commit replies against an
explicit Cosmos REST model. `tests/g5-maintenance-relay-integration.test.js` uses
actual HTTP relays/clients with that model for re-registration, matching, owner
isolation, durable recovery and compaction. Neither is live Azure evidence.

Live independent hosts, Azure partitions/failover/PITR, full distributed placement,
vendor-authoritative charges/accounting, and all-five-SDK fault conformance remain
required before G5 completion. There is no deployment/cleanup controller in this
patch and no change to production configuration.

Primary storage contracts: Microsoft Learn, Cosmos DB optimistic concurrency
(`If-Match`/412), REST query pagination (`x-ms-continuation`), and item TTL (`-1`).

## Registration replay race retained as a permanent negative

The signed registration ID is reserved before the first directory await. A failed
recovery consumes that registration envelope; a client retries with a newly
signed registration rather than reusing the in-flight ID. The deterministic
`tests/g5-maintenance-registration-race.test.js` pauses storage and sends the same
signed IDENTITY concurrently through two real HTTP requests. Exactly one is
accepted, the other receives `409 registration_replay`, with one directory query.
The initial candidate failed this test (two acceptances); the corrected order
passes it without changing signature/freshness rules. Bounded source repair run
38257692690 preserves the failing baseline and passing corrected test. Initial
17-test storage/HTTP application run 38257183880 is also retained. Both temporary
branch-only source writers removed themselves; full exact-head release/security
qualification is still independently mandatory.

## Review hardening: recoverable owner capacity and local admission ordering

Recoverable signed OFFER publication now claims an entry in a bounded same-Cosmos
`offer-owner` record before creating its OFFER record. At most 128 entries are
reserved across all cooperating replicas, including ambiguous uncommitted claims.
Only an irreversibly committed withdrawal releases a slot; its OFFER tombstone is
never deleted or reused. A failed release withholds capacity until the identical
withdrawal is reconciled. This prevents a provider from publishing a 129th active
snapshot and later being unable to restore its own registration. Legacy unsigned
fingerprint-only records are not upgraded or counted as recoverable snapshots.

On each relay, provider re-registration and publication share an owner operation
guard. A concurrent owner mutation receives retryable 409 before storage; an
accepted OFFER is not removed by an older recovery snapshot. Registration also
reserves a local node-capacity slot before querying Cosmos. Full or already
reserved node capacity rejects fresh identities without remote directory IO;
reservations and owner guards are released in finally blocks. Existing stale-node
eviction does not evict an identity whose lifecycle mutation is in progress.

The per-owner capacity index is not a global NEED/effect/tombstone quota. A lost
slot-claim response conservatively retains its slot; exact same-ID OFFER retry
can complete it, but a new ID does not reclaim an ambiguous reservation. Full
network placement, lifetime global retention, real cloud failure and financial
acceptance remain separate requirements.
