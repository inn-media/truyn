# G5 relay runtime shared-ledger opt-in

**Status:** integration candidate; G5 issue #990 remains OPEN.

The `runtime/service.js` relay entrypoint supports an explicit shared Cosmos lifecycle ledger, separately from the already integrated provider-side effect intent ledger.

## Enable only after Cosmos safety verification

```ini
TRUYN_G5_RELAY_LIFECYCLE_LEDGER=cosmos
TRUYN_G5_REQUIRE_RELAY_LIFECYCLE_LEDGER=1
TRUYN_G5_COSMOS_ENDPOINT=https://<name>.documents.azure.com
TRUYN_G5_COSMOS_DATABASE=<database>
TRUYN_G5_COSMOS_CONTAINER=<container>
IDENTITY_ENDPOINT=<Container Apps injected loopback endpoint>
IDENTITY_HEADER=<Container Apps injected identity header>
```

The Cosmos database/container must use partition key `/partitionKey` and a correctly scoped Entra managed identity data contributor. No account keys, connection strings, external identity endpoint or local SQLite WAL are supported by this runtime selector. It is **off by default** to preserve historical deployments.

If `REQUIRE=1` is specified without `cosmos`, startup fails. With Cosmos selected, runtime performs a read-only authenticated container-metadata GET (requiring the exact `/partitionKey` hash schema), then a direct sentinel document GET before binding any listener; missing container, authorization/transport and partition-schema errors fail closed and do not silently downgrade to an in-memory or single-host ledger. This smoke proves only basic data-plane reachability. It does not prove cross-region write guarantees or safe multi-host failover.

The same Cosmos ledger is supplied to all direct relay paths. It does not automatically enable provider-side effect intent: each provider must independently use `TRUYN_G5_PROVIDER_EFFECT_LEDGER=cosmos` and require the shared fence, pointing to the approved authority. This integration does not deploy resources or change live traffic.

## Still missing for G5 PASS

Real Azure multi-host crash/partition and Cosmos write failover with bounded replay/retention, global signed OFFER namespace authority, verified provider external idempotency/receipt and accounting reconciliation, SDK end-to-end consumer ACK under real failover, immutable counts and postmerge exact-main qualification. All existing release/public-private restrictions still apply.
