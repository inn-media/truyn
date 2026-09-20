# D-200 repeatability run 01 — pre-launch contract

TASK_ID: `truyn-d200-repeatability-01-260920-r1`  
Durable anchor: issue #676  
Reference accepted run: `35503894414`  
Reference status: **ACCEPTED / PASS / NEVER_RERUN**  
Repeat status: **PREPARED — NOT LAUNCHED**

## Purpose

This is a new independent D-200 campaign intended to test repeatability of the already accepted D-200 result. It does **not** rerun, replace, overwrite, supersede or weaken the accepted run `35503894414` or its evidence.

The repeat uses the same frozen tested source and the same strict D-200 acceptance predicates. Its workflow run ID, launcher commit, artifact, terminal marker and eventual public evidence files are separate.

## Frozen test target

- source SHA: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- source tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- source exact-main CI: `35500410155` — SUCCESS
- source exact-main Five-Patch: `35500410293` — SUCCESS
- source tree CodeQL check: `106050818849` — SUCCESS
- tree-equivalent CodeQL SHA: `293e3cf5da54e58e37a8d3bb3c138b05bf03e36b`

The original accepted source/runtime target is intentionally reused so that the new result measures repeatability rather than a changed implementation.

## Independent workflow

Workflow: `.github/workflows/d200-repeatability-01.yml`

Prepared workflow blob SHA: `531ad46739a8a54d0d542bfe34405933b2bf2901`

The workflow does not trigger when it is merged. It triggers only when the new file `.github/d200-repeatability/launch-01.txt` is added to `main`.

The launch commit must contain exactly that one added file, must be DCO signed-off, must be attempt `1`, and the launch token must bind:

- `TASK_ID=truyn-d200-repeatability-01-260920-r1`
- `REPEAT_ID=d200-repeat-01`
- `REFERENCE_RUN=35503894414`
- `TESTED_COMMIT=e91c165c67c655deb80df4511ca346acb9f1f45b`
- `WORKFLOW_BLOB_SHA=531ad46739a8a54d0d542bfe34405933b2bf2901`

Any mismatch fails before cloud provisioning.

## Acceptance parity

The repeat evaluator is required by regression test to be identical to the accepted D-200 evaluator. Required gates remain:

- 20 hosts;
- 200 real processes;
- 200 unique identities;
- 200 unique endpoints;
- zero synthetic nodes;
- readiness ratio `>= 0.99`;
- baseline routing `>= 0.99`;
- post-restart routing `>= 0.99`;
- healed routing `>= 0.99`;
- convergence routing `>= 0.99`;
- convergence p95 `<= 120000 ms`;
- restart recovery p95 `<= 120000 ms`;
- packet-partition recovery `<= 120000 ms`;
- real packet-partition path and zero blocked successes;
- exactly 100 acknowledged durable writes;
- zero acknowledged-write loss;
- zero invalid signed state acceptance;
- zero stale revoked receipt acceptance;
- zero unauthorized provider execution;
- campaign cleanup confirmed with zero remaining resources;
- staging cleanup confirmed with zero remaining resources.

No threshold is relaxed for repeatability.

## Placement comparability

The reference PASS used `eastus2 / Standard_E2as_v7`. Repeatability run 01 requires the same placement.

Before provisioning, the workflow checks regional vCPU quota, VM-family quota and SKU availability for exactly 20 VMs. If the exact reference placement is unavailable, the run fails closed before campaign provisioning. It does not silently substitute another region or SKU.

## Parallel isolation

The workflow has a separate concurrency group: `truyn-d200-repeatability-01-e91c165c`.

Runtime staging and campaign resource naming continue to include the new GitHub `run_id`, so the repeat uses independent ephemeral cloud resource identities. The reference run itself is never rerun.

## Result identity

The new terminal marker is:

`TRUYN_D200_REPEAT_TERMINAL`

It includes `repeat_id=d200-repeat-01` and `reference_run=35503894414` plus the normal launcher/source/runtime/placement/acceptance/artifact fields.

Artifact name pattern:

`truyn-class-d200-repeat-01-e91c165c-<new-run-id>`

The artifact retains the same raw benchmark telemetry structure as D-200 plus `class-d-200-repeatability-meta.json` linking it to the reference run.

## Public evidence after terminal result

The reference files remain append-only and unchanged. The repeat result will use a separate namespace, for example:

- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>.md`
- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>.json`
- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>_READINESS_PUBLIC.json`
- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>_RETENTION_PUBLIC.json`
- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>_ARTIFACT_FILES.sha256`
- `docs/benchmarks/CLASS_D_200_REPEAT_01_<date>_PUBLIC_EVIDENCE_INDEX.json`

`docs/benchmarks/CLASS_D_200_REPEATABILITY_MATRIX.md` will show the accepted reference run and repeat run side by side.

A repeat failure is preserved as a separate negative result; it does not erase the accepted reference PASS.

## Security/publication boundary

Use **verify-max / exposure-min**.

Public evidence may contain benchmark counters/ratios, latency and recovery telemetry, sanitized host/node ordinal observations, resource-use measurements, public Git/run/artifact identifiers and cryptographic digests required for independent verification.

Never publish secrets, credentials, tokens, private/internal IP addresses, private topology, cloud resource identifiers, secret-bearing URLs, connection strings, or unnecessary raw operational logs. Unsafe raw bytes may be withheld while their SHA-256 identities remain public and the acceptance-relevant structured telemetry is published in sanitized form.

## Launch gate

Do not add the launch token until:

1. the preparation PR is merged;
2. exact merged `main` CI is SUCCESS;
3. exact merged `main` Class D Five-Patch is SUCCESS;
4. exact merged `main` CodeQL/security checks are GREEN;
5. the workflow blob SHA on `main` still equals `531ad46739a8a54d0d542bfe34405933b2bf2901`.

Only then is the single launch-token commit allowed.
