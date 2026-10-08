# T/BREAK-EVEN-REAL-BENCHMARK — Diagnostic methodology v1

Status: **FOUNDATION ONLY / NOT EXECUTED / NO PAID INFERENCE ARMED**.
Independent T-series subtest; not a rerun, replacement, or change to accepted T/BREAK-EVEN evidence or TS8 negative result.

## Question
Identify whether the LARGE delay after a high-token DIRECT request is caused by Azure 429/Retry-After/retry sleep, server-side queue/TTFB, local HTTP pool/connection establishment, or actual TRUYN non-provider overhead. Keep semantics, model, inputs, outputs, accuracy checks, provenance and pricing comparable to the frozen source. Existing TS7 evidence remains immutable.

## Five diagnostic strata
- A: TRUYN → TRUYN → TRUYN (baseline).
- B: DIRECT → TRUYN (transition).
- C: DIRECT → DIRECT (non-TRUYN negative control).
- D: DIRECT → pause {0,2,5,10,15}s → TRUYN (refill curve); wall-clock pause excluded from request latency and reported separately.
- E: synchronized DIRECT || TRUYN on **independent connections**; measure both request intervals and queue pressure, not simply promise provider independence.

Use balanced seeded randomized sequences and counterbalanced orders where applicable; isolate/label warmups, record predecessor for *every* physical call, and distinguish within-pair from cross-pair transitions. Prevent carryover confounding by recording elapsed since preceding request and stratifying results accordingly. No repeated selection of attractive outcomes. Initial diagnostic sample size and budget must be frozen prior to paid execution; do not infer p99/causality from a tiny pilot.

## Mandatory attempt-level telemetry
For each physical HTTP attempt: UTC providerRequestStartedAt/providerRequestEndedAt, monotonic start/end/duration, attemptNumber, HTTP status, Retry-After raw and parsed value, x-request-id and provider response id (safe/redacted), response headers relevant to Azure throttling (sanitized), TTFB, DNS/connect/TLS, socket reused, local pool wait, request upload, response read and JSON parse. Use null+availabilityReason when Node fetch transport cannot expose DNS/TCP/TLS/pool timing; **never emit fabricated zeros**. Define TTFB precisely (request start→response headers and optionally socket write→first byte when observable). A default undici fetch does not by itself provide exact phase timings: qualified instrumentation/diagnostics or trace-capable transport must validate event association, without altering retries, pacing, or HTTP payload.

Per logical request: logicalLatencyMs, providerAttemptLatencyMs[], retrySleepMs[], providerLatencyMs, retrievalMs, truynNonProviderOverheadMs (measured by explicit boundaries, not assumed subtraction), full stage durations, firstArm, predecessor arm/tokens/time delta, input/cached/output tokens, per-arm accurate answer/provenance, response body bytes, provider request IDs and attributable cost. Preserve all retry attempts and waits; distinguish server 429, locally thrown network exceptions, timeout and 5xx.

## Reconciliation
Recompute from raw events: request count, physical attempt count, retry count and status distribution, exact sum of stage durations, transition matrix, conditional latency by preceding arm and cached token bands, pause-to-recovery curve, simultaneous-arm latency paired distribution, quality, accuracy, provider gross spend, and evidence completeness. Reject unpaired, missing or inconsistent spans; emit NOT_OBSERVABLE rather than guessing server queue from TTFB alone. A long TTFB only locates latency after dispatch; Azure internal queue requires Azure diagnostic correlation. Correlation does not itself prove token-bucket causation.

## Boundaries
Public repo owns sanitized methodology/schema/conformance; private repo owns Azure identities, runner, secrets, cost limits, attempt control and raw evidence. Append-only evidence; redact-not-delete. No legacy paid dispatch, no modification to existing TS7 or TS8 runners, no automatic paid workflow trigger; Attempt 1 is single-shot only after a separately authorized, frozen candidate, zero-paid qualification, duplicate guard and budget admission.
