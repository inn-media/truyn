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
| `not_found` | The addressed public resource or authorized target does not exist. | no |
| `conflict` | The request conflicts with accepted lifecycle or idempotency state. | no; reconcile authoritative state first |
| `resource_exhausted` | A bounded capacity, quota or request-size limit is exceeded. | only when the controlling limit permits |
| `internal_error` | A bounded internal failure; diagnostics must not reveal implementation or private topology. | no by default |

These public error identifiers are lowercase ASCII tokens and MUST NOT be repurposed to mean a different failure class within TRUYN/1. The four additional compatibility-profile codes document values already emitted by existing HTTP/SDK implementations; this change does not admit new signed envelope types, wire fields or protocol generations. Legacy `invalid_request`, `payload_too_large`, `authorization_denied` and SDK-local `validation_error` are input/source aliases only: new public responses MUST use `invalid_argument`, `resource_exhausted`, `permission_denied` and `invalid_argument`, respectively. Native A2A/MCP JSON-RPC numeric error codes remain unchanged; their TRUYN classification is preserved as separately namespaced metadata.

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

## P10 deterministic interface projection (release-candidate)

The canonical error *class* is independent of interface. The original native
format remains the transport's contract: no new signed envelope field, message
type or protocol generation is introduced.

| Interface | Machine-readable normalized classification | Native form preserved |
|---|---|---|
| REST v1 | `error.code` in `{ok:false,error:{code,message},correlationId}` | HTTP status and bounded correlation ID |
| MCP tool | `result._meta['truyn/errorCode']` on failed tools | MCP JSON-RPC method/result semantics |
| MCP JSON-RPC | `error.data.truynCode` | Native numeric JSON-RPC error code |
| A2A | `google.rpc.ErrorInfo.metadata.truynCode` | JSON-RPC numeric code and A2A reason |
| NLWeb (pinned profile) | `NlwebCompatibilityError.truynCode` alongside its existing `code` | NLWeb source profile reason and shape |
| WebSocket relay | `truynCode` on negative `ERROR` and negative `ACK` frames | Existing `kind`, `status`, `error` and correlation fields |
| JS/TS, Python, Go, Java, .NET SDK | Normalized SDK `code` and conservative `retryable` | Original HTTP status/legacy machine code when available |

Deterministic precedence: stable machine class → enumerated source alias →
HTTP status family → bounded `internal_error`. Arbitrary prose never changes
authorization, replay policy or public error class. A raw HTTP 429 is
`resource_exhausted` but not automatically retryable; explicitly recognized
bounded backpressure may advise retry. Unknown server-side HTTP 5xx is
`internal_error` rather than a transport failure. Only a transport failure
before an authoritative application response is `transport_error`.

An SDK `retryable` hint cannot authorize replay: idempotency, terminal
cancellation, provider ownership and exactly-once controls remain authoritative.
No public response may leak provider diagnostics or private topology.

Executable corpus: `sdk/conformance/v1/p10-error-mapping.json`. All five
first-party SDKs consume the common matrix. The REST/MCP/A2A and WebSocket
negative-surface contract is verified in `tests/p10-error-parity.test.js`.
This is a bounded RC profile, **not** a TRUYN/1 stable-v1 declaration.
