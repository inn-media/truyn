# TRUYN/1 PARTIAL Lifecycle Record

**Status:** release-candidate normative contract for the bounded Open 1.0 direct streaming lifecycle. `PARTIAL` is not promoted into the top-level `MVP_TYPES` envelope vocabulary; it is a signed compact lifecycle record correlated to one accepted direct NEED.

## Scope

PARTIAL provides generic incremental output without inventing provider-specific token semantics. In the bounded profile it is available only for supported direct/compact NEED execution paths; chain-stage cancellation/streaming is outside this core contract unless separately negotiated.

A signed compact PARTIAL frame is correlated by its compact request ID to the original NEED. Its payload is:

```json
{
  "sequence": 0,
  "delta": null,
  "metadata": { }
}
```

Requirements:

- `sequence` MUST be a non-negative safe integer;
- the first accepted PARTIAL sequence is `0`;
- each new accepted PARTIAL increments the expected sequence by exactly one;
- a sequence gap, future sequence or conflicting duplicate MUST be rejected without advancing lifecycle state;
- an identical retry of an already accepted sequence MAY return the already committed idempotent outcome but MUST NOT enqueue/deliver the same logical partial a second time;
- `delta` carries the application/provider incremental value and MUST be present for a claimed PARTIAL record;
- `metadata` is optional bounded JSON metadata and MUST NOT contain credentials/authority secrets;
- the PARTIAL must be signed by the provider identity selected for the correlated request;
- a foreign provider, unknown request, cancelled request or already-terminal request MUST NOT append a PARTIAL;
- accepted partials remain ordered before the single terminal RESULT;
- backpressure rejection MUST NOT advance the expected sequence.

## Correlation and authority

PARTIAL correlation is lifecycle state, not authorization. The relay/runtime verifies the provider/request binding before accepting the record. Requester-controlled or bridge-controlled metadata cannot replace that binding.

A compatibility bridge that cannot preserve ordering, correlation, idempotency and terminal semantics MUST report the mapping as unsupported/lossy rather than fabricating a PARTIAL stream.

## Stable-v1 acceptance

Stable qualification requires executable tests for zero-based ordering, sequence mismatch, identical retry idempotency, conflicting duplicate rejection, provider mismatch, backpressure without sequence advance, cancellation/terminal suppression and ordered RESULT completion.
