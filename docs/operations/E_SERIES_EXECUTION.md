# E-Series Execution Procedure

Status: **FOUNDATION / no benchmark result**

This is the public execution procedure. Private resource names, quotas, billing reconciliation, leases and raw traces live only in `inn-media/truyn-platform`.

## 1. Required order

```text
E0 contract freeze
  -> E1 instrumentation qualification
  -> E2 cross-series isolation dry-run
  -> E3 DECOMPOSE pilot/final
  -> E4 PER-RESULT pilot/final
  -> E5 KNEE pilot/final
  -> E6 DEGRADE pilot/final
  -> E7 independent reconciliation/export
```

DECOMPOSE precedes KNEE so the mechanism behind any plateau can be diagnosed. PER-RESULT precedes KNEE because it defines the primary useful-efficiency curve.

## 2. E0 — contract freeze

Freeze and digest:

- public source/release;
- private runner identity/digest;
- corpus/workload and oracle;
- provider mix/model class;
- regions/config classes;
- all stage mappings;
- DIRECT control;
- scale/load grids;
- warmup policy;
- sample minima/confidence method;
- cost/compute attribution mode;
- invalidation/stop rules.

Any material change after freeze creates a new campaign identity.

## 3. E1 — instrumentation qualification

Before paid/large-scale work, prove on a small bounded run that:

- every logical NEED has one terminal outcome;
- stage spans cover all canonical stages used by the workload;
- durations use monotonic clocks;
- retries remain attached to the original request;
- cost/usage is attributable to request/run;
- useful-result oracle can be independently recomputed;
- provider-429 and internal saturation are distinguishable;
- sanitized export can reproduce summary metrics;
- no private resource identifier is required for public recomputation.

Instrumentation qualification is not an E benchmark result.

## 4. E2 — cross-series isolation dry-run

Classify every dependency R0/R1/R2 under `BENCHMARK_SERIES_ISOLATION.md`.

Required preflight:

```text
E namespace unique
artifact prefix unique
telemetry partition unique
cache/index generation unique or immutable R0
run/spend budget unique
provider attribution unique
R1 interference detector active
R2 lease owned or no R2 mutation planned
cleanup ownership scoped to E run
foreign active D/S/T/H runs discovered
```

If a required R2 target is owned by another series, record `WAITING_SHARED_RESOURCE`. Do not cancel or mutate the foreign run.

## 5. Per-run preflight

Immediately before each measured run:

1. read authoritative public/private SHAs;
2. verify frozen manifest digests;
3. verify provider access and expected model class;
4. verify all expected nodes/providers are ready;
5. verify no configuration/capacity drift;
6. verify E run namespace is empty/new;
7. verify budget and stop conditions;
8. snapshot R1/R2 ownership/interference state;
9. record run identity before sending the first measured NEED.

## 6. Warmup

Warmup executes the frozen workload shape without collecting headline samples. Warmup must not spill into another run namespace.

Start measured window only after the declared steady-state condition is met. Mark warmup records `measured=false`.

## 7. E/DECOMPOSE execution

For each `N in {50,100,200,500}`:

1. provision/attach exactly the frozen scale;
2. hold offered load constant at the frozen non-saturating level;
3. run warmup;
4. execute >=5 independent measured batches and >=1,000 measured NEEDs total for final claims;
5. capture stage spans, bytes, tokens/cost, terminal outcomes and interference state;
6. compute per-host stage quantiles and conservative cross-host max-of-host-quantiles;
7. export request-level TRUYN tax distribution and stage shares;
8. cleanup only E-owned ephemeral state.

Do not optimize between final scale points. Repairs require a new qualified campaign/version.

## 8. E/PER-RESULT execution

For each frozen task pair:

1. randomize/counterbalance TRUYN vs DIRECT order;
2. execute both arms under the same provider/task/output/oracle class;
3. charge all retries and failed-answer cost to the originating request;
4. adjudicate usefulness independently;
5. compute cost/wall/compute per useful result;
6. report wasted cost/compute from unusable results;
7. retain pair identity for bootstrap/reconciliation.

## 9. E/KNEE execution

For each `N in {50,75,100,150,200,350,500}`:

- run the same frozen PER-RESULT workload/load level;
- meet final evidence density;
- record DECOMPOSE-compatible stage telemetry;
- compute primary `G_cost(N)` and secondary curves;
- apply the precommitted knee detector only after all valid points are closed.

If data do not support a knee, publish `NO_KNEE_OBSERVED_IN_RANGE` rather than selecting a visual breakpoint.

## 10. E/DEGRADE execution

For each `N in {50,100,200,500}`:

1. establish measured low-load baseline;
2. execute the frozen monotonically increasing offered-load ladder;
3. keep each step long enough for the frozen measured window/request minimum;
4. continue until stop rules are met;
5. immediately restore baseline offered load;
6. measure recovery/hysteresis until recovery criteria or timeout;
7. distinguish provider/external throttling from internal saturation;
8. export load windows and ordered failure modes.

Never raise shared provider capacity during a measured ramp unless the capacity itself is an E-owned R2 target frozen into the methodology.

## 11. Run termination states

A run closes as one of:

```text
PASS
FAIL
INCOMPLETE
INVALIDATED
EXTERNAL_LIMITED
WAITING_SHARED_RESOURCE
```

`WAITING_SHARED_RESOURCE` is not failure and does not authorize touching the owner run.

## 12. Independent reconciliation

Before any public E claim, a reconciliation step independent of the measured runner recomputes from sanitized/raw evidence as appropriate:

- request and useful-result counts;
- stage latency aggregates;
- TRUYN tax;
- cost/wall/compute per useful;
- paired ratios and CIs;
- knee detector result;
- sustainable load and recovery time;
- error taxonomy;
- interference/invalidation state;
- cleanup ownership.

Mismatch blocks publication as PASS.

## 13. Public export

Public export contains only safe methodology/evidence and cryptographic identities. Private topology, credentials, account/service identities, exact quotas/cost ceilings, active lease backend and raw secret-bearing traces remain private.

The public report explicitly states limitations and negative/blocked cells.
