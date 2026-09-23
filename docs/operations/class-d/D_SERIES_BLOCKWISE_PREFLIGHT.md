# D-Series Blockwise Preflight

Blockwise is the mandatory D-Series admission layer inside the broader Sanitation / Swarm architecture. It is not the primary diagnostic engine and must not replace the canonical Swarm fail-collect DAG.

Permanent hierarchy:

`Sanitation / Swarm -> root causes -> repairs -> targeted Bxx qualification -> clean Swarm evidence -> full B01-B16 exact-SHA admission -> isolated live qualification -> collision/capacity check -> one real D-Series campaign -> immutable evidence`.

The preflight contains B01-B16. Blocks run in parallel with fail-fast disabled. A block continues through all of its commands after a failure so one pass collects maximum diagnostics. The aggregate job is the sole full Blockwise verdict and requires exactly 16/16 PASS from one source SHA.

Targeted mode can rerun one repaired block until GREEN. Targeted GREEN is not full acceptance and never replaces either the clean Swarm requirement or the final exact-SHA 16/16 admission pass.

B01 contracts/repository; B02 runtime/staging; B03 cloud/OIDC; B04 topology/placement; B05 process startup/identity; B06 bootstrap/refresh; B07 readiness/leases; B08 baseline routing; B09 restart injection; B10 post-restart routing; B11 healing/convergence/recovery; B12 durable writes/retention; B13 adversarial partition; B14 safety/security negative paths; B15 resources/telemetry/evidence; B16 cleanup/terminal assembly.

The canonical definition is `config/d-series-blockwise-preflight.json`. Local blocks reuse `scripts/class-d-local-multiprocess-repro.mjs` for D-200/D-500/D-1000 semantics with bounded local process counts. Local proof is not represented as a 20-host scale proof.

Cloud-dependent behavior has isolated live qualification. B06 uses `Class D Bootstrap Qualification`: D-500 runs 20 hosts x 25 real processes, D-1000 runs 20 x 50, and the harness exits after bootstrap/readiness/cleanup rather than continuing into full acceptance.

## Canonical full-admission transport

The canonical `D-Series Blockwise Preflight` workflow supports both direct `workflow_dispatch` and reusable `workflow_call`, but the reusable surface is not independently launch-authoritative. The only supported automated caller is `D-Series Blockwise One-Shot Launcher`.

A one-shot caller run is launch-eligible Blockwise provenance only when all of the following are proven fail-closed by `scripts/verify-d-series-blockwise-preflight-run.sh`:

- the tested source SHA is still exact current `main`;
- the caller branch is exactly `automation/d-series-blockwise/<source-prefix>-<scale>-<swarm-run-id>`;
- the caller commit has exactly one parent and that parent is the tested source SHA;
- the caller is exactly one commit ahead of that source SHA;
- the only changed file is `.github/d-series-blockwise-dispatch/request.env`;
- the request contains exactly `SOURCE_SHA`, `SCALE`, `MODE=blockwise` and `SWARM_RUN_ID`;
- the supplied Swarm run passes the canonical exact-SHA Swarm verifier for the same source and scale;
- the top-level Blockwise caller run is attempt 1, terminal success, from the same repository;
- the full Blockwise aggregate emits both retained `d-series-blockwise-summary-*` and `d-series-blockwise-admission-*` artifacts.

The caller is transport-only. It cannot run isolated live qualification, collision/capacity checks, D-500 acceptance, D-1000 acceptance, or copy B01-B16 logic. Those boundaries remain separate gates.

For development and repair, pull-request runs and targeted executions are diagnostic only. A launch-eligible full Blockwise run must be exact-current-main and must verify a preceding exact-SHA GREEN `D-Series Sanitation Swarm` run. Either a direct exact-main manual dispatch or the strictly verified canonical one-shot reusable caller may produce launch-eligible admission evidence; no other reusable caller is accepted.

Repair loop: identify all RED Swarm/root-cause domains -> repair without weakening thresholds -> rerun only affected Bxx blocks for fast confirmation -> revalidate the affected Swarm evidence until clean -> re-read exact main -> run full B01-B16 -> isolated live qualification if required -> fresh collision/capacity check -> only then prepare one full D-500/D-1000 launch.

This prerequisite does not alter routing, recovery, topology, safety, cleanup, evidence or terminal thresholds. It adds a stricter two-layer launch gate with Sanitation / Swarm as the priority mechanism.
