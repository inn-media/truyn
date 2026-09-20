#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# D-500 is an extension of the accepted D-200 path, not a replacement for it.
# First prove the D-200 safety floor and canonical Class-D patches remain intact.
node scripts/check-d200-contract.mjs
node scripts/check-d500-contract.mjs
node scripts/check-class-d-five-patches.mjs
node scripts/check-repository-hygiene.mjs

# Keep using the already-proven shared Class-D runtime/provisioning implementation.
bash -n benchmarks/scale/class-d-azure-1000-provision.sh
bash -n benchmarks/scale/class-d-azure-1000-campaign.sh
bash -n benchmarks/scale/d200-restart-recovery-stage.sh
bash -n scripts/d200-stage-isolated-campaign.sh
bash -n scripts/d200-stage-runtime-bundle.sh
node --check network/runtime.js

# The current shared provisioner intentionally supports 20 hosts with 10/25/50
# processes per host. D-500 uses the already-supported 25-process mode.
grep -Fq 'HOST_COUNT=20' benchmarks/scale/class-d-azure-1000-provision.sh
grep -Fq 'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"' benchmarks/scale/class-d-azure-1000-provision.sh
grep -Fq 'TRUYN_CLASS_D1000_NODES_PER_HOST' benchmarks/scale/class-d-azure-1000-provision.sh

# Preserve the proven D-200 restart slice for the first D-500 scale gate:
# five restarted nodes per host = 100 real restarted nodes total. This changes
# scale only (200 -> 500) rather than changing scale and fault model at once.
grep -Fq 'restart_first_node=5' benchmarks/scale/d200-restart-recovery-stage.sh
grep -Fq 'restart_last_node=9' benchmarks/scale/d200-restart-recovery-stage.sh

# Stage-isolated diagnostics and partial-evidence reconstruction are mandatory.
grep -Fq 'D200_CAMPAIGN_SOURCE=' scripts/d200-stage-isolated-campaign.sh
grep -Fq 'class-d-200-stage-results.json' scripts/d200-stage-isolated-campaign.sh
grep -Fq 'acceptanceWeakened' scripts/d200-stage-isolated-campaign.sh

# Preparation must remain non-launching. The eventual executable workflow is
# materialized only after D-200 repeatability closure and exact-main qualification.
if compgen -G '.github/workflows/d500*.yml' >/dev/null || compgen -G '.github/workflows/d-500*.yml' >/dev/null; then
  echo 'TRUYN_D500_PREFLIGHT=FAIL active_d500_workflow_present' >&2
  exit 1
fi

node --test tests/d500-prelaunch.test.js
printf 'TRUYN_D500_PREFLIGHT_QUALIFICATION=PASS topology=20x25 process_target=500 max_peers=32 d200_floor_preserved=true five_patch=true launchable=false\n'
