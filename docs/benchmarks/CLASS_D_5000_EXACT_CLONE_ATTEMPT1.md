# D-5000 Attempt 1 — exact D-1000 source clone and surgical scale adapter

Status: PREPARING, NO BENCHMARK DISPATCH AND NO ACCEPTANCE EVIDENCE.

## Immutable provenance
- Parent accepted D-1000 source: `c1d3fa087716dbf24d0b3b65bceae303e907160a`
- Exact parent source tree: `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`
- Accepted real run: [37687469411](https://github.com/inn-media/truyn/actions/runs/37687469411) run_attempt=2; independent double-check [37785777704](https://github.com/inn-media/truyn/actions/runs/37785777704). This branch was made directly from that source commit, without transplanting or copying a subset of files.
- Accepted original D-1000 files are unchanged and remain evidence for D-1000 only.

## D-5000-only additions
- `benchmarks/scale/class-d-azure-5000-provision.sh`: 20 VM, strict 250 node processes per host, strict 32-vCPU host floor, separate `truyn-d5000-${GITHUB_RUN_ID}` Azure resource naming and evidence path, original cleanup and fail-close policy.
- `benchmarks/scale/class-d-azure-5000-campaign.sh`: same 20-host original campaign with D-5000 class and evidence scope; D-1000 original intact.
- `benchmarks/scale/class-d-5000-evidence.js`, `evaluate-class-d-5000-evidence.js`, `verify-class-d-5000-terminal.js`: strict 5000 nodes and 250 nodes/host, same >=.99 routing, <=120000ms recovery/convergence and zero-safety-failure gates as D-1000.
- `benchmarks/scale/class-d-5000-admission.test.js`: rejects 1000-node results, routing deterioration, safety violations and cleanup leaks.

## Azure quota confirmation 2026-10-08
Read-only workflow [37816169012](https://github.com/inn-media/truyn/actions/runs/37816169012): 2150 regional vCPUs free, Edsv6, Ddsv6 and Dldsv6 each 800 vCPUs free. Preferred `Standard_E32ds_v6` (32 vCPU / 256 GiB RAM), backups `Standard_D32ds_v6`, `Standard_D32lds_v6`. Location restrictions none; zone 3 restricted. 640 required, quota and SKU preflight GREEN; available VM placement itself not yet proven.

## Gates before any one-shot launch
1. Machine-check base commit ancestry and ensure originals unchanged, exact source/tree.
2. Build and test new D-5000 source: `bash -n` provision/campaign, `node --check` evidence code, `node --test` admission/negative cases, CI and runtime-bundle SHA provenance. No weakening strict thresholds.
3. Freeze branch source SHA and tree, authorize only that SHA for runtime bundle and VM provisioning; do not move it after qualification.
4. New main-branch OIDC launcher with fail-closed quota/SKU/cost/duplicate controls, fresh capacity recheck and precise first Attempt 1 launch identity; ensure resource cleanup on failure.
5. Validate memory/process/file descriptors, network ports, telemetry and health readiness for 250 processes/host, and actual placement of 20 VMs. A quota listing is not a capacity reservation.
6. Launch only after 1–5 PASS. No double-run when pending; declare acceptance only with real 5000-node evidence, all D-1000 equivalent security and durability checks, and resource/staging cleanup PASS.

D-1000 source acceptance is immutable; D-5000 has **NO measurement** until its own run.
