# T/BREAK-EVEN-REAL-BENCHMARK — Diagnostic methodology v1

Historical design-time status (before execution): **FOUNDATION ONLY / NOT EXECUTED / NO PAID INFERENCE ARMED**.

**2026-10-10 outcome update:** A separately versioned real paid Attempt 6 has now completed with independent audit **PASS** (57/57 HTTP 200, 57/57 exact-answer, A–E complete). Its verified accepted measurements, qualifications, methodological differences, and limits are recorded in [T_BREAK_EVEN_REAL_ATTEMPT6_ACCEPTED_RESULTS.md](./T_BREAK_EVEN_REAL_ATTEMPT6_ACCEPTED_RESULTS.md). The frozen historical methodology remains unchanged; this update does not retroactively reclassify Attempts 1–5 or assert dollar break-even.
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

## Diagnostic execution policy, revision 2 (2026-10-08)

One Attempt 1 invocation includes all strata A–E. Preserve **causal sequences** within A/B/C/D; parallelizing sequential predecessor-sensitive calls would invalidate the hypothesis. Run independent preparation and post-run validation concurrently when they do not share cost/identity resources. E launches two provider arms concurrently through distinct keep-alive HTTPS connection pools; verify actual sockets/connection IDs rather than assuming Promise concurrency means independent connections.

Every per-attempt event is appended when observed, including HTTP 429, sleeps and network failures. Record status or null with a reason on unavailable socket phases. Distinguish time to HTTP response headers from first response body byte. Do not log Authorization, prompt body or secrets. A failed request must not cancel independent strata; paired E uses allSettled semantics. An authorization breach, hard quota exhaustion or resource-safety violation stops **new** paid attempts but permits finalization of collected evidence. The physical-attempt cap must be checked *before each retry*, not once per logical request. A fiscal USD budget also requires conservative worst-case token/price validation before paid admission; metered-token observations alone cannot provide an upfront hard USD cap.

No concurrent background load should contaminate sequential arm-order analysis. Preserve exact ordered call events, previous successful/failed arm, cooldown duration and wall-clock gaps; label preceding failures rather than silently implying successful DIRECT. Checkpoint append-only samples/attempts throughout the run and produce terminal summary independently of individual failures. If an interruption prevents summary creation, artifacts must include recoverable append-only journal and classify as INCOMPLETE. Do not make a causal Azure server queue claim solely from high TTFB without Azure-side request correlation.

**Readiness:** methodology update does not authorize launch. Private credential, immutable SHA, diagnostic transport validation, independent E socket proof, frozen real max logical + physical HTTP calls + token/cost caps, exactly-once identity and zero-paid CI are mandatory before READY.
