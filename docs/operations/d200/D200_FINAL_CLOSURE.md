# D-200 final closure

Status: **CLOSED / COMPLETE / REPEATABILITY CONFIRMED**  
Closure date: `2026-09-20`

## Canonical accepted gate

The canonical accepted D-200 gate remains workflow run `35503894414`, attempt 1, frozen source `e91c165c67c655deb80df4511ca346acb9f1f45b`, strict terminal `TRUYN_D200_TERMINAL result=PASS`.

Canonical evidence: [`../../benchmarks/CLASS_D_200_2026-09-20.md`](../../benchmarks/CLASS_D_200_2026-09-20.md).

## Independent repeatability confirmation

A separate independent campaign, run `35517248924`, attempt 1, executed the same frozen source/tree/runtime under the same strict acceptance contract and the same Azure placement class and emitted `TRUYN_D200_REPEAT_TERMINAL result=PASS`.

Repeat evidence: [`../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md).  
Comparison ledger: [`../../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md`](../../benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md).

The successful repeat reproduced:

- 20/20 hosts and 200/200 real processes;
- readiness 200/200;
- baseline 400/400;
- convergence 200/200;
- restart of 100 nodes with recovery p95 `28,798 ms`;
- post-restart 100/100 first-attempt routing with retries `0`;
- real packet partition with `0/10` blocked successes and `32,130 ms` recovery;
- healed routing 200/200;
- 100/100 retained durable writes with acknowledged loss `0`;
- zero safety violations;
- complete campaign and staging cleanup with zero remaining resources.

## Negative history preserved

Repeatability 01 run `35515705123` remains an immutable pre-provisioning FAIL caused by the OIDC identifier delivery path. It is not rewritten as PASS and is not considered a benchmark regression because the real cloud campaign never started.

All earlier D-200 failures remain immutable historical evidence.

## Final post-merge qualification

Final D-200 closure documentation was merged through PR `#686` to exact main SHA `07471834685118d5be833dcb64b8f5548dece897`.

The final post-merge checks on that exact main are terminal GREEN:

- CI run `35521958204` — **SUCCESS**, including mandatory security/safety, full qualification, `npm run test:full`, D-200 preflight qualification and `git diff --check`;
- Class D Five-Patch Preflight run `35521958253` — **SUCCESS**, including the D-200, D-500 and D-1000 lanes plus the aggregate exact-SHA evidence gate;
- CodeQL run `35521957744` — **SUCCESS** for actions, Go, Java/Kotlin, C#, Python and JavaScript/TypeScript.

The merge commit is GitHub-verified. No D-200 acceptance threshold was weakened.

## Operational closure

D-200 is no longer an active launch/repair program.

- accepted run `35503894414` — **NEVER_RERUN**
- successful repeat `35517248924` — **NEVER_RERUN**
- failed repeat `35515705123` — **NEVER_RERUN**
- no threshold may be weakened or reinterpreted
- original accepted evidence remains append-only
- repeatability evidence remains separate
- future scale work proceeds only through new D-500 / D-1000 gates

This closure does not claim D-500, D-1000, long-duration stability, stable/mainnet readiness, or managed-production acceptance.
