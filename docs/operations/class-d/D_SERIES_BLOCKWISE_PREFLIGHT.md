# D-Series Blockwise Preflight

Permanent rule: every new full D-200, D-500 or D-1000 acceptance campaign must be preceded by a GREEN `D-Series Blockwise Preflight` on the exact source SHA tested by that campaign. Historical runs remain immutable and are never rerun retroactively.

The preflight contains B01-B16. Blocks run in parallel with fail-fast disabled. A block continues through all of its commands after a failure so one pass collects maximum diagnostics. The aggregate job is the sole full verdict and requires exactly 16/16 PASS from one source SHA.

Targeted mode can rerun one repaired block until GREEN. Targeted GREEN is not full acceptance and never replaces the final exact-SHA 16/16 GREEN preflight required before a real scale campaign.

B01 contracts/repository; B02 runtime/staging; B03 cloud/OIDC; B04 topology/placement; B05 process startup/identity; B06 bootstrap/refresh; B07 readiness/leases; B08 baseline routing; B09 restart injection; B10 post-restart routing; B11 healing/convergence/recovery; B12 durable writes/retention; B13 adversarial partition; B14 safety/security negative paths; B15 resources/telemetry/evidence; B16 cleanup/terminal assembly.

The canonical definition is `config/d-series-blockwise-preflight.json`. Local blocks reuse `scripts/class-d-local-multiprocess-repro.mjs` for D-200/D-500/D-1000 semantics with bounded local process counts. Local proof is not represented as a 20-host scale proof.

Cloud-dependent behavior has isolated live qualification. B06 uses `Class D Bootstrap Qualification`: D-500 runs 20 hosts x 25 real processes, D-1000 runs 20 x 50, and the harness exits after bootstrap/readiness/cleanup rather than continuing into full acceptance.

Repair loop: identify all RED blocks -> repair without weakening thresholds -> rerun only affected blocks until GREEN -> run any required isolated live qualification -> re-read exact main -> run full B01-B16 again -> only after 16/16 GREEN prepare the full D-500/D-1000 launch.

For the current D-500 incident the active live block is B06. Required sequence: B06 local GREEN -> D-500 Bootstrap Qualification GREEN -> fresh exact-main B01-B16 GREEN -> new immutable full D-500 attempt.

This prerequisite does not alter routing, recovery, topology, safety, cleanup, evidence or terminal thresholds. It only adds a stricter launch gate.