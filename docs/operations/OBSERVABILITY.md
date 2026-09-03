# TRUYN Production Observability Plane

**Status:** implemented production instrumentation plane; deployed backend/retention/on-call evidence remains OPEN.  
**Scope:** production relay/provider runtime telemetry and the standard integration surface for network/DHT, semantic retrieval and external A2A/MCP adapters.  
**Related contract:** [Production SLI / SLO Contract](PRODUCTION_SLO.md).

This document defines the canonical production observability plane for TRUYN. It replaces the assumption that component-local counters or bounded benchmark traces are sufficient production evidence.

The production plane has three independent streams:

```text
METRICS          OpenTelemetry Meter -> Prometheus exporter -> private /metrics
TRACES           OpenTelemetry Tracer + Node auto-instrumentation -> OTLP/HTTP collector
STRUCTURED LOGS  one JSON object per line -> stdout/stderr -> deployment log collector
```

All three use the same correlation vocabulary, but correlation identifiers are deliberately **not** Prometheus labels.

## 1. Security boundary

Observability does not widen the public relay API.

The public `/health` endpoint remains a minimal liveness/protocol disclosure. Metrics, traces, runtime topology, provider identities, SLO state, queue depths and diagnostic counters are not returned from `/health`.

The Prometheus listener is a separate listener and is required to bind to loopback (`127.0.0.1`, `::1` or `localhost`). A node-local collector/sidecar may scrape it and forward metrics to the production backend. Binding the metrics endpoint directly to a public interface is rejected at startup.

The provider runtime also keeps `/health` minimal; readiness remains a separate `/ready` concern.

## 2. Correlation model

Every trace/log integration uses these canonical field names:

| Field | Meaning | Storage rule |
|---|---|---|
| `requestId` | request/protocol correlation id | log/trace only; never metric label |
| `needId` | TRUYN NEED id | log/trace only; never metric label |
| `providerId` | provider identity | SHA-256-derived hash-safe identity in telemetry |
| `nodeId` | requester/local node identity | SHA-256-derived hash-safe identity in telemetry |
| `sessionId` | session correlation identity | hash-safe value only; bearer/session token itself is forbidden |
| `traceId` | OpenTelemetry/W3C trace id | log/trace correlation |
| `resultId` | terminal result correlation id where available | log/trace only |
| `errorClass` | stable low-cardinality error class | logs/traces and selected metrics |

Hash-safe identities are emitted as `sha256:<24 hex chars>`. The observability layer must never treat correlation metadata as authentication, authorization, provider ownership or billing authority.

### Forbidden structured-log material

The generic structured logger drops fields whose names indicate authorization/cookies, bearer/session/access tokens, passwords/secrets/credentials, private/API keys, edge/origin proofs, prompts, input, output, payload or content.

Raw request/response bodies are not logged by the production plane.

## 3. Metrics

The implementation uses OpenTelemetry metrics with the Prometheus exporter. Core metric families include:

```text
truyn_http_requests_total
truyn_http_request_duration_seconds
truyn_websocket_connections_total
truyn_authenticated_requests_total
truyn_dispatch_attempts_total
truyn_result_delivery_total
truyn_provider_executions_total
truyn_provider_execution_duration_seconds
truyn_authorization_decisions_total
truyn_billing_decisions_total
truyn_semantic_operations_total
truyn_semantic_operation_duration_seconds
truyn_external_protocol_requests_total
truyn_network_routing_operations_total
truyn_network_stale_selections_total
truyn_infrastructure_errors_total
truyn_runtime_ready
truyn_relay_nodes
truyn_relay_offers
truyn_relay_pending_requests
truyn_relay_provider_sockets
truyn_relay_active_chains
truyn_relay_contexts
truyn_process_uptime_seconds
truyn_process_resident_memory_bytes
truyn_process_heap_used_bytes
```

Metric labels are intentionally bounded: surface, normalized route, method, outcome, error class, capability, adapter, decision and operation. Request/NEED/result/session/node/provider identifiers are forbidden metric labels because they create cardinality and privacy risk.

### SLO semantics

Metrics preserve the `PRODUCTION_SLO.md` distinction between successful service, fail-closed denial and excluded/rejected traffic:

- `success` is SLO-eligible success;
- `failure` is an unexpected service/capacity/5xx outcome;
- `denied` is a fail-closed authorization outcome and is not availability failure;
- `rejected` is malformed/unsupported client or protocol traffic;
- `no_provider` is the documented no-eligible-provider outcome for NEED dispatch.

Final 28-day compliance still requires the exact denominator/exclusion policy in `PRODUCTION_SLO.md`; dashboards must not silently reinterpret these classes.

## 4. Traces

Production startup initializes the OpenTelemetry Node SDK before importing the relay/provider service. This is required so Node HTTP/fetch/undici instrumentation can establish trace context around real serving-path work.

When `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT` is configured, traces are exported through OTLP/HTTP to an operator-owned collector. Provider execution receives an explicit `truyn.provider.execute` span with hash-safe requester/provider identity attributes and capability metadata.

Trace attributes may carry request/NEED ids for debugging, but trace attributes do not grant protocol authority and must not contain user payloads or secrets.

## 5. Structured logs

With production observability enabled, runtime lifecycle, HTTP completion, authorization decisions, billing decisions, provider execution and infrastructure errors are emitted as one JSON object per line.

Production deployments should collect stdout/stderr with the platform log agent and retain the JSON fields as structured fields rather than flattening them into free text.

## 6. Production configuration

Canonical runtime variables:

```text
TRUYN_OBSERVABILITY=1
TRUYN_METRICS_HOST=127.0.0.1
TRUYN_METRICS_PORT=9464
OTEL_SERVICE_NAME=truyn-relay
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<private collector trace endpoint>
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.10
```

`OTEL_EXPORTER_OTLP_ENDPOINT` may be used instead of the trace-specific endpoint; `/v1/traces` is appended by the TRUYN bootstrap. Collector credentials/headers are deployment secrets and are not committed to the public repository.

The production Docker image enables observability by default, binds metrics to loopback and starts `runtime/production.js`, which initializes OpenTelemetry before loading `runtime/service.js`.

## 7. Dashboard contract

Canonical Grafana dashboard definitions live in `observability/grafana/dashboards/`:

1. **Relay** — HTTP availability/errors/latency, WS attempts, pending requests, active chains and provider sockets.
2. **Network / DHT** — routing outcomes, stale selections and the DHT SLO signal when a production DHT profile is actually activated.
3. **Provider runtimes** — execution success/error rate, latency and runtime readiness.
4. **Authorization** — allow/deny decisions and authenticated-request outcome classes.
5. **Billing / entitlement** — allow/deny decisions by billing mode/error class.
6. **Semantic retrieval** — retrieve/select/delta outcomes and latency.
7. **External A2A / MCP** — protocol request rate/errors/latency when the standard server observer is attached to those facades.
8. **Infrastructure** — process health/memory/uptime and infrastructure error classes.

The checked-in dashboards are portable definitions, not evidence that a particular Grafana instance is deployed.

## 8. Prometheus alert rules

`observability/prometheus/slo-alerts.yml` encodes the high-value burn-rate alarms from `PRODUCTION_SLO.md` for relay HTTP, NEED dispatch and RESULT delivery. Operators may mirror them in another alerting backend, but the numerical thresholds and dual-window semantics must remain equivalent.

A security invariant remains zero-budget even if every availability burn alert is green.

## 9. External A2A/MCP integration

`getObservabilityPlane().observeHttpServer(server, { surface: 'a2a' })` and the equivalent `surface: 'mcp'` are the standard hooks for external facade HTTP servers. The HTTP observer normalizes routes, records protocol request outcomes and emits structured request-completion logs without reading request bodies.

An external adapter that bypasses these hooks is not observability-complete and cannot be used as production SLO evidence.

## 10. Network/DHT integration

The plane exposes `recordNetwork(operation, outcome, { errorClass, stale })` for Kademlia/QUIC routing implementations. This is the production metric vocabulary for DHT/routing operations and stale-selection accounting.

The current production DHT SLO remains **NOT_EVALUATED** until a production network profile actually calls this hook on real routing paths and supplies durable measurement evidence. Testnet/D-100/D-1000 data is not silently promoted into the production metric series.

## 11. What this implementation proves and does not prove

After merge, the repository has a real production observability implementation surface: OpenTelemetry SDK initialization before production runtime imports; a private Prometheus metrics endpoint; OTLP/HTTP trace export; manual provider execution spans; structured JSON logs with redaction and common correlation fields; relay serving-path metrics plus runtime/policy/provider/request instrumentation; dashboard definitions for all required domains; and burn-rate alert definitions.

It does **not** by itself prove 28-day SLO compliance or complete Productionized maturity. Deployed backends, external probes, real alert delivery, on-call ownership, controlled failure exercises and durable 28-day evidence remain separate acceptance work.
