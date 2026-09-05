# Production Persistence / Backup / DR Deployment

**Status:** deployment foundation implementation. Repository acceptance proves the declarative controls and workflow contract. Live production acceptance requires the exact-main Azure apply plus successful migration, cutover, isolated restore and all nine recovery drills.

This layer turns the managed authority runtime into a recoverable production service without changing its authority semantics.

## Deployment sequence

```text
Cosmos foundation
  -> continuous PITR + two-region replication
  -> managed-identity data-plane RBAC
  -> private Container Apps environment
  -> immutable authority image/revision
  -> explicit digest-bound migration/seed
  -> relay/provider cutover
  -> isolated restore
  -> nine live recovery drills
  -> RTO/RPO + integrity + negative evidence
```

The sequence is intentionally staged. A live authority service must not be deployed as an empty source of truth. The existing managed runtime refuses an empty checkpoint unless an explicit bootstrap snapshot and matching digest are supplied.

## Foundation contract

`infra/production-dr/foundation.bicep` creates the bounded persistence and serving foundation:

- Azure Cosmos DB for NoSQL with two configured regions;
- a single authoritative write region with automatic failover;
- continuous point-in-time backup, defaulting to the 30-day tier;
- Microsoft Entra-only Cosmos authentication with local key authentication disabled;
- Cosmos public network access disabled;
- private endpoint and private DNS integration for the SQL API;
- a checkpoint container whose partition key path is `/partitionKey`, matching the runtime checkpoint document;
- a user-assigned managed identity for the authority runtime;
- Cosmos built-in data contributor assignment to that identity;
- an internal, VNet-integrated Azure Container Apps environment;
- a container registry with administrator authentication disabled and pull permission for the authority identity.

Multi-region write is deliberately disabled. The current authority is an ETag-fenced single logical writer. Enabling multi-write would require a separate conflict-resolution and convergence proof rather than being treated as a resilience toggle.

## Network and credential boundary

The authority data store is private-network only. The workload authenticates to Cosmos through managed identity and the Cosmos data plane. Account keys and connection strings are not part of the runtime or deployment contract.

The Container Apps environment is internal. A later authority-app deployment must keep the authority endpoint private and expose only the existing bounded runtime/admin surfaces to explicitly authorized relay/provider/admin callers.

The public repository contains no live cloud resource identities, private endpoints, tenant/subscription identifiers or runtime secrets. The deployment workflow derives opaque resource names at execution time and uploads only sanitized boolean/aggregate evidence.

## Exact-main foundation apply

`.github/workflows/production-dr-foundation.yml` has two modes:

- pull requests compile the Bicep and never log in to or mutate Azure;
- a push to `main` that changes the production-DR surface performs the real foundation apply using the repository's federated Azure deployment identity.

After deployment, the workflow independently queries the live resources and requires all of the following before emitting `PASS` evidence:

- continuous backup is active at the requested tier;
- exactly two Cosmos locations are configured;
- automatic failover is enabled;
- multi-region writes are disabled;
- local Cosmos authentication is disabled;
- Cosmos public network access is disabled;
- the checkpoint partition path is correct;
- the authority managed identity exists;
- the identity has the bounded Cosmos data-plane role;
- the Cosmos private endpoint is approved;
- the Container Apps environment is internal;
- the authority identity can pull from the registry through RBAC.

A deployment command returning success is not itself accepted evidence; the post-deployment assertions must all pass.

## Migration / seed gate

The next gate after a live foundation PASS is production state migration.

Migration must use an explicit snapshot of the current authoritative production control-plane state and its SHA-256 digest. The public evidence may publish only the source Git SHA, checkpoint revision, snapshot digest, sanitized object counts, timestamp and PASS/FAIL.

The first managed authority startup must commit revision 1 only after the supplied bootstrap digest verifies. Once the managed checkpoint exists, subsequent restarts load the managed checkpoint and must not reuse bootstrap input.

No guessed, empty or synthetic snapshot is permitted for production migration.

## Relay/provider cutover gate

Cutover is accepted only after:

1. the private authority service reports ready against the managed checkpoint;
2. relay bootstrap fetches and verifies the first managed authority snapshot;
3. managed provider modes reserve through the authority before remote execution;
4. the relay/provider negative path fails closed when authority state is unavailable or stale;
5. there is no fallback from ambiguous managed entitlement/accounting to owner-funded execution.

The cutover must record the exact deployed source SHA and checkpoint revision/digest without publishing private topology.

## Isolated PITR restore gate

Point-in-time recovery must restore into an isolated recovery account/context. It must never overwrite or mutate the live source account in order to prove backup validity.

The restored checkpoint is accepted only if:

- the restore operation completes within the applicable recovery objective;
- the restored checkpoint document validates;
- the embedded authority state digest matches;
- the restored revision/recovery point is within the declared RPO;
- known corrupt/stale/revoked material is rejected;
- the negative authorization/accounting path remains fail-closed.

After the drill, the isolated restore target may be removed only after sanitized evidence has been persisted.

## Nine live recovery drills

The canonical scenarios and objectives remain defined by `operations/recovery-dr.js` and `docs/operations/RECOVERY_DR.md`:

1. instance loss;
2. regional failure;
3. durable-state corruption;
4. identity/key loss;
5. semantic-index corruption;
6. provider outage;
7. relay outage;
8. artifact-store outage;
9. entitlement/accounting outage.

Each live drill must execute the existing ordered lifecycle:

```text
declare -> contain -> restore -> revalidate -> resume -> audit
```

No phase may be skipped. The existing validator enforces the scenario's RTO/RPO and required positive/negative revalidation flags.

## Closure definition

The production persistence / backup / DR layer is closed only when both categories are complete:

**Repository/deployment contract:** exact-head DCO, complete CI/package/conformance regression suite, `git diff --check`, hosted CodeQL, zero unresolved review threads, `behind=0`, expected-head merge, then exact merged-main CI and CodeQL.

**Live production evidence:** foundation apply PASS, real state migration PASS, private authority deployment PASS, relay/provider cutover PASS, isolated PITR restore PASS and all nine live recovery scenarios PASS within their numerical RTO/RPO and integrity/security-negative gates.

A configured backup that has not been restored is not accepted DR evidence.
