# Cross-Repository Task Routing

This contract makes two-repository coordination explicit. No executor is allowed to rely on memory of the second repository.

## Required classification

Every task and pull request that can affect TRUYN architecture MUST declare exactly one scope:

- `OPEN` — public interoperability, SDK, protocol, Node/Relay reference implementation, conformance, public benchmark or self-hosting primitive;
- `PRIVATE` — managed global state, managed authority/revocation, commercial control plane, proprietary routing/reputation/telemetry/analytics, billing/licensing/enterprise, or private production operations;
- `BOTH` — a public contract changes and a coordinated private compatibility change is required.

Ambiguous work is not silently placed. Classify it before implementation.

## BOTH changes

A `BOTH` change uses two independent PRs. Each PR links the counterpart and states the compatibility order. Private automation MUST NOT write to or dispatch into the public repository.

Allowed flow:

1. define/change the open contract in `inn-media/truyn`;
2. qualify and expose it either as a versioned public artifact or as an explicitly pinned immutable public contract identified by repository + exact commit + canonical path + cryptographic digest;
3. update the private dependency/pin policy to that immutable identity;
4. implement/qualify the private consumer;
5. merge in the declared compatibility order.

A pinned contract is limited to declared SHARED_CONTRACT bytes and does not authorize raw-source consumption. Direct Git/path/submodule/raw-source coupling is forbidden.

## D-200 routing

D-200 is `OPEN` by default. Its network benchmark, scripts, evidence and qualification stay in `inn-media/truyn`.

- D-200 implementation/evidence only -> public PR only.
- D-200 changes a public protocol/SDK/Descriptor/shared contract -> public PR plus a private compatibility PR (`BOTH`).
- Managed routing/ranking/global telemetry learned from a D-200 run -> private PR only; public evidence must remain sanitized.

## NLWeb routing

NLWeb protocol/adapter/discovery/bridge/conformance work is `OPEN` by default.

Examples of `OPEN` NLWeb work:

- client/provider adapter contracts;
- exact upstream profile/version negotiation;
- `ask` / `who` interoperability;
- public discovery and capability advertisement;
- routing/relay integration with the public authority contract;
- public MCP/A2A bridge profiles;
- conformance, black-box and adversarial tests.

Examples of `PRIVATE` NLWeb work:

- managed endpoint registry and enterprise/tenant visibility policy;
- proprietary ranking/selection among eligible endpoints;
- private endpoint health/history, abuse intelligence and telemetry/analytics;
- commercial entitlements, billing hooks and production operations.

Use `BOTH` only when a public NLWeb contract changes and the managed platform must update its immutable public-contract consumer.

Publisher crawling/ingestion, indexing, vector search, RAG corpus ownership, brand/product/news content, publisher/content rights, campaign data and InnMedia Data Graph business semantics are not reclassified into TRUYN merely because an NLWeb integration references them. They stay in their separate application/data products or external systems.

## PR metadata

Every relevant PR records:

- Scope: `OPEN | PRIVATE | BOTH`;
- Contract impact: `none | additive | breaking`;
- Counterpart PR/issue when scope is BOTH;
- Public dependency coordinate or immutable contract identity affected, if any;
- D-200 impact: `none | public-only | compatibility-update`;
- NLWeb impact: `none | public-interoperability | managed-compatibility | both`.

## Fail-closed rules

- Public code never imports private code.
- Private code never consumes public source by mutable branch, checkout, raw URL, sibling path, submodule or vendored snapshot.
- A versioned public artifact or explicitly pinned immutable public contract identity must exist before private production code relies on the shared surface.
- Missing counterpart metadata for a declared BOTH change blocks completion.
