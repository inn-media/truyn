# TRUYN Operations

**Status:** current reference operations baseline for `0.1.0-dev`; not a mainnet SRE/SLO acceptance claim. The current production relay origin perimeter is deployment-proven, the numerical production SLI/SLO contract is defined, and standard production observability plus service-alert/error-budget policy are implemented. Production security-credential rotation and human on-call contracts are now also implemented; deployed backends/probes/pager delivery, live private roster evidence and durable SLO compliance evidence remain pre-stable.

Operations documentation describes how the implemented reference system is expected to be run safely and what remains unproven. It deliberately excludes private cloud topology, credentials, live allowlists, resource IDs and cost ceilings.

## Current operational surfaces

- [Production SLI / SLO Contract](PRODUCTION_SLO.md) — numerical production targets, measurement window, exclusions, error budgets and burn-rate policy; defined target contract, not yet accepted production compliance evidence.
- [Production Observability Plane](OBSERVABILITY.md) — OpenTelemetry/Prometheus metrics, OTLP traces, structured logs, correlation/privacy model and dashboards; implementation exists, deployment evidence remains open.
- [Production Alerting and Error Budgets](ALERTING.md) — 28-day budget recording, multi-window SLO burn paging and service/security anomaly alerts; implementation exists, real pager delivery evidence remains open.
- [Production Security Rotation Lifecycle](ROTATION_LIFECYCLE.md) — executable create -> overlap -> cutover -> verify -> revoke-old -> audit policy for origin/M2M proofs, entitlement keys, cloud/deploy identities, node identity and bootstrap trust records.
- [Production On-Call Rotation](ON_CALL.md) — primary/secondary coverage, escalation, ownership and acknowledged handoff contract; actual people/contact routes remain private operational data.
- [Node Operations](NODE_OPERATIONS.md) — identity/state/startup/restart/profile boundaries.
- [Testnet Operations](TESTNET_OPERATIONS.md) — signed bootstrap, QUIC/Kademlia, churn/repair and evidence discipline.
- [Billing Operations](BILLING_OPERATIONS.md) — BYOK, owner-funded and entitlement safety rules.
- [Operational Security](../security/OPERATIONAL_SECURITY.md) — accepted edge/origin/provider proof rotation and incident handling.

## Current maturity

The repository has executable relay/provider/node/testnet paths and a CI-proven v0.1 QUIC/Kademlia underlay. A four-node real QUIC/Kademlia trust-lifecycle testnet has also passed a bounded evidence gate.

Separately, the current production relay perimeter has passed its deployment gate. This is a bounded production relay perimeter claim, not a claim that TRUYN mainnet operations are complete.

The production service-level target contract is defined in `PRODUCTION_SLO.md`. The standard production instrumentation plane is implemented in `observability/`: production startup initializes OpenTelemetry before runtime imports; metrics are exposed only on a loopback Prometheus listener; traces can be exported over OTLP/HTTP; and runtime/policy/provider/request events emit structured JSON logs using the shared hash-safe correlation model. Checked-in Grafana dashboards cover relay, network/DHT, provider runtimes, authorization, billing/entitlement, semantic retrieval, A2A/MCP and infrastructure.

The alerting layer records rolling 28-day error-budget consumption and implements multi-window service pages for availability, 5xx, dispatch, RESULT delivery/timeouts, provider failures and DHT degradation, plus anomaly/zero-budget signals for WebSocket disconnect storms, authorization denies, billing ambiguity, artifact-store failures and origin-bypass probes.

The rotation layer now defines and machine-enforces one six-phase lifecycle across all P1 credential/identity/trust classes. The on-call layer now defines primary/secondary continuous coverage, escalation deadlines, ownership and acknowledged handoff. Live secrets and personal/pager data intentionally remain outside the public repository.

These are still implementation surfaces until real deployment telemetry, independent probes, alert delivery, a populated private on-call roster/test-fire and durable acceptance evidence satisfy the production operations contract.

What is **not** yet operationally complete:

- stable public mainnet bootstrap;
- universal NAT/reachability support;
- remaining large real-node / Internet-scale evidence required by the current network roadmap;
- deployed production metrics/trace/log backends with defined retention and access controls;
- independent HTTP/WebSocket synthetic probes from more than one vantage point;
- production DHT and every deployed external A2A/MCP facade wired into the standard hooks and evidenced;
- test-fired burn-rate/zero-budget alert delivery with a populated private primary/secondary roster and escalation evidence;
- sanitized live rotation drills for each deployed credential/identity/trust authority being claimed;
- accepted durable 28-day SLO compliance evidence;
- signed release/updater/rollback lifecycle for all supported OSes;
- production account/tenant commercial control plane;
- deployed durable sponsored/prepaid/subscription accounting;
- automatic equivalence proof for every future deployment or material edge/origin topology change.

## General operational rule

A temporary cloud workflow, successful one-shot deployment or local test is not by itself a production claim. Promote operational maturity only when the result is reproducible and recorded in durable evidence or a stable release contract.

A defined SLO target, instrumented dashboard, checked-in alert rule, rotation state machine or on-call role contract is also not proof of production compliance. Productionized status requires real serving-path measurements, auditable exclusions, error-budget accounting, test-fired alert delivery, populated human coverage, exercised rotations and durable acceptance evidence.

## Public/private boundary

Public runbooks may document generic configuration names, metric names, failure modes, rotation phases, role names and acceptance invariants. Exact live origins, provider/node IDs, cloud identities, privileged bootstrap sets, secret values, collector credentials, billing accounts, pager destinations, personal contact data and incident-sensitive data remain outside the public repository.

Public `/health` remains minimal. Metrics, traces and internal runtime state use the private observability plane and are never added to unauthenticated health output.
