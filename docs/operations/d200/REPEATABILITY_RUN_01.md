# D-200 repeatability run 01 — historical negative result

TASK_ID: `truyn-d200-repeatability-01-260920-r1`  
Durable anchor: issue `#676`  
Reference accepted run: `35503894414` — **ACCEPTED / PASS / NEVER_RERUN**  
Repeat 01 run: `35515705123` — **FAIL / PRELAUNCH AUTH CONFIGURATION / NEVER_RERUN**

## Final result

Repeatability 01 did **not** execute the real D-200 cloud campaign.

The one-shot launch guard, frozen source/tree verification, strict D-200 preflight contract, and immutable runtime bundle build all passed. The run then failed before Azure login/provisioning because the OIDC identifier delivery variables were empty.

Therefore:

- no 20-VM topology was provisioned;
- no 200-process benchmark campaign started;
- no D-200 acceptance predicate was weakened;
- no benchmark regression is inferred from this run;
- no staging resource was created;
- staging cleanup remained `true`, remaining `0`;
- the failure artifact is preserved as immutable negative evidence.

## Immutable identity

- run: `35515705123`
- attempt: `1`
- launcher: `bfc6b2d940be4b09ccf99f995e351b5062c83c73`
- frozen source: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- frozen tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- runtime digest built successfully: `sha256:296e7684229eaea00be02ce573b255461e340eae1b07b88da395c0f1102598c3`
- artifact ID: `10606213881`
- artifact digest: `sha256:abdc99c9b8c227ea7ee83e260862563c99c6778c31ea4655999d0ee5191d84a5`
- terminal: `TRUYN_D200_REPEAT_TERMINAL result=FAIL`

This run is **NEVER_RERUN**.

## Resolution

The failure was isolated to OIDC identifier delivery. The repair restored the existing Azure OIDC identifiers through exact static secret references without exposing secret values and without changing the frozen D-200 source, runtime, evaluator, thresholds, cleanup semantics, or evidence semantics.

The repaired independent Repeatability 02 run `35517248924` then executed the complete 20-host / 200-process campaign and emitted `TRUYN_D200_REPEAT_TERMINAL result=PASS`.

Final repeatability evidence: [`../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md`](../../benchmarks/CLASS_D_200_REPEAT_02_2026-09-20.md).

D-200 is now **CLOSED / COMPLETE / REPEATABILITY CONFIRMED**.
