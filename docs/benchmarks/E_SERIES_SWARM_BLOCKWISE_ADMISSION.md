# E-Series Swarm-Blockwise Admission

Status: **LOCKED ARCHITECTURE CONTRACT**

Machine authority: `config/e-series-swarm-blockwise-architecture-lock.json`.

This contract is binding until `ALL_E_SERIES_TESTS_COMPLETE`. It preserves the existing E-Series frozen-candidate model and adds a non-bypassable two-level execution discipline before any paid or measured E-Series boundary.

## Qualification model

```text
Frozen Candidate
  -> E Qualification Swarm
  -> E Blockwise Admission to current Main
  -> S24 / DECOMPOSE / PER-RESULT / KNEE / DEGRADE
```

`main` movement does **not** invalidate frozen candidate evidence by itself. It invalidates only the Admission snapshot when the snapshot is stale. Admission must compare `BASE_SHA -> current main`, construct the integration candidate, recompute E-sensitive fingerprints and requalify only affected zero-paid blocks.

## Level 1 — E Qualification Swarm

The canonical independent blocks are:

- `E-COMMON`
- `E-DECOMPOSE`
- `E-PER-RESULT`
- `E-KNEE`
- `E-DEGRADE`
- `E-PROVIDER-SMOKE`

All six blocks run with fail-collect semantics (`fail-fast=false`) and produce immutable per-block evidence. A failed block does not cancel diagnostic collection from the other blocks. The Swarm itself performs zero paid provider calls.

A GREEN Swarm requires all six blocks to be terminal GREEN for the exact frozen candidate identity. Historical GREEN from another candidate cannot be substituted.

## Level 2 — E Blockwise Admission

Blockwise Admission consumes one exact terminal GREEN Swarm and then performs, in order:

1. verify Swarm run identity, candidate SHA and aggregate digest;
2. require all six required blocks GREEN;
3. reread current private `main`;
4. compare `BASE_SHA -> current main`;
5. construct the synthetic integration candidate and recompute E-sensitive fingerprints;
6. run only E-sensitive targeted zero-paid requalification required by the main delta;
7. run fresh R1 interference attribution;
8. run fresh R2 collision/exclusive-lease guard using the existing shared benchmark-coordination authority;
9. run duplicate-history guard for the requested next E boundary;
10. run budget guard;
11. emit immutable GREEN admission evidence bound to candidate, current-main snapshot and next boundary.

If the Admission snapshot becomes stale because `main` moves, rerun Admission analysis only. Do not discard or automatically repeat expensive frozen-candidate evidence.

## Paid and measured boundary

No E paid or measured workflow may reach provider execution from `candidate_sha` alone.

The mandatory order is:

```text
S24 Provider Smoke
-> E/DECOMPOSE
-> E/PER-RESULT
-> E/KNEE
-> E/DEGRADE
```

Every such workflow must verify successful E Blockwise Admission evidence before its first provider call or measured request. The workflow must fail closed if the admission run is missing, stale, RED, belongs to another candidate, does not contain all required GREEN blocks, or fails its one-shot/duplicate/budget guards.

## Cross-series isolation

E uses the existing D/S/T/H/E/N R0/R1/R2 benchmark coordination authority. It must not create a second global lock plane.

- R0: independent; no wait.
- R1: concurrent when attribution/interference requirements are satisfied.
- R2: exclusive only for the exact genuinely shared mutable resource/fault domain.

Zero-paid qualification/admission work from another series is not itself proof of paid shared-capacity occupation. Collision decisions must be material and fail closed on actual shared-resource evidence.

## Non-bypass invariant

Regression coverage must fail if any production E workflow can reach provider execution while omitting successful Swarm-Blockwise Admission verification. This includes S24 and every future DECOMPOSE, PER-RESULT, KNEE or DEGRADE paid/measured launcher.
