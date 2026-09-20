# TRUYN S-Series Open / Private Ownership Boundary

Status: **CANONICAL OWNERSHIP CONTRACT — S-SERIES**  
Applies to: **S-50, S-100, S-200, S-500**

This document applies the permanent TRUYN two-repository rule to the Semantic Scale S-Series.

The governing invariant remains:

> **Private may depend on Public. Public must never depend on Private.**

S-Series is not owned wholesale by either repository. Ownership is classified by behavior and data sensitivity.

## Public ownership — `inn-media/truyn`

The public repository owns the parts required for an independent developer to understand, reproduce and verify the open TRUYN benchmark path:

- S-Series architecture and benchmark methodology;
- semantic-node eligibility and acceptance gates;
- scenario definitions (`ECON`, `MIX`, `XBORDER`, `CHAIN`, `CHURN`, `COST-ROUTING`, `CONTENTION`, `LANG`);
- generic/reference S runner built only from public TRUYN Node/Relay/provider/BYOK surfaces;
- public-safe benchmark configuration schemas;
- public-safe normalized telemetry schema and formulas;
- conformance/evaluator logic that does not require managed/private state;
- sanitized benchmark evidence, immutable run identities and artifact digests;
- generic D/S benchmark isolation semantics;
- reference owner-funded/BYOK provider authorization behavior.

Public benchmark code must remain independently buildable and useful without access to `inn-media/truyn-platform`.

## Private ownership — `inn-media/truyn-platform`

The private repository owns managed/commercial S-Series implementation and operational intelligence, including:

- managed cloud provisioning and production benchmark orchestration;
- real subscription/project/account topology and private resource identifiers;
- provider credentials, service identities, deployment names, allowlists and private endpoints;
- provider quota, entitlement and spend ceilings;
- raw/private telemetry ingestion and retained operational logs;
- tenant/account/organization data;
- proprietary routing, ranking, trust and cost-selection intelligence;
- private health, latency, abuse and capacity intelligence;
- commercial cost/accounting data not intentionally published as sanitized benchmark evidence;
- private cross-network analytics and historical datasets;
- private production runbooks, incident handling and cleanup internals.

None of those implementation details may be copied into the public repository merely to make an S run easier to launch.

## Shared-contract boundary

When private S-Series execution needs public TRUYN functionality, it must consume only an accepted released/versioned public artifact or an explicitly pinned immutable public contract allowed by the repository boundary policy.

A cross-repository S-Series change is `BOTH` only when a public contract/reference surface must change and the private managed executor must adapt to that change. In that case:

1. public and private changes use independent linked PRs;
2. private automation does not write to the public repository;
3. public code does not import or call private code;
4. private implementation consumes the accepted public surface only after it is immutable/pinned according to policy.

## Evidence publication rule

Public evidence may contain sanitized, reproducible measurements such as node counts, provider families, region/cloud labels when safe, latency distributions, token/cost-reduction calculations, correctness/provenance results, run SHA/attempt identities and artifact digests.

Public evidence must not contain secrets or private operational state such as credentials, tenant data, account/subscription/project identifiers, internal resource names, private endpoints, allowlists, raw provider request identifiers when unsafe, or proprietary routing/analytics datasets.

When raw evidence cannot be published safely, the public report may retain a cryptographic identity/digest and a sanitized derived result while the raw artifact remains private.

## S-Series execution split

A public/reference S runner may exist in `inn-media/truyn` when it uses only open/self-hostable TRUYN behavior and owner-funded/BYOK provider access.

The InnMedia-managed S campaign executor, cloud orchestration, production telemetry pipeline and proprietary optimization logic belong in `inn-media/truyn-platform`.

Therefore an S-Series PASS is a benchmark/evidence claim, not permission to move managed implementation into public source.

## Relationship to D-Series

This rule does not change the existing D-Series classification. Public network qualification remains public unless a separate managed/private implementation concern is involved. S-Series reuses that public network foundation while keeping managed S execution details private.

## Default for ambiguity

If a new S-Series component mixes public benchmark logic with managed/private state, stop and classify it before implementation. Prefer a public stable contract/reference seam with the managed implementation on the private side.
