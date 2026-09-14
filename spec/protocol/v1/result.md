# TRUYN/1 RESULT

**Status:** release-candidate normative contract for the bounded Open 1.0 core profile. Overall TRUYN/1 remains pre-stable until exact-head and post-merge qualification pass.

`RESULT` is the signed terminal provider output for one accepted bounded `NEED` request. A RESULT can carry inline output and, where the selected capability/reference contract permits it, references to content-addressed objects or artifacts.

## Bounded payload

The canonical public client emits:

```json
{
  "requestId": "<original NEED envelope id>",
  "output": null,
  "completedAt": "<RFC3339 / ISO-8601 timestamp>",
  "metadata": { }
}
```

Requirements:

- `requestId` MUST be a non-empty identifier of an existing accepted logical request;
- the signed RESULT envelope `from` MUST be the provider identity selected/authorized for that request;
- `completedAt` MUST be a parseable completion timestamp;
- `output` MAY be any JSON-compatible value allowed by the selected capability contract;
- `metadata` is OPTIONAL and, when present, MUST be a JSON object;
- the RESULT signature covers the complete bounded envelope under the TCJ1/Ed25519 contract;
- a RESULT for an unknown, foreign-provider, cancelled, already-terminal or otherwise ineligible request MUST fail closed before requester delivery/state mutation;
- at most one terminal RESULT may commit the logical request. Replaying the same or another RESULT for an already-terminal request MUST NOT create a second requester delivery, accounting mutation or provider-side effect.

PARTIAL records, where supported, are non-terminal lifecycle records. The terminal RESULT follows the accepted PARTIAL sequence and closes the request lifecycle.

## Usage and billing attribution

Where a provider exposes usage information, RESULT metadata may include normalized usage data such as input/output/total tokens, provider-native units, artifact bytes, latency or a safe provider request identifier.

Billing/authorization state used to permit execution is authoritative server/provider policy state. A RESULT can report attribution, but it does not retroactively authorize the request that produced it.

Raw provider credentials, cloud secrets and private authorization tokens MUST NOT be embedded in a RESULT. Public evidence SHOULD avoid exposing unnecessary private operational identifiers even when a private/internal audit record retains them.

## Trust distinction

A signed RESULT proves attribution/integrity of the result record, not factual truth. Claims within or behind a result are evaluated separately through Trustability.

Authorization and Trustability are distinct: authorization answers whether the provider may be used; Trustability helps decide how much the returned information should be relied upon.

## Stable-v1 acceptance

Stable qualification requires executable correlation, provider-ownership, replay/duplicate-terminal, cancellation/late-result and signature/integrity regressions for the bounded RESULT path.
