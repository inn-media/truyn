# TRUYN/1 NEED

**Status:** release-candidate normative contract for the bounded Open 1.0 core profile. Overall TRUYN/1 remains pre-stable until exact-head and post-merge qualification pass.

`NEED` expresses a request for a named capability without requiring a predetermined provider. The signed envelope `id` is the canonical request/correlation identifier for the bounded core path.

## Bounded payload

The bounded Open 1.0 core NEED payload is:

```json
{
  "capability": { "name": "<non-empty capability name>" },
  "input": { },
  "policy": { }
}
```

Requirements:

- `capability` MUST resolve to one non-empty capability name; the canonical public client emits `capability.name`;
- `input` is application/provider input and MAY be any JSON-compatible value allowed by the selected capability contract; it does not grant protocol authority;
- `policy` is OPTIONAL decision context and, when present, MUST be a JSON object;
- the signed envelope `from` plus the authenticated transport/session identity determine the requester identity for the public relay path;
- the envelope `id` identifies the logical request and is used for correlation, replay/idempotency, RESULT matching and bounded NEED cancellation;
- a requester MUST NOT obtain a second provider-side side effect merely by replaying the same accepted logical NEED through a retry, alternate transport or compatibility bridge.

A request MAY carry inline input and/or references to existing objects/state where the selected capability and reference contract permit them.

## Authorization boundary

A NEED is a request, not an authorization grant.

A requester MAY express provider preferences/selectors and cost/privacy constraints, but requester-controlled fields such as desired owner, tenant, billing mode or provider identity MUST NOT make an otherwise unauthorized provider eligible.

The implementation resolves authoritative requester identity/tenant and provider policy separately under `provider-policy.md` before dispatch. Provider selection and soft ranking operate only inside the already authorized/visible/eligible provider set.

## Hard constraints and decision context

The request policy may include, where supported by the selected capability/runtime profile:

- minimum trustability;
- maximum information age/freshness;
- maximum latency;
- maximum cost and currency/unit;
- absolute deadline;
- priority;
- urgency;
- decision value/value unit;
- domain;
- purpose;
- privacy/data-release requirements;
- compute-near-data preference;
- optional provider-selection preferences that apply only within the authorized provider set.

Unsupported required policy semantics MUST fail closed or be rejected by explicit negotiation rather than silently ignored. Unauthorized providers and providers/routes that violate hard constraints MUST be rejected before soft ranking.

Decision value is not a payment. It is the requester's declared value/risk context and can be used to justify additional verification or a higher-cost route within the authorized/eligible set.

## Stable-v1 acceptance

Stable qualification requires an executable positive signed NEED vector plus tests proving correlation/requester ownership, replay/idempotency and authorization boundaries without duplicate provider execution.
