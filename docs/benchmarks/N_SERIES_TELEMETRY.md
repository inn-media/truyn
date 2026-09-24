# TRUYN N-Series Telemetry and Metric Vocabulary

Status: **NORMATIVE PUBLIC-SAFE SCHEMA / NO RESULT CLAIM**  
Series: **N**

## 1. Purpose

N-Series claims must be reconstructable from normalized events rather than trusted summary prose. This document defines the minimum public-safe event vocabulary and metric inputs for N/SOVEREIGNTY, N/MARKETPLACE, N/TRUST-DECAY and N/SUSTAINED-CHURN.

Private runners may collect richer raw telemetry, but public metric semantics must remain compatible with this vocabulary. Sensitive topology, provider, packet/flow and hidden-oracle material is retained privately and exported only through safe labels, hashes, digests and derived measurements.

## 2. Common event envelope

Every normalized event carries enough identity to join to exactly one run:

```json
{
  "schemaVersion": "truyn.n.telemetry/v1",
  "seriesId": "N",
  "benchmarkId": "SOVEREIGNTY|MARKETPLACE|TRUST-DECAY|SUSTAINED-CHURN",
  "runId": "immutable-run-id",
  "runClass": "PILOT|QUALIFICATION|FINAL|CHARACTERIZATION",
  "eventId": "globally-unique-event-id",
  "eventType": "...",
  "phase": "preflight|baseline|measure|recovery|cleanup",
  "wallTime": "RFC3339 timestamp",
  "monotonicNs": 0,
  "publicTruynRef": "sha-or-release",
  "runnerIdentity": "safe-sha-or-workflow-identity",
  "requestId": null,
  "chainId": null,
  "nodeIdHash": null,
  "providerFamily": null,
  "capability": null,
  "regionClass": null,
  "cloudClass": null,
  "policyIdHash": null,
  "trustDomain": null,
  "payload": {}
}
```

Raw node/provider/resource IDs may be replaced by stable run-scoped hashes in public export.

## 3. Required common event types

```text
run_registered
run_state
resource_classified
resource_lease
interference_probe
budget_event
need_created
discovery_candidate
route_selected
provider_execution
result_received
request_terminal
exception_event
cleanup_event
run_terminal
```

Scenario-specific types extend this list.

## 4. Request terminal record

Every measured request has exactly one terminal record:

```json
{
  "eventType": "request_terminal",
  "payload": {
    "status": "success|failed|denied|cancelled|timeout|orphaned",
    "attempts": 1,
    "applicationRetries": 0,
    "latencyMs": 0,
    "routeHops": 0,
    "providerExecutions": 0,
    "provenanceComplete": true,
    "exceptionClass": null
  }
}
```

Retries/exclusions must remain visible. A summary may not silently convert retry-assisted success into first-attempt success.

## 5. Cross-series/interference record

```json
{
  "eventType": "interference_probe",
  "payload": {
    "resourceClass": "R0|R1|R2",
    "resourceKeyHash": "...",
    "baseline": null,
    "observed": null,
    "relativeDelta": null,
    "threshold": null,
    "material": false,
    "foreignSeriesObserved": []
  }
}
```

Public export may hash the resource identity while retaining class, measured shift, threshold and outcome.

---

# 6. N/MARKETPLACE telemetry

Additional event types:

```text
capability_advertised
capability_withdrawn
discovery_probe
specialist_selected
composite_step_start
composite_step_terminal
```

## 6.1 Capability manifest fields

For every counted node/capability pair:

```json
{
  "nodeIdHash": "...",
  "capability": "reasoning.general",
  "eligible": true,
  "advertisedWeight": 1.0,
  "manifestDigest": "sha256:..."
}
```

The evaluator uses the frozen independent capability manifest to determine whether a selected node was genuinely capable.

## 6.2 Discovery record

```json
{
  "eventType": "discovery_probe",
  "requestId": "...",
  "payload": {
    "targetCapability": "language.translate",
    "nodesContacted": 3,
    "activeNodes": 50,
    "candidateCount": 2,
    "requesterHadProviderId": false
  }
}
```

## 6.3 Marketplace formulas

```text
specialist_hit_rate = capable_dispatches / eligible_atomic_dispatch_attempts
incapable_dispatch_count = count(dispatch where frozen capability manifest says incapable)
composite_completion_rate = valid_completed_composites / attempted_composites
step_provenance_completeness = steps_with_complete_provenance / completed_steps
discovery_fanout_fraction = distinct_nodes_contacted_for_discovery / active_nodes
execution_fanout = distinct_provider_executions_for_atomic_need
provider_identity_leak_count = discovery-tested requests whose requester input contained target provider/node identity
```

Equal-policy load-balancing arm:

```text
Jain_fairness = (sum(x_i)^2) / (n * sum(x_i^2))
```

Report sample count, eligible provider count and declared weights with the fairness value.

---

# 7. N/SOVEREIGNTY telemetry

Additional event types:

```text
policy_decision
jurisdiction_candidate
egress_observation
compute_placement
leak_canary_observation
policy_terminal
```

## 7.1 Policy-decision record

```json
{
  "eventType": "policy_decision",
  "requestId": "...",
  "payload": {
    "policyClass": "only-region|forbid-region|data-stays-source|compute-near-data",
    "requestedRegionClass": "EU",
    "selectedRegionClass": "EU",
    "compatibleCandidateExists": true,
    "decision": "allow|deny",
    "reasonClass": "eligible|no-compatible-provider|egress-forbidden|other"
  }
}
```

## 7.2 Egress observation

Public-safe record:

```json
{
  "eventType": "egress_observation",
  "requestId": "...",
  "payload": {
    "sourceRegionClass": "EU",
    "destinationRegionClass": "EU",
    "bytes": 0,
    "forbiddenBoundaryCrossed": false,
    "rawPrivateEvidenceDigest": "sha256:..."
  }
}
```

The private raw evidence may come from cloud flow logs, egress gateway/firewall logs, packet-path observations or equivalent infrastructure telemetry. The public record keeps the safe result and cryptographic identity.

## 7.3 Sovereignty formulas

```text
policy_compliance_rate = compliant_policy_outcomes / policy_exercising_requests
impossible_policy_fail_closed_rate = correct_fail_closed / impossible_policy_requests
compute_near_data_success_rate = compliant_near_data_executions / feasible_near_data_requests
forbidden_execution_count = count(provider execution violating frozen policy)
forbidden_data_egress_events = count(observed forbidden boundary egress)
restricted_content_leak_events = count(restricted test material in forbidden sink)
latency_compliance_tax = (restricted_latency - unrestricted_latency) / unrestricted_latency
cost_compliance_tax = (restricted_cost - unrestricted_cost) / unrestricted_cost
```

Cost fields must distinguish public list-price equivalent from private net-cash/credit reconciliation.

---

# 8. N/SUSTAINED-CHURN telemetry

Additional event types:

```text
churn_event
node_join
node_leave
bootstrap_change
peer_table_sample
newcomer_ready
recovery_event
queue_sample
```

## 8.1 Churn event

```json
{
  "eventType": "churn_event",
  "payload": {
    "intervalSeconds": 60,
    "activeNodesBefore": 100,
    "nodesRemoved": 10,
    "nodesJoined": 10,
    "populationFractionReplaced": 0.10,
    "bootstrapNodesAffected": 1,
    "trafficPaused": false
  }
}
```

## 8.2 Peer-table sample

```json
{
  "eventType": "peer_table_sample",
  "payload": {
    "validEntries": 0,
    "staleEntries": 0,
    "expiredEntries": 0,
    "activePeerView": 0
  }
}
```

## 8.3 Churn formulas

```text
routing_success_rate(rate) = successful_requests / attempted_requests
orphaned_request_rate = orphaned_requests / attempted_requests
newcomer_ready_p95 = p95(node_ready_time - node_start_time)
recovery_p95 = p95(recovery_time - churn_effect_time)
stale_peer_fraction = stale_entries / max(1, total_peer_entries)
population_fraction_replaced_per_minute = replaced_fraction / (interval_seconds / 60)
population_fraction_replaced_per_TTL = normalized replacement over one peer-record TTL
```

Long-window drift report:

```text
Q1_routing_success
Q4_routing_success
Q1_stale_peer_fraction
Q4_stale_peer_fraction
queue_backlog_slope
```

Time-bucket distributions must be retained so outage spikes cannot be hidden by whole-run averaging.

---

# 9. N/TRUST-DECAY telemetry

Additional event types:

```text
oracle_observation
quality_verification
dispute_submitted
dispute_authorized
trust_update
trust_selection
provider_behavior_phase
rehabilitation_event
```

## 9.1 Oracle observation

Public-safe record:

```json
{
  "eventType": "oracle_observation",
  "requestId": "...",
  "payload": {
    "providerHash": "...",
    "domain": "finance",
    "oracleLabel": "good|bad",
    "qualityScore": null,
    "oracleCommitmentDigest": "sha256:..."
  }
}
```

Whether `oracleLabel` can be published depends on contamination risk. If withheld, the public export may preserve a stable opaque label plus aggregate calculations and the oracle commitment digest.

## 9.2 Trust update

```json
{
  "eventType": "trust_update",
  "payload": {
    "providerHash": "...",
    "domain": "finance",
    "reasonClass": "verified-quality|authorized-dispute|recovery|security-violation",
    "evidenceCount": 0,
    "scoreBefore": null,
    "scoreAfter": null,
    "selectionEligibleBefore": true,
    "selectionEligibleAfter": true
  }
}
```

Public export need not reveal proprietary trust weights or raw internal score if they are private. It must retain enough outcome/evidence-count data to recompute benchmark metrics.

## 9.3 Trust formulas

```text
bad_provider_traffic_share = completed_work_to_oracle_bad / completed_competing_work
rounds_to_avoidance = first stable round/window where bad_provider_traffic_share <= 0.01
network_accuracy = oracle_correct_results / oracle_scored_results
accuracy_delta = last_quartile_accuracy - first_quartile_accuracy
false_penalty_rate = unjustified_good_provider_penalties / eligible_good_provider_decisions
unauthorized_dispute_accepted_count = count(unauthorized disputes accepted as valid)
unauthorized_dispute_score_mutation_count = count(score/eligibility mutation caused by unauthorized dispute)
domain_B_selection_delta_vs_control = (observed_B_share - matched_control_B_share) / matched_control_B_share
rehabilitation_share_ratio = recovered_provider_share / matched_good_control_share
```

Confidence interval method and minimum sample count are part of the frozen acceptance manifest.

---

# 10. Economic fields

When cost is measured, preserve separate fields:

```text
provider_list_price_equivalent
provider_reported_usage
private_credit_covered
private_net_cash_cost
truyn_infrastructure_cost
one_time_setup_or_publication_cost
amortization_denominator
```

Public evidence may omit private negotiated/net-cash values while retaining list-price-equivalent methodology and a digest/statement that private reconciliation was performed if relevant.

# 11. Exception / retry ledger

Every run retains:

```json
{
  "requestId": "...",
  "exceptionClass": "provider-rate-limit|network-timeout|policy-deny|runner-error|other",
  "attempt": 1,
  "retryAllowedByManifest": false,
  "excludedFromMetric": false,
  "exclusionReason": null
}
```

Any excluded sample is counted and justified. Post-hoc exclusion to improve a metric invalidates the affected claim.

# 12. Evidence levels

Recommended evidence levels:

- **L0 summary** — human-readable report only; never sufficient by itself;
- **L1 normalized events** — public-safe event stream sufficient for metric recomputation;
- **L2 private raw evidence** — packet/flow logs, hidden oracle, operational traces, exact topology; private retention;
- **L3 cryptographic identity** — SHA-256/file manifest linking L1/public report to withheld L2 evidence.

Final public claims should have at least L1 plus L3 for every withheld evidence family.

# 13. Current status

Schema and formulas are defined. No event in this document is evidence that a N-Series run has executed or passed.
