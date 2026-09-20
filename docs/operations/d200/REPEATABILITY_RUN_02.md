# D-200 repeatability run 02 — final accepted repeat

TASK_ID: `truyn-d200-repeatability-02-260920-r2`  
Durable anchor: issue `#676`  
Reference accepted run: `35503894414` — **PASS / NEVER_RERUN**  
Repeat run: `35517248924` — **PASS / NEVER_RERUN**

## Purpose and result

Repeatability 02 was a fresh, independent D-200 campaign created after Repeatability 01 failed before provisioning. It reused the exact frozen D-200 source/tree, immutable runtime bundle, unchanged evaluator, unchanged safety/recovery thresholds, and the accepted placement class.

Final result: **PASS**.

- 20 hosts / 200 real processes / 200 identities / 200 endpoints / 0 synthetic;
- readiness 200/200;
- convergence 200/200, p95 `302.045 ms`;
- baseline 400/400, p95 `642.338 ms`;
- restart 100 nodes, recovery p95 `28,798 ms`;
- post-restart 100/100 first attempt, retries `0`;
- real packet partition, blocked successes `0/10`, recovery `32,130 ms`;
- healed 200/200, p95 `220.542 ms`;
- 100 acknowledged durable writes, retained 100/100, loss `0`;
- invalid signed state accepted `0`;
- stale/revoked receipt accepted `0`;
- unauthorized provider execution `0`;
- campaign cleanup `true`, remaining `0`;
- staging cleanup `true`, remaining `0`;
- campaign rc `0`;
- evaluator rc `0`.

## Immutable identity

- workflow: `.github/workflows/d200-repeatability-02.yml`
- workflow blob: `e405905f50bcfc13570171048a039454b3fab154`
- launcher SHA: `8035f5dd555826f8faf5ff5a2612713eacf3f7e7`
- run: `35517248924`, attempt `1`
- job: `106095150052`
- frozen source: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- frozen tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- runtime digest: `sha256:296e7684229eaea00be02ce573b255461e340eae1b07b88da395c0f1102598c3`
- Azure placement: `eastus2 / Standard_E2as_v7`
- artifact ID: `10607664333`
- artifact digest: `sha256:62808cb3e8c49c7a6218bd259365bfcb1a73ac267ea55ce33e11fe6c4f674010`
- terminal: `TRUYN_D200_REPEAT_TERMINAL result=PASS`

## Closure

This independent PASS confirms that the original accepted D-200 result is reproducible under the same strict contract.

Public evidence: [`../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md).  
Side-by-side matrix: [`../../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`](../../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md).

No D-200 workflow run is to be rerun. Future scale validation belongs to D-500 and D-1000.
