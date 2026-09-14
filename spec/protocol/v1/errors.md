# TRUYN/1 Normalized Error Registry

**Status:** bounded Open 1.0 release-candidate contract.

This registry defines the stable public error classes used by first-party SDKs and public interoperability surfaces. Transport-specific status codes or provider-specific details MAY accompany these classes, but callers MUST be able to reason about the normalized class without depending on implementation-specific text.

## Stable normalized codes

| Code | Meaning | Retry default |
|---|---|---|
| `version_mismatch` | The peer/profile cannot satisfy the required protocol generation or required semantics. | no |
| `unauthenticated` | Required requester/peer authentication is absent, expired, malformed, or otherwise not established. | no |
| `permission_denied` | The authenticated principal is not authorized for the target capability, provider, object, tenant, or lifecycle action. | no |
| `deadline_exceeded` | The bounded operation did not complete before its accepted deadline. | yes when the operation is safe to retry |
| `invalid_argument` | The request is syntactically valid at the transport layer but violates the accepted public contract. | no |
| `unimplemented` | The requested optional operation/profile is not implemented by this endpoint/runtime. | no |
| `cancelled` | The requester-owned operation reached the accepted cancellation state. | no unless a new logical operation is created |
| `transport_error` | The protocol operation could not be completed because the transport/session failed before an authoritative application result was accepted. | yes when exactly-once/idempotency rules permit |
| `invalid_response` | A peer/provider response violates the accepted protocol/profile contract, signature/integrity rules, or required response shape. | no by default |

These wire values are lowercase ASCII tokens and MUST NOT be repurposed to mean a different failure class within TRUYN/1.

## Normalization rules

1. Error text is diagnostic only. Authorization, retry, or compatibility logic MUST NOT depend on free-form message text.
2. Provider/adapter/native transport errors MAY retain a namespaced source detail, but the public caller-facing error MUST also carry one normalized code above.
3. A retryable indication is advisory and MUST NOT override exactly-once, cancellation, authorization, replay, or side-effect safety rules.
4. Authentication and authorization failures MUST fail closed and MUST NOT trigger provider execution merely because a transport retry is attempted.
5. `version_mismatch` is the stable class for required protocol/profile semantics that cannot be negotiated; silently dropping required semantics is forbidden.
6. `invalid_response` is used when a response cannot be trusted or consumed under the accepted contract, including signature/integrity or required-response-shape failure; invalid output MUST NOT be normalized as successful application output.
7. Cancellation observed after authoritative acceptance is `cancelled`; late provider output after terminal cancellation remains invalid lifecycle output and MUST NOT resurrect the request.

## Transport mapping

HTTP, WebSocket, A2A, MCP, NLWeb and SDK adapters MAY map native status/error forms to these normalized classes. Those mappings are compatibility layers, not alternate authority models. A surface MUST preserve the same identity, authorization, cancellation, provenance and provider-execution boundary as the native TRUYN path.

The exact per-interface mapping belongs to that interface's conformance profile. New normalized public classes require an explicit compatible protocol/profile change; implementation-specific string errors MUST NOT be promoted into the stable registry accidentally.
