# H-Series SECOND-OPINION v2 — Final Lineage 3 Execution Protocol

Status: **PROSPECTIVELY FROZEN BEFORE ANY LINEAGE-3 PROVIDER CALL**  
Date: **2026-09-25**

## Why Lineage 3 exists

Lineage 2 run `36165951631` terminated as `INCOMPLETE_INFRA / NOT_EVALUATED` after 140 complete items because the Google Vertex OAuth access token expired during the long-running benchmark. Artifact `10881136706` contains partial telemetry and therefore Lineage 2 is invalidated for headline hidden-final use. No Gate A/B/C/D result is inferred from that partial evidence.

This successor changes only execution/authentication resilience and the untouched hidden sample. It does **not** change trust calibration, frozen baselines, provider set, primary policy, bootstrap method/seed, Gate A/B/C/D acceptance, the `-0.02` non-inferiority margin, the `$50` cost cap, or the `29019 ms` final K5 p95 latency envelope.

## New hidden commitments

Only commitments are public. Seed and gold material remain private until safe disclosure.

- lineage ID: `second-v2-hidden-final-20260925-l3`
- ID namespace: `holdout-l3`
- expected hidden items: `200`
- expected base logical provider calls: `1400`
- seed commitment: `sha256:2c4b9b04c30f6c7cd99c3f8cb17599a7ab59e391a5959fe5a9d29604f9e0eed8`
- public dataset digest: `sha256:5deee6d19f32e110c9a23d7f1690053cb784e2361752e2e9acb127b33e3648d0`
- gold digest: `sha256:a7c822b6c0cc05ce492ef94b8421e82c8403c480d94625228d56eb1883e343af`
- canonical content-set digest: `sha256:1aa791bfd8fdd8ca9f9802efcd8a8754eb1b7fa17afdd9763f82a63d672e433e`

Exact-candidate qualification must prove zero canonical `(stratum,prompt,gold)` overlap with:

1. SECOND v2 validation;
2. the original SECOND v2 hidden holdout;
3. Lineage 2;
4. the original HS12 SECOND v1 holdout.

It must also prove zero item-ID overlap with prior SECOND v2 hidden namespaces.

## Credential-resilience layer

Every measured provider request must pass through a common credential manager before the common resilient transport layer:

```text
logicalProviderCall
        ↓
credential manager
        ↓
resilient transport
        ↓
provider
```

Credential refresh is an execution retry, never a second logical benchmark sample.

### Proactive refresh

The execution protocol freezes a maximum credential age of **45 minutes (`2700000 ms`)** for long-running final execution. Before a provider request, the manager refreshes the relevant credential if its age is at or above that bound.

Credential classes:

- Google Vertex: Google workload-identity/Application Default Credentials refresh source;
- Azure OpenAI / Azure Foundry: Azure login refresh source for the Cognitive Services resource.

### Reactive refresh

A reactive refresh is allowed **at most once per logical provider call**, and only when a provider-specific classifier identifies an explicit token-expiry condition.

For Google Vertex, the permitted reactive condition is:

- HTTP `401` with Google `ErrorInfo.reason == ACCESS_TOKEN_EXPIRED`.

Ordinary `401`, `403`, `PERMISSION_DENIED`, invalid principal, IAM denial, malformed request and schema errors are terminal and must not be converted into retries.

After one forced refresh, the exact same logical call may be retried through the common resilient transport. A repeated auth-expiry response after refresh is terminal `INCOMPLETE_INFRA / NOT_EVALUATED`.

## Accounting invariants

For a token-expiry recovery such as:

```text
request → 401 ACCESS_TOKEN_EXPIRED → refresh → request → 200
```

the required accounting is:

```text
logicalProviderCalls = 1
credentialRefreshes = 1
HTTP attempts = 2
```

Credential telemetry must be append-only and must record credential key/provider, proactive/reactive reason, refresh sequence, logical call ID when reactive, and success/failure without recording token material.

## Transport inheritance

Lineage 3 inherits the frozen Lineage 2 common transport-resilience policy:

- per-attempt timeout `60000 ms`, derived from validation-only latency evidence;
- HTTP retries for `408/409/429/500/502/503/504`;
- transient exception retries including Undici headers/connect/body/socket timeouts, `ETIMEDOUT`, `ECONNRESET`, `EPIPE`, `EAI_AGAIN` and protocol `TimeoutError`;
- GPT max 6 attempts, Grok max 8, all other providers max 5;
- Grok adaptive capacity scheduler remains enabled;
- logical provider calls and physical HTTP attempts remain separate.

## Mandatory zero-paid auth fault injection

Before any Lineage 3 measured request, the exact candidate must prove at least:

- valid token → `200` without refresh;
- proactively stale Google credential → refresh → `200`;
- Google `401 ACCESS_TOKEN_EXPIRED` → exactly one refresh → retry same logical call → `200`;
- `401 PERMISSION_DENIED`/non-expiry auth failure → terminal;
- `403` IAM denial → terminal;
- refresh-source failure → `INCOMPLETE_INFRA` classification path;
- repeated `401 ACCESS_TOKEN_EXPIRED` after forced refresh → terminal;
- logical-call invariant remains `1` while physical attempts and credential refresh counts increase independently.

The existing seven-provider 1400-logical-call synthetic transport schedule remains mandatory.

## Atomic final and failure semantics

Lineage 3 remains one atomic scientific final. Cross-run partial-result combination is forbidden. On any incomplete infrastructure/auth outcome:

- statistical classification is `NOT_EVALUATED`;
- partial evidence is not eligible for Gates;
- the consumed exact candidate is not rerun;
- a further successor requires a new versioned lineage and untouched hidden sample.

## Dispatch contract

Before the one measured Lineage 3 final:

1. this public protocol and commitments must already be immutable in public Git history;
2. private seed/gold commitments must reproduce exactly;
3. predecessor Lineage 2 must be terminally recorded as `INVALIDATED_BY_INFRASTRUCTURE_EXPOSURE / NOT_EVALUATED`;
4. credential fault-injection qualification must be GREEN with zero paid calls;
5. seven-provider 1400-call synthetic transport qualification must be GREEN with zero paid calls;
6. exact private candidate qualification and Admission-to-current-main must be GREEN;
7. duplicate-history and material shared-capacity guards must be GREEN;
8. exactly one versioned Lineage 3 arm may dispatch the measured final.
