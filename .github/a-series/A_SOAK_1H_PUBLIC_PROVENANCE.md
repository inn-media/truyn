# A-SOAK 1H Attempt 1 — public D-Series provenance

Task: `truyn-a-series-20261008`. Intended real campaign: 2 Azure VMs, 2 Google Compute VMs, 8 independent signed nodes per VM, 32 total, RF3, one full hour. **No live A-SOAK Attempt 1 has started.**

## Verified working public Azure pipeline

Read-only source anchors in `inn-media/truyn`:

- `.github/workflows/d5000-attempt1.yml`, real run `37824934693`: D-5000 real Azure OIDC login, 20-VM placement, collision guard and immutable runtime staging are successful, while its campaign was still in progress at the last check.
- `.github/workflows/d5000-sku-readonly-20261008.yml`: approved public-main `azure/login@v2`, dynamic GitHub secret references for Azure client/tenant/subscription and `id-token: write`. Reuse the references **inside the public repository**. GitHub secret values cannot be read or exported via the GitHub API, and they must never be copied into the private repository or committed here.
- `.github/d5000/d5000-sku-readonly-preflight.sh`: read-only regional/family quota, VM SKU and Location restriction validation.
- `scripts/build-class-d-1000-runtime-bundle.sh`: exact-source bundle with SHA-256 and runtime manifest verification.
- `scripts/d200-stage-runtime-bundle.sh`: secure staged runtime via Azure data-plane authentication, only for a separately approved real launch with guaranteed cleanup.
- `benchmarks/scale/class-d-azure-1000-provision.sh`: concrete VM fleet and cleanup mechanics; do not reuse D-series namespace or overwrite its live resources.

New `.github/a-series/a-soak-1h-public-azure-preflight.sh` adapts public SKU and quota selection to exactly **two Azure VMs**. It is strictly read-only, produces an evidence JSON document with zero cloud mutations, and fails closed while D-5000 occupies shared resources. It does not create or delete cloud resources or claim that Azure capacity guarantees actual placement.

## Boundaries and remaining prerequisites

The public repository contains no discovered existing Google Compute Engine WIF workflow. Existing successful Google AI/Cloud Run authentication belongs to separate private-platform workflows and **does not prove VM-creation permission**. Do not introduce secrets or private identities into this public source. The private orchestrator may consume only accepted, versioned public artifacts.

A-SOAK cannot be dispatched until public foundation PR #912 and current exact main CI are green, the runtime is released and digest-pinned, the second cloud's Compute IAM and quota are proven, and an actual 4-VM/32-node dual-cloud UDP/QUIC runner with signed one-minute telemetry, partition+churn proof, bounded billing, independent lease/cleanup and post-run resource reconciliation exists. Current D-5000 campaign must end and its resources be released before capacity can be leased for A-SOAK. Fail closed rather than weaken the 99% routing, p95 recovery <=120 seconds, zero safety violations and zero acknowledged write loss thresholds.

**Workflow wiring status:** an attempted creation of a new A-Series public GitHub Actions OIDC workflow was rejected by the environment. This branch therefore contains the reproducible eligibility script, regression tests and provenance documentation, **not a functioning new GitHub Actions cloud launcher**. The public D-5000 workflow is untouched. Never report this branch as LIVE-READY or as a completed cloud launch.
