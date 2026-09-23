# TRUYN Network-Scale Operational Status

This is the repository-owned source for **current D-Series operational status**. Architecture and roadmap documents should link here rather than duplicate ephemeral launch state.

**Documentation audit:** 2026-09-23  
**Audited public main:** `3a1f7e67b80cecf678d373e33db9ceb09098e8a4`

## Accepted gates

Class C heterogeneous WAN, Class D-100 and Class D-200 are accepted.

### D-200 — CLOSED / COMPLETE / REPEATABILITY CONFIRMED

Canonical accepted run:

- task: `truyn-d200-parallel-closure-260914-a7f3`;
- run `35503894414`, attempt 1 — PASS / NEVER_RERUN;
- frozen source `e91c165c67c655deb80df4511ca346acb9f1f45b`;
- frozen tree `3a402ba72502de12ed2277db3c9f472872f44b46`;
- artifact `10603748497`;
- artifact digest `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`.

Independent repeatability:

- run `35517248924`, attempt 1 — PASS / NEVER_RERUN;
- artifact `10607664333`;
- artifact digest `sha256:62808cb3e8c49c7a6218bd259365bfcb1a73ac267ea55ce33e11fe6c4f674010`.

The accepted reference proved 20/20 hosts, 200 real processes, readiness 200/200, baseline routing 400/400, post-restart routing 100/100 first-attempt with zero application retries, healed routing 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, packet-partition recovery `32,159 ms`, 100 acknowledged durable writes with zero loss, zero safety violations and complete campaign/staging cleanup.

Durable reports:

- [`../benchmarks/CLASS_D_200_2026-09-20.md`](../benchmarks/CLASS_D_200_2026-09-20.md)
- [`../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md)
- [`../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`](../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md)
- [`d200/D200_FINAL_CLOSURE.md`](d200/D200_FINAL_CLOSURE.md)

## D-500 — OPEN / ATTEMPTED / NOT ACCEPTED

D-500 is no longer merely a future design gate: multiple immutable launch generations have executed. **None is currently accepted as D-500 PASS.**

The latest public acceptance workflow run at this audit is:

- workflow: `D-500 Acceptance`;
- run `35787480348`;
- run number / immutable launch generation: `6`;
- source `64ce333f77ac82d4d8d10106d36bcba0dd8e810a`;
- started `2026-09-22T21:34:41Z`;
- terminal GitHub conclusion: **`cancelled`**.

Therefore run `35787480348` is not acceptance evidence and must not be described as PASS. Earlier D-500 attempts remain immutable historical evidence; they are not rerun or rewritten.

Current public `main` contains subsequent S-Series/WebSocket heartbeat/backpressure diagnostic coverage. Those repairs/diagnostics may inform future scale qualification, but they do **not** retroactively convert any historical D-500 attempt into PASS.

The next valid D-500 transition is: diagnose the latest immutable evidence → minimally repair without weakening acceptance → exact-head qualification → create a **new** immutable acceptance identity if/when all launch gates are GREEN.

## D-1000 — OPEN

No D-1000 acceptance PASS is claimed. D-200 success and D-500 execution history do not satisfy D-1000.

## Long-duration / mainnet boundary

No D-Series result above declares stable mainnet or long-duration production SLO compliance. Those remain separate gates.

## Evidence and execution policy

- accepted and failed campaigns remain immutable audit history;
- security cleanup is **redact-not-delete** for benchmark evidence;
- private topology/secrets stay out of public reports;
- diagnostics, preflights and partial qualification are not acceptance;
- future scale work keeps bounded parallel/non-fail-fast diagnostics, root-cause grouping, targeted requalification and fresh exact-SHA single-shot acceptance identities.
