# D-5000 Attempt 1 — preparation only (2026-10-08)

**STATE: PREPARING / NOT LAUNCHED / NO ACCEPTANCE CLAIM.**
**Source-of-truth reference:** accepted D-1000 Attempt 1 run 37687469411 (run_attempt=2) and independent exact-frozen Double-Check run 37785777704 (run_attempt=1). D-1000 immutable tested SHA c1d3fa087716dbf24d0b3b65bceae303e907160a, tree 266c83c8520d486cc6f1d44f63c8bd9b6e185c38, runtime sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88. Original strict D-1000 terminal PASS, cleanup PASS, zero acknowledged-write losses.

## Immutable copy boundary
- Source accepted workflow copy (byte-exact file content): `.github/d5000/reference/D1000_ATTEMPT1_EXACT.yml`.
- Source repeatability workflow copy (byte-exact file content): `.github/d5000/reference/D1000_DOUBLE_CHECK_EXACT.yml`.
- Accepted original launch marker copy: `.github/d5000/reference/D1000_ATTEMPT1_LAUNCH_EXACT.txt`.
- **DO NOT** edit these references. All D-5000 changes must be in new files, never rewrite accepted evidence.
- Preparation branch rooted at successful D-1000 launcher SHA `e5c957123efa449e14fb225fd8be5df2d0e6e995`. Runtime source remains pinned separately.

## D-5000 target and capacity hypothesis (NOT YET QUALIFIED)
- Target **20 real hosts × 250 real processes per host = 5,000**, unique identity and endpoint for each.
- 32 vCPU per host is a *provisional capacity planning minimum*, not an accepted or benchmarked performance assertion; target 20 × 32 = 640 vCPUs and request >=800 regional/family quota to leave placement margin. Confirm actual SKU, regional placement, SKU restrictions, usable CPU/memory and data-plane throughput before provisioning. Never infer that quota implies allocation capacity.
- All D-1000 topology, recovery, routing, safety, durability and zero-resource cleanup invariants retained without relaxing thresholds; new 5,000-process exact evaluator must prove real counts.
- Known source hard guards in `benchmarks/scale/class-d-azure-1000-provision.sh`: `STRICT_NODES_PER_HOST=50`, allowed `10 25 50`, `HOST_COUNT=20`. D-5000 must derive its own provisioner/evaluator/runtime and explicitly admit 250; **do not modify the frozen D-1000 tested source**.
- Network/QUIC port ranges, endpoint uniqueness, security-group ingress/egress rules, per-VM fd/port/memory ceilings, agent restarts, timeout bounds, concurrency, and evidence sizes must be separately validated for 250 nodes per host before allowing launch.
- Azure OIDC must run from **authorized main context** (failed branch run 37784820939 was `AADSTS700213`). Only quota preflight/request may run now. Never place the D-5000 campaign in an active push-triggered workflow while preparation is incomplete.

## Mandatory gates — ALL before any future D-5000 dispatch
1. Quota-only GitHub Actions operation completed; record request ID/decision and read-after-write effective limits. Request acceptance is NOT applied quota.
2. Check regional and exact chosen VM-family quotas, concurrently consumed capacity, Azure SKU restrictions and actual placement capacity for 20 VMs, with explicit headroom. Quota request may take manual Microsoft approval.
3. Freeze modified D-5000 source/tree and machine-verifiably compare D-1000 originals with D-5000 minimal scale-specific diffs.
4. Build/pin immutable D-5000 runtime bundle, verify SHA and manifest exact-source traceability.
5. Complete all static/unit/integration/security/capacity preflight on exact D-5000 SHA, and safety/cleanup regression checks (no weakened acceptance).
6. Record new one-shot launch identity `D-5000 Attempt 1`, duplicate-operation, budget, Azure resource name, capacity collision and cleanup guards; independent acceptance policy.
7. Publish only to authorized main OIDC workflow with explicit user permission **after** all gates GREEN. As of this document **NO D-5000 test is authorized to run**.

## Evidence and accountability
Prior PASS run IDs: 37687469411, 37785777704. Prior double-check evidence artifact: 11557320070. The branch-OIDC failure 37784820939 remains immutable negative pre-provision evidence. D-5000 measured evidence: **NONE**; status must not be labeled GREEN/ACCEPTED. Never copy private credentials, quota authority or cloud secrets into public documentation.


## Updated Azure capacity plan: approved alternative families (2026-10-08)

The user reports actual Azure South Central US quotas: **Total Regional vCPUs=800**, **Standard Ddsv6 Family=800**, **Standard Dldsv6 Family=800**, **Standard Edsv6 Family=800**. **Standard Easv7 Family remains denied** and is no longer a necessary dependency. The effective limits and SKU permissions must be independently verified through Azure on the intended subscription; do not interpret this user-reported state as completed cloud-side validation.

Target 20 VMs × 32 vCPU = 640 regional vCPU, leaving a theoretical 160-vCPU regional quota margin when no other workloads consume cores. Each family quota is independent and shares the *same* 800 regional vCPU ceiling; do **not** add family quotas together.

Validated Microsoft SKU specifications:
1. Preferred **Standard_E32ds_v6** (Edsv6), 32 vCPU, **256 GiB RAM**.
2. Backup **Standard_D32ds_v6** (Ddsv6), 32 vCPU, **128 GiB RAM**.
3. Memory-constrained backup **Standard_D32lds_v6** (Dldsv6), 32 vCPU, **64 GiB RAM**; require explicit per-process RSS and host headroom validation for 250 processes/VM.

Official references:
- https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/memory-optimized/edsv6-series
- https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/ddsv6-series
- https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dldsv6-series
- https://learn.microsoft.com/en-us/azure/virtual-machines/quotas

Read-only discovery on public main: `.github/workflows/d5000-sku-readonly-20261008.yml` and `.github/d5000/d5000-sku-readonly-preflight.sh`, scoped to `southcentralus`. It tests actual regional and exact-family free quota, subscription SKU listing, and location restrictions and emits evidence without VM provisioning, quota mutations or benchmark dispatch. Results marked `QUOTA_SKU_PASS` mean **quota/SKU eligible, not actual 20-VM capacity guaranteed**; Azure placement capacity, RAM consumption, exact-D5000 implementation, and all safety and acceptance gates remain pending.

Current GitHub Azure OIDC service-principal corporate ownership was questioned by the user and must be separately reconciled by authorized administrators before granting broader credentials or running a paid benchmark. The read-only probe does not grant Azure roles or modify cloud resources.

**D-5000 Attempt 1 remains PREPARING / NOT LAUNCHED.**
