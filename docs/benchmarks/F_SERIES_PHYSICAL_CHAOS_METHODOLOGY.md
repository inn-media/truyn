# F-Series — Physical Infrastructure Chaos Methodology

Status: **FOUNDATION DEFINED / ATTEMPT 1 NOT LAUNCHED**

F-Series exists to prove what H/CHAOS-FUZZ intentionally did not prove: resilience under **real infrastructure faults**. H/CHAOS-FUZZ remains valid evidence for isolated product-facing robustness; F is a new physical-infrastructure series, not a rename or retroactive expansion of H.

## Claim boundary

A simulated failure never satisfies a physical F claim. A measured episode is admissible only when the fault was applied outside the TRUYN product logic, the infrastructure state changed, and an independent observer measured the resulting effect.

Mocks, replays, deterministic fault flags and product-local fault controllers may be useful unit/regression tools, but they cannot count toward F physical evidence.

## Fault-domain model

Attempt 1 uses a dedicated Azure fault domain.

Inside that domain, the F nodes, relay and replicated storage deliberately share the infrastructure that the test is intended to disrupt. There is no artificial product-level isolation between those F components.

The F domain itself is physically and operationally disjoint from A/D/S/T/H/E/N measured resources. The independent observer and immutable evidence destination are outside the destructive domain. The full F destructive domain is covered by one exclusive R2 lease.

This distinction is essential:

- **inside F:** real shared infrastructure is broken;
- **outside F:** foreign benchmark infrastructure is not a target and is not mutated.

## Lanes

| Lane | Coverage |
| --- | --- |
| F1 | real packet loss, latency spikes and packet reordering |
| F2 | real WAN partition and heal |
| F3 | process/node termination and restart during in-flight work |
| F4 | storage unavailability, write failure, capacity exhaustion and replica loss |
| F5 | compound network + node + storage failures under continuous load |
| F6 | independent reconciliation of evidence, audit and post-heal state |

Every measured fault episode has a no-fault control using the same workload and instrumentation.

## Workload floor

During every measured episode:

- request rate >= 20 requests/s;
- durable write rate >= 50 writes/minute;
- replication factor = 3;
- minimum acknowledgements = 2.

An episode without active workload is diagnostic only.

## Physical impact proof

Every episode requires at least two independent proof sources:

1. injector/control-plane readback showing the requested infrastructure mutation occurred;
2. observer evidence showing the externally visible effect before, during and after heal.

Cloud-control-plane mutations additionally require an independently exported cloud audit record.

Each episode records pre-fault, during-fault and post-heal state digests.

## Acceptance

Required gates:

- recovery p95 <= 120 s;
- acknowledged confirmed writes lost = 0;
- phantom writes = 0;
- acknowledgements without quorum = 0;
- identity safety violations = 0;
- provenance safety violations = 0;
- foreign resource mutations = 0;
- post-heal acknowledged record set exactly reconciles.

Recovery p50/p95/p99 are reported only when statistically meaningful. With fewer than 100 samples, the maximum is reported as `max_not_percentile`, never mislabeled p99.

## Evidence and closure

The measured runner may emit at most **PASS_CANDIDATE**. It cannot self-award the terminal result.

Only independent reconciliation may emit **PASS_RECONCILED**, after verifying the frozen execution identities, all impact proofs, required audit records, write-set reconciliation, safety counters, evidence-chain integrity and terminal infrastructure state.

Accepted D-Series packet-partition/restart/write-retention results are useful historical baselines, but they are not F evidence and cannot close an F lane.
