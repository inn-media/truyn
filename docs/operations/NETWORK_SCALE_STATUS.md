# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current D-Series operational acceptance**. Architecture, roadmap and top-level documentation must link here rather than copy ephemeral run state.

**Snapshot:** 2026-10-08  
**Qualification architecture:** locked Frozen Candidate → Branch Qualification → Admission to Main, with Sanitation Swarm → Blockwise B01-B16. Parallel movement of `main` does not invalidate expensive frozen-candidate qualification by itself.

## Accepted baseline

Class C heterogeneous WAN, Class D-100, **Class D-200, Class D-500 and Class D-1000 are accepted**.

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

## D-500 accepted boundary

**D-500 status: CLOSED / ACCEPTED / PASS.**

Canonical accepted execution is Attempt 22:

- workflow run: `37666768998`
- `run_attempt=1`
- terminal: `TRUYN_D500_TERMINAL result=PASS`
- launch SHA: `23775f700929cf66ece66496428eece37cc240ed`
- frozen tested source: `1d6746b57104175e295f8fdc3d9643db8e9d42a6`
- frozen tested tree: `9f2771286cc683a9ee49e0e0c5f8092347d54470`
- runtime digest: `sha256:d11969a63145f27876bc03cf18f9bba0ac7bd2196d4ac3eee78b0d7642324f28`
- artifact: `11504509954`
- artifact digest: `sha256:6a255b77f2988913f41593a275c8bd7cb813ee0f49e52f3f073e51879e12cc66`
- A22 lineage merge into `main`: `5d0f8c3480ef8ff01887591fb96f552cf2192969`
- full accepted runtime forward-port / canonical main: `61469b6934066ce0719aecd68356419240d95988`

Accepted result: 20 hosts / 500 real processes / 500 identities / 500 endpoints; baseline routing `1.0`; post-restart `1.0`; healed `0.998`; convergence `1.0` with p95 `288.664 ms`; restart recovery p95 `12,105 ms`; real packet-partition recovery `32,561 ms`; 100 acknowledged durable writes with zero loss; zero invalid-signed/stale-receipt/unauthorized-execution acceptance; campaign and staging cleanup both confirmed with zero remaining resources.

Attempt 22 preserved RF3/minAcks2, topology, safety thresholds, recovery limits and the >=4-vCPU-per-host floor. The successful repair added bounded publisher-side re-replication after topology churn, bounded iterative `FIND_VALUE` frontier traversal and diagnostic telemetry without weakening acceptance.

Durable public evidence: [`../benchmarks/CLASS_D_500_2026-10-07.md`](../benchmarks/CLASS_D_500_2026-10-07.md).

### Repeatability double-check

A second, intentionally unchanged execution of the accepted frozen A22 source also passed:

- workflow run: `37676472133`
- run attempt: `1`
- terminal: `TRUYN_D500_TERMINAL result=PASS`
- launch SHA: `8fb43126f7e3edb1b3b0c606293672763f6434d3`
- tested source: `1d6746b57104175e295f8fdc3d9643db8e9d42a6`
- tested tree: `9f2771286cc683a9ee49e0e0c5f8092347d54470`
- region/SKU selected by the unchanged placement logic: `southcentralus` / `Standard_E4as_v7`
- baseline routing: `1.0`
- post-restart routing: `1.0`
- healed routing: `1.0`
- convergence routing: `1.0`, p95 `250.921 ms`
- restart recovery p95: `19,633 ms`
- real packet-partition recovery: `32,196 ms`
- acknowledged durable writes: `100`
- acknowledged-write loss: `0`
- campaign cleanup: `remaining=0`
- staging cleanup: `remaining=0`
- artifact: `11510022526`
- artifact digest: `sha256:def31ad674ca39f44d07df91e397bb1f3ac63b8ea5c65b05d4fc4bc78c98d8c5`
- per-run runtime bundle digest: `sha256:78742452dff5f204f9a4766ceed29971ef1b5d968dc47ec6c23571b1d140baa4`

This is a **repeatability PASS**, not a new repair generation: the tested source/tree and acceptance contract are identical to the first accepted Attempt 22. Generated bundle/artifact digests are recorded per run and are not expected to equal the first run's packaging/evidence digests.

Historical D-500 failures remain immutable. A19 exposed 2-vCPU CPU saturation; A20 exposed regional quota and provisioning-reconciliation defects; A21 reached the full campaign but failed durability with 99/100 retained acknowledged writes. Attempt 22 supersedes those attempts only for current D-500 acceptance status.

## D-1000 accepted boundary

**D-1000 status: CLOSED / ACCEPTED / PASS.**

Canonical accepted execution is **Attempt 1, workflow run `37687469411`, GitHub `run_attempt=2`**:

- terminal: `TRUYN_D1000_TERMINAL result=PASS`
- launch SHA: `e0da36ffb633b456f22bb29faccfba213fe28888`
- frozen tested source: `c1d3fa087716dbf24d0b3b65bceae303e907160a`
- frozen tested tree: `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`
- runtime digest: `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`
- artifact: `11543285161`
- artifact digest: `sha256:faf3f8665f074e32cf120751e8fc04decfba4ff42420bb8d834d4f1942e6a789`
- accepted scale-floor forward-port / canonical main: `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`
- Azure placement: `southcentralus` / `Standard_E8as_v7`
- retained density floor: 50 real processes per host / minimum 8 vCPU per host.

Accepted result:

- 20 hosts / 1,000 real processes / 1,000 identities / 1,000 endpoints;
- readiness: 1,000/1,000;
- baseline routing: `1.0` (2,000/2,000 probes);
- post-restart routing: `0.99` (99/100), first-attempt only, zero application retries;
- healed routing: `1.0` (1,000/1,000);
- convergence routing: `1.0`, p95 `285.988 ms`, p99 `347.477 ms`;
- restart recovery p95: `26,627 ms`, restarted nodes: 100;
- real packet-partition recovery: `32,696 ms`, blocked-path successes 0/20;
- acknowledged durable writes: `100`;
- acknowledged-write loss: `0`;
- confirmed missing durable writes: `0`;
- read errors: `0`;
- invalid signed state accepted: `0`;
- stale/revoked receipt accepted: `0`;
- unauthorized provider execution: `0`;
- campaign cleanup: confirmed, `remaining=0`;
- staging cleanup: confirmed, `remaining=0`.

### Attempt 1 infrastructure pre-run history

The first execution of the same workflow identity, `run_attempt=1`, is preserved as negative infrastructure evidence, **not a network/runtime regression**. It failed at fail-closed placement before any VM was created: 20 × 8-vCPU hosts required 160 regional vCPUs, while candidate regions had at most 120 free. No 1,000-process campaign, routing, durability or recovery stages ran.

That first execution produced artifact `11513876833`, digest `sha256:8a84958b1458d533012e42df69d419f446707f073c15006cea06771ca7d67d2f`. Protected operator quota repair run `37686421545` subsequently raised both `westeurope` and `southcentralus` to 200 free regional vCPUs, after which the exact same Attempt 1 was rerun as `run_attempt=2` and passed.

Durable public evidence: [`../benchmarks/CLASS_D_1000_2026-10-08.md`](../benchmarks/CLASS_D_1000_2026-10-08.md).

## Historical immutable failures

Historical D-Series failures remain immutable negative evidence and are not rewritten by later successful results.

Repeatability 01 run `35515705123` remains preserved as a pre-provisioning failure and is not benchmark-regression evidence. Earlier D-200 failures/diagnostics remain audit history. D-500 failed/diagnostic attempts likewise must remain immutable and must never be silently converted into acceptance.

## Execution model

The old sequential pattern — run a full scale campaign until first failure, repair one defect, relaunch — is rejected. The old exact-current-main qualification pattern is also rejected: expensive qualification belongs to an immutable frozen candidate and is reconciled with moving `main` only at Admission.

Current D-Series work must retain:

- massively parallel/non-fail-fast Swarm diagnostics;
- root-cause grouping/deduplication;
- minimal acceptance-preserving repairs;
- targeted B01–B16 checks during repair;
- clean frozen-candidate Swarm revalidation;
- full B01–B16 mandatory frozen-candidate qualification;
- final integration Admission against current `main` with fingerprint recomputation and selective reruns;
- fresh live/collision checks when policy requires them;
- exactly one real acceptance run after admission;
- immutable evidence and cleanup.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published. Raw diagnostic logs remain in immutable Actions artifacts/private operational storage; durable public reports retain safe structured telemetry, artifact identifiers and cryptographic digests.

## Operational rule

D-200, D-500 and D-1000 are closed and immutable accepted gates. Any future Class-D campaign is a new, explicitly named scale/repeatability gate and must preserve the accepted safety, topology, durability and evidence thresholds; no new result may overwrite the immutable D-1000 Attempt 1 PASS.
