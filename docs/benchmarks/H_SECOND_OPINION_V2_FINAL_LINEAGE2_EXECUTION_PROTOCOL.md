# H-Series SECOND-OPINION v2 — Final Lineage 2 Execution Protocol

Status: **PROSPECTIVELY FROZEN BEFORE ANY LINEAGE-2 PROVIDER CALL**

Date: 2026-09-25

## Scope

This protocol governs a new hidden-final lineage for `H-SECOND-OPINION-V2` after two infrastructure-only aborts of the prior hidden-final lineage. It does not change the frozen scientific claim, trust calibration, frozen single-model baselines, primary policy, statistical method, Gate A/B/C thresholds, Gate D cost cap, or the validation evidence.

The predecessor hidden-final lineage is not a statistical PASS or FAIL. It is invalidated for headline hidden-final use because partial execution artifacts exposed a subset of its hidden items/results after infrastructure aborts.

## Immutable scientific inheritance

The lineage inherits the already-frozen SECOND v2 scientific contract:

- primary policy: `TRUST_WEIGHTED`, `k=5`;
- Gate A: positive item-paired 95% CI lower bounds versus all three frozen single-model comparators;
- Gate B: positive item-paired 95% CI lower bound for trust lift over ordinary majority voting on the disagreement subset;
- Gate C: item-paired 95% CI lower bound >= `-0.02` versus majority on the full sample;
- Gate D maximum cost: `$50`;
- hidden-final size: `200` items, seven provider arms each, `1400` base logical provider calls;
- frozen final K5 p95 latency envelope: `29019 ms`;
- bootstrap iterations: `10000` with the previously frozen bootstrap seed.

No partial predecessor result may be used to modify these values.

## New hidden lineage commitments

Only commitments are public; seed and gold material remain private until safe disclosure.

- lineage ID: `second-v2-hidden-final-20260925-l2`
- seed commitment: `sha256:0697cbdbb3fb699b3ae48610636bb6e2f427da25beb1279321256f54ce4ce3c7`
- public dataset digest: `sha256:a201c2519a3d4a5a13bf9481d731858a0ec4887ee3bc6697eb02d596b37ca081`
- gold digest: `sha256:63c6b3c0458948f27b62a34a2c805e998d73544dbfa09f38f938583501fcdd9c`
- canonical content-set digest: `sha256:1d3851e925d238fe1ce8dc0f7c736481953e828e42acc7df345a85ab43906d40`
- ID namespace: `holdout-l2`

Before any measured provider request, private qualification MUST prove:

- 200 unique lineage-2 item IDs;
- zero item-ID overlap with the prior SECOND v2 hidden holdout;
- zero canonical `(stratum,prompt,gold)` overlap with validation;
- zero canonical `(stratum,prompt,gold)` overlap with the prior SECOND v2 hidden holdout, including both partial-final attempts;
- zero canonical `(stratum,prompt,gold)` overlap with the original HS12 SECOND v1 holdout.

## Frozen transport-resilience protocol

All seven provider adapters MUST use one common retry/error-classification engine. Provider-specific code may define endpoint/auth/capacity policy, but may not bypass common transient-transport handling.

### Per-attempt timeout

Validation-only latency evidence is the sole empirical basis for the timeout freeze:

- immutable validation K5 p95: `23215 ms`;
- prospective timeout rule: `max(60000 ms, ceil(2.5 * validation K5 p95))`;
- resulting per-network-attempt timeout: **`60000 ms`**.

No predecessor hidden-final latency observation is used in this timeout value.

### Retryable HTTP responses

`408`, `409`, `429`, `500`, `502`, `503`, `504`.

`429` MUST respect provider retry/reset headers when present, subject to the frozen bounded wait policy. Other retryable HTTP responses use bounded exponential backoff.

### Retryable transport exceptions

The common classifier MUST retry transient transport failures including:

- `UND_ERR_HEADERS_TIMEOUT`;
- `UND_ERR_CONNECT_TIMEOUT`;
- `UND_ERR_BODY_TIMEOUT`;
- `UND_ERR_SOCKET`;
- `ETIMEDOUT`;
- `ECONNRESET`;
- `EPIPE`;
- `EAI_AGAIN`;
- the protocol-owned per-attempt `TimeoutError`.

Authentication/authorization failures, deterministic request/schema failures and ordinary non-retryable `4xx` responses MUST fail closed.

### Frozen retry budgets

- GPT: max `6` transport attempts per logical call;
- Grok: max `8` transport attempts per logical call, preserving the existing adaptive capacity scheduler;
- Gemini, DeepSeek, Llama, Mistral, Kimi: max `5` transport attempts per logical call;
- maximum retry/reset wait used by an individual retry decision: `240000 ms`;
- generic transient-transport backoff: starts at `1000 ms`, exponential, capped at `10000 ms`;
- HTTP 5xx/408/409 short backoff: starts at `500 ms`.

A retry never creates a second logical benchmark sample. Logical provider-call count and physical HTTP-attempt count MUST remain separate.

## Evidence requirements

Every physical transport attempt MUST emit append-only transport evidence containing at least:

- logical call ID;
- provider alias;
- attempt number/max attempts;
- event class (`attempt`, `http_retry`, `transport_retry`, `success`, `terminal`);
- HTTP status when available;
- classified nested exception name/code when applicable;
- retry delay and elapsed time when applicable.

Failure artifacts MUST preserve the nested cause chain. A top-level `TypeError: fetch failed` without its underlying transport cause is insufficient evidence.

## Atomic-final policy and single-run resilience qualification

Lineage 2 remains an atomic final measurement: partial results are not eligible for Gates and may not be combined across attempts.

Instead of introducing cross-run resume semantics after observing predecessor partial results, this lineage requires a zero-paid synthetic fault-injection qualification before dispatch. The exact candidate MUST demonstrate completion of a 1400-logical-call synthetic schedule while injecting representative retryable HTTP and transport failures across all seven provider aliases, while preserving exactly one logical sample per benchmark arm.

If bounded retries are exhausted during the real final, the terminal classification is `INCOMPLETE_INFRA / NOT_EVALUATED`; no statistical PASS/FAIL may be computed from the partial artifact.

## Dispatch contract

Before the single measured hidden-final run:

1. exact private candidate SHA qualification must be GREEN;
2. Admission-to-current-main must be GREEN;
3. the seven-provider zero-paid synthetic fault-injection suite must be GREEN;
4. the predecessor lineages and attempts must be immutably recorded as non-statistical infrastructure outcomes;
5. duplicate-history and material shared-capacity guards must be GREEN;
6. only one versioned lineage-2 arm token may dispatch the final.

Any measured-request start consumes that exact candidate for lineage 2. No exact-candidate rerun is permitted after a measured provider call begins.
