# Class D-500 pre-launch contract

TASK_ID: `truyn-d500-prelaunch-260920-a1`  
Durable anchor: issue `#679`

## Accepted baseline that must not be overwritten

Class D-500 inherits the accepted Class D-200 system. Authoritative accepted D-200 evidence remains immutable:

- accepted run `35503894414`, attempt 1 — **NEVER_RERUN**;
- tested source `e91c165c67c655deb80df4511ca346acb9f1f45b`;
- tested tree `3a402ba72502de12ed2277db3c9f472872f44b46`;
- terminal marker `TRUYN_D200_TERMINAL result=PASS`;
- durable report `docs/benchmarks/CLASS_D_200_2026-09-20.md`.

No D-500 repair, qualification or admission may overwrite, reinterpret or weaken that evidence.

## Deliberate scale delta

| Property | D-200 accepted | D-500 |
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

The shared Class-D provisioner remains authoritative. D-500 does not create a second infrastructure stack merely to rename D-200 components.

## Acceptance floors inherited from D-200

D-500 may strengthen but may not weaken:

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
- peer-record TTL and bootstrap lease floors at least as strict as D-200.

Machine authority for thresholds remains `config/d500-contract.json` plus its anti-weakening checkers.

## Permanent D-Series qualification model

D-500 is governed by the D-Series locked model:

`Frozen Candidate -> Branch Qualification -> Admission to Main`

Machine authority:

- `config/d-series-frozen-candidate-policy.json`
- `config/d-series-swarm-blockwise-architecture-lock.json`
- `docs/operations/class-d/FROZEN_CANDIDATE_ADMISSION.md`

### Frozen candidate

Expensive D-500 qualification is bound to an exact candidate SHA/tree, not to a moving `main`.

The qualification manifest records:

- `BASE_SHA`;
- candidate SHA/tree;
- successful Sanitation Swarm run;
- successful full B01-B16 Blockwise run;
- D-sensitive fingerprints;
- scale and policy digest.

Once frozen, unrelated movement of `main` does not cancel the qualification and does not require an automatic full rerun.

### Admission analysis

Before merge or launch, Admission compares:

`BASE_SHA -> current main`

It constructs the integration candidate and recomputes D-sensitive fingerprints.

- No D-sensitive main drift: reuse the frozen expensive evidence after the small integration gate.
- D-sensitive main drift: rerun only mapped affected Bxx blocks on the integrated state.
- A fresh live D run is required only where the locked sensitive-surface policy explicitly marks it necessary.
- Main movement by itself must never trigger an automatic full D-Series rerun.

A GREEN old candidate SHA is never sufficient merge authority. The final Admission Gate on the integrated state is mandatory.

If `main` moves after Admission, that Admission becomes stale and must be recalculated against the new main. The expensive frozen candidate evidence remains intact unless the new analysis proves a D-sensitive incompatibility.

## Proven Class-D mechanisms that D-500 must retain

1. Frozen exact-candidate qualification with immutable source/tree identity.
2. Immutable runtime bundle and source manifest.
3. Canonical five-patch contract.
4. Sparse host-stratified bootstrap with `maxPeers=32`.
5. Measured readiness barrier; no arbitrary sleep as acceptance.
6. Stage-isolated diagnostics.
7. Real restart/recovery and packet-path fault exercise.
8. Safety evidence: zero write loss and zero authorization/signature violations.
9. Fail-closed campaign and staging cleanup.
10. Evidence discipline: verify-max / exposure-min.
11. No runtime source patching.
12. Single-shot live acceptance; failed immutable live runs are not rerun in place.
13. Frozen-candidate evidence is never invalidated solely because unrelated main commits landed.
14. Integration Admission is never bypassed solely because a historical branch run was GREEN.

## Qualification and launch sequence

### Q0 — freeze candidate

- choose exact candidate SHA/tree;
- capture `BASE_SHA`;
- run Sanitation Swarm on that candidate;
- run full B01-B16 Blockwise on that candidate;
- emit automatic qualification manifest and fingerprints.

### Q1 — main may continue moving

Other unrelated work may merge to `main`. Do not cancel or restart Q0 merely because main changed.

### Q2 — Admission to current main

Immediately before merge/launch:

- read current `main`;
- compare `BASE_SHA -> current main`;
- create the integration candidate;
- recompute D-sensitive fingerprints;
- run the mandatory small integration admission tests;
- rerun only impacted Bxx blocks;
- require live requalification only if the locked policy says the changed sensitive surface needs it;
- fail if main moves during the Admission run.

### Q3 — merge

Merge is permitted only with a fresh successful Admission artifact whose integration tree matches the state being merged.

Historical GREEN candidate evidence without fresh Admission is not merge authority.

### Q4 — live D-500 campaign

Before one real D-500 campaign:

- validate frozen candidate evidence;
- validate fresh Admission evidence against the actual integrated tree;
- run fresh collision/shared-capacity guard;
- verify no duplicate live attempt;
- pin immutable runtime inputs;
- execute one live attempt.

A live attempt emits its own strict evidence and terminal marker. A failed single-shot attempt remains failed and is not rerun in place.

## Evidence expected from a D-500 live run

- normalized topology/routing/recovery/safety/resource telemetry;
- per-node readiness observations, sanitized;
- durability/retention rows, sanitized;
- source manifest and digest;
- runtime bundle manifest and digest;
- qualification manifest;
- Admission manifest and integration tree digest;
- immutable Actions artifact ID/digest;
- explicit public evidence index;
- strict terminal marker `TRUYN_D500_TERMINAL result=PASS`.

Raw secret-bearing or private infrastructure bytes remain excluded while acceptance-relevant structured measurements and artifact digests remain durable.

## Stop conditions

Stop rather than weaken acceptance if:

- D-500 needs more than 32 bootstrap peers per node;
- readiness needs an arbitrary sleep instead of a measured barrier;
- a stage can pass with missing structured evidence;
- a provider or safety check is bypassed for scale;
- cleanup cannot be proven to zero remaining resources;
- candidate qualification identity or fingerprints cannot be reproduced;
- Admission cannot construct a clean integration candidate;
- Admission fingerprints change despite classification claiming no D-sensitive delta;
- a D-sensitive main delta requires targeted blocks that are not GREEN;
- the locked policy requires fresh live evidence and none exists;
- main moves after the final Admission and Admission has not been recalculated;
- someone attempts to merge or launch from historical GREEN candidate evidence without fresh Admission.

**Main movement itself is not a stop condition and is not a reason for an automatic full D rerun.**

## Current claim boundary

D-200 is accepted. Each D-500 live run is accepted only by its own immutable terminal PASS. The frozen-candidate/admission model governs all future D-Series qualification and launch decisions.
