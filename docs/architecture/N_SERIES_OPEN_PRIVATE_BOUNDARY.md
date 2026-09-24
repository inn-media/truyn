# TRUYN N-Series Open / Private Ownership Boundary

Status: **CANONICAL OWNERSHIP CONTRACT — N-SERIES**  
Applies to: **N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY, N/SUSTAINED-CHURN**

This document applies the permanent TRUYN two-repository rule to the N-Series.

> **Private may depend on Public. Public must never depend on Private.**

N-Series is split by behavior and data sensitivity. The public repository must contain enough specification, formulas and sanitized evidence for an independent implementation to understand and reproduce the open benchmark semantics. Managed operational details and proprietary network intelligence remain private.

## Public ownership — `inn-media/truyn`

The public repository owns:

- N-Series architecture and scenario definitions;
- benchmark methodology and invariant acceptance rules;
- public capability taxonomy and capability-discovery semantics;
- public policy labels/constraint semantics needed to express sovereignty cases;
- public trust-event/result semantics and metric definitions;
- generic/reference evaluator logic and recomputable formulas;
- public-safe normalized telemetry vocabulary;
- cross-series R0/R1/R2 isolation semantics;
- deterministic evidence/export expectations;
- sanitized benchmark reports, limitations, failures, corrections, immutable run identities and artifact digests;
- any generic/reference runner that uses only public/self-hostable TRUYN surfaces.

Public code and documentation must remain independently useful without this private repository.

## Private ownership — `inn-media/truyn-platform`

The private repository owns managed execution and sensitive evidence, including:

### Common private N material

- real cloud subscription/project/account identities;
- resource groups/projects/names, private endpoints and service identities;
- provider deployments, allowlists, quota/entitlement/spend ceilings and negotiated/private cost data;
- raw private telemetry, logs and request/provider identifiers when unsafe to publish;
- active run registry, lock/lease paths, fault-domain identifiers and cleanup commands;
- private orchestration and production incident/runbook internals;
- proprietary routing/ranking/cost/trust implementation and historical network intelligence.

### N/SOVEREIGNTY private material

- exact region/zone/account mapping;
- private network routes, firewall/egress policy implementation and enforcement topology;
- packet/flow-log bodies or identifiers that expose infrastructure;
- restricted test payload bodies and leak-canary values;
- private log/telemetry destinations and data-residency enforcement details.

Public evidence may reveal safe region/jurisdiction classes and proof outcomes, but not the private topology needed to attack or bypass the deployment.

### N/MARKETPLACE private material

- live provider/node identities and private endpoints;
- private capability availability/capacity and commercial inventory where sensitive;
- proprietary matching/ranking signals beyond the public eligibility contract;
- managed marketplace supply/demand analytics and commercial terms.

The public methodology still owns the rule that a requester starts from capability + constraints rather than a provider ID.

### N/TRUST-DECAY private material

- hidden ground-truth/oracle bodies, labels and seed material before/through measurement;
- adversarial bad-provider response fixtures that would reveal the holdout;
- private trust/reputation calibration and managed ranking signals;
- dispute-abuse intelligence and fraud history;
- private recovery/decay policy implementation when it exceeds the public reference contract.

Public evidence publishes commitments/digests and safe aggregate/per-sample outcomes, not the hidden oracle before it can no longer contaminate future runs.

### N/SUSTAINED-CHURN private material

- real host/resource identities and process orchestration details;
- node-kill/join schedules when premature disclosure would affect active execution;
- private bootstrap/fault targets, infrastructure capacity and cleanup controls;
- raw network/host diagnostics that disclose topology.

Public evidence retains exact churn rate, interval, duration, node-count cell, result metrics and safe topology classes.

## Shared-contract boundary

A cross-repository N change is `BOTH` only when a public contract/reference surface changes and the private managed executor must adapt.

For `BOTH` work:

1. public and private changes use independent linked PRs;
2. private automation never writes into `inn-media/truyn`;
3. public code never imports private code or depends on a private service to satisfy public conformance;
4. the private side consumes an accepted immutable/released public surface or an explicitly pinned immutable public contract allowed by policy;
5. private proprietary state is not copied into the public repository to simplify benchmarking.

## Data/evidence movement rule

The intended flow is:

```text
PUBLIC CONTRACT / RELEASE
        │
        ▼
PRIVATE MANAGED RUNNER
        │
        ├── raw private evidence ──> private retention
        │
        └── deterministic sanitizer/exporter
                    │
                    ▼
            PUBLIC SAFE EVIDENCE
```

The reverse source dependency is forbidden.

## Public evidence that is normally safe

Subject to the general repository security policy, public N evidence may include:

- scenario and node-count cell;
- safe cloud/region/jurisdiction class labels;
- provider family/capability class when already public;
- request counts and statistical sample sizes;
- routing/specialist-hit/fan-out/fairness metrics;
- policy-compliance/fail-closed/egress-leak counts;
- compliance cost/latency deltas using public list-price equivalent where applicable;
- churn rates, intervals, recovery distributions and drift metrics;
- trust-decay/false-penalty/domain-isolation/recovery metrics;
- tested public SHA/release, run identity, workflow/artifact identity and digest;
- safe sanitized per-event/per-sample records;
- interference and cleanup outcomes;
- limitations and negative findings.

## Information that must not become public merely for evidence

Do not publish:

- credentials, tokens, private keys or signed privileged URLs;
- tenant/customer data;
- real service-account/managed-identity identifiers when sensitive;
- private provider endpoints or deployment/resource names;
- exact live quota/cost ceilings or negotiated private pricing;
- private egress/firewall routes that would weaken security;
- hidden oracle bodies/labels while they can contaminate future tests;
- private fault targets, lock/lease backend paths or kill-switch details;
- proprietary routing/ranking/trust feature weights or historical intelligence unless deliberately open-sourced.

Use deterministic redaction/sanitization and retain cryptographic identity for withheld artifacts.

## Cross-series ownership

N uses the common public `BENCHMARK_SERIES_ISOLATION.md` contract. Real active-run state, resource ownership, R1 interference measurements and R2 leases are private operational concerns. The public repository defines their semantics; private `truyn-platform` provides the managed coordinator/runner integration.

N cleanup may touch only resources owned by its `N/<benchmark>/<run_id>` namespace or an explicitly leased R2 resource after ownership verification.

## Default for ambiguity

When a N component mixes reproducible benchmark semantics with private operational state, stop and classify it before implementation. Prefer an open stable contract/reference seam with the managed implementation on the private side.
