# Class D Five-Patch Canonical Contract

Status: **CANONICAL_REQUIRED**  
Applies to: **D-200, D-500, D-1000**

These five fixes are part of the Class D execution contract. They are not temporary D-200 repairs and must not be removed, bypassed, replaced with weaker checks, or scoped away by later repair work.

## Canonical patches

1. **Durable-write diagnostics.** The shared Azure Class D campaign must preserve bounded per-write HTTP/ack/body evidence and explicitly surface remote write-marker failures before acceptance evaluation.
2. **Parallel DHT replication.** Replica `store` RPCs execute in parallel batches. Write quorum remains fail-closed and `minAcks` is never weakened.
3. **Peer-record renewal jitter.** Renewal scheduling includes bounded random jitter so large fleets do not renew in synchronized waves.
4. **Resumable fail-collect diagnostics.** Class D preflight uses an atomic checkpointed DAG. Failed stages remain FAIL, dependent stages become BLOCKED, independent stages continue, and later runs may resume from prior proven PASS stages. Any FAIL/INFRA/BLOCKED keeps the overall result RED.
5. **Real local multi-process repro.** Preflight starts separate real `network/testnet/node-service.js` processes and exercises topology, readiness, direct QUIC routing, DHT durability, partition/heal recovery and peer-record renewal.

## Scale inheritance

Patch 1 is implemented in `benchmarks/scale/class-d-azure-1000-campaign.sh`, the shared campaign source also consumed by strict D-1000 acceptance. Patches 2 and 3 are in the shared network runtime, so every Class D scale inherits them directly. Patches 4 and 5 are exposed through the shared `class-d` preflight layer and are executed for D-200, D-500 and D-1000.

D-500 does not yet have a separate production Azure acceptance launcher in the repository. Its canonical Class D profile therefore means the five-patch diagnostic/preflight contract is already defined and continuously exercised; it does **not** claim that a real 500-node Azure acceptance run exists or has passed.

## Enforcement

`config/class-d-five-patches.json` is the machine-readable authority. `scripts/check-class-d-five-patches.mjs` verifies the actual implementation markers and class wiring. The checker is part of mandatory CI.

`.github/workflows/class-d-five-patch-preflight.yml` runs three profiles in parallel on pull requests: D-200, D-500 and D-1000. Each profile writes exact-SHA checkpoint evidence. The aggregate accepts only when all three checkpoints are clean and belong to the tested SHA.

The legacy D-200 Bug Hunt remains supported, but its resumable stage job delegates to the canonical Class D runner with `--class 200`, preventing a separate D-200-only implementation from drifting away from higher scale classes.

## Change rule

A future change to any of the five behaviours requires all of the following in the same qualified change:

- preserve or strengthen the invariant;
- update the canonical manifest if the implementation location changes;
- keep D-200, D-500 and D-1000 coverage;
- pass the canonical checker;
- pass exact-SHA Class D preflight evidence;
- never reduce existing acceptance thresholds as a means of obtaining GREEN.
