# TRUYN Open 1.0 REST API

**Status:** Open 1.0 release-candidate contract  
**Task:** `truyn-open-1-0-productization-7e4c91`  
**Task anchor:** issue #615  
**OpenAPI:** `openapi/truyn-v1.yaml`

## Purpose

The REST API is a first-class versioned interface over the same public TRUYN node/runtime semantics used by the SDK, MCP and A2A adapters. It is not a second authority plane and it must never bypass TRUYN identity, authorization, provider visibility, cancellation, provenance, replay, or execution rules.

The existing `adapters/http/server.js` local HTTP adapter is the implementation surface to evolve. Open 1.0 preserves its existing routes while adding the bounded v1 operations defined here. No private-platform service is required to build or use this API.

## Trust and exposure boundary

1. The public adapter is loopback-only by default (`127.0.0.1`, `::1`, or `localhost`). Remote exposure requires an explicitly authenticated gateway outside this adapter.
2. REST request bodies and query parameters are input, never authority. A caller cannot assert requester identity, provider ownership, tenant, billing identity, session token, or authorization by supplying JSON fields.
3. Execution-capable operations call the same authoritative `TruynNode` paths as other public interfaces.
4. Discovery returns only providers/capabilities visible to the authenticated/local node context.
5. Provider credentials, relay session tokens, private keys, and managed-platform state are never returned by the REST API.
6. References containing URLs are data only; the REST layer does not implicitly fetch arbitrary URLs.
7. Retry, streaming, polling and cancellation must not cause duplicate provider-side application execution.
8. Cancellation is requester-owned and maps to the canonical TRUYN REVOKE lifecycle. Late PARTIAL/RESULT output after accepted terminal cancellation remains rejected.

## Versioning

The bounded Open 1.0 API is namespaced under `/v1` except for conventional health and well-known discovery resources. Breaking REST semantics require a new API version; additive optional fields may be introduced only when older clients can safely ignore them.

`GET /v1/version` reports the REST API profile and the runtime/protocol profile actually supported by the running node. It must not claim a protocol/profile that the runtime has not qualified.

## Correlation

Every execution-capable response has a stable TRUYN request identifier. The REST layer also accepts or creates an HTTP correlation identifier for diagnostics. Correlation metadata is not identity or authorization and cannot select a provider or widen access.

## Bounded Open 1.0 surface

| Operation | Path | RC state before implementation sprints | Canonical behavior |
|---|---|---|---|
| Health | `GET /health` | Existing | Liveness only; no secret/topology disclosure |
| Version | `GET /v1/version` | S38 | API/runtime/protocol profile metadata |
| Identity | `GET /v1/identity` | Existing | Public local node identity metadata only |
| Agent Descriptor | `GET /.well-known/truyn-agent.json` | S39 | Existing signed Descriptor semantics, exposed through the REST serving surface |
| Discovery | `GET /v1/offers` | Existing, hardened S40 | Authorization-aware visible capability/provider discovery |
| Publish OFFER | `POST /v1/offer` | Existing, hardened S41 | Uses canonical node OFFER path; body cannot grant provider authority |
| Submit NEED | `POST /v1/need` | Existing, hardened S42 | Uses canonical node NEED/dispatch path |
| Poll events | `GET /v1/events` | Existing compatibility route | Bounded compatibility polling surface |
| Request status/result | `GET /v1/needs/{requestId}` | S43 | Requester-scoped state and accepted result only |
| Provider RESULT | `POST /v1/result` | Existing compatibility route | Provider-side canonical RESULT path; provider binding remains authoritative |
| Stream request events | `GET /v1/needs/{requestId}/events` | S46 | Ordered PARTIAL/terminal events for the authorized requester |
| Cancel request | `DELETE /v1/needs/{requestId}` | S47 | Requester-owned cancellation mapped to canonical REVOKE exactly once |

The table records the target RC contract. A route is not considered implemented merely because it appears in this document or OpenAPI; implementation status is established only by the corresponding executable sprint and tests.

## Error contract

REST errors use a JSON object with a stable normalized TRUYN error code plus a bounded human-readable message. HTTP status communicates transport/API class; the TRUYN error code communicates canonical protocol/runtime failure class. Unknown internal errors are not serialized with stack traces, credentials, topology, or provider internals.

Conceptual shape:

```json
{
  "ok": false,
  "error": {
    "code": "authorization_denied",
    "message": "request is not authorized"
  },
  "correlationId": "..."
}
```

Existing compatibility responses are migrated without silently weakening callers. S44 owns the executable normalized mapping.

## Compatibility and non-goals

- Existing public HTTP adapter routes remain backward-compatible unless a versioned migration explicitly supersedes them.
- REST does not replace MCP, A2A, NLWeb, SDK, native relay, or WebSocket interfaces.
- REST does not implement private account/tenant control plane, managed billing, reputation, global routing intelligence, or proprietary telemetry.
- REST does not turn arbitrary request fields into trusted provider/account/billing identity.
- OpenAPI is a contract surface, not evidence of implementation. Exact-head REST conformance/security qualification is required before the REST profile can be declared accepted.

## Acceptance progression

S38–S48 implement and test the operations and security properties above. S49 qualifies OpenAPI/schema validation, REST functional/security conformance, DCO, CI and CodeQL on one exact head. S50 may merge only that exact qualified head; S51 then qualifies the merged `main` revision.
