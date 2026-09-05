# Managed Production Authority Runtime

**Status:** repository/runtime support implemented by this change. Live Azure provisioning, production migration, backup acceptance and restore-drill acceptance remain separate deployment gates until executed against real production resources.

## Production boundary

The fsync-backed `ProductionControlPlane` remains the deterministic authority engine, but its JSON files are not the production source of truth in managed mode. They are materialized only into ephemeral per-revision working directories.

The production topology is:

```text
managed checkpoint store
  ↓  digest + monotonic revision + ETag fencing
private TRUYN authority runtime
  ↓
revisioned relay snapshot cache
  ↓
relay authorization hot path
```

The first supported managed checkpoint adapter is Azure Cosmos DB for NoSQL using Container Apps managed identity/AAD. No Cosmos account key or connection string is accepted by this adapter.

## Checkpoint contract

A checkpoint contains:

- schema version;
- monotonically increasing authority revision;
- exact deployed source Git SHA;
- commit timestamp;
- SHA-256 commitment over the complete authority state;
- account/organization/tenant/membership and binding state;
- terminal revocations;
- provider policies and grants;
- entitlements;
- accounting ledgers and reservations.

The document is bounded below the Cosmos DB item-size ceiling. Exceeding the configured safe document budget fails closed; scaling the accounting state beyond this bounded checkpoint requires a later sharded/normalized persistence migration rather than silently increasing the limit.

All state mutations are applied to an ephemeral materialization and acknowledged only after an `If-Match` ETag replacement succeeds. A conflicting writer forces a bounded reload/retry. A write that is not durably committed to the managed checkpoint is not reported as successful.

## Bootstrap / migration rule

Production does **not** create an empty authority automatically.

If no managed checkpoint exists, startup requires both:

- `TRUYN_AUTHORITY_BOOTSTRAP_B64` — explicit serialized snapshot supplied through the deployment secret/configuration plane;
- `TRUYN_AUTHORITY_BOOTSTRAP_DIGEST` — the expected SHA-256 snapshot digest.

If either is missing, or the digest does not match, authority startup fails. After the first committed checkpoint, normal restarts load only the managed checkpoint and do not require bootstrap input.

A real migration evidence record must publish only sanitized information such as source SHA, checkpoint revision, snapshot digest, object counts, timestamp and PASS/FAIL. Private account, tenant, node and provider identifiers are not required in public evidence.

## Relay cache semantics

The relay does not issue a remote database/network lookup for every routing authorization decision. When `TRUYN_AUTHORITY_URL` is configured, production bootstrap must successfully fetch and verify the first authority snapshot before starting the existing relay service.

The cache:

- accepts only a valid snapshot digest;
- accepts only monotonic revisions;
- rejects same-revision/different-digest state;
- refreshes on a configured cadence;
- fails closed once the last successful refresh exceeds `TRUYN_AUTHORITY_MAX_STALE_MS`;
- atomically swaps the active in-process authority object by revision.

This provides a bounded revocation propagation interval while preserving the synchronous relay authorization hot path.

## Private authority service

`TRUYN_ROLE=authority` starts the managed authority service. Deployment must expose it only on the private/internal service path.

The service has two independent bearer credentials:

- `TRUYN_AUTHORITY_RUNTIME_TOKEN` for snapshot, access and billing operations;
- `TRUYN_AUTHORITY_ADMIN_TOKEN` for lifecycle mutations.

The tokens must be different. They are deployment secrets and must never be committed or printed in evidence.

The current admin mutation surface is an explicit allowlist for account/organization/tenant/membership/binding lifecycle, provider policies and grants, entitlements, and terminal revocation. Unsupported operations are rejected.

## Cosmos configuration

Managed mode requires deployment-provided values:

- `TRUYN_COSMOS_ENDPOINT`
- `TRUYN_COSMOS_DATABASE`
- `TRUYN_COSMOS_CONTAINER`
- `TRUYN_SOURCE_SHA`

Optional bounded controls include checkpoint ID/partition key, maximum checkpoint bytes and mutation retry count.

The runtime requests a Cosmos data-plane AAD token from the Container Apps managed identity endpoint and performs conditional item reads/creates/replacements. Provisioning the Cosmos account, database/container, data-plane RBAC, networking, continuous backup and multi-region replication is intentionally a deployment action, not a repository claim.

## What this change does not prove

Passing unit/CI/CodeQL tests proves the repository contract only. It does not prove that:

- a Cosmos account has been provisioned;
- multi-region writes are active;
- continuous backup is enabled;
- production state has been migrated;
- the live relay is consuming managed authority snapshots;
- point-in-time restore works within the required RTO/RPO;
- any production restore drill has passed.

Those claims require sanitized live evidence from the exact deployed environment.
