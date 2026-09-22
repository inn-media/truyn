# Class-D Bootstrap Qualification

Class-D acceptance is split into independently repeatable qualification gates before an immutable full acceptance launch. Bootstrap is a permanent first-class qualification gate for both D-500 and D-1000.

## Purpose

A full Class-D run contains independent failure domains and is expensive. A bootstrap failure must be repaired and re-qualified without rerunning already-proven routing, restart, safety, adversarial, resource, or cleanup logic. Full acceptance thresholds are not relaxed by this qualification.

The permanent workflow is `.github/workflows/class-d-bootstrap-qualification.yml`.

## Exact-main contract

Every qualification is pinned to an explicit 40-character `source_sha`. The workflow fails closed unless `source_sha` is the current `main` SHA and the workflow run itself is executing that same SHA. It then builds the immutable runtime bundle from that source, authenticates to Azure with the existing OIDC path, selects fail-closed capacity, stages the digest-verified bundle, and launches the same 20-host provisioning/bootstrap harness used by full Class-D acceptance.

Supported scales:

- `d500`: 20 hosts × 25 real node processes = 500 nodes.
- `d1000`: 20 hosts × 50 real node processes = 1,000 nodes.

## Bootstrap gate

The isolated qualification executes only:

1. exact-main/source validation and local bootstrap contract checks;
2. immutable runtime bundle construction and digest verification;
3. Azure OIDC login and fail-closed 20-host capacity selection;
4. infrastructure provisioning and per-process runtime readiness;
5. fresh signed peer-record collection and lease-margin validation;
6. host-stratified bounded bootstrap plan construction;
7. `/bootstrap` plus per-node `/dht/refresh` for every real node;
8. per-node DHT readiness validation;
9. fail-closed Azure resource cleanup;
10. fail-closed runtime-staging cleanup;
11. retained qualification evidence and artifact digest validation.

It stops before bandwidth, convergence, baseline routing, restart/recovery, adversarial, durable-write/safety, and resource-pressure stages.

The terminal marker is:

`TRUYN_CLASS_D_BOOTSTRAP_TERMINAL scale=D-500|D-1000 result=PASS|FAIL ...`

A full D-500 or D-1000 acceptance launch is eligible only after the bootstrap qualification for the exact current main SHA is GREEN.

## Refresh bounds and overlap control

The bootstrap topology requirements remain unchanged: each node receives the existing 32-peer bootstrap plan and refresh executes up to four DHT rounds.

The refresh execution is bounded as follows:

- at most four target walks per node run concurrently;
- one `/dht/refresh` has a 240,000 ms aggregate server-side deadline;
- the existing client boundary remains 300,000 ms;
- deadline exhaustion returns a failed refresh and cannot be treated as success;
- an identical overlapping refresh request joins the already-running operation;
- a different refresh request while one is in flight fails with `TRUYN_DHT_REFRESH_IN_FLIGHT` instead of starting overlapping DHT work;
- the aggregate deadline is propagated into the existing QUIC RPC deadline context.

This prevents a timed-out client retry from creating an unbounded second DHT walk on top of a still-running first walk.

## Permanent stage decomposition

Class-D full acceptance is treated as the composition of these logical gates:

`preflight → provision/install → bootstrap → readiness → convergence → baseline routing → restart/post-restart → healed/recovery → adversarial → durable writes/safety → resources → cleanup`

Operational rule:

- if a gate is GREEN, retain its exact-SHA evidence;
- if a gate is RED, diagnose and repair only that gate and its directly required dependencies;
- rerun that isolated gate on the new exact main SHA until it is GREEN;
- never rerun an immutable historical full acceptance attempt;
- when all applicable qualification gates are GREEN for the exact source, launch exactly one new full acceptance attempt.

Bootstrap is the first permanently extracted D-500/D-1000 gate because it is the currently failing component. Additional extracted gates must follow the same exact-SHA, real-infrastructure, retained-evidence, fail-closed-cleanup pattern.
