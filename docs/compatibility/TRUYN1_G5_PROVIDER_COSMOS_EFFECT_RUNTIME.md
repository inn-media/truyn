# G5 provider-side distributed effect intent: opt-in runtime

**Status:** candidate. NOT G5 production qualification. See #990 and the prerequisite Cosmos ledger PR #1010.

The production provider process can independently enable a shared multi-host **effect intent fence**, using the public Cosmos implementation and existing Container Apps managed identity. It must never be treated as proof of exactly-once remote provider charging.

## Explicit operator configuration

```ini
TRUYN_G5_PROVIDER_EFFECT_LEDGER=cosmos
TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE=1
TRUYN_G5_COSMOS_ENDPOINT=https://<name>.documents.azure.com
TRUYN_G5_COSMOS_DATABASE=<database>
TRUYN_G5_COSMOS_CONTAINER=<container>
IDENTITY_ENDPOINT=<Container Apps injected local endpoint>
IDENTITY_HEADER=<Container Apps injected identity token>
AZURE_CLIENT_ID=<optional user-assigned identity client id>
```

The runtime requests an Entra data-plane token for `https://cosmos.azure.com/`. Cosmos account keys and connection strings are not supported. The Cosmos container partition key must be `/partitionKey`. No cloud resources are created or modified by enabling code in a repository branch.

With `TRUYN_G5_PROVIDER_EFFECT_LEDGER=off` or absent, existing providers are unchanged. When `TRUYN_G5_REQUIRE_PROVIDER_EFFECT_FENCE=1` is set, an absent effect store prevents provider startup. Bad backend configuration fails before serving. A remote 429, partition or loss of Cosmos connectivity rejects the effect reservation before the first provider adapter invocation; it cannot fall back to an in-memory fence.

## Invariants, caveats

The same async effect ledger is passed to `TruynAdapterHost` for both `executeNeed` and `runOnce`. At-most-one **invocation** follows only if all provider replicas use the same Cosmos database/container and all supported paths route through that host. Ambiguous outcomes remain `started` or `unknown`, and automatic retries must not execute another paid side effect.

This does NOT enable cross-host relay NEED reservation: `createRelay()` still uses synchronous ledger calls. It also does not install a provider-side idempotency key or a verified receipt lookup, so there is no claim of exactly-once paid external side effects or automatic settlement. Do not enable public G5 admission until the remaining #990 acceptance gates and independent live Azure crash/partition proof are green.

## External effect evidence boundary

The Azure OpenAI Responses adapter currently creates requests with `store: false`; such requests cannot be assumed retrievable by response ID after an ambiguous timeout. Neither an HTTP request ID nor an effect-intent row proves that a provider executed or billed exactly once. Until each real provider implements a verified idempotency contract or receipt reconciliation, a lost response stays `unknown` and must not be automatically retried, charged as finalized, or represented as a successful G5 paid-effect proof. Tests in `tests/g5-cosmos-provider-once.test.js` count calls to a **mock** remote adapter and do not substitute for externally issued paid-provider receipts.
