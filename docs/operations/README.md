# TRUYN Operations

**Status:** current reference operations baseline for `0.1.0-dev`; not a mainnet SRE/SLO acceptance claim. The current production relay origin perimeter is deployment-proven, and the numerical production SLI/SLO contract is defined, but broader network/mainnet operations and SLO observability/alerting/on-call acceptance remain pre-stable.

Operations documentation describes how the implemented reference system is expected to be run safely and what remains unproven. It deliberately excludes private cloud topology, credentials, live allowlists, resource IDs and cost ceilings.

## Current operational surfaces

- [Production SLI / SLO Contract](PRODUCTION_SLO.md) — numerical production targets, measurement window, exclusions, error budgets and burn-rate policy; defined target contract, not yet accepted production compliance evidence.
- [Node Operations](NODE_OPERATIONS.md) — identity/state/startup/restart/profile boundaries.
- [Testnet Operations](TESTNET_OPERATIONS.md) — signed bootstrap, QUIC/Kademlia, churn/repair and evidence discipline.
- [Billing Operations](BILLING_OPERATIONS.md) — BYOK, owner-funded and entitlement safety rules.
- [Operational Security](../security/OPERATIONAL_SECURITY.md) — accepted Cloudflare → Azure Front Door → Container Apps origin perimeter, edge/origin/provider proof rotation and incident handling.
- [Production Azure Origin Lock evidence](../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md) — deployment-proven direct AFD/Container App HTTP+WebSocket and forged-proof denial matrix.

## Current maturity

The repository has executable relay/provider/node/testnet paths and a CI-proven v0.1 QUIC/Kademlia underlay. A four-node real QUIC/Kademlia trust-lifecycle testnet has also passed a bounded evidence gate.

Separately, the current production relay perimeter has passed its deployment gate:

```text
Cloudflare
  ↓
Azure Front Door SocketAddr sanitize/inject proof
  ↓
Container Apps AzureFrontDoor.Backend-only ingress
  ↓
runtime origin guard
  ↓
inner relay
```

The accepted gate preserves public Cloudflare HTTP/WebSocket behavior and denies direct Azure Front Door HTTP/WebSocket, forged-proof direct Front Door HTTP/WebSocket and direct Container App HTTP/WebSocket with 403. This is a bounded production relay perimeter claim, not a claim that TRUYN mainnet operations are complete.

The production service-level target contract is now defined in `PRODUCTION_SLO.md`. It specifies rolling 28-day SLIs for relay HTTP/WebSocket availability, authenticated request success, NEED dispatch, RESULT delivery, first-party provider availability, DHT/routing health, stale-selection rate, end-to-end and connection latency, instance/routing recovery, plus non-budgetable security invariants. It also defines exclusions, error budgets and multi-window burn-rate actions. These are targets until real production telemetry, alerting, on-call ownership and durable acceptance evidence satisfy the contract.

What is **not** yet operationally complete:

- stable public mainnet bootstrap;
- universal NAT/reachability support;
- remaining large real-node / Internet-scale evidence required by the current network roadmap;
- production SLO measurement/dashboards, burn-rate alerting, on-call ownership and accepted compliance evidence against the defined contract;
- signed release/updater/rollback lifecycle for all supported OSes;
- production account/tenant commercial control plane;
- deployed durable sponsored/prepaid/subscription accounting;
- automatic equivalence proof for every future deployment or material edge/origin topology change.

## Origin-perimeter operational rule

For the protected production relay, Azure Front Door control-plane `deploymentStatus` is not sufficient proof of serving-edge convergence. Before proof cutover, operations must establish real data-plane behavior for the unconditional sanitize rule and the Cloudflare-only `SocketAddr` rule, then re-run the direct AFD/Container App HTTP+WebSocket/spoof denial matrix.

Changes to Cloudflare, Front Door routes/rules, Cloudflare CIDRs, Container Apps ingress, trusted-edge proof handling or origin topology invalidate the prior equivalence assumption until the gate passes again.

## General operational rule

A temporary cloud workflow, successful one-shot deployment or local test is not by itself a production claim. Promote operational maturity only when the result is reproducible and recorded in the durable evidence ledger or a stable release contract.

A defined SLO target is also not proof of SLO compliance. Productionized status requires real serving-path measurements, auditable exclusions, error-budget accounting, burn-rate alerting, responsible on-call ownership and durable acceptance evidence.

Completed one-shot privileged origin-lock executors are removed after acceptance; durable evidence, stable architecture and generic runbook invariants remain in the public repository.

## Public/private boundary

Public runbooks may document generic configuration names, failure modes and acceptance invariants. Exact live origins, provider node IDs, cloud identities, privileged bootstrap sets, secret values, billing accounts and incident-sensitive data remain outside the public repository.
