# F-Series Fault Domain and Execution Contract

Status: **FOUNDATION / NO DESTRUCTIVE RUN AUTHORIZED BY THIS DOCUMENT**

## Public/private split

Public `inn-media/truyn` owns the fault taxonomy, metric formulas, acceptance gates, proof requirements and sanitized evidence format.

Private `inn-media/truyn-platform` owns the managed cloud topology, resource identifiers, fault application, audit export, R2 lease integration and cleanup.

## Required physical layout

The private runner must create a dedicated F workload fault domain plus a separate control/evidence domain.

The workload domain contains the F nodes, relay and replicated storage intended to experience faults. The control/evidence domain contains the independent observer and immutable evidence destination and must survive destruction or isolation of the workload domain.

No F destructive selector may match resources owned by A/D/S/T/H/E/N.

## Execution order

1. freeze public SHA/release, private runner SHA, contract digest, workload and episode manifest;
2. reconcile active benchmark coordination state;
3. acquire the exclusive F R2 fault-domain lease;
4. provision and register only F-owned resources;
5. run no-fault control;
6. execute F1-F5 physical episodes under continuous workload;
7. heal/restore and verify correctness after every bounded episode;
8. export independent observer and cloud-audit evidence;
9. cleanup or restore all F-owned resources;
10. execute F6 independent reconciliation;
11. release the lease after terminal ownership reconciliation.

A failed lease acquisition yields `WAITING_SHARED_RESOURCE`; it never authorizes takeover, mutation or cleanup of another owner.

## Sanitation

Do not copy H deterministic fault scaffolding into F and then relabel it physical. Do not copy D launch identities or immutable D evidence into an F result.

Reuse is limited to stable public runtime/protocol artifacts, generic coordination primitives and generic evidence utilities.

Until a real destructive execution exists, every current-state document must say **foundation defined / not executed**.
