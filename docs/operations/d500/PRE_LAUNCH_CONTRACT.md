# Class D-500 pre-launch contract

TASK_ID: `truyn-d500-prelaunch-260920-a1`  
Durable anchor: issue `#679`  
State: **PREPARATION_ONLY / DO_NOT_LAUNCH**

## Accepted baseline that must not be overwritten

Class D-500 starts from the already accepted Class D-200 system, not from an older D-1000 prototype and not from a parallel rewrite.

Authoritative D-200 evidence remains:

- accepted run `35503894414`, attempt 1 — **NEVER_RERUN**;
- tested source `e91c165c67c655deb80df4511ca346acb9f1f45b`;
- tested tree `3a402ba72502de12ed2277db3c9f472872f44b46`;
- terminal marker `TRUYN_D200_TERMINAL result=PASS`;
- durable report `docs/benchmarks/CLASS_D_200_2026-09-20.md`.

Nothing in D-500 preparation may edit, replace, delete, downgrade, reinterpret, or relabel that evidence.

## Deliberate scale delta

The first D-500 gate changes one primary dimension only:

| Property | D-200 accepted | D-500 prepared |
| --- | ---: | ---: |
| Azure hosts | 20 | 20 |
| Real TRUYN processes / host | 10 | 25 |
| Real processes | 200 | 500 |
| Unique identities | 200 | 500 |
| Unique endpoints | 200 | 500 |
| Synthetic nodes | 0 | 0 |
| Max peers / node | 32 | 32 |
| All-to-all bootstrap | forbidden | forbidden |
| Concurrent restart slice | 5 / host | 5 / host |
| Total restarted nodes | 100 | 100 |

The shared Class-D provisioner already supports `NODES_PER_HOST=25`, so D-500 must use the same runtime/provisioning implementation unless a concrete incompatibility is proven. We do **not** fork a second infrastructure stack merely to rename D-200 files.

Keeping the 5-per-host restart slice unchanged is deliberate for the first D-500 run: it preserves the already-proven 100-real-node failure exercise while isolating the scale change from 200 to 500. A later resilience campaign may increase the restart fraction, but that would be a separate gate rather than silently changing two variables at once.

## Acceptance floors inherited from D-200

D-500 may strengthen these requirements, but may not weaken them:

- readiness `>= 0.99`;
- convergence routing `>= 0.99`;
- baseline routing `>= 0.99`;
- post-restart routing `>= 0.99`;
- healed routing `>= 0.99`;
- convergence p95 `<= 120000 ms`;
- restart recovery p95 `<= 120000 ms`;
- packet-partition recovery `<= 120000 ms`;
- acknowledged durable writes `>= 100`;
- acknowledged write loss `= 0`;
- invalid signed state accepted `= 0`;
- stale/revoked receipt accepted `= 0`;
- unauthorized provider executions `= 0`;
- campaign cleanup confirmed with `0` resources remaining;
- staging cleanup confirmed with `0` resources remaining;
- `maxPeers <= 32`;
- all-to-all bootstrap forbidden;
- peer-record TTL and bootstrap lease floors must remain at least as strict as D-200.

Machine authority: `config/d500-contract.json` + `scripts/check-d500-contract.mjs`.

## Proven D-200 mechanisms that D-500 must retain

1. **Exact-source qualification** — tested commit/tree are frozen and independently tied to successful CI, Five-Patch and CodeQL evidence.
2. **Immutable runtime bundle** — source manifest and runtime archive digest are recorded before cloud execution.
3. **Canonical five-patch contract** — remains mandatory for D-500 and D-1000.
4. **Sparse host-stratified bootstrap** — no full-mesh shortcut; `maxPeers=32` remains fixed.
5. **Readiness barrier** — peer-record freshness, propagation, buckets and remote-host diversity are acceptance data rather than sleeps or guessed timing.
6. **Stage-isolated diagnostics** — a logical stage failure must not erase later diagnostic visibility or cleanup evidence.
7. **Real fault exercise** — restart/recovery and real packet-path partition remain required.
8. **Safety evidence** — durable writes, signed-state rejection, revoked-receipt rejection and provider authorization remain zero-loss/zero-violation gates.
9. **Fail-closed cleanup** — campaign and runtime-staging cleanup are terminal acceptance predicates.
10. **Evidence discipline** — verify-max / exposure-min; redact sensitive fields, never delete benchmark evidence merely because redaction is needed.
11. **No runtime patching** — the runtime bundle is built from the frozen tested source; no in-run source mutation is allowed.
12. **Single-shot acceptance** — eventual D-500 acceptance run is attempt 1 only; a failed immutable run remains failed and is not rerun in place.

## Preparation phases

### P0 — current task

- add D-500 contract and anti-weakening checker;
- add non-cloud preflight qualification;
- add regression tests for 20 x 25 = 500 and D-200 floor inheritance;
- create a non-active launcher template outside `.github/workflows/`;
- keep `main` untouched while D-200 repeatability/repair activity is unresolved.

### P1 — reconcile after D-200 repeatability closure

Before any D-500 launcher is materialized:

- fetch authoritative `main`;
- fetch final D-200 repeatability evidence;
- rebase/reconcile this preparation branch;
- incorporate only proven repeatability fixes that are generic to Class D;
- do not copy a transient workaround blindly;
- rerun full local/CI preflight.

### P2 — merge preparation only

Once D-200 repeatability is closed, merge the D-500 preparation changes **without a launch token**. D-500 remains OPEN.

### P3 — exact-head qualification

On the exact future `main` intended for D-500:

- CI = SUCCESS;
- Class D Five-Patch Preflight = SUCCESS;
- CodeQL = SUCCESS on the same source tree;
- D-500 preflight = PASS;
- read-only Azure capacity/placement probe = PASS;
- no unrelated main movement after qualification.

### P4 — single launcher commit

Only then materialize the reviewed template as the executable workflow and create exactly one dedicated launch token/commit. The launcher must pin:

- tested commit;
- tested tree;
- exact CI run;
- exact Five-Patch run;
- CodeQL check and equivalent tree;
- D-200 accepted baseline identity;
- accepted D-200 repeatability evidence identity;
- D-500 contract digest;
- runtime bundle digest;
- placement class selected by the qualified capacity gate.

### P5 — real D-500 campaign

This document does **not** authorize P5. D-500 is not accepted until a fresh 500-real-process run emits its own strict terminal PASS and durable sanitized public evidence is committed.

## Evidence expected from eventual D-500 run

The publication shape should mirror the successful D-200 evidence package, renamed for D-500:

- normalized topology/routing/recovery/safety/resource telemetry;
- all per-node readiness observations, sanitized;
- all durability/retention rows, sanitized;
- source manifest and digest;
- runtime bundle manifest and digest;
- immutable Actions artifact ID/digest;
- explicit public evidence index with raw-file inclusion/exclusion reasons;
- strict terminal marker `TRUYN_D500_TERMINAL result=PASS`.

Raw logs containing private addresses, ephemeral cloud resource identifiers or secret-bearing URLs remain excluded as raw bytes, while their artifact digests and all acceptance-relevant structured measurements remain public.

## Stop conditions

Preparation or eventual launch must stop rather than weaken acceptance if any of the following occurs:

- D-500 requires more than 32 bootstrap peers per node to become ready;
- readiness needs an arbitrary sleep instead of a measured barrier;
- a stage can pass with missing structured evidence;
- a provider or safety check is bypassed for scale;
- cleanup cannot be proven to zero remaining resources;
- exact-source qualification is stale because `main` moved;
- D-200 repeatability reveals a generic Class-D regression not yet repaired and requalified.

## Current claim boundary

D-200 is accepted. D-500 is **prepared, not launched, not accepted**. D-1000 remains a separate future gate.
