# Repository Structure — TRUYN Open

TRUYN is implemented across **two codebases** with an explicit dependency boundary.

- `inn-media/truyn` — **TRUYN Open**, public Apache-2.0 interoperability/reference layer.
- `inn-media/truyn-platform` — **TRUYN Platform**, private proprietary managed/commercial layer.

This repository is not the home for all TRUYN implementation.

## Source-of-truth hierarchy

1. `spec/protocol/<generation>/` — normative public protocol semantics.
2. `proto/<generation>/` — machine-readable wire schema.
3. `GOVERNANCE.md` + `docs/governance/` — public normative change process.
4. `docs/architecture/OPEN_CORE_BOUNDARY.md` + `config/open-core-boundary.json` — repository ownership.
5. `docs/architecture/ARCHITECTURE_CONTRACT.md` — public architecture invariants.
6. `docs/architecture/IMPLEMENTATION_STATUS.md` — public factual maturity/status.
7. subsystem architecture documents.
8. `docs/benchmarks/` — durable public measured evidence.
9. `README.md` and `ROADMAP.md` — summary and sequencing.

## Public implementation directories

- `core/` — open identity, capability, intent, objects, claims, provenance, trust/state/routing and self-hosting/reference security logic.
- `core/security/` — public authority/reference/provider-policy primitives required for independent self-hosting and interoperability. Managed cloud authority implementation is a private target; current legacy exceptions are tracked explicitly.
- `network/` — QUIC, authenticated sessions, Kademlia/DHT, routing, Relay, NAT/testnet mechanics.
- `runtime/` — public provider/relay/reference composition and client-side managed-authority integration contract. Managed authority server ownership is private.
- `adapters/mcp/`, `adapters/a2a/`, `adapters/providers/` — public external protocol/provider edges that do not embed private owner infrastructure.
- `sdk/` — five first-party public SDKs and release/conformance tooling.
- `trust/` — open Trustability/provenance/receipt primitives.
- `storage/` — public reference storage components.
- `observability/` — generic reference instrumentation; private global telemetry/analytics systems belong to TRUYN Platform.
- `tests/`, `benchmarks/`, `scripts/` — public conformance/evidence/maintenance support.

## Private counterpart ownership

`inn-media/truyn-platform` owns:

- `managed-authority/` and managed revocation/governance service implementation;
- `control-plane/` for managed global orchestration;
- `trust-registry/` and `reputation/` managed/global state;
- `routing-intelligence/`;
- private `telemetry/` and `analytics/`;
- `marketplace/`, `billing/`, `licensing/`, `enterprise/`;
- private production `ops/`.

The private repository consumes open released/versioned artifacts. Public code never imports private code.

## Shared contracts

Shared contracts stay open even when a private service implements them. Current examples:

- `TRUYN/1`;
- `truyn.agent-descriptor/v1`;
- first-party SDK stable API behavior;
- object/artifact reference schemas;
- provider authorization outcome/error vocabulary;
- production-control-plane snapshot/status contract consumed by an open Relay client.

## Current migration exceptions

The public tree still contains a bounded legacy set whose **ownership is private but physical migration is not yet complete**:

- `core/security/managed-production-authority.js`;
- `core/security/cosmos-authority-checkpoint.js`;
- `runtime/authority-service.js`;
- two mixed managed-authority test files;
- `docs/operations/MANAGED_AUTHORITY_RUNTIME.md`;
- legacy `production-*` GitHub workflows listed in `config/open-core-boundary.json`.

They remain only until the reusable public authority-kernel artifact exists and the private managed implementation can consume it without Git/path/source coupling. The exception allowlist may only shrink.

## D-200 ownership

D-200 is public/open network qualification. Its scripts, benchmark logic, predicates and sanitized evidence stay here. It does not move to TRUYN Platform merely because managed network intelligence may later consume lessons or metrics from it.

## License

This repository remains licensed under Apache-2.0. See `LICENSE` and `NOTICE`. TRUYN Platform is separately licensed and does not alter the license of this repository.
