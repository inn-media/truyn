# TRUYN N-Series — Emergent Network Behavior

Status: **DEFINED / NOT YET EXECUTED**  
Track: **N-Series**  
Scenarios: **N/SOVEREIGNTY → N/MARKETPLACE → N/TRUST-DECAY → N/SUSTAINED-CHURN**  
Task: `truyn-n-series-foundation-260920-n0`

## Purpose

The N-Series tests behavior that should emerge from a real TRUYN network when independent nodes, providers, policies and trust signals interact over time. It does not ask only whether messages can be routed. It asks whether the network can discover specialists without hard-coded provider identities, obey data-sovereignty constraints under economic pressure, adapt away from semantically bad providers without a manual blocklist, and remain convergent while membership changes continuously.

N-Series is deliberately separate from:

- **D-Series** — network scale/resilience qualification;
- **S-Series** — live semantic-node scale and provider/economic behavior;
- **T-Series** — commercial/economic proof;
- **H-Series** — hidden-value/adversarial benchmark families;
- future **E** or other series.

A result in another series never satisfies an N-Series gate. N-Series may reuse accepted public substrate as an immutable dependency, but every N claim requires its own frozen source, methodology, run identity and evidence.

## Foundation substrate

N-Series starts from two already-proven layers:

1. the accepted **Class D-200** network substrate; and
2. the real seven-provider semantic path already exercised with GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi.

These are foundations, not inherited N PASSes. A N run must re-prove every metric that its claim depends on.

## Permanent two-repository rule

The governing invariant is:

> **Private may depend on Public. Public must never depend on Private.**

Public `inn-media/truyn` owns reproducible N-Series architecture, methodology, public-safe schemas, generic/reference evaluator behavior, capability/policy/trust metric semantics and sanitized evidence.

Private `inn-media/truyn-platform` owns managed orchestration, real cloud/account/resource topology, private provider identities/endpoints/allowlists, quota/spend controls, raw packet/flow/log evidence, hidden ground-truth/oracle material, adversarial fixtures, proprietary routing/ranking/trust intelligence and private operations.

Canonical ownership split: `N_SERIES_OPEN_PRIVATE_BOUNDARY.md`.

## Core N-Series rule: do not pre-program the conclusion

A N benchmark is invalid when the desired behavior is effectively hard-coded into the requester or runner.

Examples:

- N/MARKETPLACE requester must know the **capability name and constraints**, not the specialist provider/node ID;
- N/SOVEREIGNTY must make a cheaper/faster forbidden route available so policy enforcement is actually tested;
- N/TRUST-DECAY may not start from a blocklist or from the evaluator's hidden good/bad labels;
- N/SUSTAINED-CHURN may not stop traffic while membership changes and then measure only idle reconvergence.

The network must make the measured decision through ordinary TRUYN discovery, routing, policy and trust surfaces.

## Common invariants

Every final N run must freeze before material execution:

```text
series_id = N
benchmark_id
run_id
public_truyn_sha_or_release
private_runner_identity_or_reference_identity
acceptance_manifest_digest
workload_or_seed_digest
node_count
scenario_config
shared_resource_classification
budget_identity
```

Common hard invariants:

- no acceptance threshold is weakened after a final run starts;
- thresholds remain unchanged between node-count cells for the same claim unless the report explicitly treats them as a different benchmark generation;
- comparative claims use a paired baseline/control on the same workload;
- exceptions, excluded samples and retries are disclosed and attributable;
- unauthorized owner-funded provider execution is zero;
- cross-series namespace/resource contamination is zero;
- evidence provenance is complete and recomputable from raw/sanitized records;
- failed and invalidated campaigns remain durable evidence rather than being deleted.

## Scenario 1 — N/SOVEREIGNTY

### Question

Can TRUYN route computation while respecting jurisdiction/data-residency constraints even when the cheapest or fastest provider would violate them?

### Required topology

- at least **3 declared jurisdiction/region classes**;
- at least **2 cloud/provider infrastructures**;
- policy-tagged nodes and data objects;
- feasible and deliberately impossible policy cases;
- a cheaper/faster forbidden candidate in the conflict arm.

### Required branches

1. compatible provider exists in the allowed jurisdiction → use it;
2. compatible provider does not exist → **fail closed**;
3. compute-near-data → move execution toward the data rather than moving restricted data out;
4. logging/telemetry path → prove restricted payload is not copied into a disallowed log/metadata sink.

A claimed sovereignty proof must use actual data-plane/network evidence, not only the route declared by the application.

## Scenario 2 — N/MARKETPLACE

### Question

Can TRUYN form an economy of capabilities in which requesters discover and route to specialists without knowing provider identities?

Capability classes should include more than generic chat. The initial public taxonomy includes examples such as:

```text
language.translate
text.summarize
embedding.generate
media.image.generate
code.review
reasoning.general
data.fetch
```

The exact provider inventory is benchmark input. Multiple eligible vendors/nodes per class are required where a choice is being measured.

Atomic NEEDs and composite capability DAGs are both required. Every composite sub-result retains step-level provenance.

## Scenario 3 — N/TRUST-DECAY

### Question

Can network trust adapt from repeated independently verified outcomes so semantically bad providers lose work without a manual blocklist, while good providers avoid false punishment and domain-specific behavior remains isolated?

The bad providers must return signed, syntactically valid but subtly wrong/stale/low-quality content. Simple crashes do not test semantic trust decay.

Ground truth is independent from TRUYN's own trust state. Hidden oracle material is committed before measurement and remains private until safe disclosure, if ever.

Required branches:

- bad-in-domain-A / good-in-domain-B isolation;
- hostile/unauthorized dispute attempts;
- recovery after a previously bad provider begins behaving correctly;
- matched good-provider controls.

## Scenario 4 — N/SUSTAINED-CHURN

### Question

Can a loaded open network continue converging when nodes continuously arrive and leave over many peer-record TTL/refresh cycles?

This is not a single kill/restart test. Membership changes continuously while NEED traffic remains active. Bootstrap nodes also participate in churn according to the frozen schedule.

A valid long-window run spans at least:

```text
max(2 hours, 12 peer-record TTL cycles)
```

unless a later benchmark generation deliberately raises this floor. Results are reported as a curve over exact churn rate. A bare statement such as "churn PASS" without the tested rate and interval is forbidden.

## Planned topology cells

The initial low-cost progression is intentionally asymmetric:

| Scenario | First cell | Next cell | Why |
|---|---:|---:|---|
| N/SOVEREIGNTY | 50 nodes | 100 nodes | deterministic policy/data-plane proof first |
| N/MARKETPLACE | 50 nodes | 100 nodes | capability discovery and composite routing |
| N/TRUST-DECAY | 50 nodes | 100 nodes | enough repeated competition for statistical learning |
| N/SUSTAINED-CHURN | 100 nodes | 200 nodes | long-window membership dynamics need a larger population |

Node-count cells do not weaken acceptance thresholds. Passing a smaller cell does not imply the larger cell.

## Scenario order

The default execution order is:

```text
N/SOVEREIGNTY
      ↓
N/MARKETPLACE
      ↓
N/TRUST-DECAY
      ↓
N/SUSTAINED-CHURN
```

Rationale:

- sovereignty is relatively deterministic and has direct enterprise/regulatory value;
- marketplace proves capability-directed self-organization;
- trust-decay requires hidden ground truth and repeated rounds;
- sustained churn requires the longest windows and repeated TTL/refresh cycles.

The series may run lanes in parallel only when the common cross-series/resource-isolation contract is satisfied.

## Cross-series isolation

N-Series binds to `docs/benchmarks/BENCHMARK_SERIES_ISOLATION.md`.

Canonical namespace:

```text
N/<benchmark_id>/<run_id>
```

Required concurrency group pattern:

```text
n-series-<benchmark_id>-<resource_scope>
```

N may share immutable/read-only R0 dependencies. R1 services require attributable usage and interference detection when they affect a headline metric. R2 mutable/fault/capacity targets require exclusive leases. A waiting N run records `WAITING_SHARED_RESOURCE`; it never cancels or mutates a D/S/T/H/E run.

## Evidence boundary

Every measured N claim must preserve, when safe:

- exact source/release and runner identity;
- frozen acceptance/workload/seed/config digests;
- topology cell and capability/policy/trust/churn parameters;
- raw or normalized telemetry sufficient to recompute headline metrics;
- paired control identity where comparative;
- interference and exception records;
- run/workflow/artifact identities and cryptographic digests;
- cleanup result;
- limitations and negative findings.

Public reports redact private operational values rather than deleting evidence. Raw sensitive packet/flow logs, hidden oracle bodies and managed topology stay private.

## Current status

This document defines architecture only. **No N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY or N/SUSTAINED-CHURN PASS is claimed.**
