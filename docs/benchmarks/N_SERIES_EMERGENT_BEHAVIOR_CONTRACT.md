# TRUYN N-Series Emergent Behavior Benchmark Contract

Status: **METHODOLOGY / NO N-SERIES PASS CLAIM YET**  
Applies to: **N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY, N/SUSTAINED-CHURN**  
Task: `truyn-n-series-foundation-260920-n0`

## 1. Objective

The N-Series measures emergent network behavior that is not proven merely because transport, discovery, provider execution or semantic retrieval already work.

The common substrate is the accepted Class D-200 network architecture plus the existing heterogeneous provider/semantic path. Each N claim still requires its own immutable execution and evidence.

A final N claim is valid only when:

1. the measured behavior is not pre-programmed into the requester;
2. the acceptance manifest is frozen before material final-run execution;
3. the run is isolated from D/S/T/H/E and other N runs according to `BENCHMARK_SERIES_ISOLATION.md`;
4. raw/sanitized telemetry is sufficient to recompute every headline metric;
5. any comparative statement uses a paired control/baseline on the same workload;
6. thresholds are not weakened between node-count cells in the same benchmark generation;
7. exceptions/retries/exclusions are disclosed;
8. no security, authorization or sovereignty invariant is traded for performance.

## 2. Immutable run identity

Every measured run has:

```text
series_id = N
benchmark_id = SOVEREIGNTY | MARKETPLACE | TRUST-DECAY | SUSTAINED-CHURN
run_id
run_class = PILOT | QUALIFICATION | FINAL | CHARACTERIZATION
public_truyn_sha_or_release
runner_sha_or_workflow_identity
acceptance_manifest_sha256
workload_or_seed_sha256
scenario_config_sha256
node_count
started_at
```

Mutable aliases such as `latest`, `current` or branch names are not evidence identities.

A repair changes source/runner/config identity and therefore requires a new run ID. The prior run remains evidence.

## 3. Common acceptance gates

The following gates apply whenever the relevant behavior is exercised:

| Gate | Acceptance |
|---|---:|
| Route/request success | **>= 99%** |
| Recovery p95 | **<= 120 s** |
| Unauthorized owner-funded provider calls | **0** |
| Invalid/stale/forbidden execution accepted | **0** |
| Cross-series namespace collisions | **0** |
| Foreign artifact writes | **0** |
| Foreign cleanup actions | **0** |
| Undeclared mutable shared dependencies | **0** |
| Uncontrolled cross-series fault overlap | **0** |
| Unattributed shared-provider usage affecting claim | **0** |
| Evidence/provenance required by scenario | **100% complete** |
| Material undeclared interference | **false** |

A scenario may add stricter gates. It may not weaken these common gates.

## 4. Result vocabulary

Final evaluator states:

- `PASS` — all frozen required gates pass;
- `FAIL` — the measured system violates one or more frozen gates;
- `INVALIDATED` — methodology/isolation/evidence contamination prevents a valid conclusion;
- `INCOMPLETE` — execution ended without enough required evidence;
- `BLOCKED_ACCESS` — external provider/entitlement access prevented the planned measurement before the relevant behavior could be exercised;
- `WAITING_SHARED_RESOURCE` — an R2/shared-resource lease is held elsewhere; this is an execution state, not a benchmark result.

No `PASS_WITH_EXCEPTIONS` state exists. Exceptions are either compatible with the frozen rules or the run is not a PASS.

---

# 5. N/MARKETPLACE

## 5.1 Hypothesis

Given only a capability name and constraints, the network can find and dispatch to a genuinely capable specialist, assemble composite capability chains, balance equivalent eligible supply, and avoid disguising discovery as all-node flooding.

## 5.2 Topology

Initial cells: **50 → 100 real independently identified nodes**.

The topology must expose multiple capability classes and, when load balancing is measured, multiple eligible providers for the same class.

Initial capability taxonomy:

```text
language.translate
text.summarize
embedding.generate
media.image.generate
code.review
reasoning.general
data.fetch
```

Additional capabilities may be added without changing the benchmark generation if their semantics are frozen before the run.

## 5.3 Requester blindness invariant

For a discovery-tested NEED, the requester input/config may contain:

```text
capability
constraints
input/object refs
policy
quality/deadline/cost bounds if applicable
```

It MUST NOT contain the target provider/node ID, endpoint or a precomputed specialist address.

Measured value:

```text
provider_identity_leak_count = 0
```

## 5.4 Maneuvers

Required workload classes:

1. atomic NEED where requester lacks the capability;
2. same capability with >=2 equivalent eligible providers;
3. capability with nearby but incapable distractor nodes;
4. composite DAG requiring >=3 distinct capability steps;
5. provider departure/replacement during discovery for at least one non-final characterization/pilot cell.

## 5.5 Metrics

### Specialist hit rate

```text
specialist_hit_rate =
  successful_dispatches_to_capable_node / eligible_atomic_dispatch_attempts
```

Acceptance: **>=99%**.

### Incapable dispatches

```text
incapable_dispatch_count
```

Acceptance: **0**.

A node that falsely advertises a capability belongs in a separate adversarial/trust scenario unless the marketplace run explicitly freezes that case.

### Composite completion

```text
composite_completion_rate =
  completed_valid_composite_jobs / attempted_composite_jobs
```

Acceptance: **>=99%**.

### Composite provenance

Every completed sub-step must retain provider identity/provenance/correlation sufficient to reconstruct the chain.

Acceptance:

```text
step_provenance_completeness = 100%
```

### Discovery targeting / anti-flood metric

Measure candidate/discovery fan-out separately from actual provider execution.

```text
discovery_fanout_fraction = distinct_nodes_contacted_for_discovery / active_nodes
execution_fanout = distinct_provider_executions_for_one_atomic_NEED
```

Unless redundancy is explicitly requested by the frozen workload:

```text
all_node_broadcast_count = 0
execution_fanout = 1
p95(discovery_fanout_fraction) <= 0.10
```

A run that finds the correct specialist by broadcasting every NEED to the whole network is not a marketplace PASS.

### Route/path length

Record discovery hops and end-to-end route hops. This is descriptive unless a later generation freezes a numerical gate. It must never be omitted when fan-out/efficiency is claimed.

### Load balance among equivalent providers

Use a dedicated equal-policy arm in which equivalent providers have matched declared weight/eligibility and no intentional cost/trust preference.

Jain's fairness index:

```text
J = (sum(x_i)^2) / (n * sum(x_i^2))
```

where `x_i` is completed work assigned to eligible equivalent provider `i`.

Acceptance for the equal-policy arm: **J >= 0.90** after the frozen minimum sample count.

The benchmark must not treat unequal policy weights as unfairness.

## 5.6 False-PASS traps

A N/MARKETPLACE result is invalidated when:

- requester is pre-seeded with specialist ID/address;
- a central runner directly selects the provider while claiming network discovery;
- discovery floods all nodes and hides this by reporting only successful execution;
- capability truth is evaluated using the same mutable routing/trust state being tested rather than an independent capability manifest;
- composite chain provenance is reconstructed after the fact instead of being emitted by the measured path.

---

# 6. N/SOVEREIGNTY

## 6.1 Hypothesis

TRUYN can enforce residency/jurisdiction constraints at selection and execution time, fail closed when no compliant route exists, and move computation toward restricted data rather than exporting the data.

## 6.2 Topology

Initial cells: **50 → 100 real independently identified nodes**.

Required:

- >=3 region/jurisdiction classes;
- >=2 cloud/provider infrastructures;
- policy-tagged nodes, tasks and/or data objects;
- a conflict arm where the cheapest/faster provider is forbidden;
- at least one feasible allowed-region case and one impossible-policy case.

Safe public labels may be `EU`, `AZ/CIS`, `US` or equivalent classes. Exact operational resource identities remain private.

## 6.3 Policy branches

Required branches:

### A — compliant provider exists

The network must select an eligible provider in the allowed region even when a forbidden provider is cheaper/faster.

### B — compliant provider absent

The network must return a fail-closed policy outcome without dispatching restricted data outside the allowed boundary.

### C — compute-near-data

The task/compute is routed to the data region. The restricted source data is not exported merely to use a preferred provider.

### D — logs/metadata

Restricted raw payload/content must not appear in a disallowed central log, tracing payload, debug dump or benchmark export.

## 6.4 Data-plane proof rule

Application-declared route labels are insufficient.

A valid sovereignty result combines at least:

- signed/application routing and policy-decision events;
- actual egress/network-flow observation from the relevant source/compute boundary;
- enforcement configuration outcome (for example, fail-closed egress policy) attributable to the run;
- canary/leak audit proving restricted test material did not appear in forbidden sinks;
- provider execution region/jurisdiction evidence safe enough to support the claim.

The public report may sanitize the raw topology and retain cryptographic identities/digests for private artifacts.

## 6.5 Metrics and acceptance

### Policy compliance

```text
policy_compliance_rate = compliant_policy_outcomes / all_policy_exercising_requests
```

Acceptance: **100%**.

### Forbidden provider execution

```text
forbidden_execution_count = 0
```

### Forbidden data egress

```text
forbidden_data_egress_events = 0
```

This refers to observed data-plane/network events, not only route declarations.

### Fail closed

```text
impossible_policy_fail_closed_rate =
  correct_fail_closed_outcomes / impossible_policy_requests
```

Acceptance: **100%**.

### Compute-near-data

For feasible compute-near-data cases:

```text
compute_near_data_success_rate = 100%
```

### Restricted-content log leakage

```text
restricted_content_leak_events = 0
```

### Compliance tax

Report, do not hide:

```text
latency_compliance_tax = (restricted_latency - unrestricted_latency) / unrestricted_latency
cost_compliance_tax = (restricted_cost - unrestricted_cost) / unrestricted_cost
```

The first generation does not require the tax to be small; it requires it to be measured honestly.

## 6.6 False-PASS traps

Invalidating conditions include:

- checking only the selected/declared route rather than actual egress;
- allowing raw restricted payload into a global telemetry/logging sink;
- removing forbidden providers from the topology instead of creating a real policy conflict;
- silently rerouting outside the jurisdiction when no compatible provider exists;
- reporting a region label that does not correspond to the actual execution/data-plane path.

---

# 7. N/SUSTAINED-CHURN

## 7.1 Hypothesis

Under continuous workload, the network maintains >=99% routing success up to a declared churn rate, repeatedly reconverges within the recovery envelope, admits newcomers to steady state, and avoids slow monotonic degradation across many peer-record TTL cycles.

## 7.2 Topology and duration

Initial cells: **100 → 200 real independently identified nodes**.

A final long-window run duration is at least:

```text
max(2 hours, 12 * peer_record_TTL)
```

Traffic remains active throughout the measurement window.

## 7.3 Churn definition

Each run records:

```text
population_size
churn_interval_seconds
nodes_joined_per_interval
nodes_removed_per_interval
population_fraction_replaced_per_interval
population_fraction_replaced_per_minute
population_fraction_replaced_per_TTL
bootstrap_nodes_churned
```

The initial characterization matrix SHOULD include **5%, 10%, 20% population replacement per frozen interval** when operationally feasible.

A final PASS always names its rate. The series reports:

```text
max_tested_supported_churn_rate
first_tested_break_rate
```

No claim is made above the highest tested passing rate.

## 7.4 Maneuver

- continuous NEED stream before, during and after every churn event;
- nodes may leave mid-chain;
- newcomers join while load continues;
- bootstrap nodes participate in the frozen churn schedule;
- run spans repeated refresh/expiry cycles;
- no pause for an idle-only reconvergence phase.

## 7.5 Metrics and acceptance

### Routing success by churn rate

```text
routing_success_rate(rate) = successful_requests / attempted_requests
```

Acceptance for every claimed supported rate: **>=99%**.

### Recovery

For churn events that create measurable loss of reachability:

```text
recovery_p95 <= 120 s
```

### Orphaned requests

```text
orphaned_request_rate <= 1%
```

Requests intentionally cancelled by the frozen workload are excluded and separately counted.

### Newcomer steady-state

`newcomer_ready_seconds` is measured from the newcomer's successful runtime/network start to meeting the frozen readiness definition and successfully handling/forwarding a measured request.

Acceptance:

```text
p95(newcomer_ready_seconds) <= 120 s
```

### No slow degradation

Split the steady measured window into quartiles after initial warmup.

Acceptance:

```text
Q4_routing_success >= Q1_routing_success - 0.5 percentage points
Q4_stale_peer_fraction <= Q1_stale_peer_fraction + 1.0 percentage point
```

Also report queue/backlog slope and peer-table validity. A material monotonic backlog or routing-table deterioration that is hidden by whole-run averaging invalidates the no-degradation claim.

### Transient visibility

Per-event and time-bucket failure/recovery spikes are retained. They may not be averaged away into a single benign mean.

## 7.6 False-PASS traps

Invalidating conditions include:

- short run that does not span many TTL/refresh cycles;
- churn occurs while request load is paused;
- measuring only final healed state;
- excluding bootstrap nodes from churn without disclosure;
- reporting only aggregate success while transient outage windows are omitted;
- changing churn interval between node-count cells while claiming an unchanged rate without normalized rate reporting.

---

# 8. N/TRUST-DECAY

## 8.1 Hypothesis

Repeated independently verified outcomes cause semantically bad providers to lose traffic over time, improve total network accuracy, preserve good providers from false punishment, isolate reputation by domain, reject dispute abuse and allow rehabilitated providers to regain trust.

## 8.2 Topology

Initial cells: **50 → 100 real independently identified nodes**.

For one or more capability/domain classes, include:

- multiple good providers;
- multiple intentionally bad providers;
- same-capability competition;
- at least one provider that is bad in domain A but good in domain B;
- at least one recovery phase where a previously bad provider becomes good;
- hostile/unauthorized dispute attempts.

Bad behavior is semantic: signed, syntactically valid, plausible but wrong/stale/low-quality output. Crash-only behavior is not sufficient.

## 8.3 Independent oracle requirement

Ground truth must be independent of the trust system being tested.

Before measured execution, private oracle/workload material is committed by digest. The routing/trust path never receives hidden good/bad labels.

For ordinary quality failures, a provider/domain must accumulate at least the frozen minimum evidence count before crossing the benchmark's quality-based avoidance threshold. The initial foundation minimum is **30 independently scored observations per provider/domain**, unless a separate cryptographic/security violation justifies immediate exclusion.

## 8.4 Learning and recovery windows

`learning_window_rounds` and `recovery_window_rounds` are frozen after low-cost pilot calibration and **before any final run**. They do not change between 50- and 100-node final cells within the same benchmark generation.

The public final report always publishes these window sizes.

## 8.5 Metrics and acceptance

### Traffic share to known-bad providers

```text
bad_provider_traffic_share(round_window) =
  completed_work_to_oracle_bad_providers / completed_competing_work
```

Acceptance:

```text
bad_provider_traffic_share <= 1%
by end of frozen learning window
and remains <= 1% over the final 25% of measured rounds
```

### Rounds to avoidance

Report the first round/window at which the <=1% floor is reached and remains stable according to the frozen rule.

```text
rounds_to_avoidance <= frozen_learning_window_rounds
```

### Network accuracy trend

Compute accuracy from independent oracle labels.

Acceptance requires:

```text
accuracy_last_quartile > accuracy_first_quartile
```

and the lower bound of the frozen 95% confidence interval for the accuracy delta must be **> 0**.

The confidence method/sample minimum is frozen before final execution.

### False penalty

A false penalty is a quality-based avoidance/exclusion action against an oracle-good provider when the frozen evidence rule does not justify it.

Acceptance:

```text
false_penalty_rate <= 0.5%
```

and no single unverified/unauthorized dispute may directly create a quality-based exclusion.

### Domain isolation

For a provider bad in domain A but oracle-good in domain B, compare domain-B selection/accuracy to a matched good-provider control.

Acceptance:

```text
abs(domain_B_selection_delta_vs_control) <= 5%
domain_B_accuracy remains within frozen good-provider tolerance
```

A global collapse of trust from one bad domain is a FAIL.

### Dispute authorization safety

```text
unauthorized_dispute_accepted_count = 0
unauthorized_dispute_score_mutation_count = 0
```

### Rehabilitation

After a provider switches to oracle-good behavior, it must regain a substantial share of matched eligible traffic rather than remaining permanently blocklisted.

Acceptance:

```text
recovered_provider_share >= 90% of matched_good_control_share
within frozen_recovery_window_rounds
```

unless the frozen trust policy explicitly classifies the earlier behavior as an irreversible security violation; such irreversible cases are a separate branch and not counted as ordinary quality-decay recovery.

## 8.6 False-PASS traps

Invalidating conditions include:

- oracle label derived from TRUYN's own trust score;
- manual provider blocklist applied during the measured learning phase;
- bad provider identified to the router by hidden fixture label;
- one accidental bad answer causing immediate permanent suppression contrary to the frozen evidence rule;
- disputes accepted without required authorization;
- domain A quality failure suppressing domain B without explicit cross-domain policy;
- publishing improved trust score without showing actual traffic allocation and independent network accuracy.

---

# 9. Comparative control rules

When the claim is comparative, the paired control must use the same task/input/seed and compatible timing stratum.

Examples:

- N/SOVEREIGNTY compliance tax: unrestricted policy arm vs restricted policy arm;
- N/MARKETPLACE targeted discovery: reference eligible-discovery behavior vs any alternative explicitly compared;
- N/TRUST-DECAY: static/no-learning routing control vs adaptive trust routing when claiming improvement caused by trust adaptation;
- N/SUSTAINED-CHURN: no-churn or lower-churn cell for degradation curves.

Order randomization/counterbalancing must be frozen when provider/cache/time effects could bias the comparison.

# 10. Cross-series isolation

N-Series inherits the normative common contract in `BENCHMARK_SERIES_ISOLATION.md`.

Mandatory namespace:

```text
N/<benchmark_id>/<run_id>
```

N must never reuse D/S/T/H/E mutable state, launch tokens, caches, artifact prefixes, temporary indexes, provider-capacity mutation controls, fault targets or cleanup scopes.

Shared resources are classified R0/R1/R2 before execution:

- **R0:** immutable public source/release, frozen corpus, public price snapshot, accepted D evidence;
- **R1:** provider endpoint/shared telemetry/network service with attributable usage and interference probe when needed;
- **R2:** mutable capacity, shared cache/index, packet-path fault domain, provider deployment scaling, network rule or any shared target changed by the benchmark.

R2 is exclusively leased. Conflict means `WAITING_SHARED_RESOURCE`, not cancellation of the owner.

# 11. Evidence bundle

A final evidence bundle must contain or cryptographically identify:

```text
run-manifest.json
acceptance-manifest.json
scenario-config.json
resource/isolation manifest
normalized telemetry/events
metric recomputation output
exception/retry/exclusion ledger
interference report
cleanup report
public source/release identity
runner/workflow identity
artifact/file SHA-256 manifest
sanitization/export manifest
```

N/TRUST-DECAY additionally requires the pre-run hidden-oracle commitment identity. N/SOVEREIGNTY additionally requires private raw data-plane evidence identity plus sanitized proof summary.

# 12. Stop / invalidation conditions

A runner must stop or refuse final acceptance when it detects:

- acceptance manifest drift after freeze;
- public source/runner identity drift;
- missing or ambiguous run attribution;
- namespace collision or foreign resource ownership;
- R2 conflict without exclusive lease;
- material unaccounted R1 interference;
- provider billing owner ambiguity;
- sovereignty enforcement not instrumented at data-plane level;
- oracle/workload commitment mismatch;
- evidence loss that prevents metric recomputation;
- cleanup logic broad enough to touch foreign-series resources.

# 13. Current status

This file is a frozen methodology foundation, not measured evidence. **No N-Series PASS exists until immutable real runs satisfy these rules.**
