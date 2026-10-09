# A-Series public documentation sanitation — 2026-10-09

**Documentation only.** No runtime, workflow, protocol, CI, cloud resource or benchmark acceptance change is authorized by this report.

## Provenance and exact scope

- Public main before documentation changes: `d1f06e0984b88dabe21cae8c8f5455772b20a7cd`.
- Foundation [PR #922](https://github.com/inn-media/truyn/pull/922) MERGED, source merge `64fc6e845339880da19f43298a3f863122759496`.
- Runtime-release request [PR #925](https://github.com/inn-media/truyn/pull/925) MERGED, source merge `480d70442b4044057399a031f895f6f9ab97231d`; prior automatic request [#37905720956](https://github.com/inn-media/truyn/actions/runs/37905720956) failed closed due to moving main. No published A runtime archive was independently observed at this snapshot.
- Latest observed D-5000 Attempt 3 [run #37908203516](https://github.com/inn-media/truyn/actions/runs/37908203516) was `in_progress`; not accepted. Recheck run state before any cross-series resource admission.

## Canonical documentation alignment

- `README.md`, `ROADMAP.md`, `docs/README.md`, `docs/architecture/IMPLEMENTATION_STATUS.md`, `docs/assurance/README.md` now explicitly index A-Series and distinguish **foundation merged** from **A-SOAK Attempt 1 NOT LAUNCHED**.
- Dependency order: **A-SOAK → A-OPS → A-SLO → A-WIRE → A-NET → private A-MGMT**. The public side owns open conformance, protocol/network evidence and SLO; `inn-media/truyn-platform` owns cloud operations, budget, tenant authority and managed billing. No private implementation or credential crosses the public boundary.
- D-5000 Attempt 1 PREPARING / NOT RUN notes were preserved as dated historical snapshots, rather than rewritten as current truth. Historical negative/failed evidence remains append-only.
- This record is the latest **A-Series documentation** reconciliation. [2026-10-08 sanitation](DOCUMENTATION_SANITATION_2026-10-08.md) remains canonical for its accepted D-1000 event. [2026-10-07](DOCUMENTATION_SANITATION_2026-10-07.md) and [2026-09-23](DOCUMENTATION_SANITATION_2026-09-23.md) remain historical.

## Validation and boundaries

All touched relative Markdown links must resolve to repository files; the PR diff must be documentation-only, without new workflow files, leaked topology or access tokens. Exact-head DCO, mandatory security and aggregate required `test` must be GREEN before merge. This record is not a safety waiver or terminal benchmark.

Immutable A-SOAK release SHA256, real 4-VM provisioning and cleanup, true 3600-second signed WAN retention, external evidence sinks, D5000 conflict clearance and private hard cost ceiling remain separately required. Do not interpret offline qualification as a live-run PASS.
