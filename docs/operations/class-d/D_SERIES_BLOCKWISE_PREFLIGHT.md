# D-Series Blockwise Preflight

Blockwise is the mandatory D-Series admission layer inside the broader Sanitation / Swarm architecture. It is not the primary diagnostic engine and must not replace the canonical Swarm fail-collect DAG.

Permanent hierarchy:

`Sanitation / Swarm -> root causes -> repairs -> targeted Bxx qualification -> clean Swarm evidence -> full B01-B16 exact-SHA admission -> isolated live qualification -> collision/capacity check -> one real D-Series campaign -> immutable evidence`.

The preflight contains B01-B16. Blocks run in parallel with fail-fast disabled. A block continues through all of its commands after a failure so one pass collects maximum diagnostics. The aggregate job is the sole full Blockwise verdict and requires exactly 16/16 PASS from one source SHA.

Targeted mode can rerun one repaired block until GREEN. Targeted GREEN is not full acceptance and never replaces either the clean Swarm requirement or the final exact-SHA 16/16 admission pass.

B01 contracts/repository; B02 runtime/staging; B03 cloud/OIDC; B04 topology/placement; B05 process startup/identity; B06 bootstrap/refresh; B07 readiness/leases; B08 baseline routing; B09 restart injection; B10 post-restart routing; B11 healing/convergence/recovery; B12 durable writes/retention; B13 adversarial partition; B14 safety/security negative paths; B15 resources/telemetry/evidence; B16 cleanup/terminal assembly.

The canonical definition is `config/d-series-blockwise-preflight.json`. Local blocks reuse `scripts/class-d-local-multiprocess-repro.mjs` for D-200/D-500/D-1000 semantics with bounded local process counts. Local proof is not represented as a 20-host scale proof.

Cloud-dependent behavior has isolated live qualification. B06 uses `Class D Bootstrap Qualification`: D-500 runs 20 hosts x 25 real processes, D-1000 runs 20 x 50, and the harness exits after bootstrap/readiness/cleanup rather than continuing into full acceptance.

For development and repair, pull-request runs and targeted workflow-dispatch runs are diagnostic only. A launch-eligible full Blockwise run must be a manual exact-main workflow dispatch and must verify a preceding exact-SHA GREEN `D-Series Sanitation Swarm` run. Only such a run emits the `d-series-blockwise-admission-*` provenance artifact consumed by launcher verification.

Repair loop: identify all RED Swarm/root-cause domains -> repair without weakening thresholds -> rerun only affected Bxx blocks for fast confirmation -> revalidate the affected Swarm evidence until clean -> re-read exact main -> run full B01-B16 -> isolated live qualification if required -> fresh collision/capacity check -> only then prepare one full D-500/D-1000 launch.

This prerequisite does not alter routing, recovery, topology, safety, cleanup, evidence or terminal thresholds. It adds a stricter two-layer launch gate with Sanitation / Swarm as the priority mechanism.
