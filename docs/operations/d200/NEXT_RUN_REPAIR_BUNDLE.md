# D-200 next-run repair bundle — historical / superseded

TASK_ID: `truyn-d200-parallel-closure-260914-a7f3`

Status: **SUPERSEDED BY ACCEPTED D-200 PASS**

This document is retained as historical repair context. It originally recorded the stage-isolated repair bundle prepared after failed D-200 run `35462775116` and the diagnostic hardening used by subsequent repair iterations.

The closure task is now complete. The immutable accepted run is `35503894414`, attempt 1, with strict terminal marker `TRUYN_D200_TERMINAL result=PASS`.

Accepted evidence: [`../../benchmarks/CLASS_D_200_2026-09-20.md`](../../benchmarks/CLASS_D_200_2026-09-20.md). Current operational status: [`../NETWORK_SCALE_STATUS.md`](../NETWORK_SCALE_STATUS.md).

## Final resolution

The accepted source repair plus stage-isolated diagnostics resolved the restart-recovery failure without weakening acceptance. The passing run proved:

- 20/20 hosts / 200 real processes;
- readiness 200/200;
- convergence 200/200, p95 `256.43 ms`;
- baseline routing 400/400;
- safety invariants PASS;
- 100 acknowledged durable writes;
- restart of 100 nodes across all 20 hosts, recovery p95 `28,717 ms`;
- post-restart routing 100/100 first-attempt, application retries `0`;
- real packet partition with zero successful blocked probes and recovery `32,159 ms`;
- healed routing 200/200, p95 `322.473 ms`;
- write retention 100/100 with acknowledged loss `0`, confirmed missing `0`, read errors `0`;
- resource observation 200/200 processes;
- campaign cleanup confirmed, remaining `0`;
- staging cleanup confirmed, remaining `0`;
- evaluator rc `0`, campaign rc `0`, terminal PASS.

Accepted tuple:

- tested source: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- tested tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- launcher merge: `e785815530a59a56787e20ceb6bb232ccc93ad4f`
- run: `35503894414`
- artifact ID: `10603748497`
- artifact digest: `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`

Run `35503894414` is accepted immutable evidence and **NEVER_RERUN**.

## Historical failure facts

The earlier failed run `35462775116` proved provisioning and the pre-restart network were healthy enough to reach restart: 20 hosts / 200 real processes, topology PASS, readiness 200/200, convergence 200/200, baseline 400/400, safety PASS, and 100 acknowledged durable writes. It failed at restart recovery and motivated the diagnostic hardening below.

A later failed run `35470182984` provided complete evidence that pre-restart state was GREEN while restart recovery failed; its evidence drove the final permanent source repair. Both runs remain immutable historical failures and are not converted into PASS by the later success.

## Repairs that became part of the accepted path

1. Session binding uses process instance generation/identity so a real process restart invalidates stale transport/RPC sessions without treating ordinary lease renewal as a restart.
2. Peer-record restart readiness is based on required Kademlia placement rather than every recovered peer; recovered-peer dissemination remains best-effort and does not broaden the readiness gate.
3. Persistence work is coalesced so unchanged peer-record hearsay does not repeatedly force full snapshot/fsync work.
4. Restart generation recovery, discovery-client lease/refcount behavior, DHT replication cleanup, required-placement readiness, recovered-peer hydration, critical publish/background dissemination and persistence anti-starvation were hardened without lowering thresholds.
5. Per-host restart diagnostics record remote/logical rc, readiness counts, pending propagation, valid peers, buckets, remote-host diversity, refresh status and last failing local node.
6. Stage-isolated orchestration continues independent meaningful stages after a failure, records PASS/RED/SKIPPED_DEPENDENCY, preserves first failure, and still returns non-zero whenever a mandatory stage fails.
7. Post-restart acceptance remains first-attempt-only; diagnostic retries never change the gate.
8. Write-retention evidence separates confirmed missing records from read/control errors; acknowledged write loss remains strictly zero.

## Stage-isolated orchestration retained

`scripts/d200-stage-isolated-campaign.sh` remains the canonical diagnostic execution model for this scale path. It isolates top-level stages, aggregates complete evidence, skips only invalid dependencies, rebuilds strict partial evidence after diagnostics, and leaves cleanup owned by the provisioner EXIT trap.

The stage plan is fail-closed: malformed or incomplete plans are RED. The GitHub acceptance launcher requires both campaign rc `0` and evaluator rc `0`, plus durability, cleanup, staging cleanup and immutable artifact gates, before emitting terminal PASS.

## Future use

This file is no longer a request to launch another D-200. D-200 is closed. Future D-500/D-1000 work may reuse the proven diagnostic principles, but must create new exact-SHA qualification and new single-shot acceptance evidence for those separate gates.
