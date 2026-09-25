# H-Series SECOND-OPINION v2 — Final Lineage 3 Execution Protocol

Status: **PROSPECTIVELY FROZEN BEFORE ANY LINEAGE-3 PROVIDER CALL**

Date: 2026-09-25

## Scope

Lineage 3 is a new hidden-final lineage for `H-SECOND-OPINION-V2` after Lineage 2 terminated as `INCOMPLETE_INFRA / NOT_EVALUATED` because a short-lived Vertex credential expired during a long-running measured job. This protocol changes execution/authentication resilience only. It does not change the frozen scientific claim, trust calibration, provider set, frozen single-model baselines, primary policy, statistical method, Gate A/B/C thresholds, Gate D cost cap, validation evidence, bootstrap seed, or final latency envelope.

## Immutable scientific inheritance

- primary policy: `TRUST_WEIGHTED`, `k=5`;
- Gate A: positive item-paired 95% CI lower bounds versus all three frozen single-model comparators;
- Gate B: positive item-paired 95% CI lower bound for trust lift over ordinary majority voting on the disagreement subset;
- Gate C: item-paired 95% CI lower bound >= `-0.02` versus majority on the full sample;
- Gate D maximum cost: `$50`;
- hidden-final size: `200` items, seven provider arms each, `1400` base logical provider calls;
- frozen final K5 p95 latency envelope: `29019 ms`;
- bootstrap iterations: `10000` with the previously frozen bootstrap seed.

No partial predecessor evidence may be used to alter these values.

## New hidden lineage commitments

Only commitments are public. Seed material and gold remain private until safe disclosure.

- lineage ID: `second-v2-hidden-final-20260925-l3`
- ID namespace: `holdout-l3`
- seed commitment: `sha256:a35833ba143258c5cff0c58235b037724993bf024b6eabe7fb50ab820a5d23b7`
- public dataset digest: `sha256:69073617ae3069564da2a8fab5158ee27cba798729866d6e21de364e690bd01a`
- gold digest: `sha256:c320f21d0dbcf8602026cbf6676557f501dab745526a93d48f49dd7725b2720c`
- canonical content-set digest: `sha256:500ee27d2404641d4eb5525c43f62da4bead1fd6324511e032c00af4084e33c9`

Before any measured request, exact-candidate qualification MUST prove 200 unique Lineage-3 IDs and zero canonical `(stratum,prompt,gold)` overlap with SECOND v2 validation, the original v2 holdout, Lineage 2, and the original HS12 SECOND v1 holdout. Lineage-3 item IDs must not overlap any earlier hidden-final lineage.

## Frozen transport resilience

Lineage 3 inherits Lineage 2's common transport layer unchanged:

- per-attempt timeout: `60000 ms`, derived from validation-only K5 p95;
- retryable HTTP statuses: `408`, `409`, `429`, `500`, `502`, `503`, `504`;
- retryable transport classes include Undici headers/connect/body/socket timeouts, `ETIMEDOUT`, `ECONNRESET`, `EPIPE`, `EAI_AGAIN`, and the protocol-owned timeout;
- max attempts: GPT `6`, Grok `8`, Gemini/DeepSeek/Llama/Mistral/Kimi `5`;
- one retry decision may wait at most `240000 ms`;
- transport backoff and Grok adaptive capacity scheduling remain frozen;
- logical provider calls and physical HTTP attempts remain separate counters.

## Frozen credential-lifecycle resilience

All provider calls MUST obtain credentials through a common credential manager before entering the transport layer.

### Credential groups

- `google`: Vertex Gemini; refreshed from the job's Workload Identity Federation / Application Default Credentials context;
- `azure-cognitive`: GPT and all Azure Foundry provider aliases; refreshed from the authenticated Azure job context.

No long-running provider adapter may rely exclusively on a credential captured once at job start.

### Proactive refresh

The credential manager uses a frozen nominal credential lifetime of `3600000 ms` and a safety margin of `300000 ms`. A credential MUST be refreshed before a provider request when its remaining nominal lifetime is at or below the safety margin.

Initial acquisition is not counted as a refresh. Proactive refresh is counted separately from logical provider calls and physical provider HTTP attempts.

### Reactive refresh

A logical provider call may perform at most one forced credential refresh when the provider response is strictly classified as credential expiry.

For Google, reactive refresh is permitted only for HTTP `401` with structured error reason `ACCESS_TOKEN_EXPIRED`.

For Azure, reactive refresh is permitted only for HTTP `401` carrying an explicitly recognized expired-token marker. Generic `401`, invalid-principal, missing-permission, and `403` responses MUST remain terminal and MUST NOT be converted into retryable authentication failures.

After a forced refresh, the exact same logical provider call is retried. The retry MUST NOT increment the logical provider-call count; physical HTTP-attempt accounting continues normally. A second expiry response after the one allowed reactive refresh is terminal `INCOMPLETE_INFRA`.

### Refresh failure semantics

Failure to acquire or refresh a credential is infrastructure failure. It must produce durable redacted evidence, must not expose credential material, and must result in `INCOMPLETE_INFRA / NOT_EVALUATED` if the measured final cannot complete.

## Credential telemetry

Append-only credential telemetry MUST record only non-secret metadata:

- logical call ID and credential group;
- acquisition/refresh event class;
- proactive versus reactive reason;
- refresh count;
- nominal expiry timestamp or remaining lifetime when known;
- success/failure classification;
- elapsed time.

Tokens and credential-file contents MUST never be written to artifacts or logs.

## Required zero-paid auth fault injection

Before dispatch, the exact candidate MUST prove all of the following without measured provider calls:

1. valid cached credential -> request succeeds without refresh;
2. proactively expired/near-expiry Google credential -> one refresh -> request succeeds;
3. Google `401 ACCESS_TOKEN_EXPIRED` -> exactly one forced refresh -> retry of the same logical call succeeds;
4. Google permission/auth failures that are not `ACCESS_TOKEN_EXPIRED` -> terminal, no refresh;
5. `403` IAM denial -> terminal, no refresh;
6. credential refresh failure -> clean `INCOMPLETE_INFRA`-classifiable error;
7. repeated expiry after the one allowed reactive refresh -> terminal;
8. invariant for the reactive-success case: `logicalProviderCalls=1`, `credentialRefreshes=1`, `providerHttpAttempts=2`.

The existing 1400-logical-call seven-provider synthetic transport schedule remains mandatory in the same qualification.

## Evidence and atomic final semantics

The final remains atomic for scientific evaluation. Partial results are not eligible for Gates and may not be combined across attempts. Durable progress may be retained for forensic purposes only.

If transport or credential-lifecycle recovery budgets are exhausted, the result is `INCOMPLETE_INFRA / NOT_EVALUATED`, never scientific FAIL.

## Dispatch contract

Before the single measured Lineage-3 run:

1. Lineage 2 terminal closure and immutable evidence must be committed;
2. exact private candidate SHA qualification must be GREEN;
3. Admission-to-current-main must be GREEN;
4. Lineage-3 disjointness/commitment checks must be GREEN;
5. seven-provider 1400-call synthetic transport qualification must be GREEN;
6. credential fault-injection qualification must be GREEN;
7. duplicate-history and material shared-capacity guards must be GREEN;
8. exactly one versioned Lineage-3 arm may dispatch the measured final.

Any measured request consumes that exact Lineage-3 candidate. Exact-candidate rerun is forbidden.
