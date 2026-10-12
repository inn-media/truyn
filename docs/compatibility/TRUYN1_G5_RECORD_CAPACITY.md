# G5: bounded shared lifecycle record admission

Issue #990. Source candidate only. No cloud deployment, bootstrap, invoice proof,
or final G5 admission is implied by this feature.

## Contract

`TRUYN_G5_LIFECYCLE_RECORD_CAPACITY` is an explicit integer from 1 through 4096.
It is absent by default. Both relay and provider Cosmos factories accept the same
limit. A configured capacity cannot be ignored when that runtime's ledger is off.

All participating writers MUST use this profile against one dedicated container,
with single-region writes, matching endpoint/database/container configuration and
limit. Mixed legacy writers or direct out-of-contract writes invalidate the bound.
The isolated deployment must verify those preconditions before activation.

Before creating a NEED, OFFER or effect record, the ledger first reserves that
entity's kind-qualified hashed ID in one permanent allocation document using
ETag/If-Match CAS. Different replicas cannot over-allocate the shared limit.
Existing-ID retries reuse one ticket but remain subject to the ordinary entity
CREATE conflict, signed identity and irreversible terminal rules.

The quota allocation and entity creation are intentionally NOT advertised as a
cross-partition transaction. Allocation occurs first. A crash or ambiguous reply
can waste capacity but cannot create an unbudgeted entity. No entity POST follows
an ambiguous allocation response. A later same-ID retry can complete that record;
a different ID cannot reuse the reserved slot. Ambiguous entity CREATE replies
remain ordinary durable duplicate/reconciliation cases, not repeat provider calls.

## Bootstrap and scope

The pure `createLifecycleCapacityDocument()` helper only constructs the seed JSON.
It performs no IO. An operator must install the initial document with CREATE-only
semantics in a separately verified empty and quiesced dedicated scope before any
participating writer starts. It is NOT a migration tool for an occupied container.
Never insert an empty seed into an existing ledger, overwrite a seed, reset its
counter or infer absence from a failed/session-unavailable read. Missing, corrupt,
expiring, mismatched-scope or differently sized seeds fail closed without creation.

`verifyCapacityContract()` is internal readiness information, not a public quota
or administrative endpoint. It exposes no reset or ticket-removal operation.
The relay startup preflight checks the contract when this profile is enabled;
provider effect admission independently verifies it before reserving an effect.

## Capacity, retention and recovery

At most `recordCapacity` managed NEED/OFFER/effect IDs plus one allocation document
can be created under the above preconditions. Existing document/outbox byte limits
still apply. This bounds managed JSON cardinality; it is not a physical Cosmos
index/storage billing estimate. Tickets and all replay tombstones retain `ttl=-1`.

Terminal transitions, withdrawal, ACK and payload-only compaction never free a
slot. New IDs receive `503 lifecycle_global_capacity_reached` at exhaustion. The
finite horizon is therefore explicit: the service stops new admission rather
than recycle IDs or erase evidence. There is no automatic epoch rotation, total
history migration, or unlimited-lifetime claim.

A point-in-time restore can roll back both tickets and effects. Restored scopes
MUST remain admission-disabled until independent durable evidence is reconciled.
This profile does not make restored history automatically safe for live dispatch,
does not attest physical host separation and does not verify vendor charges.

## Executable coverage

`tests/g5-global-capacity.test.js` uses the production ledger and both runtime
factories against an explicitly simulated Cosmos HTTP/ETag service. It covers
mixed kinds, unique and same-ID races, full-capacity replay, uncertain allocation
and entity replies, restart, terminal/withdrawal retention, missing/corrupt seeds,
scope/limit divergence and backend outage. Full exact-SHA SDK/security/CI and live
Azure qualification remain separate obligations. No acceptance threshold changes.

Storage references: Microsoft Learn, Cosmos DB optimistic concurrency control,
transactional-batch same-partition boundary, and TTL item `-1` semantics.
