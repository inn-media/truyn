# TRUYN N-Series Execution and Isolation Procedure

Status: **DEFINED / EXECUTION NOT STARTED**  
Series: **N**  
Task: `truyn-n-series-foundation-260920-n0`

## 1. Purpose

This document defines the public operational contract for running N-Series benchmarks without contaminating D, S, T, H, E or another N scenario. It does not contain private cloud resource identifiers, credentials, live quota values, hidden oracle material or managed cleanup commands.

Private managed execution belongs in `inn-media/truyn-platform` and consumes this public contract only from an immutable accepted/pinned surface.

## 2. Required execution order for the first N generation

Default order:

```text
N0 foundation / runner qualification
        ↓
N/SOVEREIGNTY
        ↓
N/MARKETPLACE
        ↓
N/TRUST-DECAY
        ↓
N/SUSTAINED-CHURN
```

This is an evidence-development order, not a global serialization rule. Independent runs may overlap when R0/R1/R2 classification proves they cannot contaminate each other.

## 3. Namespace contract

Every run uses:

```text
series_id = N
namespace = N/<benchmark_id>/<run_id>
```

All mutable state derived from the run must be run-scoped:

```text
state/N/<benchmark>/<run_id>/...
artifacts/N/<benchmark>/<run_id>/...
telemetry/N/<benchmark>/<run_id>/...
cache/N/<benchmark>/<run_id>/...
indexes/N/<benchmark>/<run_id>/...
cleanup/N/<benchmark>/<run_id>/...
```

Equivalent cloud/object-store prefixes are acceptable. Mutable aliases (`latest`, `current`) are forbidden as ownership boundaries.

## 4. Workflow/concurrency contract

Required pattern:

```text
workflow: n-series-<benchmark>
concurrency group: n-series-<benchmark>-<resource_scope>
```

A global group such as `truyn-benchmark` is prohibited because it would serialize/cancel unrelated series.

`cancel-in-progress` must not allow a new N run to cancel D/S/T/H/E or an unrelated N scenario.

## 5. R0 / R1 / R2 classification

Every shared dependency is classified before launch.

### R0 — immutable/read-only

Examples:

- accepted public TRUYN source/release;
- accepted D-200 evidence used as reference substrate;
- frozen public corpus/workload manifest;
- public price snapshot;
- frozen capability taxonomy.

No exclusive lease required.

### R1 — shared service with measurable interference

Examples:

- shared provider deployment/endpoint;
- shared network fabric;
- telemetry backend;
- shared but non-mutated durable service.

Requirements:

- request/run attribution;
- quota/capacity interference visibility when latency/cost/success is a headline metric;
- no config mutation by the benchmark;
- an interference probe when the methodology requires it.

Material unaccounted interference means `INVALIDATED`/`INCOMPLETE`, not a PASS.

### R2 — exclusive mutable/fault/capacity target

Examples:

- provider capacity being changed;
- shared cache/index being flushed or mutated;
- packet-path/network policy being fault-injected;
- shared routing table or mutable test authority;
- region/egress rule being changed for a sovereignty maneuver.

R2 requires an exclusive lease. Conflict means:

```text
N requester = WAITING_SHARED_RESOURCE
foreign owner = unchanged
```

No benchmark may seize, cancel or reconfigure the active owner.

## 6. Public/private execution split

### Public side

May contain:

- methodology;
- configuration schemas;
- generic/reference harness/evaluator logic using open/self-hostable surfaces;
- safe telemetry/metric formulas;
- deterministic sanitizer contract;
- sanitized evidence.

### Private side

Must contain managed details such as:

- real cloud topology;
- benchmark service identities and allowlists;
- provider deployment/quota/spend state;
- packet/flow log collection;
- hidden oracle/seed bodies;
- proprietary trust/ranking implementation;
- shared-resource coordinator backend;
- private resource creation/cleanup commands.

## 7. Full run procedure

### Step 0 — reconcile current repository state

Before material action:

- resolve exact public `main`/release identity;
- resolve exact private runner identity when managed execution is used;
- check for active foreign qualifying campaigns that would be invalidated by moving or mutating a shared surface;
- confirm this N run is not a duplicate of an already active/completed run.

### Step 1 — pin public contract

Freeze:

```text
public_truyn_sha_or_release
N architecture/benchmark/telemetry document identities
public evaluator/reference runner identity if used
```

Private execution may not consume a moving branch as an implicit dependency.

### Step 2 — define run identity

Generate globally unique:

```text
run_id
benchmark_id
run_class
namespace
series_budget_id
run_budget_id
```

### Step 3 — freeze workload/scenario config

Freeze exact:

- node-count cell;
- provider/capability distribution;
- task/workload/seed identity;
- policy matrix / churn schedule / trust phases as applicable;
- paired control specification when comparative;
- duration/sample minimums.

### Step 4 — freeze acceptance manifest

Numerical thresholds, confidence method, retry/exclusion rules, stop conditions and required evidence must be frozen **before final paid/material requests**.

A pilot may be used to calibrate sample size or trust learning/recovery windows. Final thresholds then remain unchanged across the final size cells in that benchmark generation.

### Step 5 — classify every shared resource

Record each dependency as R0/R1/R2. Acquire R2 leases before any mutation. Configure R1 interference probes where needed.

### Step 6 — authorization and budget preflight

Prove:

- benchmark requester identity is authorized only for intended owner-funded providers;
- negative unauthorized requester probe produces zero provider executions;
- billing owner is unambiguous;
- run spend envelope exists;
- provider quota/capacity is sufficient or the run fails closed before expensive work.

### Step 7 — zero/low-spend instrumentation preflight

Before a final campaign, verify:

- event IDs and run IDs propagate end-to-end;
- telemetry lands in the correct N namespace;
- metric recomputation works on synthetic/dry-run events;
- cleanup ownership tags are correct;
- no foreign namespace write/delete is possible through the runner;
- packet/flow evidence path is present for N/SOVEREIGNTY;
- hidden oracle commitment path is present for N/TRUST-DECAY.

### Step 8 — deploy/prepare only owned resources

Register every ephemeral resource to the run before or atomically with creation. Do not use broad product-wide prefixes for cleanup ownership.

### Step 9 — execute paired baseline/control where required

Use the same frozen task/seed/config stratum. Randomize/counterbalance order if warm cache/provider time effects could bias the comparison.

### Step 10 — execute N maneuver under live load

Scenario-specific requirement:

- SOVEREIGNTY: create real policy conflict and data-plane observation;
- MARKETPLACE: requester knows capability, never specialist ID;
- TRUST-DECAY: hidden oracle labels remain invisible to router/trust path;
- SUSTAINED-CHURN: workload never pauses for churn/reconvergence.

### Step 11 — monitor cross-series interference

During execution record:

- foreign runs on shared R1 services;
- provider throttling/rate limits;
- capacity/config changes;
- lease state;
- unexpected namespace collisions;
- shared resource saturation.

Do not silently retry around a material interference event and still claim the original run.

### Step 12 — evaluate frozen gates

Metric recomputation reads normalized events/raw safe inputs, not a mutable dashboard summary.

The evaluator emits:

```text
PASS | FAIL | INVALIDATED | INCOMPLETE | BLOCKED_ACCESS
```

with each gate's numerator/denominator/sample count and evidence pointer.

### Step 13 — cleanup by ownership

Cleanup may touch only:

- resources registered to current `run_id`; or
- explicitly leased R2 targets after verifying current lease ownership and required rollback state.

Verify zero remaining owned ephemeral resources unless the frozen plan intentionally retains an immutable artifact/evidence object.

### Step 14 — independent reconciliation

A separate reconciliation step verifies:

- source/runner/manifest identities;
- no manifest drift;
- every headline metric recomputes from evidence;
- interference/exception/exclusion ledgers match summaries;
- cleanup complete;
- no claim exceeds the measured size/rate/policy/domain scope.

### Step 15 — evidence export

Private raw evidence is sanitized deterministically. Public report retains safe normalized evidence and digests for withheld raw artifacts.

No measured report is deleted because it is negative. Security cleanup redacts sensitive values only.

## 8. Scenario-specific preflight additions

### N/SOVEREIGNTY

Before launch:

- actual egress/flow observation configured;
- policy conflict candidate exists;
- impossible-policy branch exists;
- compute-near-data branch exists;
- restricted payload canary defined;
- raw-content logging prohibition verified;
- any shared network-policy mutation classified R2.

### N/MARKETPLACE

Before launch:

- frozen capability manifest exists independently of router result;
- requester fixture has no provider/node ID;
- >=2 equivalent providers exist in the fairness arm;
- composite DAG has >=3 distinct capability steps;
- discovery fan-out instrumentation counts contacted nodes.

### N/TRUST-DECAY

Before launch:

- hidden oracle/seed commitment frozen;
- good/bad/domain/recovery phases committed privately;
- learning/recovery windows frozen for final run;
- confidence method/sample minimum frozen;
- hostile dispute fixture cannot bypass authorization;
- no manual blocklist active in measured quality-decay arm.

### N/SUSTAINED-CHURN

Before launch:

- peer-record TTL and refresh interval recorded;
- duration satisfies `max(2h, 12*TTL)` for final long-window run;
- continuous request generator proven active;
- churn interval/rate frozen;
- bootstrap participation specified;
- time-bucketed routing/peer/backlog telemetry enabled.

## 9. Stop conditions

Fail closed before or during material execution when:

- exact source/runner pin changes unexpectedly;
- acceptance manifest drifts after freeze;
- R2 ownership is unavailable;
- billing owner cannot be resolved;
- required provider entitlement/quota is absent;
- sovereignty data-plane proof path is unavailable;
- trust oracle commitment mismatch occurs;
- telemetry loses run attribution;
- foreign namespace/resource mutation is detected;
- cleanup cannot prove ownership;
- material R1 interference makes the headline result ambiguous.

## 10. Series isolation matrix

| Interaction | Allowed? | Rule |
|---|---|---|
| N + D on separate ephemeral topology | Yes | distinct namespaces/resources; shared R1 measured if relevant |
| N + S sharing immutable public release | Yes | R0 |
| N + T sharing provider endpoint | Conditional | R1 attribution/interference proof |
| N + H logical runs on disjoint resources | Yes | distinct namespaces; no shared mutable target |
| N/SOVEREIGNTY network fault + foreign run same path | No without exclusive ownership | R2 lease |
| N capacity mutation + foreign series same deployment | No without exclusive ownership | R2 lease |
| N cleanup over product-wide prefix | No | owner-scoped cleanup only |
| N new run cancelling foreign concurrency group | No | groups must be series/benchmark/resource scoped |

## 11. Foundation status

No N workflow is launched by this document. The next implementation step is private/public runner/schema qualification followed by a low-cost N/SOVEREIGNTY pilot on isolated resources.
