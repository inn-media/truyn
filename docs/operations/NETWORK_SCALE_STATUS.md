# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current network-scale operational status**. Stable architecture, roadmap, and top-level documentation must link here rather than copy ephemeral run state.

## Current state

Class C heterogeneous WAN, Class D-100, and **Class D-200 are accepted**.

**D-200 status: CLOSED / COMPLETE / REPEATABILITY CONFIRMED.**

The canonical D-200 closure task `truyn-d200-parallel-closure-260914-a7f3`, anchored by issue #536, is COMPLETE / PASS. The accepted immutable single-shot run is `35503894414`, `run_attempt=1`, with strict terminal marker `TRUYN_D200_TERMINAL result=PASS`.

The separate repeatability task, anchored by issue #676, is also complete. Repeatability 02 run `35517248924`, `run_attempt=1`, executed the same frozen source/tree/runtime and the same strict acceptance contract and emitted `TRUYN_D200_REPEAT_TERMINAL result=PASS`.

Accepted D-200 identity:

- frozen tested source: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- frozen tested tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- canonical accepted run: `35503894414` — PASS / NEVER_RERUN
- canonical accepted artifact: `10603748497`
- canonical artifact digest: `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`
- independent repeat run: `35517248924` — PASS / NEVER_RERUN
- independent repeat artifact: `10607664333`
- independent repeat artifact digest: `sha256:62808cb3e8c49c7a6218bd259365bfcb1a73ac267ea55ce33e11fe6c4f674010`
- shared runtime digest: `sha256:296e7684229eaea00be02ce573b255461e340eae1b07b88da395c0f1102598c3`
- repeat placement: `eastus2 / Standard_E2as_v7`

The accepted reference proved 20/20 hosts, 200 real processes, readiness 200/200, baseline 400/400, post-restart 100/100 first-attempt with zero application retries, healed 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, packet-partition recovery `32,159 ms`, 100 acknowledged durable writes with zero loss, zero safety violations, and complete campaign/staging cleanup.

The independent repeat reproduced the same strict PASS with convergence p95 `302.045 ms`, baseline p95 `642.338 ms`, restart recovery p95 `28,798 ms`, partition recovery `32,130 ms`, healed p95 `220.542 ms`, 100/100 retained writes, zero acknowledged loss, zero safety violations, and zero remaining campaign/staging resources.

Durable public evidence:

- canonical accepted report: [`../benchmarks/CLASS_D_200_2026-09-20.md`](../benchmarks/CLASS_D_200_2026-09-20.md)
- independent repeat report: [`../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md)
- side-by-side matrix: [`../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`](../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md)
- final closure record: [`d200/D200_FINAL_CLOSURE.md`](d200/D200_FINAL_CLOSURE.md)

Class D-500 and Class D-1000 remain **OPEN** and are separate gates. D-200 closure does not imply stable/mainnet or long-duration operational stability acceptance.

## Historical immutable failures

Historical D-200 failures remain immutable negative evidence and are not rewritten by the accepted/repeat PASS results.

Repeatability 01 run `35515705123` is preserved as a pre-provisioning FAIL. Its cloud campaign never started; it failed at OIDC identifier delivery and therefore is not benchmark-regression evidence.

Earlier failed/diagnostic D-200 runs remain historical evidence. Closed diagnostic issues are retained for audit history.

## Execution model retained

The old sequential pattern — full D-200 until first failure, repair one defect, then relaunch — remains rejected. Future D-scale work should retain bounded parallel/non-fail-fast diagnostics, complete lane evidence aggregation, root-cause grouping, targeted requalification, exact-SHA qualification, and fresh single-shot acceptance only after the final candidate is green.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published. Raw diagnostic logs remain in immutable Actions artifacts; durable public reports retain safe structured telemetry, artifact identifiers and cryptographic digests.

## D-200 operational rule

D-200 is closed. Runs `35503894414`, `35515705123`, and `35517248924` must not be rerun. Any future real scale campaign must be a distinct D-500 or D-1000 gate with new task identity, exact-SHA qualification, single-shot launch identity, immutable artifact, terminal marker, and durable evidence.
