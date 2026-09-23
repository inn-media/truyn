# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current D-Series operational acceptance**. Architecture, roadmap and top-level documentation must link here rather than copy ephemeral run state.

**Snapshot:** 2026-09-23  
**Snapshot main:** `eb25f0f8ad5bedb643f007ddfb0da107dab44b89`

## Accepted baseline

Class C heterogeneous WAN, Class D-100 and **Class D-200 are accepted**.

**D-200 status: CLOSED / COMPLETE / REPEATABILITY CONFIRMED.**

The canonical D-200 closure task `truyn-d200-parallel-closure-260914-a7f3`, anchored by issue #536, is COMPLETE / PASS. Accepted single-shot run: `35503894414`, `run_attempt=1`, strict terminal marker `TRUYN_D200_TERMINAL result=PASS`.

Independent repeatability run `35517248924`, `run_attempt=1`, executed the same frozen source/tree/runtime and strict acceptance contract and also passed.

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

The accepted reference proved 20/20 hosts, 200 real processes, readiness 200/200, baseline 400/400, post-restart 100/100 first-attempt with zero application retries, healed 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, packet-partition recovery `32,159 ms`, 100 acknowledged durable writes with zero loss, zero safety violations, and complete cleanup.

Durable public evidence:

- [`../benchmarks/CLASS_D_200_2026-09-20.md`](../benchmarks/CLASS_D_200_2026-09-20.md)
- [`../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md)
- [`../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`](../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md)
- [`d200/D200_FINAL_CLOSURE.md`](d200/D200_FINAL_CLOSURE.md)

## D-500 current boundary

**D-500 status: ACTIVE QUALIFICATION / OPEN.**

The repository now contains the dedicated D-500 contract/workflow, immutable launch generations and D-Series qualification machinery. This is materially beyond the original “preparation only” state, but it is **not an accepted D-500 result**.

Issue #737 permanently locks the D-Series execution architecture while remaining D-Series campaigns are active:

`Swarm diagnostic/repair engine → targeted block qualification during repair → clean exact-SHA Swarm revalidation → full B01–B16 exact-SHA admission → isolated LIVE qualification where required → shared-resource/capacity collision check → exactly one real D-Series run → immutable evidence`.

Important distinctions:

- targeted Bxx GREEN is diagnostic only;
- a launcher token/workflow is execution machinery, not acceptance;
- full B01–B16 admission requires clean exact-SHA Swarm provenance;
- no D-500 PASS exists until a fresh real campaign emits its own strict terminal PASS and durable public evidence is reconciled;
- D-200 evidence must not be reused as D-500 proof.

D-500 therefore remains OPEN despite active qualification and multiple immutable launch generations.

## D-1000 current boundary

**D-1000 status: OPEN.**

D-1000 is a distinct scale gate. It does not inherit PASS from D-200 or from any D-500 preparation/qualification activity. A future D-1000 acceptance requires its own exact-SHA qualification, single-shot launch identity, strict terminal PASS, immutable artifacts, cleanup proof and durable evidence.

## Historical immutable failures

Historical D-Series failures remain immutable negative evidence and are not rewritten by later successful results.

Repeatability 01 run `35515705123` remains preserved as a pre-provisioning failure and is not benchmark-regression evidence. Earlier D-200 failures/diagnostics remain audit history. D-500 failed/diagnostic attempts likewise must remain immutable and must never be silently converted into acceptance.

## Execution model

The old sequential pattern — run a full scale campaign until first failure, repair one defect, relaunch — is rejected.

Current D-Series work must retain:

- massively parallel/non-fail-fast Swarm diagnostics;
- root-cause grouping/deduplication;
- minimal acceptance-preserving repairs;
- targeted B01–B16 checks during repair;
- clean exact-SHA Swarm revalidation;
- full B01–B16 mandatory admission;
- exact-SHA CI/CodeQL/required qualification;
- fresh live/collision checks;
- exactly one real acceptance run after admission;
- immutable evidence and cleanup.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published. Raw diagnostic logs remain in immutable Actions artifacts/private operational storage; durable public reports retain safe structured telemetry, artifact identifiers and cryptographic digests.

## Operational rule

D-200 is closed and immutable. D-500 and D-1000 are separate open gates. Any new real D-Series campaign requires a new task/launch identity and must pass the locked Swarm-Blockwise admission architecture without weakening thresholds.
